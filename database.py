import os
import sqlite3
from pathlib import Path
from typing import Any


DEFAULT_DATABASE_PATH = "course.db"


def get_database_path() -> Path:
    return Path(os.getenv("DATABASE_PATH", DEFAULT_DATABASE_PATH)).expanduser()


def get_connection() -> sqlite3.Connection:
    database_path = get_database_path()
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)


def init_db() -> None:
    with get_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS modules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS lessons (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                module_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
            );
            """
        )


def next_sort_order(table: str, module_id: int | None = None) -> int:
    if table not in {"modules", "lessons"}:
        raise ValueError("Unsupported table name")

    with get_connection() as connection:
        if table == "lessons" and module_id is not None:
            row = connection.execute(
                "SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_order FROM lessons WHERE module_id = ?",
                (module_id,),
            ).fetchone()
        else:
            row = connection.execute(
                f"SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_order FROM {table}"
            ).fetchone()
    return int(row["next_order"])


def list_modules() -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
                modules.id,
                modules.title,
                modules.sort_order,
                COUNT(lessons.id) AS lessons_count
            FROM modules
            LEFT JOIN lessons ON lessons.module_id = modules.id
            GROUP BY modules.id
            ORDER BY modules.sort_order ASC, modules.id ASC
            """
        ).fetchall()
    return [dict(row) for row in rows]


def get_module(module_id: int) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT id, title, sort_order FROM modules WHERE id = ?",
            (module_id,),
        ).fetchone()
    return row_to_dict(row)


def create_module(title: str, sort_order: int | None = None) -> dict[str, Any]:
    if sort_order is None:
        sort_order = next_sort_order("modules")

    with get_connection() as connection:
        cursor = connection.execute(
            "INSERT INTO modules (title, sort_order) VALUES (?, ?)",
            (title, sort_order),
        )
        module_id = int(cursor.lastrowid)
    module = get_module(module_id)
    if module is None:
        raise RuntimeError("Created module was not found")
    return module


def update_module(module_id: int, title: str, sort_order: int | None = None) -> dict[str, Any] | None:
    existing = get_module(module_id)
    if existing is None:
        return None
    if sort_order is None:
        sort_order = int(existing["sort_order"])

    with get_connection() as connection:
        connection.execute(
            "UPDATE modules SET title = ?, sort_order = ? WHERE id = ?",
            (title, sort_order, module_id),
        )
    return get_module(module_id)


def delete_module(module_id: int) -> bool:
    with get_connection() as connection:
        cursor = connection.execute("DELETE FROM modules WHERE id = ?", (module_id,))
    return cursor.rowcount > 0


def list_lessons(module_id: int | None = None) -> list[dict[str, Any]]:
    query = """
        SELECT
            lessons.id,
            lessons.module_id,
            lessons.title,
            lessons.content,
            lessons.sort_order,
            modules.title AS module_title
        FROM lessons
        JOIN modules ON modules.id = lessons.module_id
    """
    params: tuple[Any, ...] = ()
    if module_id is not None:
        query += " WHERE lessons.module_id = ?"
        params = (module_id,)
    query += " ORDER BY modules.sort_order ASC, modules.id ASC, lessons.sort_order ASC, lessons.id ASC"

    with get_connection() as connection:
        rows = connection.execute(query, params).fetchall()
    return [dict(row) for row in rows]


def get_lesson(lesson_id: int) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT
                lessons.id,
                lessons.module_id,
                lessons.title,
                lessons.content,
                lessons.sort_order,
                modules.title AS module_title
            FROM lessons
            JOIN modules ON modules.id = lessons.module_id
            WHERE lessons.id = ?
            """,
            (lesson_id,),
        ).fetchone()
    return row_to_dict(row)


def create_lesson(
    module_id: int,
    title: str,
    content: str,
    sort_order: int | None = None,
) -> dict[str, Any]:
    if sort_order is None:
        sort_order = next_sort_order("lessons", module_id)

    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO lessons (module_id, title, content, sort_order)
            VALUES (?, ?, ?, ?)
            """,
            (module_id, title, content, sort_order),
        )
        lesson_id = int(cursor.lastrowid)
    lesson = get_lesson(lesson_id)
    if lesson is None:
        raise RuntimeError("Created lesson was not found")
    return lesson


def update_lesson(
    lesson_id: int,
    module_id: int,
    title: str,
    content: str,
    sort_order: int | None = None,
) -> dict[str, Any] | None:
    existing = get_lesson(lesson_id)
    if existing is None:
        return None
    if sort_order is None:
        sort_order = int(existing["sort_order"])

    with get_connection() as connection:
        connection.execute(
            """
            UPDATE lessons
            SET module_id = ?, title = ?, content = ?, sort_order = ?
            WHERE id = ?
            """,
            (module_id, title, content, sort_order, lesson_id),
        )
    return get_lesson(lesson_id)


def delete_lesson(lesson_id: int) -> bool:
    with get_connection() as connection:
        cursor = connection.execute("DELETE FROM lessons WHERE id = ?", (lesson_id,))
    return cursor.rowcount > 0
