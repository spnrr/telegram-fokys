import logging
import os
import asyncio
import threading
import time

from dotenv import load_dotenv


logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)


def get_port(default: int = 8000) -> int:
    raw_port = os.getenv("PORT", str(default)).strip()
    try:
        return int(raw_port)
    except ValueError as exc:
        raise RuntimeError(f"PORT must be a number, got {raw_port!r}") from exc


def run_backend() -> None:
    from server import app

    port = get_port()
    logger.info("Starting Flask backend on 0.0.0.0:%s", port)
    app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False)


def run_bot() -> None:
    import bot

    logger.info("Starting Telegram bot polling")
    bot.main()


def run_task_bot() -> None:
    asyncio.set_event_loop(asyncio.new_event_loop())

    import task_bot

    logger.info("Starting task Telegram bot polling")
    task_bot.main()


def main() -> None:
    load_dotenv()

    backend_thread = threading.Thread(
        target=run_backend,
        name="flask-backend",
        daemon=True,
    )
    backend_thread.start()
    time.sleep(1)

    course_token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    task_token = os.getenv("TASK_BOT_TOKEN", "").strip()
    if not task_token:
        logger.warning("TASK_BOT_TOKEN is not configured; task bot disabled")
    elif task_token == course_token:
        logger.warning("TASK_BOT_TOKEN matches TELEGRAM_BOT_TOKEN; task bot disabled")
    else:
        task_bot_thread = threading.Thread(
            target=run_task_bot,
            name="task-telegram-bot",
            daemon=True,
        )
        task_bot_thread.start()
        time.sleep(1)

    run_bot()


if __name__ == "__main__":
    main()
