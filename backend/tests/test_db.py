import pytest
from pathlib import Path

from backend.app.db import (
    connect,
    create_board,
    create_user,
    delete_board,
    ensure_user_board,
    get_board,
    get_board_by_id,
    get_user_boards,
    init_db,
    replace_board,
    user_exists,
    verify_user,
)
from backend.app.schemas import BoardPayload


@pytest.fixture
def db_path(tmp_path: Path) -> Path:
    path = tmp_path / "pm.db"
    init_db(path)
    return path


# ---------------------------------------------------------------------------
# Schema init
# ---------------------------------------------------------------------------

def test_init_and_seed_board(db_path: Path) -> None:
    with connect(db_path) as conn:
        board_id = ensure_user_board(conn, "user")
        board = get_board(conn, board_id)

    assert len(board["columns"]) == 5
    assert len(board["cards"]) == 8


def test_init_idempotent(db_path: Path) -> None:
    """Running init_db twice should not raise."""
    init_db(db_path)


# ---------------------------------------------------------------------------
# User management
# ---------------------------------------------------------------------------

def test_user_exists_false_for_new(db_path: Path) -> None:
    with connect(db_path) as conn:
        assert not user_exists(conn, "newbie")


def test_create_user_and_exists(db_path: Path) -> None:
    with connect(db_path) as conn:
        create_user(conn, "alice", "secret123")
        conn.commit()
        assert user_exists(conn, "alice")


def test_verify_user_correct(db_path: Path) -> None:
    with connect(db_path) as conn:
        create_user(conn, "bob", "mypassword")
        conn.commit()
        assert verify_user(conn, "bob", "mypassword")


def test_verify_user_wrong_password(db_path: Path) -> None:
    with connect(db_path) as conn:
        create_user(conn, "carol", "correct")
        conn.commit()
        assert not verify_user(conn, "carol", "wrong")


def test_verify_user_nonexistent(db_path: Path) -> None:
    with connect(db_path) as conn:
        assert not verify_user(conn, "nobody", "anything")


def test_create_duplicate_user_raises(db_path: Path) -> None:
    with connect(db_path) as conn:
        create_user(conn, "dave", "pw1")
        conn.commit()
    with connect(db_path) as conn:
        with pytest.raises(Exception):
            create_user(conn, "dave", "pw2")


# ---------------------------------------------------------------------------
# Multi-board support
# ---------------------------------------------------------------------------

def test_get_user_boards_creates_default(db_path: Path) -> None:
    with connect(db_path) as conn:
        boards = get_user_boards(conn, "eve")
        conn.commit()
    assert len(boards) == 1
    assert boards[0]["name"] == "Kanban Board"


def test_create_board_adds_to_list(db_path: Path) -> None:
    with connect(db_path) as conn:
        get_user_boards(conn, "frank")  # ensure user
        board_id = create_board(conn, "frank", "Sprint 1")
        conn.commit()
        boards = get_user_boards(conn, "frank")

    names = [b["name"] for b in boards]
    assert "Sprint 1" in names
    assert "Kanban Board" in names


def test_create_board_starts_blank(db_path: Path) -> None:
    """Explicitly created boards have 3 empty columns and no cards."""
    with connect(db_path) as conn:
        get_user_boards(conn, "grace")
        board_id = create_board(conn, "grace", "New Board")
        conn.commit()
        board = get_board(conn, board_id)

    assert len(board["columns"]) == 3
    assert len(board["cards"]) == 0
    assert [c["title"] for c in board["columns"]] == ["To Do", "In Progress", "Done"]


def test_get_board_by_id_correct_user(db_path: Path) -> None:
    with connect(db_path) as conn:
        boards = get_user_boards(conn, "heidi")
        conn.commit()
        board_id = boards[0]["id"]
        board = get_board_by_id(conn, "heidi", board_id)

    assert board is not None
    assert len(board["columns"]) == 5


def test_get_board_by_id_wrong_user_returns_none(db_path: Path) -> None:
    with connect(db_path) as conn:
        boards = get_user_boards(conn, "ivan")
        conn.commit()
        board_id = boards[0]["id"]
        board = get_board_by_id(conn, "other_user", board_id)

    assert board is None


def test_delete_board(db_path: Path) -> None:
    with connect(db_path) as conn:
        get_user_boards(conn, "judy")
        board_id = create_board(conn, "judy", "Temp")
        conn.commit()

    with connect(db_path) as conn:
        result = delete_board(conn, "judy", board_id)
        conn.commit()
        boards = get_user_boards(conn, "judy")

    assert result is True
    assert all(b["id"] != board_id for b in boards)


def test_delete_last_board_raises(db_path: Path) -> None:
    with connect(db_path) as conn:
        boards = get_user_boards(conn, "kate")
        conn.commit()
        last_id = boards[0]["id"]

    with connect(db_path) as conn:
        with pytest.raises(ValueError, match="last"):
            delete_board(conn, "kate", last_id)


def test_delete_nonexistent_board_returns_false(db_path: Path) -> None:
    with connect(db_path) as conn:
        get_user_boards(conn, "leo")
        conn.commit()
        result = delete_board(conn, "leo", 99999)
    assert result is False


# ---------------------------------------------------------------------------
# replace_board
# ---------------------------------------------------------------------------

def test_replace_board(db_path: Path) -> None:
    replacement = BoardPayload.model_validate(
        {
            "columns": [
                {"id": "col-backlog", "title": "Backlog", "cardIds": ["card-1"]},
                {"id": "col-done", "title": "Done", "cardIds": []},
            ],
            "cards": {
                "card-1": {"id": "card-1", "title": "New title", "details": "Updated"}
            },
        }
    )

    with connect(db_path) as conn:
        board_id = ensure_user_board(conn, "user")
        replace_board(conn, board_id, replacement)
        conn.commit()
        board = get_board(conn, board_id)

    assert [column["id"] for column in board["columns"]] == ["col-backlog", "col-done"]
    assert board["cards"]["card-1"]["title"] == "New title"


def test_multiple_users_have_independent_boards(db_path: Path) -> None:
    with connect(db_path) as conn:
        id1 = ensure_user_board(conn, "user_a")
        id2 = ensure_user_board(conn, "user_b")
        conn.commit()

    assert id1 != id2
