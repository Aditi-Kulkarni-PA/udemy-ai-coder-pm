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


def test_health(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


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


def test_auth_login_valid(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={"username": "user", "password": "password"})
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["username"] == "user"


def test_auth_login_invalid(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={"username": "user", "password": "wrong"})
    assert response.status_code == 401


def test_board_invalid_username_returns_422(client: TestClient) -> None:
    response = client.get("/api/board/" + "a" * 100)
    assert response.status_code == 422


def test_board_special_chars_username_returns_422(client: TestClient) -> None:
    response = client.get("/api/board/invalid username!")
    assert response.status_code in (404, 422)


# M6: Test mismatched board card mapping returns 400
def test_board_invalid_card_mapping_returns_400(client: TestClient) -> None:
    read_response = client.get("/api/board/user")
    board = read_response.json()["board"]

    # Add a card to the dict that isn't in any column
    board["cards"]["orphan-card"] = {"id": "orphan-card", "title": "Orphan", "details": ""}

    write_response = client.put("/api/board/user", json={"board": board})
    assert write_response.status_code == 400
    assert "invalid" in write_response.json()["detail"].lower()


# M5: Test zero columns returns 400
def test_board_zero_columns_returns_400(client: TestClient) -> None:
    write_response = client.put("/api/board/user", json={"board": {"columns": [], "cards": {}}})
    assert write_response.status_code == 400
    assert "column" in write_response.json()["detail"].lower()


def test_ai_chat_route_with_mock(client: TestClient, monkeypatch) -> None:

    def mock_call_openrouter(_messages):
        return (
            '{"assistant_message":"Done","board_update":null}'
        )

    monkeypatch.setattr(main, "call_openrouter", mock_call_openrouter)

    response = client.post(
        "/api/ai/chat/user",
        json={
            "question": "Summarize",
            "history": [],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["assistantMessage"] == "Done"
    assert payload["boardUpdated"] is False


# M7: Test AI board update is persisted to DB
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
