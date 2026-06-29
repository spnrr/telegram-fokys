# Add protected lesson highlighting to the Mini App

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository has `PLANS.md` at the project root. This document is maintained in accordance with `PLANS.md`.

## Purpose / Big Picture

After this change, a learner can select text inside a lesson, choose a color from a small floating toolbar, and see that fragment highlighted when they reopen the same lesson on the same device. The Mini App should still allow text selection because selection is required for highlighting, but ordinary copying through keyboard shortcuts, context menus, cut events, and drag should be blocked for lesson content.

The visible proof is simple: open the Mini App, open a lesson, select a few words inside a text block, tap a color, leave the lesson, reopen it, and see the highlight restored. Attempting Ctrl+C or the context menu inside the lesson should not copy the text and should show a short "Копирование отключено" notice.

## Progress

- [x] (2026-06-29 11:46Z) Read `PLANS.md` and inspected `webapp/app.js`, `webapp/style.css`, and `server.py` to confirm the work can stay in the frontend.
- [x] (2026-06-29 11:54Z) Added lesson-only copy protection and a small user notice.
- [x] (2026-06-29 11:54Z) Added a floating color toolbar that appears only for non-empty selections inside lesson text blocks.
- [x] (2026-06-29 11:54Z) Rendered text blocks with stable metadata so highlights can be saved by block id and text offsets.
- [x] (2026-06-29 11:54Z) Saved and restored highlights from `localStorage` under `lesson_highlights_<lesson_id>`.
- [x] (2026-06-29 11:54Z) Added CSS for highlights, toolbar, protected lesson text, and protected images.
- [x] (2026-06-29 11:54Z) Validated syntax and checked local lesson rendering, stable text block ids, and absence of browser console errors.

## Surprises & Discoveries

- Observation: No backend changes are needed for the MVP because the student API already returns text blocks with ids and content through `GET /api/lessons/<lesson_id>/blocks`.
  Evidence: `server.py` exposes `/api/lessons/<int:lesson_id>/blocks` and returns `database.list_lesson_blocks(lesson_id)`.

- Observation: A legacy lesson text block in the local database rendered with `block.id` as `null`, so a direct block id would not be stable enough for localStorage keys.
  Evidence: Local browser check showed `.lesson-text-block` initially had `data-block-id="null"` for lesson "Твое Лучшее Утро".

- Observation: The in-app browser automation sandbox did not allow programmatic use of Selection or DOM Event constructors for a full automated selection/copy scenario.
  Evidence: Browser evaluation returned `selection.removeAllRanges is not a function` and `Event is not a constructor`, while normal page load and DOM/CSS checks still reported zero console errors.

## Decision Log

- Decision: Store highlights in browser `localStorage` using text offsets per `lesson_id` and `block_id`.
  Rationale: The user asked for an MVP and explicitly allowed frontend-only persistence. This keeps Railway, SQLite, bot commands, and admin APIs untouched.
  Date/Author: 2026-06-29 / Codex

- Decision: Keep `user-select: text` on lesson text and block copying with JavaScript events instead of CSS.
  Rationale: Text selection is necessary for applying highlights, while copy protection must happen through `copy`, `cut`, `contextmenu`, `dragstart`, and keyboard handlers.
  Date/Author: 2026-06-29 / Codex

- Decision: Use a generated frontend key like `legacy-0` for lesson blocks whose API id is missing or null.
  Rationale: Existing old lessons must support highlights without requiring a database migration or backend change.
  Date/Author: 2026-06-29 / Codex

## Outcomes & Retrospective

Implemented the requested MVP in the Mini App frontend. Lesson text remains selectable, a floating toolbar provides five highlight colors and a remove action, highlights are persisted in localStorage per lesson, and copying/cutting/context-menu/drag/keyboard copy attempts inside lessons are blocked with a short notice. Backend, bot, database, Railway startup, and admin logic were not changed.

Automated validation covered syntax and local rendering. A fully automated real text-selection test was limited by the browser automation sandbox, so final phone/desktop confirmation should be done manually in Telegram and a normal browser.

## Context and Orientation

The Mini App is a static frontend served from `webapp/` by the Flask backend in `server.py`. The main student page is `webapp/index.html`, styles are in `webapp/style.css`, and interactive behavior is in `webapp/app.js`.

Lessons are rendered by `renderLesson(moduleId, lessonId)` in `webapp/app.js`. That function fetches the lesson metadata from `/api/lessons/<lesson_id>` and lesson content blocks from `/api/lessons/<lesson_id>/blocks`. Text blocks are rendered by `appendTextBlock(article, block)`, image blocks by `appendImageBlock(article, block)`, and video blocks by `appendVideoBlock(article, block)`.

