# Add a Simple Course Backend and Admin Panel

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows the repository guidance in `Plans.md`. The existing project is a Telegram bot with a static Telegram Mini App; this plan changes the Mini App into a small local course platform backed by SQLite and a simple admin page.

## Purpose / Big Picture

After this change, a student can open the Telegram Mini App, load course modules from a backend API, open lessons, and move to the next or previous lesson. An administrator can open a simple browser page, enter the password from `.env`, then create, edit, and delete modules and lessons without editing JavaScript by hand. This matters because the course content becomes manageable from a small admin panel while staying intentionally simple: no payment, no Telegram login, no progress tracking, and no complex deployment.

The working behavior is observable locally by running the backend, opening `http://127.0.0.1:8000`, opening `http://127.0.0.1:8000/admin`, creating content, and seeing the new lesson appear in the learner view.

## Progress

- [x] (2026-06-25 00:00Z) Read `AGENTS.md`, `Plans.md`, current bot files, Mini App files, dependencies, and README.
- [x] (2026-06-25 00:05Z) Create this ExecPlan with repository context, intended backend shape, validation, and safety notes.
- [x] (2026-06-25 00:18Z) Implement SQLite data layer in `database.py`.
- [x] (2026-06-25 00:24Z) Implement Flask backend and admin API in `server.py`.
- [x] (2026-06-25 00:34Z) Update learner Mini App JavaScript to load modules and lessons from API and navigate between lessons.
- [x] (2026-06-25 00:42Z) Add `webapp/admin.html` for password-protected admin actions.
- [x] (2026-06-25 00:48Z) Update bot command `/admin`, fix `build_content_plan`, and preserve existing commands.
- [x] (2026-06-25 00:55Z) Update `.env.example`, `requirements.txt`, `README.md`, `.gitignore`, and `AGENTS.md`.
- [x] (2026-06-25 01:05Z) Run syntax checks and local API/UI validation.
- [x] (2026-06-25 01:10Z) Record final validation evidence and retrospective.

## Surprises & Discoveries

- Observation: `.env.example` currently contains a real-looking Telegram token and a concrete public URL instead of safe placeholders.
  Evidence: Reading `.env.example` showed `TELEGRAM_BOT_TOKEN=` followed by a token-shaped value. This must be replaced with placeholders.

- Observation: `build_content_plan` in `bot.py` currently computes hook text but does not return the content plan because the return block is accidentally placed after `is_valid_webapp_url`.
  Evidence: Reading `bot.py` showed `build_content_plan` ending after the `hooks = ...` assignment, and the intended content-plan return block sitting after a `return parsed.scheme == "https" ...` line in `is_valid_webapp_url`. This must be fixed while preserving `/content`.

## Decision Log

- Decision: Use Flask instead of FastAPI for this MVP.
  Rationale: Flask is the smallest fit for this project because it can serve static files and JSON endpoints with one lightweight dependency and no separate ASGI server command. The project already favors simple single-file MVP pieces.
  Date/Author: 2026-06-25 / Codex

- Decision: Use a single local SQLite file named by `DATABASE_PATH`, defaulting to `course.db`.
  Rationale: SQLite through Python's built-in `sqlite3` meets the requirement, needs no external service, and keeps local development easy. The `.env.example` will document the optional path without requiring it.
  Date/Author: 2026-06-25 / Codex

- Decision: Protect admin API requests with the `X-Admin-Password` header.
  Rationale: The requirement asks for password protection from `.env` but explicitly rejects complex authorization. A header sent by the admin page is simple, readable, and enough for a local MVP.
  Date/Author: 2026-06-25 / Codex

- Decision: Serve the learner Mini App and the admin page from the Flask backend in local MVP mode.
  Rationale: This avoids CORS complexity and gives one local command, `python server.py`, that serves both the API and the web pages.
  Date/Author: 2026-06-25 / Codex

## Outcomes & Retrospective

The backend MVP is complete. The project now has a SQLite data layer, a Flask server, learner API endpoints, admin API endpoints protected by `ADMIN_PASSWORD`, an admin page, and a learner Mini App that loads course content from the API. Existing Telegram bot commands are preserved, `/admin` was added, and the previously broken `/content` helper now returns the intended template output again.

What remains outside this MVP is deployment: Telegram still needs a public HTTPS `WEBAPP_URL`, while the implemented server is intentionally optimized for local development first. Future work can add tests, real authentication, progress tracking, and deployment configuration if the project grows.

## Context and Orientation

The repository root contains `bot.py`, a Python Telegram bot using `python-telegram-bot`, and `webapp/`, a static Telegram Mini App. The Mini App currently keeps all module and lesson data inside `webapp/app.js`. A module is a course section, such as "Осознанный фокус". A lesson is one readable page inside a module. The user wants modules and lessons to move into a SQLite database so content can be managed from an admin page.

`SQLite` is a small file-based database. In this project it will appear as `course.db` in the repository root unless `DATABASE_PATH` is set. The backend creates the database tables automatically at startup.

`Flask` is a small Python web framework. In this project `server.py` will start the local web server, expose JSON API routes under `/api/...`, and serve files from `webapp/`. JSON means structured data that browser JavaScript can request and parse.

`bot.py` must keep all existing commands and add `/admin`. The `/app` command still uses `WEBAPP_URL`, which should point to the public HTTPS learner page in Telegram. The new `/admin` command sends a link to the admin page derived from `WEBAPP_URL` by appending `/admin`.

## Plan of Work

