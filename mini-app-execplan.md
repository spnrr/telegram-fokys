# Add a simple learning Telegram Mini App

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan must be maintained in accordance with `Plans.md` in the repository root.

## Purpose / Big Picture

After this change, a Telegram user can send `/app`, tap an inline button, and open a small learning interface inside Telegram. The interface starts with course modules, opens a module to show its lessons, and opens a lesson to show readable lesson text. The existing planning, content, focus, and check-in commands must continue to work unchanged.

The Mini App is a static website: all course data and navigation logic live in `webapp/app.js`. No database, payment, progress tracking, completion button, OpenAI API, or custom authentication is introduced. A human can verify the website locally in a browser and can verify the Telegram launch after publishing `webapp/` at a public HTTPS address and putting that address in `.env` as `WEBAPP_URL`.

## Progress

- [x] (2026-06-24 09:44Z) Read repository instructions and the current bot, environment example, and README.
- [x] (2026-06-24 09:44Z) Chose a static Mini App and a failure-safe `/app` handler that does not prevent the bot from starting when `WEBAPP_URL` is absent.
- [x] (2026-06-24 09:44Z) Added `webapp/index.html`, `webapp/style.css`, and `webapp/app.js` with module, lesson-list, and lesson-detail views.
- [x] (2026-06-24 09:44Z) Added `/app` and failure-safe `WEBAPP_URL` handling to `bot.py` without changing existing command behavior.
- [x] (2026-06-24 09:44Z) Updated `.env.example`, `README.md`, and `AGENTS.md` for static Mini App development and deployment.
- [x] (2026-06-24 09:51Z) Validated Python and JavaScript syntax, `/app` URL and fallback behavior, preservation of existing commands, browser navigation, back controls, mobile layout, console output, and absence of public secrets.

## Surprises & Discoveries

- Observation: The bot already has a persistent reply keyboard with exactly four actions from an earlier requirement.
  Evidence: `bot.py` defines `MAIN_MENU` with `План дня`, `Контент`, `Фокус`, and `Проверка`.

- Observation: The existing `.env` contains the real Telegram token and must not be read, modified, logged, or copied into documentation.
  Evidence: The repository includes an ignored `.env`; `.env.example` contains only a placeholder.

- Observation: A 390-pixel mobile viewport renders one 354.4-pixel card column with no horizontal overflow.
  Evidence: Browser metrics reported `width: 390`, `scrollWidth: 390`, `columns: "354.4px"`, and three visible module cards.

- Observation: The interface remains usable during ordinary browser preview regardless of Telegram client integration.
  Evidence: The complete module-to-lesson navigation worked on localhost, and every bridge call uses optional chaining so local navigation does not depend on Telegram methods.

## Decision Log

- Decision: Keep the Mini App as three static files and store all lesson data in `webapp/app.js`.
  Rationale: This meets the requested MVP scope and avoids a backend, database, and deployment dependencies.
  Date/Author: 2026-06-24 / Codex

- Decision: Open the Mini App from an inline `web_app` button returned by `/app` rather than altering the four-button main keyboard.
  Rationale: It satisfies the new command while preserving the exact existing keyboard and its command mappings.
  Date/Author: 2026-06-24 / Codex

- Decision: Allow the bot to start without `WEBAPP_URL`, but make `/app` explain that the Mini App is not configured.
  Rationale: Existing bot functions remain usable during local frontend development or before HTTPS deployment.
  Date/Author: 2026-06-24 / Codex

- Decision: Require a public HTTPS URL for the Telegram launch button and document a separate local HTTP server only for browser development.
  Rationale: Telegram Mini Apps need a reachable secure webpage, while local browser verification does not.
  Date/Author: 2026-06-24 / Codex

## Outcomes & Retrospective

The static learning Mini App is complete. It presents three modules, two lessons per module, full lesson text, local back navigation, and Telegram native back-button integration when opened inside the client. The bot now registers `/app`, reads `WEBAPP_URL`, creates a `WebAppInfo` launch button for a valid HTTPS address, and remains fully operational with a clear fallback when the address is absent.

Python compilation, JavaScript syntax, focused handler checks, all three interface levels, two-step back navigation, mobile overflow, and browser console output were verified. Existing commands remain registered. The only remaining operational step is outside the repository: publish `webapp/` at a public HTTPS URL, copy that URL into the private `.env`, and restart the bot.

## Context and Orientation

`bot.py` is the single Python entry point. It loads `TELEGRAM_BOT_TOKEN` from `.env`, creates a `python-telegram-bot` `Application`, registers all command and conversation handlers, and starts long polling. Long polling means the Python process repeatedly asks Telegram for new updates; it does not serve web files.

`requirements.txt` pins `python-telegram-bot` and `python-dotenv`. No new Python dependency is needed because the Mini App is static.

`.env.example` documents safe placeholder environment variables. The real `.env` is ignored and must remain private. `WEBAPP_URL` is the public HTTPS address where `webapp/index.html` and its adjacent CSS and JavaScript files are deployed.

`webapp/index.html` will provide the page structure and load Telegram's Web App bridge plus local CSS and JavaScript. The bridge is a small Telegram-provided script that lets the page tell Telegram it is ready, expand the visible area, and use Telegram's native back button when available.

`webapp/style.css` will implement a mobile-first layout using Telegram theme variables with ordinary browser fallbacks. `webapp/app.js` will contain course data and render three states: module list, lesson list, and lesson detail. Navigation must use DOM `textContent`, not HTML assembled from lesson data.

