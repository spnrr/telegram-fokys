import os
import sqlite3
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any


DEFAULT_DATABASE_PATH = "course.db"

DEFAULT_COURSE_SETTINGS = {
    "brandTitle": "Протокол 0.",
    "brandSubtitle": "закрытый курс",
    "heroImageUrl": "",
    "heroKicker": "ПРОТОКОЛ",
    "heroTitle": "Следуй протоколу",
    "heroDescription": "Закрытая система уроков, фокуса и движения вперёд.",
    "productImageUrl": "",
    "productTitle": "Протокол 0.",
    "productDescription": "Ты уже здесь. Обратного пути нет.",
    "productPrice": "Бесплатно",
    "continueButtonText": "Продолжить",
    "searchPlaceholder": "Поиск по названию",
    "authorName": "Protocol",
}


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

            CREATE TABLE IF NOT EXISTS lesson_blocks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lesson_id INTEGER NOT NULL,
                type TEXT NOT NULL,
                content TEXT NOT NULL,
                position INTEGER NOT NULL,
                FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS course_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS daily_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                date TEXT NOT NULL,
                main_task TEXT,
                secondary_task TEXT,
                daily_ban TEXT,
                focus_minutes INTEGER,
                promise TEXT,
                task_done INTEGER DEFAULT 0,
                ban_broken INTEGER DEFAULT 0,
                wasted_time TEXT,
                blocker TEXT,
                tomorrow_fix TEXT,
                completed INTEGER DEFAULT 0,
                created_at TEXT,
                completed_at TEXT,
                UNIQUE(user_id, date)
            );
            """
        )
        connection.executemany(
            """
            INSERT OR IGNORE INTO course_settings (key, value)
            VALUES (?, ?)
            """,
            DEFAULT_COURSE_SETTINGS.items(),
        )


def get_course_settings() -> dict[str, str]:
    with get_connection() as connection:
        rows = connection.execute("SELECT key, value FROM course_settings").fetchall()

    settings = dict(DEFAULT_COURSE_SETTINGS)
    settings.update({str(row["key"]): str(row["value"]) for row in rows})
    return settings


def update_course_settings(values: dict[str, Any]) -> dict[str, str]:
    allowed_keys = set(DEFAULT_COURSE_SETTINGS)
    clean_values = {
        key: str(value or "").strip()
        for key, value in values.items()
        if key in allowed_keys
    }

    with get_connection() as connection:
        connection.executemany(
            """
            INSERT INTO course_settings (key, value)
            VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """,
            clean_values.items(),
        )
    return get_course_settings()


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


def next_block_position(lesson_id: int) -> int:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT COALESCE(MAX(position), 0) + 10 AS next_position
            FROM lesson_blocks
            WHERE lesson_id = ?
            """,
            (lesson_id,),
        ).fetchone()
    return int(row["next_position"])


def list_lesson_blocks(lesson_id: int, include_legacy_fallback: bool = True) -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, lesson_id, type, content, position
            FROM lesson_blocks
            WHERE lesson_id = ?
            ORDER BY position ASC, id ASC
            """,
            (lesson_id,),
        ).fetchall()
        blocks = [dict(row) for row in rows]
        if blocks or not include_legacy_fallback:
            return blocks

        lesson = connection.execute(
            "SELECT id, content FROM lessons WHERE id = ?",
            (lesson_id,),
        ).fetchone()

    if lesson is None:
        return []

    content = str(lesson["content"] or "").strip()
    if not content:
        return []

    return [
        {
            "id": None,
            "lesson_id": int(lesson["id"]),
            "type": "text",
            "content": content,
            "position": 10,
            "is_legacy": True,
        }
    ]


def get_lesson_block(block_id: int) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, lesson_id, type, content, position
            FROM lesson_blocks
            WHERE id = ?
            """,
            (block_id,),
        ).fetchone()
    return row_to_dict(row)


def create_lesson_block(
    lesson_id: int,
    block_type: str,
    content: str,
    position: int | None = None,
) -> dict[str, Any]:
    if position is None:
        position = next_block_position(lesson_id)

    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO lesson_blocks (lesson_id, type, content, position)
            VALUES (?, ?, ?, ?)
            """,
            (lesson_id, block_type, content, position),
        )
        block_id = int(cursor.lastrowid)
    block = get_lesson_block(block_id)
    if block is None:
        raise RuntimeError("Created lesson block was not found")
    return block


def update_lesson_block(
    block_id: int,
    block_type: str,
    content: str,
    position: int | None = None,
) -> dict[str, Any] | None:
    existing = get_lesson_block(block_id)
    if existing is None:
        return None
    if position is None:
        position = int(existing["position"])

    with get_connection() as connection:
        connection.execute(
            """
            UPDATE lesson_blocks
            SET type = ?, content = ?, position = ?
            WHERE id = ?
            """,
            (block_type, content, position, block_id),
        )
    return get_lesson_block(block_id)


def delete_lesson_block(block_id: int) -> bool:
    with get_connection() as connection:
        cursor = connection.execute("DELETE FROM lesson_blocks WHERE id = ?", (block_id,))
    return cursor.rowcount > 0


def reorder_lesson_blocks(lesson_id: int, block_ids: list[int]) -> list[dict[str, Any]]:
    existing_blocks = list_lesson_blocks(lesson_id, include_legacy_fallback=False)
    existing_ids = {int(block["id"]) for block in existing_blocks}
    requested_ids = [int(block_id) for block_id in block_ids]

    if set(requested_ids) != existing_ids or len(requested_ids) != len(existing_ids):
        raise ValueError("Block ids must match all blocks in the lesson")

    with get_connection() as connection:
        for index, block_id in enumerate(requested_ids, start=1):
            connection.execute(
                "UPDATE lesson_blocks SET position = ? WHERE id = ? AND lesson_id = ?",
                (index * 10, block_id, lesson_id),
            )
    return list_lesson_blocks(lesson_id, include_legacy_fallback=False)


def today_iso() -> str:
    return date.today().isoformat()


def current_timestamp() -> str:
    return datetime.now().replace(microsecond=0).isoformat()


def get_daily_task(user_id: str, task_date: str | None = None) -> dict[str, Any] | None:
    task_date = task_date or today_iso()
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT *
            FROM daily_tasks
            WHERE user_id = ? AND date = ?
            """,
            (user_id, task_date),
        ).fetchone()
    return row_to_dict(row)


