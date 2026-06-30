# Move landing screen settings into the admin panel

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository has `PLANS.md` at the project root. This document is maintained in accordance with `PLANS.md`.

## Purpose / Big Picture

After this change, the course owner can change the landing screen texts and image URLs from the existing admin panel instead of editing `webapp/app.js`. A learner opening the Mini App sees the saved settings immediately, while empty image URLs still show the dark Protocol placeholder.

The visible proof is that `/admin` contains a "Настройки главного экрана" form. Saving a new title, description, price, or image URL changes the landing screen at `/` without a code edit.

## Progress

- [x] (2026-06-30 12:09Z) Read `PLANS.md` and inspected `database.py`, `server.py`, `webapp/admin.html`, and `webapp/app.js`.
- [x] (2026-06-30 12:13Z) Added SQLite-backed course settings with defaults.
- [x] (2026-06-30 12:13Z) Added public and admin API endpoints for landing settings.
- [x] (2026-06-30 12:13Z) Made the Mini App load settings from the backend with frontend fallback defaults.
- [x] (2026-06-30 12:13Z) Added admin form for editing landing settings.
- [x] (2026-06-30 12:13Z) Validated syntax and local API behavior.

## Surprises & Discoveries

- Observation: The admin panel is a single static `webapp/admin.html` file with inline JavaScript.
  Evidence: All admin UI rendering and API calls are inside the `<script>` tag in `webapp/admin.html`.

- Observation: Local validation confirmed the public settings endpoint returns defaults and the admin endpoint rejects unauthenticated reads.
  Evidence: `GET /api/course-settings` returned product title "Протокол 0."; `GET /api/admin/course-settings` without `X-Admin-Password` returned HTTP 401.

## Decision Log

- Decision: Store landing settings in a simple SQLite key-value table named `course_settings`.
  Rationale: The project already uses SQLite and does not need a larger schema for a single landing screen settings object.
  Date/Author: 2026-06-30 / Codex

- Decision: Keep frontend fallback defaults in `webapp/app.js`.
  Rationale: If the settings API fails temporarily, the Mini App should still render the landing screen instead of showing a broken page.
  Date/Author: 2026-06-30 / Codex

## Outcomes & Retrospective

Implemented the admin-managed landing settings. The landing values are now stored in SQLite, readable by the Mini App through `/api/course-settings`, and editable from `/admin` through the "Настройки главного экрана" form. The Mini App still has fallback defaults in `webapp/app.js` so the landing screen renders even if settings cannot be loaded.

## Context and Orientation

The backend is Flask in `server.py`, with SQLite helpers in `database.py`. The public Mini App is `webapp/index.html` plus `webapp/app.js` and `webapp/style.css`. The admin panel is `webapp/admin.html` and uses `X-Admin-Password` for authenticated API calls.

The current landing screen reads a JavaScript object named `COURSE_LANDING_CONFIG` in `webapp/app.js`. This plan changes that so the object becomes fallback defaults, while the saved values come from the backend.

## Plan of Work

First, add default course settings and a `course_settings` SQLite table in `database.py`. Add helpers to return all settings and update allowed settings.

Second, add `GET /api/course-settings` for the Mini App and authenticated `GET` and `PUT /api/admin/course-settings` for the admin panel. Validate optional image URLs so they are either empty or start with `http://` or `https://`.

Third, update `webapp/app.js` so it loads `/api/course-settings` during app startup and uses the received object when rendering the landing screen.

Fourth, update `webapp/admin.html` with a settings form and save logic.

## Concrete Steps

Run these commands from `C:\Users\Sasha\Documents\telegram fokus bot`:

    C:\Users\Sasha\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --check webapp\app.js
    python -m py_compile bot.py database.py server.py start.py

Then start the app locally, log into `/admin`, save a visible setting, and reload `/` to see it on the landing screen.

## Validation and Acceptance

Acceptance requires that `/api/course-settings` returns landing settings without admin auth, `/api/admin/course-settings` requires the admin password, `/admin` can edit and save the settings, and `/` uses the saved settings. Existing modules, lessons, blocks, highlights, copy protection, and resume behavior must keep working.

## Idempotence and Recovery

Creating the `course_settings` table is safe to run repeatedly. Missing keys are filled from defaults. If an admin saves an empty image URL, the Mini App uses the existing dark placeholder.

## Artifacts and Notes

Validation evidence will be added after implementation.

Validation evidence from 2026-06-30:

    C:\Users\Sasha\Documents\telegram fokus bot> C:\Users\Sasha\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --check webapp\app.js
    # no output means success

    C:\Users\Sasha\Documents\telegram fokus bot> python -m py_compile bot.py database.py server.py start.py
    # no output means success

    Local Flask API checks:
    GET http://127.0.0.1:8000/api/course-settings returned productTitle = Протокол 0.
    GET http://127.0.0.1:8000/api/admin/course-settings without password returned 401

## Interfaces and Dependencies

No new dependency is required. The implementation uses Flask, sqlite3, and existing frontend JavaScript.

Revision note: Initial ExecPlan created for moving landing settings from code into the admin panel.

Revision note: Implementation completed. Added SQLite settings storage, public and admin settings APIs, admin form fields, Mini App backend loading, and validation evidence.
