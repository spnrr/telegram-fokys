import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request, send_from_directory

import database


BASE_DIR = Path(__file__).resolve().parent
WEBAPP_DIR = BASE_DIR / "webapp"


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

    def clean_sort_order(value: Any) -> int | None:
        if value in (None, ""):
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    @app.get("/")
    def index() -> Response:
        return send_from_directory(WEBAPP_DIR, "index.html")

    @app.get("/admin")
    def admin() -> Response:
        return send_from_directory(WEBAPP_DIR, "admin.html")

    @app.get("/<path:filename>")
    def static_files(filename: str) -> Response:
        return send_from_directory(WEBAPP_DIR, filename)

    @app.get("/api/modules")
    def api_modules() -> Response:
        return jsonify(database.list_modules())

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

    @app.get("/api/admin/modules")
    def api_admin_modules() -> tuple[Response, int] | Response:
        denied = require_admin_password()
        if denied is not None:
            return denied
        return jsonify(database.list_modules())

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
        if not content:
            return jsonify({"error": "Lesson content is required"}), 400

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
        if not content:
            return jsonify({"error": "Lesson content is required"}), 400

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

    return app


app = create_app()


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    app.run(host="127.0.0.1", port=port, debug=True)