def start_daily_task(
    user_id: str,
    main_task: str,
    secondary_task: str,
    daily_ban: str,
    focus_minutes: int,
    promise: str,
    task_date: str | None = None,
) -> dict[str, Any]:
    task_date = task_date or today_iso()
    created_at = current_timestamp()
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO daily_tasks (
                user_id,
                date,
                main_task,
                secondary_task,
                daily_ban,
                focus_minutes,
                promise,
                task_done,
                ban_broken,
                wasted_time,
                blocker,
                tomorrow_fix,
                completed,
                created_at,
                completed_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, '', '', '', 0, ?, NULL)
            ON CONFLICT(user_id, date) DO UPDATE SET
                main_task = excluded.main_task,
                secondary_task = excluded.secondary_task,
                daily_ban = excluded.daily_ban,
                focus_minutes = excluded.focus_minutes,
                promise = excluded.promise,
                task_done = 0,
                ban_broken = 0,
                wasted_time = '',
                blocker = '',
                tomorrow_fix = '',
                completed = 0,
                completed_at = NULL
            """,
            (
                user_id,
                task_date,
                main_task,
                secondary_task,
                daily_ban,
                focus_minutes,
                promise,
                created_at,
            ),
        )
    task = get_daily_task(user_id, task_date)
    if task is None:
        raise RuntimeError("Created daily task was not found")
    return task


def complete_daily_task(
    user_id: str,
    task_done: bool,
    ban_broken: bool,
    wasted_time: str,
    blocker: str,
    tomorrow_fix: str,
    task_date: str | None = None,
) -> dict[str, Any] | None:
    task_date = task_date or today_iso()
    completed_at = current_timestamp()
    with get_connection() as connection:
        cursor = connection.execute(
            """
            UPDATE daily_tasks
            SET
                task_done = ?,
                ban_broken = ?,
                wasted_time = ?,
                blocker = ?,
                tomorrow_fix = ?,
                completed = 1,
                completed_at = ?
            WHERE user_id = ? AND date = ?
            """,
            (
                1 if task_done else 0,
                1 if ban_broken else 0,
                wasted_time,
                blocker,
                tomorrow_fix,
                completed_at,
                user_id,
                task_date,
            ),
        )
        if cursor.rowcount == 0:
            return None
    return get_daily_task(user_id, task_date)


def _calculate_day_streak(task_dates: set[str]) -> int:
    streak = 0
    cursor = date.today()
    while cursor.isoformat() in task_dates:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def get_daily_task_stats(user_id: str) -> dict[str, Any]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT *
            FROM daily_tasks
            WHERE user_id = ?
            ORDER BY date DESC
            """,
            (user_id,),
        ).fetchall()

    tasks = [dict(row) for row in rows]
    task_dates = {str(task["date"]) for task in tasks}
    blocker_counts = Counter(
        str(task.get("blocker") or "").strip()
        for task in tasks
        if str(task.get("blocker") or "").strip()
        and str(task.get("blocker") or "").strip().lower() != "ничего"
    )
    most_common_blocker = blocker_counts.most_common(1)[0][0] if blocker_counts else "Нет данных"

    return {
        "total_days": len(tasks),
        "tasks_done": sum(1 for task in tasks if int(task.get("task_done") or 0) == 1),
        "current_streak": _calculate_day_streak(task_dates),
        "ban_broken_count": sum(1 for task in tasks if int(task.get("ban_broken") or 0) == 1),
        "most_common_blocker": most_common_blocker,
        "recent_days": [
            {
                "date": task.get("date"),
                "main_task": task.get("main_task") or "",
                "task_done": int(task.get("task_done") or 0),
                "ban_broken": int(task.get("ban_broken") or 0),
                "wasted_time": task.get("wasted_time") or "",
                "blocker": task.get("blocker") or "",
                "completed": int(task.get("completed") or 0),
            }
            for task in tasks[:10]
        ],
    }
