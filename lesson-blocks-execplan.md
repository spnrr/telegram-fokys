# Add Course Steps and Lesson Blocks

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows the repository guidance in `Plans.md`. The existing project has a Flask backend, SQLite storage, a Telegram Mini App in `webapp/app.js`, and an admin page in `webapp/admin.html`. The deployment entry points `bot.py` and `start.py` are intentionally out of scope unless a validation problem proves they must change.

## Purpose / Big Picture

After this change, the learner sees course modules as expandable steps instead of plain cards. An administrator can build a lesson from ordered text, image, and video blocks, so a photo or video can be placed before, between, or after text. Existing lessons remain readable because old `lessons.content` is preserved and shown as a fallback text block when a lesson has no new blocks.

## Progress

- [x] (2026-06-27 00:00Z) Read project guidance and current backend, Mini App, admin, and README files.
- [x] (2026-06-27 00:05Z) Create this ExecPlan.
- [x] (2026-06-27 00:16Z) Add the `lesson_blocks` SQLite table and database helpers.
- [x] (2026-06-27 00:24Z) Add learner and admin block API endpoints.
- [x] (2026-06-27 00:38Z) Update the Mini App main screen to expandable module steps and render lesson blocks.
- [x] (2026-06-27 00:55Z) Update the admin page with a block editor for text, image, and video blocks.
- [x] (2026-06-27 01:02Z) Update CSS, README, and AGENTS.md for the new behavior.
- [x] (2026-06-27 01:10Z) Validate syntax, API behavior, fallback behavior, and public-file secret scan.
- [x] (2026-06-27 01:14Z) Record final validation evidence and retrospective.

## Surprises & Discoveries

- Observation: The current backend already preserves legacy lesson `content` in API responses, which gives a clean compatibility path for old lessons.
  Evidence: `database.py` selects `lessons.content`, and `server.py` returns it from `GET /api/lessons/<lesson_id>`.

## Decision Log

- Decision: Keep `lessons.content` and add `lesson_blocks` as an additive table.
  Rationale: This matches the requested safe migration and avoids deleting existing Railway data.
  Date/Author: 2026-06-27 / Codex

- Decision: Use button-based block ordering in the admin page and keep drag-and-drop out of the MVP.
  Rationale: The user requested up/down buttons as the reliable baseline; avoiding drag-and-drop reduces mobile and browser edge cases.
  Date/Author: 2026-06-27 / Codex

- Decision: Use a learner endpoint `GET /api/lessons/<lesson_id>/blocks` that returns fallback blocks when no explicit blocks exist.
  Rationale: This lets the Mini App render one unified block list while old lessons continue to work.
  Date/Author: 2026-06-27 / Codex

## Outcomes & Retrospective

The course UI and lesson editor upgrade is complete. The Mini App now shows modules as expandable steps, allows multiple modules to stay open, and opens lessons from the expanded lists. Lessons render ordered blocks from `lesson_blocks`: text, inline images, YouTube iframe videos, and external video buttons.

The admin page now manages lesson blocks. Admins can create text, image, and video blocks, edit block type and content, delete blocks, and reorder blocks with `↑` and `↓`. Existing lessons are preserved because `lessons.content` remains in place and is returned as one fallback text block when a lesson has no explicit blocks.

`bot.py`, `start.py`, Railway startup settings, `WEBAPP_URL`, and `DATABASE_PATH` were not changed.

## Context and Orientation

`modules` are course sections. `lessons` are pages inside modules. The new `lesson_blocks` table stores ordered parts of a lesson. A block is one piece of lesson content: text, image URL, or video URL. The `position` field is an integer used to sort blocks from top to bottom.

The learner interface lives in `webapp/app.js`. The admin interface lives in `webapp/admin.html`. Shared styling lives in `webapp/style.css`. Backend routes are in `server.py`, and database functions are in `database.py`.

## Plan of Work

Update `database.py` so `init_db` creates `lesson_blocks` with a foreign key to `lessons`. Add helper functions to list, create, update, delete, and reorder blocks. The fallback behavior should be implemented by returning one virtual text block from `lessons.content` only when the explicit block list is empty.

Update `server.py` with the requested block endpoints. Admin endpoints will reuse the existing `X-Admin-Password` password check. Validate that text blocks are not empty and image/video values begin with `http://` or `https://`.

Update `webapp/app.js` so the module list becomes expandable steps. Opening a lesson fetches `/api/lessons/<lesson_id>/blocks` and renders text paragraphs, images, YouTube iframes, or a button for non-YouTube video links.

Update `webapp/admin.html` so each lesson has a block editor. It should create text/image/video blocks, edit each block, delete blocks, and move them up or down through the reorder endpoint.

Update `webapp/style.css` and `README.md` to describe and support the new UI.

## Concrete Steps

Work from the repository root:

    C:\Users\Sasha\Documents\telegram fokus bot

Run syntax checks:

    python -m py_compile bot.py database.py server.py start.py

Validate JavaScript syntax with Node if available:

    node --check webapp/app.js

Use Flask's test client with a temporary SQLite database to prove block creation, fallback, update, reorder, and deletion.

## Validation and Acceptance

Acceptance is met when old lessons still render from `lessons.content`, new lessons can be built from ordered text/image/video blocks, the learner view shows expandable steps, and the admin endpoints reject empty text blocks and invalid image/video URLs.

The bot commands `/start`, `/app`, and `/admin`, Railway startup, `WEBAPP_URL`, and `DATABASE_PATH` must remain unchanged.

## Idempotence and Recovery

The migration is safe because it uses `CREATE TABLE IF NOT EXISTS` and does not remove `lessons.content`. Running the service repeatedly will not delete modules, lessons, or blocks. If a block operation fails, the old lesson and existing blocks remain in the database.

## Artifacts and Notes

Validation evidence:

    .\.venv\Scripts\python.exe -m py_compile bot.py database.py server.py start.py
    # exit code 0

    C:\Users\Sasha\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --check webapp\app.js
    # exit code 0

    C:\Users\Sasha\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe -e "...extract inline admin script and compile it..."
    admin js syntax ok

    .\.venv\Scripts\python.exe -c "...Flask test client checks legacy fallback, block create, validation, reorder, update, delete..."
    lesson blocks api ok

    .\.venv\Scripts\python.exe -c "...Flask test client opens /, /admin, /app.js, /style.css..."
    pages ok

    rg -n "[0-9]{8,}:[A-Za-z0-9_-]{20,}|AAF7HNRX" -g "!.env" -g "!.venv/**" -g "!__pycache__/**"
    # no matches

## Interfaces and Dependencies

No new dependencies are required.

New learner endpoint:

    GET /api/lessons/<lesson_id>/blocks

New admin endpoints:

    POST /api/admin/lessons/<lesson_id>/blocks
    PUT /api/admin/lesson-blocks/<block_id>
    DELETE /api/admin/lesson-blocks/<block_id>
    POST /api/admin/lessons/<lesson_id>/blocks/reorder

Revision note: This plan was created because adding lesson blocks changes the database schema and both user-facing interfaces.

Revision note: Implementation completed on 2026-06-27. The plan now records the additive migration, UI changes, admin block editor behavior, validation evidence, and confirmation that deployment entry points were left unchanged.
