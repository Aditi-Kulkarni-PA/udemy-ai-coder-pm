import json
import logging
import os
from dataclasses import dataclass

import httpx

from .schemas import BoardPayload

logger = logging.getLogger(__name__)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENAI_URL = "https://api.openai.com/v1/chat/completions"
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-oss-120b")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")


@dataclass
class AIResult:
    assistant_message: str
    board_update: BoardPayload | None


class AIConfigurationError(RuntimeError):
    pass


def _extract_json_object(text: str) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.startswith("json"):
            cleaned = cleaned[4:].strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise
        logger.warning("AI response was not pure JSON; falling back to substring extraction.")
        return json.loads(cleaned[start : end + 1])


def call_openrouter(messages: list[dict[str, str]]) -> str:
    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")

    if openrouter_key:
        api_key = openrouter_key
        url = OPENROUTER_URL
        model = OPENROUTER_MODEL
    elif openai_key:
        api_key = openai_key
        url = OPENAI_URL
        model = OPENAI_MODEL
    else:
        raise AIConfigurationError("Missing API key. Set OPENROUTER_API_KEY or OPENAI_API_KEY.")

    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.4,
    }

    response = httpx.post(
        url,
        json=payload,
        timeout=45.0,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    response.raise_for_status()
    data = response.json()
    return data["choices"][0]["message"]["content"]


def parse_structured_ai_response(content: str) -> AIResult:
    data = _extract_json_object(content)
    assistant_message = str(data.get("assistant_message", "")).strip()
    if not assistant_message:
        assistant_message = "I updated your board."

    board_update_raw = data.get("board_update")
    if board_update_raw is None:
        return AIResult(assistant_message=assistant_message, board_update=None)

    board_update = BoardPayload.model_validate(board_update_raw)
    return AIResult(assistant_message=assistant_message, board_update=board_update)


def build_ai_chat_messages(question: str, history: list[dict[str, str]], board: dict) -> list[dict[str, str]]:
    system_prompt = (
        "You are a friendly and knowledgeable Kanban board assistant. "
        "You help users manage their project board by answering questions and making changes when asked. "
        "You always reply in JSON with exactly this schema: "
        '{"assistant_message":"<your conversational reply here>","board_update":<null or updated board object>}. '
        "Rules:\n"
        "- assistant_message must be a helpful, conversational response. Be specific about what you see on the board or what you changed.\n"
        "- Only include board_update when the user explicitly asks you to add, move, rename, or delete cards or columns.\n"
        "- When board_update is not needed, set it to null.\n"
        "- When updating the board, return the COMPLETE board state including all unchanged columns and cards.\n"
        "- Card IDs and column IDs must be preserved exactly as-is unless creating new ones.\n"
        "- New card IDs should follow the pattern 'card-<short-slug>', new column IDs 'col-<short-slug>'.\n"
        "- Never truncate or drop existing cards or columns unless the user asked to delete them."
    )

    messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
    messages.extend(history)
    messages.append(
        {
            "role": "user",
            "content": f"{question}\n\nCurrent board state:\n{json.dumps(board, indent=2)}",
        }
    )
    return messages
