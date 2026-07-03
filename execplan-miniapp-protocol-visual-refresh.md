# Protocol Mini App visual refresh

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository has `PLANS.md` at the project root. This document is maintained in accordance with `PLANS.md`.

## Purpose / Big Picture

After this change, the Telegram Mini App should feel closer to a premium closed course called Protocol: a dark product landing page, a strict course menu, and a calm long-form lesson reading screen. A user should still open the Mini App, continue the course, expand course steps, open lessons, use highlights, and navigate between lessons exactly as before, but the visual system should be sharper and closer to the supplied references.

## Progress

- [x] (2026-07-03 14:32Z) Reviewed the user's visual references and the current Mini App files `webapp/app.js`, `webapp/style.css`, and `webapp/index.html`.
- [x] (2026-07-03 14:40Z) Updated landing screen structure and styles to emphasize a brand header, large hero, product card, and search area.
- [x] (2026-07-03 14:40Z) Updated course steps into a cleaner menu-like list inspired by the references while keeping existing expand/collapse behavior.
- [x] (2026-07-03 14:40Z) Updated lesson typography and reading layout without breaking lesson blocks, text highlights, images, videos, or navigation.
- [x] (2026-07-03 14:40Z) Ran syntax checks and recorded validation evidence.

## Surprises & Discoveries

- Observation: The current frontend already separates landing, course steps, and lesson rendering in `webapp/app.js`.
  Evidence: `renderLandingScreen`, `renderModuleSteps`, and `renderLesson` are separate functions.

- Observation: The supplied references use fewer visible borders and fewer nested cards than the current Mini App.
  Evidence: The course menu reference shows modules as large text rows on one dark surface, while the old implementation displayed every module as an individual card.

## Decision Log

- Decision: Keep this refresh frontend-only unless a backend change becomes strictly necessary.
  Rationale: The user's goal is visual and UX improvement, and the existing API already supplies the course data needed by the screens.
  Date/Author: 2026-07-03 / Codex

- Decision: Treat the requested unavailable skills as design lenses rather than blocking the task.
  Rationale: The named skills are not installed in this session, but the work can still follow the requested roles: interface structure, taste, and UX.
  Date/Author: 2026-07-03 / Codex

- Decision: Make the module screen a menu-like surface instead of a card grid.
  Rationale: This better matches the user's references and makes long course lists easier to scan on mobile.
  Date/Author: 2026-07-03 / Codex

- Decision: Keep the existing configurable hero and product images, but improve the fallback placeholder.
  Rationale: The admin-managed settings should continue to work, while the empty/default state should still feel like Protocol with a large glowing zero.
  Date/Author: 2026-07-03 / Codex

## Outcomes & Retrospective

Implemented a frontend-only Protocol visual refresh. The landing screen now has a stronger brand bar, large dark hero, quieter product tabs, a heavier product card, and a search field closer to the references. The module screen is now a dark course menu with a close button and large stage rows. Lesson text received a calmer long-read treatment while preserving blocks, media, navigation, and highlight behavior.

## Context and Orientation

The Mini App is served from `webapp/`. `webapp/index.html` contains the base shell with a topbar and `main#content`. `webapp/app.js` builds the screens with DOM methods. `webapp/style.css` contains both older generic styles and newer `body.mini-app` scoped styles for the dark course interface.

The landing screen means the first product-like screen shown by `renderLandingScreen`. The course menu means the expandable step list rendered by `renderModuleSteps`. A lesson screen means the reading screen rendered by `renderLesson`.

## Plan of Work

First, adjust `webapp/app.js` only where semantic hooks are useful: the landing header should have simple icon buttons, the course menu should have a small header block, and lesson screens can keep the existing topbar and content structure.

Second, update `webapp/style.css` to make the landing page closer to the references: a dark full-width hero, stronger product card hierarchy, quieter tabs, and restrained controls. Then make the course steps look like a premium menu list rather than separate heavy cards. Finally, tune lesson typography for long reading.

Third, run JavaScript and Python syntax checks. The expected outcome is no terminal output from the checks.

## Concrete Steps

Run these commands from the repository root `C:\Users\Sasha\Documents\telegram fokus bot` after editing:

    python -m py_compile bot.py database.py server.py start.py
    C:\Users\Sasha\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --check webapp\app.js

## Validation and Acceptance

Open the Mini App or local site. The first screen should show a darker product-style entry screen with a brand row, hero, product card, tabs, and search. Pressing "Продолжить" should still continue to the last lesson or open course steps. Pressing "Все ступени" should still show expandable modules. Tapping a module should still reveal lessons. Opening a lesson should still display text, images, videos, highlight mode, and previous/next buttons.

## Idempotence and Recovery

The work is frontend-only and safe to repeat. If a visual change is disliked, it can be reverted by restoring `webapp/style.css` and any small DOM hook changes in `webapp/app.js`. No database migration or backend state change is involved.

## Artifacts and Notes

Validation evidence will be added after implementation.

Validation evidence from 2026-07-03:

    C:\Users\Sasha\Documents\telegram fokus bot> python -m py_compile bot.py database.py server.py start.py
    # no output means success

    C:\Users\Sasha\Documents\telegram fokus bot> C:\Users\Sasha\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --check webapp\app.js
    # no output means success

## Interfaces and Dependencies

No new external dependencies are required. Existing backend endpoints and localStorage keys remain unchanged.

Revision note: Created this ExecPlan to guide the Protocol-inspired Mini App visual refresh requested with reference screenshots.

Revision note: Completed the frontend-only visual refresh and validation. The work changed only `webapp/app.js`, `webapp/style.css`, and this plan.
