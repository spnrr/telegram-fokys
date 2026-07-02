# Add the Protocol Day Task Bot and Mini App

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `Plans.md` from the repository root.

## Purpose / Big Picture

After this change the project will run two separate Telegram bots from the same deployment. The existing course bot continues to use `TELEGRAM_BOT_TOKEN` and the existing course Mini App. A new product, "Протокол Дня", uses `TASK_BOT_TOKEN` and opens a separate Mini App at `/tasks`. Users do all task planning, focus timing, evening review, and statistics inside that Mini App; the new Telegram chat only greets users and opens the app.

## Progress

- [x] (2026-07-01 11:45+03:00) Read the current project structure, `bot.py`, `server.py`, `database.py`, `start.py`, and `.env.example`.
- [x] (2026-07-01 11:50+03:00) Create this ExecPlan to guide the feature.
- [x] (2026-07-01 12:05+03:00) Add isolated SQLite storage helpers for `daily_tasks` without changing course tables.
- [x] (2026-07-01 12:10+03:00) Add `/tasks` static routes and `/api/tasks/*` endpoints to `server.py`.
- [x] (2026-07-01 12:15+03:00) Add the separate `task_bot.py` entry bot with only `/start` and a Mini App menu button.
- [x] (2026-07-01 12:30+03:00) Add `webapp/tasks/index.html`, `webapp/tasks/app.js`, and `webapp/tasks/style.css`.
- [x] (2026-07-01 12:34+03:00) Update `start.py` so Flask, the course bot, and the task bot can run together when configured.
- [x] (2026-07-01 12:35+03:00) Update `.env.example` with `TASK_BOT_TOKEN` and `TASK_WEBAPP_URL`.
- [x] (2026-07-01 12:40+03:00) Run Python syntax checks and local API smoke checks.

## Surprises & Discoveries

- Observation: `server.py` has a catch-all static route, but the requested `/tasks` files should still be added explicitly so the new product has clear ownership.
  Evidence: `server.py` defines `@app.get("/<path:filename>") def static_files(...)`.

- Observation: Node.js is not installed in this environment, so `node --check webapp\tasks\app.js` cannot be used for JavaScript syntax validation.
  Evidence: PowerShell returned `The term 'node' is not recognized as a name of a cmdlet`.

## Decision Log

- Decision: Keep all Protocol Day persistence in `database.py` but under separate functions and the separate `daily_tasks` table.
  Rationale: The project already centralizes SQLite access in `database.py`; using the same module preserves `DATABASE_PATH` behavior without mixing task data into course tables.
  Date/Author: 2026-07-01 / Codex.

- Decision: The task bot will use `TASK_WEBAPP_URL` when set, otherwise `WEBAPP_URL.rstrip("/") + "/tasks"`.
  Rationale: This exactly matches the requested environment behavior and keeps `TELEGRAM_BOT_TOKEN` and `WEBAPP_URL` semantics unchanged for the course bot.
  Date/Author: 2026-07-01 / Codex.

- Decision: Run the new task bot in a daemon thread and give that thread its own asyncio event loop.
  Rationale: `python-telegram-bot` polling uses asyncio; a non-main thread needs an explicit event loop to start reliably while the existing course bot remains the main blocking process.
  Date/Author: 2026-07-01 / Codex.

## Outcomes & Retrospective

Implemented. The project now has a second Telegram bot entrypoint, a separate `/tasks` Mini App, a new `daily_tasks` SQLite table, and API routes for creating, completing, and summarizing daily protocols. Python syntax checks and Flask API smoke checks passed. JavaScript syntax could not be checked with Node because Node is not installed in the environment.

## Context and Orientation

The repository is a Python project. `bot.py` contains the existing Telegram course and planning bot. `server.py` creates the Flask application and serves the current course Mini App from `webapp/`. `database.py` owns SQLite access and creates the course tables `modules`, `lessons`, `lesson_blocks`, and `course_settings`. `start.py` starts Flask in a background thread and then starts the existing bot polling.

