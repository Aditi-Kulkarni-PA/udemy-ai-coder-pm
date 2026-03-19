import sqlite3
from pathlib import Path

from .default_board import DEFAULT_CARDS, DEFAULT_COLUMNS, DEFAULT_COLUMN_CARD_ORDER
from .schemas import BoardPayload


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(db_path: Path) -> None:
    with connect(db_path) as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS boards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL UNIQUE,
                name TEXT NOT NULL DEFAULT 'Kanban Board',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS columns (
                id TEXT PRIMARY KEY,
                board_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                position INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(board_id, position),
                FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS cards (
                id TEXT PRIMARY KEY,
                board_id INTEGER NOT NULL,
                column_id TEXT NOT NULL,
                title TEXT NOT NULL,
                details TEXT NOT NULL DEFAULT '',
                position INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(column_id, position),
                FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
                FOREIGN KEY (column_id) REFERENCES columns(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
            CREATE INDEX IF NOT EXISTS idx_boards_user_id ON boards(user_id);
            CREATE INDEX IF NOT EXISTS idx_columns_board_position ON columns(board_id, position);
            CREATE INDEX IF NOT EXISTS idx_cards_board_id ON cards(board_id);
            CREATE INDEX IF NOT EXISTS idx_cards_column_position ON cards(column_id, position);
            """
        )
        conn.execute("PRAGMA user_version = 1")


def _seed_board(conn: sqlite3.Connection, board_id: int) -> None:
    for index, column in enumerate(DEFAULT_COLUMNS):
        conn.execute(
            "INSERT INTO columns(id, board_id, title, position) VALUES (?, ?, ?, ?)",
            (column["id"], board_id, column["title"], index),
        )

    for column_id, card_ids in DEFAULT_COLUMN_CARD_ORDER.items():
        for position, card_id in enumerate(card_ids):
            card = DEFAULT_CARDS[card_id]
            conn.execute(
                """
                INSERT INTO cards(id, board_id, column_id, title, details, position)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (card["id"], board_id, column_id, card["title"], card["details"], position),
            )


def ensure_user_board(conn: sqlite3.Connection, username: str) -> int:
    row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if row:
        user_id = int(row["id"])
    else:
        cursor = conn.execute("INSERT INTO users(username) VALUES (?)", (username,))
        user_id = int(cursor.lastrowid)

    board_row = conn.execute("SELECT id FROM boards WHERE user_id = ?", (user_id,)).fetchone()
    if board_row:
        return int(board_row["id"])

    cursor = conn.execute("INSERT INTO boards(user_id, name) VALUES (?, ?)", (user_id, "Kanban Board"))
    board_id = int(cursor.lastrowid)
    _seed_board(conn, board_id)
    return board_id


def _validate_board_payload(board: BoardPayload) -> None:
    if len(board.columns) < 1:
        raise ValueError("Board must have at least one column.")

    card_ids_from_columns: list[str] = []
    for column in board.columns:
        card_ids_from_columns.extend(column.cardIds)

    card_ids_from_cards = set(board.cards.keys())
    card_ids_in_columns = set(card_ids_from_columns)

    if card_ids_from_cards != card_ids_in_columns:
        raise ValueError("Board card mapping is invalid.")

    if len(card_ids_from_columns) != len(card_ids_in_columns):
        raise ValueError("Duplicate card references detected across columns.")


def get_board(conn: sqlite3.Connection, board_id: int) -> dict:
    columns_rows = conn.execute(
        "SELECT id, title FROM columns WHERE board_id = ? ORDER BY position ASC",
        (board_id,),
    ).fetchall()

    cards_rows = conn.execute(
        """
        SELECT id, column_id, title, details
        FROM cards
        WHERE board_id = ?
        ORDER BY column_id ASC, position ASC
        """,
        (board_id,),
    ).fetchall()

    cards_by_id: dict[str, dict[str, str]] = {}
    card_ids_by_column: dict[str, list[str]] = {str(row["id"]): [] for row in columns_rows}

    for row in cards_rows:
        card_id = str(row["id"])
        column_id = str(row["column_id"])
        cards_by_id[card_id] = {
            "id": card_id,
            "title": str(row["title"]),
            "details": str(row["details"]),
        }
        card_ids_by_column[column_id].append(card_id)

    columns = [
        {
            "id": str(row["id"]),
            "title": str(row["title"]),
            "cardIds": card_ids_by_column.get(str(row["id"]), []),
        }
        for row in columns_rows
    ]

    return {"columns": columns, "cards": cards_by_id}


def replace_board(conn: sqlite3.Connection, board_id: int, board: BoardPayload) -> None:
    _validate_board_payload(board)

    conn.execute("DELETE FROM cards WHERE board_id = ?", (board_id,))
    conn.execute("DELETE FROM columns WHERE board_id = ?", (board_id,))

    for column_position, column in enumerate(board.columns):
        conn.execute(
            "INSERT INTO columns(id, board_id, title, position) VALUES (?, ?, ?, ?)",
            (column.id, board_id, column.title, column_position),
        )

        for card_position, card_id in enumerate(column.cardIds):
            card = board.cards[card_id]
            conn.execute(
                """
                INSERT INTO cards(id, board_id, column_id, title, details, position)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (card.id, board_id, column.id, card.title, card.details, card_position),
            )
