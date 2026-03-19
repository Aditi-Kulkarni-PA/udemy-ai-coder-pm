import pytest

from backend.app.ai import build_ai_chat_messages, parse_structured_ai_response


def test_parse_structured_response_with_no_update() -> None:
    parsed = parse_structured_ai_response(
        '{"assistant_message":"No changes","board_update":null}'
    )
    assert parsed.assistant_message == "No changes"
    assert parsed.board_update is None


def test_parse_structured_response_with_board_update() -> None:
    parsed = parse_structured_ai_response(
        '{"assistant_message":"Updated","board_update":{"columns":[{"id":"col-a","title":"A","cardIds":["card-1"]}],"cards":{"card-1":{"id":"card-1","title":"T","details":"D"}}}}'
    )
    assert parsed.board_update is not None
    assert parsed.board_update.columns[0].id == "col-a"


def test_parse_structured_response_invalid_json() -> None:
    with pytest.raises(Exception):
        parse_structured_ai_response("not-json")


def test_build_ai_messages_contains_question_and_board() -> None:
    messages = build_ai_chat_messages(
        question="Summarize",
        history=[{"role": "user", "content": "Earlier"}],
        board={"columns": [], "cards": {}},
    )
    assert messages[0]["role"] == "system"
    assert "Summarize" in messages[-1]["content"]