The new product must not replace or modify the chat behavior of `bot.py`. It will live in `task_bot.py` and `webapp/tasks/`. The backend routes will be added to `server.py`, but the data model will use a separate `daily_tasks` table in the same SQLite database file selected by `DATABASE_PATH`.

## Plan of Work

First, extend `database.init_db()` with `CREATE TABLE IF NOT EXISTS daily_tasks` and add helper functions to get today's protocol, start or update today's protocol, complete today's protocol, and compute statistics. These helpers will take plain dictionaries and return dictionaries suitable for JSON responses.

Second, add explicit Flask routes for `/tasks`, `/tasks/app.js`, and `/tasks/style.css`. Add API handlers for `GET /api/tasks/today?user_id=`, `POST /api/tasks/start`, `POST /api/tasks/complete`, and `GET /api/tasks/stats?user_id=`. The handlers will normalize text, validate `user_id`, enforce focus minutes of 25, 45, or 90, and return JSON errors without tracebacks.

Third, create `task_bot.py`. It will read `TASK_BOT_TOKEN`, compute the task Mini App URL from `TASK_WEBAPP_URL` or `WEBAPP_URL + "/tasks"`, validate that the result starts with `https://`, and only register `/start`. On `/start`, it sends the requested greeting and an inline Web App button. It also sets `MenuButtonWebApp` for the chat and for the bot default menu when possible.

Fourth, create the separate Mini App files. The app will initialize Telegram WebApp APIs inside `try/catch`, derive `user_id` from `initDataUnsafe.user.id` or a persistent anonymous ID in `localStorage`, and render five screens: home, morning protocol, active day with timer, evening review, and result/statistics.

Fifth, update `start.py` to start Flask, optionally start `task_bot.py` when `TASK_BOT_TOKEN` is set and distinct from `TELEGRAM_BOT_TOKEN`, and run the existing course bot as before.

## Concrete Steps

All commands run from `C:\Users\Sasha\Documents\telegram fokus bot`.

Run syntax validation after edits:

    python -m py_compile bot.py database.py server.py start.py task_bot.py

Observed result:

    command completed successfully

Run Flask locally without Telegram tokens if needed:

    python server.py

Then open:

    http://127.0.0.1:8000/tasks

The API smoke check used Flask's test client and observed:

    GET /tasks 200
    POST /api/tasks/start 201 Сделать главное
    GET /api/tasks/today 200 0
    POST /api/tasks/complete 200 1
    GET /api/tasks/stats 200 1 1

The existing course routes were also smoke-checked with Flask's test client:

    / 200
    /admin 200
    /api/modules 200
    /api/course-settings 200

## Validation and Acceptance

The change is accepted when `python -m py_compile bot.py database.py server.py start.py task_bot.py` succeeds, `/tasks` loads the new app, `/api/tasks/start` creates a daily protocol, `/api/tasks/today?user_id=...` returns it after a restart because it is stored in SQLite, `/api/tasks/complete` marks it complete, and `/api/tasks/stats?user_id=...` returns totals and recent days.

Telegram acceptance requires real tokens. The old bot must still use `TELEGRAM_BOT_TOKEN`. The new bot must only use `TASK_BOT_TOKEN`; if `TASK_BOT_TOKEN` is absent, `start.py` logs a warning and still starts Flask plus the old bot. If `TASK_WEBAPP_URL` is not HTTPS, the new `/start` response says: `Mini App пока не настроен. Добавьте HTTPS-ссылку в TASK_WEBAPP_URL.`

## Idempotence and Recovery

The database migration is idempotent because it uses `CREATE TABLE IF NOT EXISTS`. Starting a day uses the unique `(user_id, date)` constraint to update the user's current-day protocol rather than creating duplicates. Re-running the syntax check and server smoke checks is safe.

## Artifacts and Notes

No validation artifacts yet.

## Interfaces and Dependencies

No new third-party dependencies are required. The task bot uses the already installed `python-telegram-bot` package. The backend uses the existing Flask and SQLite stack.