First, add `database.py` with all database creation and CRUD operations. CRUD means create, read, update, and delete. The file will use `sqlite3`, set row output to dictionaries, create `modules` and `lessons`, and enforce foreign keys so deleting a module removes its lessons.

Second, add `server.py` using Flask. On startup it loads `.env`, initializes the database, serves `webapp/index.html` at `/`, serves `webapp/admin.html` at `/admin`, serves static assets from `webapp/`, exposes learner endpoints, and exposes admin endpoints that require the `X-Admin-Password` header to match `ADMIN_PASSWORD`.

Third, replace the hardcoded course array in `webapp/app.js` with fetch calls to `/api/modules`, `/api/modules/{module_id}/lessons`, and `/api/lessons/{lesson_id}`. The learner UI will preserve the existing module, lesson list, lesson text, and Telegram back-button behavior, and add next/previous lesson buttons.

Fourth, create `webapp/admin.html`. This single file will contain forms for logging in, creating modules, creating lessons, editing existing module names, editing lesson title/content, and deleting modules or lessons. The admin page will use browser JavaScript and send the password through `X-Admin-Password`.

Fifth, update `bot.py` to fix the existing `/content` helper bug, add `/admin`, keep `/app`, and keep all old commands and reply buttons working.

Sixth, update `requirements.txt`, `.env.example`, `README.md`, and `AGENTS.md` so the documented stack and commands match the backend version.

## Concrete Steps

Work from the repository root:

    C:\Users\Sasha\Documents\telegram fokus bot

Install dependencies after editing `requirements.txt`:

    python -m pip install -r requirements.txt

Run the backend locally:

    python server.py

Open the learner page:

    http://127.0.0.1:8000

Open the admin page:

    http://127.0.0.1:8000/admin

Run the bot separately when needed:

    python bot.py

## Validation and Acceptance

Syntax validation must include:

    python -m py_compile bot.py database.py server.py

The learner API must show JSON:

    GET http://127.0.0.1:8000/api/modules

The admin flow must be checked manually:

1. Start `python server.py`.
2. Open `http://127.0.0.1:8000/admin`.
3. Enter the password from `.env`.
4. Create a module named `Тестовый модуль`.
5. Create a lesson inside that module named `Тестовый урок` with visible text.
6. Open `http://127.0.0.1:8000`.
7. Confirm the learner page shows `Тестовый модуль`, opens `Тестовый урок`, and displays the lesson text.
8. Use next and previous buttons; when there is no next or previous lesson, the unavailable button should not appear.
9. Delete the lesson and confirm it disappears from the learner page after refresh.

The bot must still compile and build its application object. `/app` should remain available when `WEBAPP_URL` is a valid HTTPS URL. `/admin` should send a link when `WEBAPP_URL` is valid.

## Idempotence and Recovery

Running `python server.py` repeatedly is safe. Database initialization uses `CREATE TABLE IF NOT EXISTS`, so existing data is kept. Creating the same module twice is allowed because this MVP does not enforce unique titles. If local test data becomes messy, stop the server, delete `course.db`, and start the server again to create an empty database.

Admin delete operations are intentionally destructive because the user asked for deletion. The UI will ask for browser confirmation before deleting modules or lessons. Deleting a module also deletes its lessons through the database foreign-key rule.

## Artifacts and Notes

Important validation transcripts will be added here after implementation.

Validation evidence:

    .\.venv\Scripts\python.exe -m py_compile bot.py database.py server.py
    # exit code 0

    C:\Users\Sasha\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --check webapp\app.js
    # exit code 0

    C:\Users\Sasha\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe -e "...extract inline admin script and compile it..."
    admin js syntax ok

    .\.venv\Scripts\python.exe -c "...Flask test client creates module, creates lesson, edits lesson, deletes lesson..."
    backend api ok

    .\.venv\Scripts\python.exe -c "...Flask test client edits module and deletes module with cascading lesson deletion..."
    module crud ok

    .\.venv\Scripts\python.exe -c "...Flask test client opens /, /admin, /app.js, /style.css..."
    pages ok

    .\.venv\Scripts\python.exe -c "...bot helper and command checks..."
    bot helpers ok

    rg -n "[0-9]{8,}:[A-Za-z0-9_-]{20,}|AAF7HNRX|your_real_token" -g "!.env" -g "!.venv/**" -g "!__pycache__/**"
    # no matches

## Interfaces and Dependencies

`requirements.txt` must include:

    python-telegram-bot==22.8
    python-dotenv==1.2.2
    Flask==3.1.2

`database.py` must expose functions used by `server.py`: `init_db`, `list_modules`, `create_module`, `update_module`, `delete_module`, `list_lessons`, `get_lesson`, `create_lesson`, `update_lesson`, and `delete_lesson`.

`server.py` must expose learner routes:

    GET /api/modules
    GET /api/modules/<module_id>/lessons
    GET /api/lessons/<lesson_id>

`server.py` must expose admin routes:

    POST /api/admin/modules
    PUT /api/admin/modules/<module_id>
    DELETE /api/admin/modules/<module_id>
    POST /api/admin/lessons
    PUT /api/admin/lessons/<lesson_id>
    DELETE /api/admin/lessons/<lesson_id>

All admin routes must require `X-Admin-Password`.

Revision note: This plan was created because the requested backend and admin panel are a significant feature addition. It records the choice of Flask, SQLite storage, and simple password-header admin protection so the implementation can be restarted from this file alone.

Revision note: Implementation completed on 2026-06-25. The plan was updated to mark all milestones complete, record validation evidence, and capture the outcome that local MVP behavior is working while public HTTPS deployment remains a separate next step.
