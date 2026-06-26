import logging
import os
from dataclasses import dataclass, field
from datetime import date
from random import choice
from urllib.parse import urlparse

from dotenv import load_dotenv
from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
    Update,
    WebAppInfo,
)
from telegram.ext import (
    Application,
    CallbackContext,
    CallbackQueryHandler,
    CommandHandler,
    ConversationHandler,
    MessageHandler,
    filters,
)


logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

PLAN_TASK, PLAN_STEPS, CONTENT_TOPIC = range(3)
MAX_TASK_LENGTH = 200
MAX_STEP_LENGTH = 120
MAX_CONTENT_TOPIC_LENGTH = 120

PLAN_BUTTON = "План дня"
CONTENT_BUTTON = "Контент"
FOCUS_BUTTON = "Фокус"
CHECK_BUTTON = "Проверка"
MENU_BUTTON_PATTERN = rf"^(?:{PLAN_BUTTON}|{CONTENT_BUTTON}|{FOCUS_BUTTON}|{CHECK_BUTTON})$"

MAIN_MENU = ReplyKeyboardMarkup(
    [
        [KeyboardButton(PLAN_BUTTON), KeyboardButton(CONTENT_BUTTON)],
        [KeyboardButton(FOCUS_BUTTON), KeyboardButton(CHECK_BUTTON)],
    ],
    resize_keyboard=True,
    is_persistent=True,
    input_field_placeholder="Выберите действие",
)
NON_MENU_TEXT = filters.TEXT & ~filters.COMMAND & ~filters.Regex(MENU_BUTTON_PATTERN)

FOCUS_TIPS = (
    "Убери телефон подальше и поставь таймер на 25 минут.",
    "Закрой лишние вкладки и оставь на экране только текущую задачу.",
    "Начни с самого маленького действия, которое займёт меньше пяти минут.",
    "Перед началом запиши, что именно должно быть готово к концу фокус-сессии.",
    "Сделай один глубокий вдох, отключи уведомления и работай только над первым шагом.",
)

CONTENT_HOOK_TEMPLATES = (
    "Главная ошибка тех, кто начинает разбираться в теме «{topic}».",
    "Если тема «{topic}» кажется сложной, начни с этого.",
    "Большинство усложняет «{topic}». Вот более простой подход.",
    "Что я хотел бы знать раньше о теме «{topic}».",
    "За 30 секунд покажу первый шаг в теме «{topic}».",
)


@dataclass
class DailyPlan:
    task: str
    steps: list[str] = field(default_factory=list)
    created_on: date = field(default_factory=date.today)
    completed: bool | None = None


user_plans: dict[int, DailyPlan] = {}


def get_today_plan(user_id: int) -> DailyPlan | None:
    plan = user_plans.get(user_id)
    if plan is not None and plan.created_on != date.today():
        user_plans.pop(user_id, None)
        return None
    return plan


def build_content_plan(topic: str) -> str:
    hooks = "\n".join(
        f"{number}. {template.format(topic=topic)}"
        for number, template in enumerate(CONTENT_HOOK_TEMPLATES, start=1)
    )
    return (
        f"Идея ролика на тему «{topic}»\n\n"
        "1. Боль аудитории\n"
        f"Люди интересуются темой «{topic}», но откладывают действие: "
        "не понимают, с чего начать, боятся ошибиться и потратить время зря.\n\n"
        "2. Обещание ролика\n"
        f"После ролика зритель поймёт, как сделать первый понятный шаг в теме «{topic}» "
        "без лишней сложности.\n\n"
        f"3. Варианты хука\n{hooks}\n\n"
        "4. Структура ролика\n"
        f"Хук: {CONTENT_HOOK_TEMPLATES[1].format(topic=topic)}\n"
        "Основная мысль: назови типичную ошибку, объясни одно простое правило и покажи "
        "его на коротком примере. Заверши конкретным первым действием для зрителя.\n"
        f"CTA: предложи сохранить ролик и написать, какой первый шаг по теме «{topic}» "
        "зритель сделает сегодня."
    )