`README.md` explains bot setup, local static preview, public HTTPS deployment, `WEBAPP_URL`, and manual acceptance checks. `AGENTS.md` records the new static frontend and verification commands.

## Plan of Work

Create an accessible single-page interface in `webapp/`. The HTML will contain a compact header with a local back button, a title and subtitle region, and a main content container. The CSS will present modules and lessons as large touch targets, keep lesson text readable on narrow screens, and use Telegram colors when opened in the client. The JavaScript will define at least three example modules with multiple lessons, render buttons for each level, update the heading as the user navigates, and coordinate both the local and Telegram back buttons.

Extend `bot.py` by importing `WebAppInfo`, adding an `/app` callback, and registering its `CommandHandler`. The callback will read the already-loaded `WEBAPP_URL` from `application.bot_data`, validate that it is a public HTTPS URL, and return an `InlineKeyboardMarkup` whose button uses `web_app=WebAppInfo(url=...)`. `build_application` will accept an optional web app URL for deterministic tests, and `main` will read the value from the environment. Existing handlers and the four-button reply keyboard stay intact.

Add `WEBAPP_URL=https://example.com` to `.env.example`, document `/app`, and explain that `python -m http.server 8080 --directory webapp` is for local browser preview only. For a Telegram test, the user must deploy the directory to static HTTPS hosting, put the final URL in `.env`, restart `bot.py`, send `/app`, and tap the launch button.

## Concrete Steps

Work from `C:\Users\Sasha\Documents\telegram fokus bot`.

Create and inspect the static files, then run:

    .\.venv\Scripts\python.exe -m http.server 8080 --directory webapp

Open `http://127.0.0.1:8080` in the local browser. Expect a module list. Click a module and expect its lesson list. Click a lesson and expect the full lesson text. Use Back twice and expect to return first to lessons and then modules.

Validate Python and the bot application with:

    .\.venv\Scripts\python.exe -m py_compile bot.py

Run a focused local script that imports `bot`, builds the application with a fake syntactically valid bot token and a sample HTTPS URL, verifies that `/app` is registered, calls the `/app` callback with an asynchronous mock message, and checks that the reply contains a `WebAppInfo` button with exactly that URL. Also call it with an empty URL and verify the safe configuration message.

No real Telegram request is made during automated validation. A final Telegram launch requires the user's real token and public HTTPS deployment.

Observed focused output:

    python syntax: ok
    javascript syntax: ok
    /app button url: ok
    /app missing url fallback: ok
    existing commands: preserved

## Validation and Acceptance

The implementation is accepted when `python -m py_compile bot.py` exits successfully; the focused Python check proves that the old application handlers still build and `/app` produces the correct web-app button; the browser shows all three navigation levels without console errors; the back controls return to the prior view; the layout remains readable at a narrow mobile viewport; and no secret matching a Telegram token appears outside ignored `.env`.

For manual Telegram acceptance, set `WEBAPP_URL` to the deployed HTTPS page, restart the bot, send `/app`, tap `Открыть обучение`, and observe the module list inside Telegram. The existing `/start`, `/help`, `/plan`, `/content`, `/focus`, and `/check` flows must still respond.

## Idempotence and Recovery

All source edits are additive or narrow and can be applied repeatedly without external state. The static preview server can be stopped with `Ctrl+C` and restarted safely. If the chosen local port is busy, use another port for browser preview; this does not change `WEBAPP_URL` used by Telegram.

If the public site is unavailable or `WEBAPP_URL` is missing, the bot remains operational and `/app` returns a configuration message. Restore service by fixing the URL in `.env` and restarting the bot. Never replace `.env.example` with the real token or deployment secrets.

## Artifacts and Notes

Python and JavaScript checks completed without errors. Browser snapshots showed `Модули курса`, then module `Осознанный фокус`, then lesson `Одна главная задача`, followed by successful returns to lessons and modules. The mobile viewport reported no horizontal overflow, the browser console reported zero errors, and the corrected final public secret scan reported zero matches outside ignored `.env`.

## Interfaces and Dependencies

In `bot.py`, preserve `build_application(token: str, webapp_url: str = "") -> Application` and add:

    async def open_app(update: Update, context: CallbackContext) -> None:

The callback reads `context.application.bot_data["webapp_url"]`. A valid configuration produces `InlineKeyboardButton("Открыть обучение", web_app=WebAppInfo(url=webapp_url))`. An empty or non-HTTPS configuration produces a normal text response and no button.

In `webapp/app.js`, keep one in-memory `courseModules` array. Every module has an `id`, `title`, `description`, and `lessons`; every lesson has an `id`, `title`, `summary`, and `content`. Rendering functions must create DOM nodes and set textual content safely.

No new package is added to `requirements.txt`. The external Telegram Web App bridge is loaded only by `webapp/index.html` when the page is viewed.

Revision note (2026-06-24): Created the initial self-contained plan before implementation because the Mini App spans bot integration, static frontend navigation, environment configuration, deployment documentation, and browser verification.

Revision note (2026-06-24 09:51Z): Marked implementation and validation complete, recorded the final static architecture, focused test output, browser navigation evidence, mobile metrics, and the remaining external HTTPS deployment step so the plan reflects the delivered state.

Revision note (2026-06-24 09:51Z): Added the final zero-result public secret scan after correcting the validation command's file-list flattening; no source file or configuration content changed as a result.

Revision note (2026-06-24 09:51Z): Tightened the Telegram bridge observation to describe only verified localhost behavior and the defensive optional calls, avoiding an unsupported claim about the bridge object's runtime presence.
