from pathlib import Path

from backend.app.db import connect, ensure_user_board, get_board, init_db, replace_board
from backend.app.schemas import BoardPayload


def test_init_and_seed_board(tmp_path: Path) -> None:
    db_path = tmp_path / "pm.db"
    init_db(db_path)

    with connect(db_path) as conn:
        board_id = ensure_user_board(conn, "user")
        board = get_board(conn, board_id)

    assert len(board["columns"]) == 5
    assert len(board["cards"]) == 8


def test_replace_board(tmp_path: Path) -> None:
    db_path = tmp_path / "pm.db"
    init_db(db_path)

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
