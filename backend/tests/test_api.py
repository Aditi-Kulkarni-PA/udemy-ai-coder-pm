import copy
import json

import pytest
from fastapi.testclient import TestClient

from backend.app import main


@pytest.fixture
def client(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    monkeypatch.setattr(main, "DB_PATH", db_path)
    app = main.create_app()
    return TestClient(app)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

def test_health(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# Auth: legacy login
# ---------------------------------------------------------------------------

def test_auth_login_valid(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={"username": "user", "password": "password"})
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["username"] == "user"


def test_auth_login_invalid(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={"username": "user", "password": "wrong"})
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# Auth: registration
# ---------------------------------------------------------------------------

def test_register_new_user(client: TestClient) -> None:
    response = client.post("/api/auth/register", json={"username": "alice", "password": "s3cure!"})
    assert response.status_code == 201
    assert response.json()["username"] == "alice"


def test_register_duplicate_username(client: TestClient) -> None:
    client.post("/api/auth/register", json={"username": "alice", "password": "s3cure!"})
    response = client.post("/api/auth/register", json={"username": "alice", "password": "another123"})
    assert response.status_code == 409


def test_register_then_login(client: TestClient) -> None:
    client.post("/api/auth/register", json={"username": "bob", "password": "mypassword1"})
    response = client.post("/api/auth/login", json={"username": "bob", "password": "mypassword1"})
    assert response.status_code == 200
    assert response.json()["username"] == "bob"


def test_register_wrong_password_login_fails(client: TestClient) -> None:
    client.post("/api/auth/register", json={"username": "carol", "password": "correct"})
    response = client.post("/api/auth/login", json={"username": "carol", "password": "wrong"})
    assert response.status_code == 401


def test_register_short_password_rejected(client: TestClient) -> None:
    response = client.post("/api/auth/register", json={"username": "dave", "password": "abc"})
    assert response.status_code == 422


def test_register_invalid_username_rejected(client: TestClient) -> None:
    response = client.post("/api/auth/register", json={"username": "bad user!", "password": "validpw"})
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Multi-board: list / create / delete
# ---------------------------------------------------------------------------

def test_list_boards_creates_default(client: TestClient) -> None:
    response = client.get("/api/boards/user")
    assert response.status_code == 200
    boards = response.json()["boards"]
    assert len(boards) == 1
    assert boards[0]["name"] == "Kanban Board"


def test_create_board(client: TestClient) -> None:
    client.get("/api/boards/user")  # ensure user exists
    response = client.post("/api/boards/user", json={"name": "Sprint 42"})
    assert response.status_code == 201
    assert "board_id" in response.json()


def test_list_boards_after_create(client: TestClient) -> None:
    client.get("/api/boards/user")
    client.post("/api/boards/user", json={"name": "Sprint A"})
    client.post("/api/boards/user", json={"name": "Sprint B"})

    response = client.get("/api/boards/user")
    boards = response.json()["boards"]
    names = [b["name"] for b in boards]
    assert "Sprint A" in names
    assert "Sprint B" in names
    assert len(boards) == 3  # default + 2 new


def test_delete_board(client: TestClient) -> None:
    client.get("/api/boards/user")  # default board
    create_r = client.post("/api/boards/user", json={"name": "Temp"})
    board_id = create_r.json()["board_id"]

    del_r = client.delete(f"/api/boards/user/{board_id}")
    assert del_r.status_code == 200

    boards = client.get("/api/boards/user").json()["boards"]
    assert all(b["id"] != board_id for b in boards)


def test_delete_last_board_fails(client: TestClient) -> None:
    boards = client.get("/api/boards/user").json()["boards"]
    board_id = boards[0]["id"]
    response = client.delete(f"/api/boards/user/{board_id}")
    assert response.status_code == 400
    assert "last" in response.json()["detail"].lower()


def test_delete_nonexistent_board_returns_404(client: TestClient) -> None:
    client.get("/api/boards/user")  # ensure user exists
    response = client.delete("/api/boards/user/99999")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Per-board data endpoints
# ---------------------------------------------------------------------------

def test_board_data_get(client: TestClient) -> None:
    boards = client.get("/api/boards/user").json()["boards"]
    board_id = boards[0]["id"]
    response = client.get(f"/api/boards/user/{board_id}/data")
    assert response.status_code == 200
    # Default (auto-created) board has 5 seeded columns
    assert len(response.json()["board"]["columns"]) == 5


def test_new_board_is_blank(client: TestClient) -> None:
    """Explicitly created boards start with 3 empty columns and no cards."""
    client.get("/api/boards/user")  # ensure default board exists
    create_r = client.post("/api/boards/user", json={"name": "Fresh Start"})
    board_id = create_r.json()["board_id"]

    data_r = client.get(f"/api/boards/user/{board_id}/data")
    board = data_r.json()["board"]
    assert len(board["columns"]) == 3
    assert len(board["cards"]) == 0
    assert [c["title"] for c in board["columns"]] == ["To Do", "In Progress", "Done"]


def test_board_data_put(client: TestClient) -> None:
    boards = client.get("/api/boards/user").json()["boards"]
    board_id = boards[0]["id"]

    board = client.get(f"/api/boards/user/{board_id}/data").json()["board"]
    board["columns"][0]["title"] = "Updated"
    r = client.put(f"/api/boards/user/{board_id}/data", json={"board": board})
    assert r.status_code == 200

    refreshed = client.get(f"/api/boards/user/{board_id}/data").json()["board"]
    assert refreshed["columns"][0]["title"] == "Updated"


def test_board_data_wrong_user_returns_404(client: TestClient) -> None:
    boards = client.get("/api/boards/user").json()["boards"]
    board_id = boards[0]["id"]
    response = client.get(f"/api/boards/other_user/{board_id}/data")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Legacy board endpoints
# ---------------------------------------------------------------------------

def test_board_read_and_write(client: TestClient) -> None:
    read_response = client.get("/api/board/user")
    assert read_response.status_code == 200
    board = read_response.json()["board"]
    assert len(board["columns"]) == 5

    board["columns"][0]["title"] = "Renamed"
    write_response = client.put("/api/board/user", json={"board": board})
    assert write_response.status_code == 200

    confirm_response = client.get("/api/board/user")
    assert confirm_response.status_code == 200
    assert confirm_response.json()["board"]["columns"][0]["title"] == "Renamed"


def test_board_invalid_username_returns_422(client: TestClient) -> None:
    response = client.get("/api/board/" + "a" * 100)
    assert response.status_code == 422


def test_board_special_chars_username_returns_422(client: TestClient) -> None:
    response = client.get("/api/board/invalid username!")
    assert response.status_code in (404, 422)


def test_board_invalid_card_mapping_returns_400(client: TestClient) -> None:
    read_response = client.get("/api/board/user")
    board = read_response.json()["board"]
    board["cards"]["orphan-card"] = {"id": "orphan-card", "title": "Orphan", "details": ""}
    write_response = client.put("/api/board/user", json={"board": board})
    assert write_response.status_code == 400
    assert "invalid" in write_response.json()["detail"].lower()


def test_board_zero_columns_returns_400(client: TestClient) -> None:
    write_response = client.put("/api/board/user", json={"board": {"columns": [], "cards": {}}})
    assert write_response.status_code == 400
    assert "column" in write_response.json()["detail"].lower()


# ---------------------------------------------------------------------------
# AI endpoints
# ---------------------------------------------------------------------------

def test_ai_chat_route_with_mock(client: TestClient, monkeypatch) -> None:
    def mock_call_openrouter(_messages):
        return '{"assistant_message":"Done","board_update":null}'

    monkeypatch.setattr(main, "call_openrouter", mock_call_openrouter)

    response = client.post(
        "/api/ai/chat/user",
        json={"question": "Summarize", "history": []},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["assistantMessage"] == "Done"
    assert payload["boardUpdated"] is False


def test_ai_chat_with_board_id(client: TestClient, monkeypatch) -> None:
    boards = client.get("/api/boards/user").json()["boards"]
    board_id = boards[0]["id"]

    def mock_call_openrouter(_messages):
        return '{"assistant_message":"Board-specific reply","board_update":null}'

    monkeypatch.setattr(main, "call_openrouter", mock_call_openrouter)

    response = client.post(
        "/api/ai/chat/user",
        json={"question": "Help", "history": [], "board_id": board_id},
    )
    assert response.status_code == 200
    assert response.json()["assistantMessage"] == "Board-specific reply"


def test_ai_chat_board_update_persists(client: TestClient, monkeypatch) -> None:
    read_response = client.get("/api/board/user")
    assert read_response.status_code == 200
    initial_board = read_response.json()["board"]

    updated_board = copy.deepcopy(initial_board)
    updated_board["columns"][0]["title"] = "Updated by AI"

    def mock_call_openrouter(_messages):
        return json.dumps({
            "assistant_message": "Renamed your first column.",
            "board_update": updated_board,
        })

    monkeypatch.setattr(main, "call_openrouter", mock_call_openrouter)

    response = client.post(
        "/api/ai/chat/user",
        json={"question": "Rename first column to Updated by AI", "history": []},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["boardUpdated"] is True
    assert payload["assistantMessage"] == "Renamed your first column."

    confirm_response = client.get("/api/board/user")
    assert confirm_response.json()["board"]["columns"][0]["title"] == "Updated by AI"


def test_ai_test_route_without_key(client: TestClient, monkeypatch) -> None:
    def mock_call_openrouter(_messages):
        raise main.AIConfigurationError("OPENAI_API_KEY is not set.")

    monkeypatch.setattr(main, "call_openrouter", mock_call_openrouter)

    response = client.get("/api/ai/test")
    assert response.status_code == 500
    assert "OPENAI_API_KEY" in response.json()["detail"]
