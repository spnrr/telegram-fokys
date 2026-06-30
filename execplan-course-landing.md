# Add course landing screen and last lesson resume

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository has `PLANS.md` at the project root. This document is maintained in accordance with `PLANS.md`.

## Purpose / Big Picture

After this change, opening the Mini App shows a premium dark course landing screen before the list of course steps. The learner can press "Продолжить" to resume the last opened lesson if one exists, or open the course steps if this is their first visit. This makes the Mini App feel like a closed product rather than a raw lesson list.

The visible proof is that the site opens to a Protocol-branded product page, then "Продолжить" opens either the last saved lesson or the steps screen. Opening any lesson stores its id, module id, title, and timestamp in localStorage.

## Progress

- [x] (2026-06-30 11:51Z) Read `PLANS.md` and inspected the current Mini App frontend.
- [x] (2026-06-30 11:56Z) Added frontend landing configuration that keeps editable copy and image URLs in one object.
- [x] (2026-06-30 11:56Z) Added localStorage helpers for the last opened lesson.
- [x] (2026-06-30 11:56Z) Added landing, modules, and lesson screen state transitions without changing backend APIs.
- [x] (2026-06-30 11:56Z) Added dark Protocol landing styles.
- [x] (2026-06-30 11:56Z) Validated JavaScript/Python syntax and documented manual checks.

## Surprises & Discoveries

- Observation: The existing frontend already controls all student navigation from `webapp/app.js`, so the landing screen can be added without backend changes.
  Evidence: `renderModules()`, `renderModuleSteps()`, and `renderLesson(moduleId, lessonId)` currently handle the full Mini App flow.

- Observation: A saved last lesson can become stale if an administrator deletes the lesson after the learner opened it.
  Evidence: The last lesson data is stored client-side in localStorage and is not automatically tied to backend deletions.

## Decision Log

- Decision: Keep landing configuration in `webapp/app.js` for this MVP instead of adding database-backed admin settings.
  Rationale: The user allowed a config object when admin settings are too much for the current architecture. This avoids backend, SQLite, and admin changes while keeping texts and image URLs easy to replace.
  Date/Author: 2026-06-30 / Codex

- Decision: Store last lesson resume data in localStorage using `protocol_last_lesson_id`, `protocol_last_module_id`, `protocol_last_lesson_title`, and `protocol_last_opened_at`.
  Rationale: The user requested these keys, and localStorage matches the existing frontend-only highlight persistence model.
  Date/Author: 2026-06-30 / Codex

- Decision: Before resuming a saved lesson, verify that the saved module and lesson still exist in the current API data.
  Rationale: This prevents a stale localStorage entry from sending the learner into an error screen.
  Date/Author: 2026-06-30 / Codex

## Outcomes & Retrospective

Implemented the frontend-only landing screen and last lesson resume flow. Opening the app now renders a Protocol-styled product landing page first. Pressing "Продолжить" opens the saved lesson when valid, or falls back to the course steps. Opening a lesson stores the requested `protocol_last_*` localStorage keys. Backend, bot, database, start command, Railway setup, and admin UI were not changed.

## Context and Orientation

The student Mini App is served from `webapp/index.html`. The visible content area is `#content`, and the shared header elements are `#eyebrow`, `#pageTitle`, `#pageSubtitle`, and `#backButton`. All student behavior is in `webapp/app.js`. Styles for the student app and admin page are both in `webapp/style.css`, with Mini App-specific dark overrides scoped under `body.mini-app`.

The backend in `server.py` exposes the existing course APIs. This plan does not change `server.py`, `database.py`, `bot.py`, or `start.py`.

## Plan of Work

Add `COURSE_LANDING_CONFIG` near the top of `webapp/app.js`. It will contain the brand title, hero image URL, product image URL, product title, description, price, and button text.

Add helper functions that read and write last lesson data in localStorage. When `renderLesson(moduleId, lessonId)` successfully loads lesson metadata, save the lesson id, module id, lesson title, and current timestamp.

Add `renderLandingScreen()`, `continueCourseFromLanding()`, and `showModulesScreen()` navigation helpers. The landing screen will hide the existing course header, render its own Protocol-style hero/product layout into `#content`, and provide "Продолжить" plus "Все ступени" actions. The modules screen and lesson screen will continue to use the existing header.

Add landing CSS scoped to `body.mini-app` so the admin UI remains unaffected.

## Concrete Steps

Run these commands from `C:\Users\Sasha\Documents\telegram fokus bot`:

    C:\Users\Sasha\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --check webapp\app.js
    python -m py_compile bot.py database.py server.py start.py

Then start the app locally and manually verify the landing screen and resume flow.

## Validation and Acceptance

Opening the site should show the landing screen first, not "Ступени курса". If localStorage does not contain `protocol_last_lesson_id`, pressing "Продолжить" should open "Ступени курса". Opening a lesson should write the four `protocol_last_*` keys. Returning to the landing screen and pressing "Продолжить" should open that lesson. "Все ступени" should always open the modules screen.

Existing behavior must remain intact: modules expand, lessons open, next/previous lesson buttons work, lesson blocks render, text highlighting and copy protection remain in place.

## Idempotence and Recovery

All changes are frontend-only. Reopening or reloading the app is safe. If saved last lesson data becomes stale because the lesson was deleted, the app should fall back to the modules screen. A user can clear resume state by deleting the `protocol_last_*` keys from localStorage.

## Artifacts and Notes

Validation evidence will be added after implementation.

Validation evidence from 2026-06-30:

    C:\Users\Sasha\Documents\telegram fokus bot> C:\Users\Sasha\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --check webapp\app.js
    # no output means success

    C:\Users\Sasha\Documents\telegram fokus bot> python -m py_compile bot.py database.py server.py start.py
    # no output means success

    Local Flask check:
    GET http://127.0.0.1:8000 returned HTTP 200
    GET http://127.0.0.1:8000/app.js returned HTTP 200 and included COURSE_LANDING_CONFIG, protocol_last_lesson_id, and renderLandingScreen
    GET http://127.0.0.1:8000/style.css returned HTTP 200 and included landing-shell, landing-product-card, and landing-continue-button

## Interfaces and Dependencies

No new external dependency is required. The landing screen uses existing DOM APIs, localStorage, and CSS.

Revision note: Initial ExecPlan created for the frontend-only landing screen and resume feature.

Revision note: Implementation completed with local validation evidence and a stale-resume fallback because the landing/resume feature is now present in the frontend without backend changes.