Selection API means the browser feature exposed through `window.getSelection()`. It lets the code read the current selected text and the selected range. A range is the start and end of a selection inside DOM nodes. For this MVP, the code will convert that DOM selection into plain-text offsets inside one text block, where offset means the character number from the start of the block.

## Plan of Work

First, add a small frontend state area for highlight colors, the current selected range, and the floating toolbar. The toolbar will be created by JavaScript and appended to `document.body`, so `index.html` does not need new markup.

Second, update text block rendering. Each text block will receive class `lesson-text-block`, `data-block-id`, and `data-lesson-id`. Text blocks will be rendered from the block's plain text and the saved highlights for the current lesson. Highlight spans will only be created by app code and will use safe text nodes, not saved HTML.

Third, add selection handling. On `selectionchange`, `mouseup`, and `touchend`, the code will check whether the selection is non-empty and fully inside a `.lesson-text-block`. If it is valid, the toolbar appears near the selection rectangle. If it is invalid, the toolbar hides.

Fourth, add highlight application and removal. Choosing a color stores `{ blockId, startOffset, endOffset, color }` in `localStorage` and rerenders the lesson text from safe text nodes. Clicking an existing highlight opens the toolbar in remove mode, and the remove button deletes that highlight.

Fifth, add copy protection limited to `.lesson`. Handlers for `copy`, `cut`, `contextmenu`, `dragstart`, and keyboard copy shortcuts will prevent copying only when the event target or current selection is inside the lesson.

Finally, add CSS for the toolbar, color buttons, highlight colors, selectable text, protected images, and the small notice.

## Concrete Steps

Run these commands from the repository root `C:\Users\Sasha\Documents\telegram fokus bot` after editing:

    python -m py_compile bot.py database.py server.py start.py
    C:\Users\Sasha\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --check webapp\app.js
    python start.py

Then open `http://127.0.0.1:8000`, open a lesson, select text, apply a color, reload or reopen the lesson, and confirm the highlight remains.

## Validation and Acceptance

Acceptance requires these behaviors:

In a lesson text block, selecting text shows a floating toolbar with yellow, green, blue, pink, and purple color circles. Pressing a color wraps the selected text visually as a highlight. Reopening the same lesson on the same browser restores the highlight from `localStorage`.

Clicking highlighted text shows a remove action. Pressing remove deletes that saved highlight and rerenders the text without the colored background.

Inside lesson content, Ctrl+C, Cmd+C, cut, context menu, and drag start are blocked. The app shows a short notice that copying is disabled. Text selection remains possible.

Images cannot be dragged and use CSS to discourage saving on touch devices. Videos and navigation buttons continue to work.

## Idempotence and Recovery

The implementation is frontend-only and additive. Re-running the app is safe. If saved highlights become stale because lesson text changed in the admin panel, invalid offsets should be ignored while rendering instead of breaking the lesson. A user can clear highlights manually through browser storage by deleting the `lesson_highlights_<lesson_id>` key.

## Artifacts and Notes

Validation evidence will be added here after implementation.

Validation evidence from 2026-06-29:

    C:\Users\Sasha\Documents\telegram fokus bot> python -m py_compile bot.py database.py server.py start.py
    # no output means success

    C:\Users\Sasha\Documents\telegram fokus bot> C:\Users\Sasha\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --check webapp\app.js
    # no output means success

    Local browser check:
    title: Твое Лучшее Утро
    lessonExists: true
    textBlockExists: true
    textBlockId: legacy-0
    textBlockUserSelect: text
    browser console errors: 0

## Interfaces and Dependencies

No new external dependency is required.

In `webapp/app.js`, the final behavior should expose frontend helper functions for reading and writing localStorage highlights, rendering text segments with spans, positioning the selection toolbar, blocking lesson copy events, and applying/removing highlights. These helpers are implementation details and do not change public APIs.

In `webapp/style.css`, classes must include `.highlight`, `.highlight-yellow`, `.highlight-green`, `.highlight-blue`, `.highlight-pink`, `.highlight-purple`, `.selection-toolbar`, and related button/notice styles.

Revision note: Initial ExecPlan created to guide the frontend-only copy protection and lesson highlighting work requested by the user.

Revision note: Implementation completed. Added frontend-only selection toolbar, highlight persistence, copy blocking, legacy block keys, CSS styling, and validation evidence because the requested behavior is now implemented without backend changes.
