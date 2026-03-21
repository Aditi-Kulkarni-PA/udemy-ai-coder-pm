import hashlib
import os
import sqlite3
import uuid
from pathlib import Path

from .default_board import DEFAULT_CARDS, DEFAULT_COLUMNS, DEFAULT_COLUMN_CARD_ORDER
from .schemas import BoardPayload


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# ---------------------------------------------------------------------------
# Password hashing (PBKDF2-HMAC-SHA256, no external deps)
# ---------------------------------------------------------------------------

def _hash_password(password: str, salt: bytes | None = None) -> tuple[str, str]:
    if salt is None:
        salt = os.urandom(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
    return key.hex(), salt.hex()


def _verify_password(password: str, stored_hash: str, stored_salt: str) -> bool:
    salt = bytes.fromhex(stored_salt)
    key, _ = _hash_password(password, salt)
    return key == stored_hash


# ---------------------------------------------------------------------------
# Schema management
# ---------------------------------------------------------------------------

def _create_schema_v2(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT,
            password_salt TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS boards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
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


def _migrate_v1_to_v2(conn: sqlite3.Connection) -> None:
    """Migrate schema v1 → v2: remove UNIQUE(user_id) on boards, add password columns."""
    conn.executescript(
        """
        ALTER TABLE boards RENAME TO boards_old;

        CREATE TABLE boards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL DEFAULT 'Kanban Board',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        INSERT INTO boards SELECT id, user_id, name, created_at, updated_at FROM boards_old;
        DROP TABLE boards_old;

        CREATE INDEX IF NOT EXISTS idx_boards_user_id ON boards(user_id);
        """
    )
    # Add password columns — ALTER TABLE ADD COLUMN ignores IF NOT EXISTS, so catch duplicates
    for col_def in ("password_hash TEXT", "password_salt TEXT"):
        try:
            conn.execute(f"ALTER TABLE users ADD COLUMN {col_def}")
        except Exception:
            pass  # column already exists


def init_db(db_path: Path) -> None:
    with connect(db_path) as conn:
        user_version = conn.execute("PRAGMA user_version").fetchone()[0]
        if user_version == 0:
            _create_schema_v2(conn)
        elif user_version == 1:
            _migrate_v1_to_v2(conn)
        # version 2 is current — nothing to do
        conn.execute("PRAGMA user_version = 2")


# ---------------------------------------------------------------------------
# User management
# ---------------------------------------------------------------------------

def user_exists(conn: sqlite3.Connection, username: str) -> bool:
    row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    return row is not None


def create_user(conn: sqlite3.Connection, username: str, password: str) -> int:
    """Insert a new user with a hashed password. Returns user_id."""
    ph, ps = _hash_password(password)
    cursor = conn.execute(
        "INSERT INTO users(username, password_hash, password_salt) VALUES (?, ?, ?)",
        (username, ph, ps),
    )
    return int(cursor.lastrowid)


def verify_user(conn: sqlite3.Connection, username: str, password: str) -> bool:
    """Return True if username + password match the stored hash."""
    row = conn.execute(
        "SELECT password_hash, password_salt FROM users WHERE username = ?", (username,)
    ).fetchone()
    if not row or row["password_hash"] is None:
        return False
    return _verify_password(password, row["password_hash"], row["password_salt"])


# ---------------------------------------------------------------------------
# Board management
# ---------------------------------------------------------------------------

def _seed_board(conn: sqlite3.Connection, board_id: int) -> None:
    """Seed a fresh board with default columns and cards using unique IDs per board."""
    # Map original template column IDs → new unique IDs for this board
    col_id_map: dict[str, str] = {
        col["id"]: f"col-{uuid.uuid4().hex[:12]}" for col in DEFAULT_COLUMNS
    }
    card_id_map: dict[str, str] = {
        card_id: f"card-{uuid.uuid4().hex[:12]}" for card_id in DEFAULT_CARDS
    }

    for index, column in enumerate(DEFAULT_COLUMNS):
        new_col_id = col_id_map[column["id"]]
        conn.execute(
            "INSERT INTO columns(id, board_id, title, position) VALUES (?, ?, ?, ?)",
            (new_col_id, board_id, column["title"], index),
        )

    for orig_col_id, orig_card_ids in DEFAULT_COLUMN_CARD_ORDER.items():
        new_col_id = col_id_map[orig_col_id]
        for position, orig_card_id in enumerate(orig_card_ids):
            card = DEFAULT_CARDS[orig_card_id]
            new_card_id = card_id_map[orig_card_id]
            conn.execute(
                """
                INSERT INTO cards(id, board_id, column_id, title, details, position)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (new_card_id, board_id, new_col_id, card["title"], card["details"], position),
            )


def _get_or_create_user(conn: sqlite3.Connection, username: str) -> int:
    row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if row:
        return int(row["id"])
    cursor = conn.execute("INSERT INTO users(username) VALUES (?)", (username,))
    return int(cursor.lastrowid)


def _create_default_board(conn: sqlite3.Connection, user_id: int) -> int:
    """Insert a default seeded board for user_id. Returns board_id."""
    cursor = conn.execute(
        "INSERT INTO boards(user_id, name) VALUES (?, ?)", (user_id, "Kanban Board")
    )
    board_id = int(cursor.lastrowid)
    _seed_board(conn, board_id)
    return board_id


def ensure_user_board(conn: sqlite3.Connection, username: str) -> int:
    """Get (or create) the first/default board for a user. Used by legacy routes."""
    user_id = _get_or_create_user(conn, username)

    board_row = conn.execute(
        "SELECT id FROM boards WHERE user_id = ? ORDER BY id ASC LIMIT 1", (user_id,)
    ).fetchone()
    if board_row:
        return int(board_row["id"])

    return _create_default_board(conn, user_id)


def get_user_boards(conn: sqlite3.Connection, username: str) -> list[dict]:
    """Return all boards for a user (creates the user + default board if new)."""
    user_id = _get_or_create_user(conn, username)

    rows = conn.execute(
        "SELECT id, name, created_at FROM boards WHERE user_id = ? ORDER BY id ASC",
        (user_id,),
    ).fetchall()
    if not rows:
        _create_default_board(conn, user_id)
        rows = conn.execute(
            "SELECT id, name, created_at FROM boards WHERE user_id = ? ORDER BY id ASC",
            (user_id,),
        ).fetchall()

    return [{"id": r["id"], "name": r["name"], "created_at": r["created_at"]} for r in rows]


_BLANK_COLUMNS = ["To Do", "In Progress", "Done"]


def create_board(conn: sqlite3.Connection, username: str, name: str) -> int:
    """Create a new blank board for a user (no pre-filled cards). Returns board_id."""
    user_id = _get_or_create_user(conn, username)
    cursor = conn.execute(
        "INSERT INTO boards(user_id, name) VALUES (?, ?)", (user_id, name)
    )
    board_id = int(cursor.lastrowid)
    # Start with clean empty columns — no sample cards
    for position, title in enumerate(_BLANK_COLUMNS):
        col_id = f"col-{uuid.uuid4().hex[:12]}"
        conn.execute(
            "INSERT INTO columns(id, board_id, title, position) VALUES (?, ?, ?, ?)",
            (col_id, board_id, title, position),
        )
    return board_id


def delete_board(conn: sqlite3.Connection, username: str, board_id: int) -> bool:
    """Delete a board owned by user. Returns False if not found.
    Raises ValueError if it would leave the user with zero boards."""
    row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if not row:
        return False
    user_id = int(row["id"])

    board_row = conn.execute(
        "SELECT id FROM boards WHERE id = ? AND user_id = ?", (board_id, user_id)
    ).fetchone()
    if not board_row:
        return False

    cnt = conn.execute(
        "SELECT COUNT(*) AS cnt FROM boards WHERE user_id = ?", (user_id,)
    ).fetchone()["cnt"]
    if cnt <= 1:
        raise ValueError("Cannot delete the last board.")

    conn.execute("DELETE FROM boards WHERE id = ?", (board_id,))
    return True


def get_board_by_id(conn: sqlite3.Connection, username: str, board_id: int) -> dict | None:
    """Return a board dict only if it belongs to username, else None."""
    row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if not row:
        return None
    user_id = int(row["id"])
    board_row = conn.execute(
        "SELECT id FROM boards WHERE id = ? AND user_id = ?", (board_id, user_id)
    ).fetchone()
    if not board_row:
        return None
    return get_board(conn, board_id)


# ---------------------------------------------------------------------------
# Board read / write
# ---------------------------------------------------------------------------

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
