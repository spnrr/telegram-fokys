import logging
import os
from urllib.parse import urlparse

from dotenv import load_dotenv
from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    ReplyKeyboardRemove,
    Update,
    WebAppInfo,
)
from telegram.ext import Application, CallbackContext, CommandHandler


logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)


INVALID_WEBAPP_MESSAGE = "Mini App пока не настроен. Добавьте HTTPS-ссылку в TASK_WEBAPP_URL."


def is_valid_webapp_url(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme == "https" and bool(parsed.netloc)


def resolve_task_webapp_url() -> str:
    task_url = os.getenv("TASK_WEBAPP_URL", "").strip()
    if task_url:
        return task_url

    webapp_url = os.getenv("WEBAPP_URL", "").strip()
    if not webapp_url:
        return ""
    return f"{webapp_url.rstrip('/')}/tasks"


async def set_task_menu_button(context: CallbackContext, chat_id: int | None = None) -> None:
    webapp_url = str(context.application.bot_data.get("task_webapp_url", "")).strip()
    if not is_valid_webapp_url(webapp_url):
        return

    menu_button = MenuButtonWebApp(
        text="Открыть протокол",
        web_app=WebAppInfo(url=webapp_url),
    )
    if chat_id is None:
        await context.bot.set_chat_menu_button(menu_button=menu_button)
    else:
        await context.bot.set_chat_menu_button(chat_id=chat_id, menu_button=menu_button)


async def post_init(application: Application) -> None:
    webapp_url = str(application.bot_data.get("task_webapp_url", "")).strip()
    if not is_valid_webapp_url(webapp_url):
        logger.warning("TASK_WEBAPP_URL must be a public HTTPS URL; task Mini App is unavailable")
        return

    await application.bot.set_chat_menu_button(
        menu_button=MenuButtonWebApp(
            text="Открыть протокол",
            web_app=WebAppInfo(url=webapp_url),
        ),
    )


async def start(update: Update, context: CallbackContext) -> None:
    if update.message is None:
        return

    webapp_url = str(context.application.bot_data.get("task_webapp_url", "")).strip()
    if not is_valid_webapp_url(webapp_url):
        await update.message.reply_text(
            INVALID_WEBAPP_MESSAGE,
            reply_markup=ReplyKeyboardRemove(),
        )
        return

    if update.effective_chat is not None:
        await set_task_menu_button(context, update.effective_chat.id)

    keyboard = InlineKeyboardMarkup(
        [[
            InlineKeyboardButton(
                text="Открыть протокол",
                web_app=WebAppInfo(url=webapp_url),
            )
        ]]
    )
    await update.message.reply_text(
        "Протокол Дня\n\n"
        "Ежедневный инструмент, чтобы выбрать главное действие, поставить запрет на слив "
        "времени и вечером честно отметить результат.\n\n"
        "Всё работает внутри Mini App.\n\n"
        "Нажми кнопку ниже, чтобы открыть протокол.",
        reply_markup=keyboard,
    )


async def error_handler(update: object, context: CallbackContext) -> None:
    error = context.error
    if error is not None:
        logger.error(
            "Unhandled exception while processing a task bot update",
            exc_info=(type(error), error, error.__traceback__),
        )


def build_application(token: str, task_webapp_url: str = "") -> Application:
    application = (
        Application.builder()
        .token(token)
        .post_init(post_init)
        .concurrent_updates(False)
        .build()
    )
    application.bot_data["task_webapp_url"] = task_webapp_url.strip()
    application.add_handler(CommandHandler("start", start))
    application.add_error_handler(error_handler)
    return application


def main() -> None:
    load_dotenv()
    token = os.getenv("TASK_BOT_TOKEN", "").strip()
    if not token:
        raise RuntimeError("TASK_BOT_TOKEN is not configured")

    task_webapp_url = resolve_task_webapp_url()
    application = build_application(token, task_webapp_url)
    logger.info("Task bot is starting")
    application.run_polling(allowed_updates=Update.ALL_TYPES, stop_signals=None)


if __name__ == "__main__":
    main()
