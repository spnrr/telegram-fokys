# Prepare Railway Deployment Startup

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows the repository guidance in `Plans.md`. The existing project already contains a Flask backend in `server.py`, a Telegram bot in `bot.py`, SQLite helpers in `database.py`, and Mini App files in `webapp/`. This plan adds a single Railway-friendly startup file so one service can run both the web backend and the long-polling Telegram bot.

## Purpose / Big Picture

After this change, Railway can run the whole MVP with one command: `python start.py`. The Flask backend will serve the Mini App, admin page, and JSON API on Railway's assigned `PORT`, while the Telegram bot stays online through polling even when the user's personal computer is off. A user can verify the result by deploying to Railway, opening the Railway public domain, opening `/admin`, creating a lesson, and then using `/app` in Telegram to see the course.

## Progress

- [x] (2026-06-26 00:00Z) Read `AGENTS.md`, `Plans.md`, `server.py`, `bot.py`, `database.py`, `.env.example`, `requirements.txt`, and `README.md`.
- [x] (2026-06-26 00:05Z) Create this ExecPlan for the Railway startup change.
- [x] (2026-06-26 00:12Z) Add `start.py` that runs Flask in a background thread and the Telegram bot in the main thread.
- [x] (2026-06-26 00:22Z) Update documentation for local combined launch and Railway deployment.
- [x] (2026-06-26 00:25Z) Update project guidance so future agents know Railway uses `python start.py`.
- [x] (2026-06-26 00:32Z) Validate syntax, startup helpers, bot command preservation, backend API, and public-file secret scan.
- [x] (2026-06-26 00:35Z) Record final validation evidence and retrospective.

## Surprises & Discoveries

- Observation: `server.py` already reads `PORT` for direct local runs, and `database.py` already reads `DATABASE_PATH`.
  Evidence: `server.py` uses `port = int(os.getenv("PORT", "8000"))`; `database.py` uses `Path(os.getenv("DATABASE_PATH", DEFAULT_DATABASE_PATH))`.

## Decision Log

- Decision: Run Flask in a daemon background thread and run the Telegram bot in the main thread.
  Rationale: `python-telegram-bot` polling is safest in the main thread because it manages an asyncio event loop and may register signal handlers. Flask's development server can serve this MVP from a background thread when `use_reloader=False`.
  Date/Author: 2026-06-26 / Codex

- Decision: Bind Flask to `0.0.0.0` in `start.py`.
  Rationale: Railway needs the web process to listen on all interfaces inside the container. Local development can still open `http://127.0.0.1:8000`.
  Date/Author: 2026-06-26 / Codex

- Decision: Keep Railway persistence in SQLite using `DATABASE_PATH=/data/course.db`.
  Rationale: The user explicitly asked for SQLite and Railway Volume mount path `/data`. No external database is introduced for this MVP.
  Date/Author: 2026-06-26 / Codex

## Outcomes & Retrospective

The Railway startup MVP is complete. The project now has `start.py`, which starts Flask on `0.0.0.0` using Railway's `PORT` value or local fallback `8000`, then runs Telegram bot polling in the main thread. `README.md` now documents local combined startup, Railway variables, the `/data` Volume mount, and the Start Command `python start.py`. `AGENTS.md` now records the Railway startup convention for future work.

The implementation deliberately keeps a single Railway service and SQLite file persistence because that matches the MVP requirements. If the project grows, the next likely improvement is splitting the web app and bot into separate Railway services or moving course data to a managed database.

## Context and Orientation

`bot.py` starts the Telegram bot with long polling. Long polling means the bot process repeatedly asks Telegram for new updates. This lets the bot work without a webhook, but the process must stay running on a server.

`server.py` creates a Flask application named `app`. Flask is the web backend that serves the learner Mini App at `/`, the admin page at `/admin`, and course API endpoints under `/api/...`.

`database.py` stores course modules and lessons in SQLite. SQLite is a file database. On Railway the database file must live inside the mounted Volume path `/data`, otherwise it can disappear when the service restarts.

Railway runs one start command per service. The new `start.py` will be that single entry point. It must start Flask and the bot together in one Python process.

## Plan of Work

Create `start.py` in the repository root. It will load `.env`, read `PORT` with fallback `8000`, start `server.app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False)` in a daemon thread, pause briefly so the web server can start, and then call `bot.main()` in the main thread.

Update `README.md` to explain both local development and Railway deployment. The README must name the Railway Start Command as `python start.py`, list required variables, and explain that a Railway Volume must be mounted at `/data` with `DATABASE_PATH=/data/course.db`.

Update `AGENTS.md` so future changes know that deployment uses `start.py`.

Validate without starting the real Telegram bot against Telegram. Syntax checks and helper checks are enough locally because using a real token would contact Telegram and can conflict with any already-running bot instance.

## Concrete Steps

Work from the repository root:

    C:\Users\Sasha\Documents\telegram fokus bot

For local combined startup:

    python start.py

For Railway:

    Start Command: python start.py

Required Railway variables:

    TELEGRAM_BOT_TOKEN=<real token from BotFather>
    WEBAPP_URL=https://<your-railway-domain>
    ADMIN_PASSWORD=<strong password>
    DATABASE_PATH=/data/course.db

Railway Volume:

    Mount path: /data

## Validation and Acceptance

Run syntax validation:

    python -m py_compile bot.py database.py server.py start.py

Check the start helper without contacting Telegram:

    python -c "import os, start; os.environ['PORT']='9001'; assert start.get_port() == 9001"

Check bot commands still exist by building the application object with a fake token:

    python -c "from bot import build_application; app = build_application('123:ABC', 'https://example.com'); ..."

Check backend API with Flask's test client and a temporary database:

    python -c "...create module, create lesson, read learner API..."

Acceptance is met when these checks pass, README gives Railway steps, and no real secrets appear in tracked/public project files.

## Idempotence and Recovery

Running `python start.py` multiple times is safe as long as only one copy binds the same local port and only one copy polls the same Telegram bot token. If Telegram reports a polling conflict, stop the other running copy of the bot before starting the Railway service. If Railway loses course data, confirm the Volume is mounted at `/data` and `DATABASE_PATH` is exactly `/data/course.db`.

## Artifacts and Notes

Validation evidence:

    .\.venv\Scripts\python.exe -m py_compile bot.py database.py server.py start.py
    # exit code 0

    .\.venv\Scripts\python.exe -c "import os, start; os.environ.pop('PORT', None); assert start.get_port() == 8000; os.environ['PORT']='9001'; assert start.get_port() == 9001; print('start helpers ok')"
    start helpers ok

    .\.venv\Scripts\python.exe -c "...build Telegram application with fake token and verify old commands plus /admin..."
    bot commands ok

    .\.venv\Scripts\python.exe -c "...Flask test client creates module, creates lesson, and reads learner API..."
    backend api ok

    rg -n "[0-9]{8,}:[A-Za-z0-9_-]{20,}|AAF7HNRX" -g "!.env" -g "!.venv/**" -g "!__pycache__/**"
    # no matches

## Interfaces and Dependencies

`start.py` must expose:

    get_port(default: int = 8000) -> int
    run_backend() -> None
    main() -> None

No new Python dependency is required. The implementation uses the Python standard library `threading`, `time`, `logging`, and the existing project modules.

Revision note: This plan was created because Railway deployment changes the process model of the project. It records why Flask runs in a background thread and the Telegram bot remains in the main thread.

Revision note: Implementation completed on 2026-06-26. The plan was updated to mark all milestones complete, record validation evidence, and capture that Railway deployment now uses `python start.py` with `DATABASE_PATH=/data/course.db`.
