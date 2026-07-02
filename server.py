import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request, send_from_directory

import database


BASE_DIR = Path(__file__).resolve().parent
WEBAPP_DIR = BASE_DIR / "webapp"
TASKS_WEBAPP_DIR = WEBAPP_DIR / "tasks"
VALID_BLOCK_TYPES = {"text", "image", "video"}
TASK_FOCUS_MINUTES = {25, 45, 90}


def create_app() -> Flask:
    load_dotenv()
    database.init_db()

    app = Flask(__name__, static_folder=None)

    def require_admin_password() -> tuple[Response, int] | None:
        expected_password = os.getenv("ADMIN_PASSWORD", "").strip()
        provided_password = request.headers.get("X-Admin-Password", "").strip()
        if not expected_password:
            return jsonify({"error": "ADMIN_PASSWORD is not configured"}), 500
        if provided_password != expected_password:
            return jsonify({"error": "Invalid admin password"}), 401
        return None

    def get_json_payload() -> dict[str, Any]:
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return {}
        return payload

    def clean_text(value: Any, max_length: int) -> str:
        text = " ".join(str(value or "").split())
        return text[:max_length]

    def clean_content(value: Any, max_length: int = 20_000) -> str:
        text = str(value or "").strip()
        return text[:max_length]

    def clean_user_id(value: Any) -> str:
        return " ".join(str(value or "").split())[:120]

    def clean_bool(value: Any) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, int):
            return value == 1
        return str(value or "").strip().lower() in {"1", "true", "yes", "да"}

    def clean_focus_minutes(value: Any) -> int | None:
        try:
            minutes = int(value)
        except (TypeError, ValueError):
            return None
        if minutes not in TASK_FOCUS_MINUTES:
            return None
        return minutes

    def validate_block_payload(payload: dict[str, Any]) -> tuple[str, str, tuple[Response, int] | None]:
        block_type = clean_text(payload.get("type"), 20)
        content = clean_content(payload.get("content"))
        if block_type not in VALID_BLOCK_TYPES:
            return "", "", (jsonify({"error": "Block type must be text, image, or video"}), 400)
        if block_type == "text" and not content:
            return "", "", (jsonify({"error": "Text block cannot be empty"}), 400)
        if block_type in {"image", "video"} and not (
            content.startswith("http://") or content.startswith("https://")
        ):
            return "", "", (
                jsonify({"error": "Image and video URLs must start with http:// or https://"}),
                400,
            )
        return block_type, content, None

    def clean_sort_order(value: Any) -> int | None:
        if value in (None, ""):
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    def validate_course_settings(payload: dict[str, Any]) -> tuple[dict[str, str], tuple[Response, int] | None]:
        settings: dict[str, str] = {}
        for key in database.DEFAULT_COURSE_SETTINGS:
            value = str(payload.get(key, "") or "").strip()
            if key in {"heroImageUrl", "productImageUrl"} and value and not (
                value.startswith("http://") or value.startswith("https://")
            ):
                return {}, (
                    jsonify({"error": "Image URLs must be empty or start with http:// or https://"}),
                    400,
                )
            settings[key] = value[:1000]
        return settings, None

    @app.get("/")
    def index() -> Response:
        return send_from_directory(WEBAPP_DIR, "index.html")

    @app.get("/admin")
    def admin() -> Response:
        return send_from_directory(WEBAPP_DIR, "admin.html")

    @app.get("/tasks")
    def tasks_index() -> Response:
        return send_from_directory(TASKS_WEBAPP_DIR, "index.html")

    @app.get("/tasks/app.js")
    def tasks_app_js() -> Response:
        return send_from_directory(TASKS_WEBAPP_DIR, "app.js")

    @app.get("/tasks/style.css")
    def tasks_style_css() -> Response:
        return send_from_directory(TASKS_WEBAPP_DIR, "style.css")

    @app.get("/<path:filename>")
    def static_files(filename: str) -> Response:
        return send_from_directory(WEBAPP_DIR, filename)

    @app.get("/api/modules")
    def api_modules() -> Response:
        return jsonify(database.list_modules())

    @app.get("/api/course-settings")
    def api_course_settings() -> Response:
        return jsonify(database.get_course_settings())

    @app.get("/api/tasks/today")
    def api_tasks_today() -> tuple[Response, int] | Response:
        user_id = clean_user_id(request.args.get("user_id"))
        if not user_id:
            return jsonify({"error": "user_id is required"}), 400
        return jsonify({
            "task": database.get_daily_task(user_id),
            "stats": database.get_daily_task_stats(user_id),
        })

    @app.post("/api/tasks/start")
    def api_tasks_start() -> tuple[Response, int] | Response:
        payload = get_json_payload()
        user_id = clean_user_id(payload.get("user_id"))
        main_task = clean_text(payload.get("main_task"), 240)
        secondary_task = clean_text(payload.get("secondary_task"), 240)
        daily_ban = clean_text(payload.get("daily_ban"), 120)
        promise = clean_text(payload.get("promise"), 300)
        focus_minutes = clean_focus_minutes(payload.get("focus_minutes"))

        if not user_id:
            return jsonify({"error": "user_id is required"}), 400
        if not main_task:
            return jsonify({"error": "main_task is required"}), 400
        if not daily_ban:
            return jsonify({"error": "daily_ban is required"}), 400
        if focus_minutes is None:
            return jsonify({"error": "focus_minutes must be 25, 45, or 90"}), 400

        task = database.start_daily_task(
            user_id=user_id,
            main_task=main_task,
            secondary_task=secondary_task,
            daily_ban=daily_ban,
            focus_minutes=focus_minutes,
            promise=promise,
        )
        return jsonify({"task": task, "stats": database.get_daily_task_stats(user_id)}), 201

    @app.post("/api/tasks/complete")
    def api_tasks_complete() -> tuple[Response, int] | Response:
        payload = get_json_payload()
        user_id = clean_user_id(payload.get("user_id"))
        if not user_id:
            return jsonify({"error": "user_id is required"}), 400

        task = database.complete_daily_task(
            user_id=user_id,
            task_done=clean_bool(payload.get("task_done")),
            ban_broken=clean_bool(payload.get("ban_broken")),
            wasted_time=clean_text(payload.get("wasted_time"), 80),
            blocker=clean_text(payload.get("blocker"), 120),
            tomorrow_fix=clean_content(payload.get("tomorrow_fix"), 1000),
        )
        if task is None:
            return jsonify({"error": "Daily protocol was not started"}), 404
        return jsonify({"task": task, "stats": database.get_daily_task_stats(user_id)})

    @app.get("/api/tasks/stats")
    def api_tasks_stats() -> tuple[Response, int] | Response:
        user_id = clean_user_id(request.args.get("user_id"))
        if not user_id:
            return jsonify({"error": "user_id is required"}), 400
        return jsonify(database.get_daily_task_stats(user_id))

    @app.get("/api/modules/<int:module_id>/lessons")
    def api_module_lessons(module_id: int) -> tuple[Response, int] | Response:
        if database.get_module(module_id) is None:
            return jsonify({"error": "Module not found"}), 404
        lessons = [
            {
                "id": lesson["id"],
                "module_id": lesson["module_id"],
                "title": lesson["title"],
                "sort_order": lesson["sort_order"],
            }
            for lesson in database.list_lessons(module_id)
        ]
        return jsonify(lessons)

    @app.get("/api/lessons/<int:lesson_id>")
    def api_lesson(lesson_id: int) -> tuple[Response, int] | Response:
        lesson = database.get_lesson(lesson_id)
        if lesson is None:
            return jsonify({"error": "Lesson not found"}), 404
        return jsonify(lesson)

    @app.get("/api/lessons/<int:lesson_id>/blocks")
    def api_lesson_blocks(lesson_id: int) -> tuple[Response, int] | Response:
        if database.get_lesson(lesson_id) is None:
            return jsonify({"error": "Lesson not found"}), 404
        return jsonify(database.list_lesson_blocks(lesson_id))

    @app.get("/api/admin/modules")
    def api_admin_modules() -> tuple[Response, int] | Response:
        denied = require_admin_password()
        if denied is not None:
            return denied
        return jsonify(database.list_modules())

    @app.get("/api/admin/course-settings")
    def api_admin_course_settings() -> tuple[Response, int] | Response:
        denied = require_admin_password()
        if denied is not None:
            return denied
        return jsonify(database.get_course_settings())

    @app.put("/api/admin/course-settings")
    def api_update_course_settings() -> tuple[Response, int] | Response:
        denied = require_admin_password()
        if denied is not None:
            return denied

        settings, error = validate_course_settings(get_json_payload())
        if error is not None:
            return error
        return jsonify(database.update_course_settings(settings))

    @app.post("/api/admin/modules")
    def api_create_module() -> tuple[Response, int]:
        denied = require_admin_password()
        if denied is not None:
            return denied

        payload = get_json_payload()
        title = clean_text(payload.get("title"), 160)
        if not title:
            return jsonify({"error": "Module title is required"}), 400
        module = database.create_module(title, clean_sort_order(payload.get("sort_order")))
        return jsonify(module), 201

    @app.put("/api/admin/modules/<int:module_id>")
    def api_update_module(module_id: int) -> tuple[Response, int] | Response:
        denied = require_admin_password()
        if denied is not None:
            return denied

        payload = get_json_payload()
        title = clean_text(payload.get("title"), 160)
        if not title:
            return jsonify({"error": "Module title is required"}), 400
        module = database.update_module(
            module_id,
            title,
            clean_sort_order(payload.get("sort_order")),
        )
        if module is None:
            return jsonify({"error": "Module not found"}), 404
        return jsonify(module)

    @app.delete("/api/admin/modules/<int:module_id>")
    def api_delete_module(module_id: int) -> tuple[Response, int] | Response:
        denied = require_admin_password()
        if denied is not None:
            return denied

        if not database.delete_module(module_id):
            return jsonify({"error": "Module not found"}), 404
        return jsonify({"ok": True})

    @app.get("/api/admin/lessons")
    def api_admin_lessons() -> tuple[Response, int] | Response:
        denied = require_admin_password()
        if denied is not None:
            return denied
        return jsonify(database.list_lessons())

    @app.post("/api/admin/lessons")
    def api_create_lesson() -> tuple[Response, int]:
        denied = require_admin_password()
        if denied is not None:
            return denied

        payload = get_json_payload()
        module_id = clean_sort_order(payload.get("module_id"))
        title = clean_text(payload.get("title"), 160)
        content = clean_content(payload.get("content"))
        if module_id is None or database.get_module(module_id) is None:
            return jsonify({"error": "Valid module_id is required"}), 400
        if not title:
            return jsonify({"error": "Lesson title is required"}), 400

        lesson = database.create_lesson(
            module_id,
            title,
            content,
            clean_sort_order(payload.get("sort_order")),
        )
        return jsonify(lesson), 201

    @app.put("/api/admin/lessons/<int:lesson_id>")
    def api_update_lesson(lesson_id: int) -> tuple[Response, int] | Response:
        denied = require_admin_password()
        if denied is not None:
            return denied

        payload = get_json_payload()
        module_id = clean_sort_order(payload.get("module_id"))
        title = clean_text(payload.get("title"), 160)
        content = clean_content(payload.get("content"))
        if module_id is None or database.get_module(module_id) is None:
            return jsonify({"error": "Valid module_id is required"}), 400
        if not title:
            return jsonify({"error": "Lesson title is required"}), 400

        lesson = database.update_lesson(
            lesson_id,
            module_id,
            title,
            content,
            clean_sort_order(payload.get("sort_order")),
        )
        if lesson is None:
            return jsonify({"error": "Lesson not found"}), 404
        return jsonify(lesson)

    @app.delete("/api/admin/lessons/<int:lesson_id>")
    def api_delete_lesson(lesson_id: int) -> tuple[Response, int] | Response:
        denied = require_admin_password()
        if denied is not None:
            return denied

        if not database.delete_lesson(lesson_id):
            return jsonify({"error": "Lesson not found"}), 404
        return jsonify({"ok": True})

    @app.post("/api/admin/lessons/<int:lesson_id>/blocks")
    def api_create_lesson_block(lesson_id: int) -> tuple[Response, int] | Response:
        denied = require_admin_password()
        if denied is not None:
            return denied
        if database.get_lesson(lesson_id) is None:
            return jsonify({"error": "Lesson not found"}), 404

        payload = get_json_payload()
        block_type, content, error = validate_block_payload(payload)
        if error is not None:
            return error

        block = database.create_lesson_block(
            lesson_id,
            block_type,
            content,
            clean_sort_order(payload.get("position")),
        )
        return jsonify(block), 201

    @app.put("/api/admin/lesson-blocks/<int:block_id>")
    def api_update_lesson_block(block_id: int) -> tuple[Response, int] | Response:
        denied = require_admin_password()
        if denied is not None:
            return denied

        payload = get_json_payload()
        block_type, content, error = validate_block_payload(payload)
        if error is not None:
            return error

        block = database.update_lesson_block(
            block_id,
            block_type,
            content,
            clean_sort_order(payload.get("position")),
        )
        if block is None:
            return jsonify({"error": "Lesson block not found"}), 404
        return jsonify(block)

    @app.delete("/api/admin/lesson-blocks/<int:block_id>")
    def api_delete_lesson_block(block_id: int) -> tuple[Response, int] | Response:
        denied = require_admin_password()
        if denied is not None:
            return denied

        if not database.delete_lesson_block(block_id):
            return jsonify({"error": "Lesson block not found"}), 404
        return jsonify({"ok": True})

    @app.post("/api/admin/lessons/<int:lesson_id>/blocks/reorder")
    def api_reorder_lesson_blocks(lesson_id: int) -> tuple[Response, int] | Response:
        denied = require_admin_password()
        if denied is not None:
            return denied
        if database.get_lesson(lesson_id) is None:
            return jsonify({"error": "Lesson not found"}), 404

        payload = get_json_payload()
        block_ids = payload.get("block_ids")
        if not isinstance(block_ids, list):
            return jsonify({"error": "block_ids must be a list"}), 400

        try:
            blocks = database.reorder_lesson_blocks(
                lesson_id,
                [int(block_id) for block_id in block_ids],
            )
        except (TypeError, ValueError):
            return jsonify({"error": "block_ids must match all blocks in the lesson"}), 400
        return jsonify(blocks)

    return app


app = create_app()


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    app.run(host="127.0.0.1", port=port, debug=True)