def is_valid_webapp_url(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme == "https" and bool(parsed.netloc)


def build_admin_url(webapp_url: str) -> str:
    return f"{webapp_url.rstrip('/')}/admin"


async def start(update: Update, context: CallbackContext) -> None:
    del context
    if update.message is None:
        return

    await update.message.reply_text(
        "Привет! Я помогу выбрать одну главную задачу на день, разбить её "
        "на три простых шага, вечером отметить результат и подготовить идею ролика.\n\n"
        "Выбери нужное действие на клавиатуре ниже или используй команду.",
        reply_markup=MAIN_MENU,
    )


async def help_command(update: Update, context: CallbackContext) -> None:
    del context
    if update.message is None:
        return

    await update.message.reply_text(
        "Доступные команды:\n"
        "/start — узнать идею бота\n"
        "/help — показать список команд\n"
        "/plan — составить план на день\n"
        "/focus — получить совет по концентрации\n"
        "/check — отметить выполнение задачи\n"
        "/content — подготовить идею и структуру ролика\n"
        "/app — открыть обучающее Mini App\n"
        "/admin — получить ссылку на админ-панель курса\n"
        "/cancel — отменить текущий диалог\n\n"
        "Основные действия также доступны на постоянной клавиатуре."
    )


async def plan_start(update: Update, context: CallbackContext) -> int:
    context.user_data.pop("draft_task", None)
    context.user_data.pop("draft_steps", None)

    if update.message is not None:
        await update.message.reply_text(
            "Какая одна задача сегодня самая важная? Напиши её одним сообщением."
        )
    return PLAN_TASK


async def receive_task(update: Update, context: CallbackContext) -> int:
    if update.message is None or update.message.text is None:
        return PLAN_TASK

    task = update.message.text.strip()
    if not task:
        await update.message.reply_text("Задача не может быть пустой. Попробуй ещё раз.")
        return PLAN_TASK
    if len(task) > MAX_TASK_LENGTH:
        await update.message.reply_text(
            f"Сформулируй задачу короче — максимум {MAX_TASK_LENGTH} символов."
        )
        return PLAN_TASK

    context.user_data["draft_task"] = task
    context.user_data["draft_steps"] = []
    await update.message.reply_text(
        "Теперь разобьём задачу на три простых шага. Напиши шаг 1."
    )
    return PLAN_STEPS


async def receive_step(update: Update, context: CallbackContext) -> int:
    if update.message is None or update.message.text is None:
        return PLAN_STEPS

    step = update.message.text.strip()
    if not step:
        await update.message.reply_text("Шаг не может быть пустым. Попробуй ещё раз.")
        return PLAN_STEPS
    if len(step) > MAX_STEP_LENGTH:
        await update.message.reply_text(
            f"Сделай шаг проще и короче — максимум {MAX_STEP_LENGTH} символов."
        )
        return PLAN_STEPS

    steps = context.user_data.setdefault("draft_steps", [])
    steps.append(step)

    if len(steps) < 3:
        await update.message.reply_text(f"Отлично. Теперь напиши шаг {len(steps) + 1}.")
        return PLAN_STEPS

    if update.effective_user is None:
        return ConversationHandler.END

    task = str(context.user_data.get("draft_task", "")).strip()
    if not task:
        context.user_data.pop("draft_steps", None)
        await update.message.reply_text("Не удалось найти задачу. Начни заново с /plan.")
        return ConversationHandler.END

    user_plans[update.effective_user.id] = DailyPlan(task=task, steps=list(steps))
    context.user_data.pop("draft_task", None)
    context.user_data.pop("draft_steps", None)

    formatted_steps = "\n".join(
        f"{number}. {item}" for number, item in enumerate(steps, start=1)
    )
    await update.message.reply_text(
        f"План на сегодня готов!\n\nГлавная задача: {task}\n\n{formatted_steps}\n\n"
        "Вечером используй /check."
    )
    return ConversationHandler.END


async def cancel(update: Update, context: CallbackContext) -> int:
    context.user_data.pop("draft_task", None)
    context.user_data.pop("draft_steps", None)
    if update.message is not None:
        await update.message.reply_text("Текущий диалог отменён.")
    return ConversationHandler.END


async def content_start(update: Update, context: CallbackContext) -> int:
    context.user_data.pop("draft_task", None)
    context.user_data.pop("draft_steps", None)
    if update.message is not None:
        await update.message.reply_text(
            "Напиши тему ролика одним сообщением. Например: «Как перестать откладывать дела»."
        )
    return CONTENT_TOPIC


async def receive_content_topic(update: Update, context: CallbackContext) -> int:
    del context
    if update.message is None or update.message.text is None:
        return CONTENT_TOPIC

    topic = " ".join(update.message.text.split())
    if not topic:
        await update.message.reply_text("Тема не может быть пустой. Попробуй ещё раз.")
        return CONTENT_TOPIC
    if len(topic) > MAX_CONTENT_TOPIC_LENGTH:
        await update.message.reply_text(
            f"Сформулируй тему короче — максимум {MAX_CONTENT_TOPIC_LENGTH} символов."
        )
        return CONTENT_TOPIC

    await update.message.reply_text(build_content_plan(topic))
    return ConversationHandler.END


async def focus(update: Update, context: CallbackContext) -> None:
    del context
    if update.message is not None:
        await update.message.reply_text(f"Совет по фокусу: {choice(FOCUS_TIPS)}")


async def check(update: Update, context: CallbackContext) -> None:
    del context
    if update.message is None or update.effective_user is None:
        return

    plan = get_today_plan(update.effective_user.id)
    if plan is None:
        await update.message.reply_text("На сегодня плана ещё нет. Создай его командой /plan.")
        return

    keyboard = InlineKeyboardMarkup(
        [[
            InlineKeyboardButton("✅ Да", callback_data="check:yes"),
            InlineKeyboardButton("🟡 Пока нет", callback_data="check:no"),
        ]]
    )
    await update.message.reply_text(
        f"Главная задача: {plan.task}\n\nУдалось выполнить её сегодня?",
        reply_markup=keyboard,
    )


async def open_app(update: Update, context: CallbackContext) -> None:
    if update.message is None:
        return

    webapp_url = str(context.application.bot_data.get("webapp_url", "")).strip()
    if not is_valid_webapp_url(webapp_url):
        await update.message.reply_text(
            "Mini App пока не настроен. Добавьте публичный HTTPS-адрес в WEBAPP_URL "
            "и перезапустите бота."
        )
        return

    keyboard = InlineKeyboardMarkup(
        [[
            InlineKeyboardButton(
                "Открыть обучение",
                web_app=WebAppInfo(url=webapp_url),
            )
        ]]
    )
    await update.message.reply_text(
        "Нажмите кнопку, чтобы открыть модули курса.",
        reply_markup=keyboard,
    )


async def open_admin(update: Update, context: CallbackContext) -> None:
    if update.message is None:
        return

    webapp_url = str(context.application.bot_data.get("webapp_url", "")).strip()
    if not is_valid_webapp_url(webapp_url):
        await update.message.reply_text(
            "Админ-панель пока не настроена. Добавьте публичный HTTPS-адрес в WEBAPP_URL "
            "и перезапустите бота."
        )
        return

    admin_url = build_admin_url(webapp_url)
    keyboard = InlineKeyboardMarkup(
        [[InlineKeyboardButton("Открыть админ-панель", url=admin_url)]]
    )
    await update.message.reply_text(
        "Админ-панель курса открывается по ссылке ниже. Пароль берётся из ADMIN_PASSWORD.",
        reply_markup=keyboard,
    )


async def handle_check_result(update: Update, context: CallbackContext) -> None:
    del context
    query = update.callback_query
    if query is None:
        return

    await query.answer()
    plan = get_today_plan(query.from_user.id)
    if plan is None:
        await query.edit_message_text("Этот план уже неактуален. Создай новый с помощью /plan.")
        return

    plan.completed = query.data == "check:yes"
    if plan.completed:
        text = "Отличная работа! Главная задача дня выполнена. Можно спокойно завершать день."
    else:
        text = (
            "Ничего страшного. Выбери самый маленький оставшийся шаг и удели ему 10 минут "
            "или перенеси задачу осознанно."
        )
    await query.edit_message_text(text)


async def error_handler(update: object, context: CallbackContext) -> None:
    error = context.error
    if error is not None:
        logger.error(
            "Unhandled exception while processing an update",
            exc_info=(type(error), error, error.__traceback__),
        )
    else:
        logger.error("Unknown error while processing an update")

    if isinstance(update, Update) and update.effective_message is not None:
        await update.effective_message.reply_text(
            "Произошла ошибка. Попробуй ещё раз через несколько секунд."
        )


def build_application(token: str, webapp_url: str = "") -> Application:
    application = Application.builder().token(token).concurrent_updates(False).build()
    application.bot_data["webapp_url"] = webapp_url.strip()

    conversation = ConversationHandler(
        entry_points=[
            CommandHandler("plan", plan_start),
            CommandHandler("content", content_start),
            MessageHandler(filters.Regex(rf"^{PLAN_BUTTON}$"), plan_start),
            MessageHandler(filters.Regex(rf"^{CONTENT_BUTTON}$"), content_start),
        ],
        states={
            PLAN_TASK: [MessageHandler(NON_MENU_TEXT, receive_task)],
            PLAN_STEPS: [MessageHandler(NON_MENU_TEXT, receive_step)],
            CONTENT_TOPIC: [MessageHandler(NON_MENU_TEXT, receive_content_topic)],
        },
        fallbacks=[
            CommandHandler("cancel", cancel),
            MessageHandler(filters.Regex(rf"^{FOCUS_BUTTON}$"), focus),
            MessageHandler(filters.Regex(rf"^{CHECK_BUTTON}$"), check),
        ],
        allow_reentry=True,
    )

    application.add_handler(conversation)
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("focus", focus))
    application.add_handler(CommandHandler("check", check))
    application.add_handler(CommandHandler("app", open_app))
    application.add_handler(CommandHandler("admin", open_admin))
    application.add_handler(MessageHandler(filters.Regex(rf"^{FOCUS_BUTTON}$"), focus))
    application.add_handler(MessageHandler(filters.Regex(rf"^{CHECK_BUTTON}$"), check))
    application.add_handler(
        CallbackQueryHandler(handle_check_result, pattern=r"^check:(yes|no)$")
    )
    application.add_error_handler(error_handler)
    return application


def main() -> None:
    load_dotenv()
    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    webapp_url = os.getenv("WEBAPP_URL", "").strip()
    if not token or token == "replace_with_token_from_botfather":
        raise RuntimeError(
            "TELEGRAM_BOT_TOKEN не задан. Скопируйте .env.example в .env и добавьте токен."
        )

    if webapp_url and not is_valid_webapp_url(webapp_url):
        logger.warning("WEBAPP_URL must be a public HTTPS URL; /app will stay unavailable")

    application = build_application(token, webapp_url)
    logger.info("Focus bot is starting")
    application.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
