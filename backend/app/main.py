import logging
import os
import time
from pathlib import Path
from typing import Annotated

import httpx
from fastapi import FastAPI, HTTPException, Path as FastAPIPath, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .ai import (
    AIConfigurationError,
    build_ai_chat_messages,
    call_openrouter,
    parse_structured_ai_response,
)
from .db import connect, ensure_user_board, get_board, init_db, replace_board
from .schemas import AIChatRequest, AIChatResponse, LoginRequest, SaveBoardRequest

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parents[1]
STATIC_DIR = BASE_DIR / "static"
DB_PATH = BASE_DIR / "data" / "pm.db"

ValidUsername = Annotated[
    str,
    FastAPIPath(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$"),
]

_MAX_BODY_BYTES = 1_048_576  # 1 MB
_RATE_LIMIT_SECONDS = 3.0


def create_app() -> FastAPI:
    app = FastAPI(title="PM Backend", version="0.1.0")
    _ai_rate_limit: dict[str, float] = {}

    init_db(DB_PATH)

    # H8: Warn at startup if no AI key is configured
    if not os.getenv("OPENROUTER_API_KEY") and not os.getenv("OPENAI_API_KEY"):
        logger.warning(
            "Neither OPENROUTER_API_KEY nor OPENAI_API_KEY is set — AI features will be unavailable."
        )

    # H7: CORS for local dev (frontend on :3000, backend on :8000)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://localhost:8000"],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT"],
        allow_headers=["Content-Type"],
    )

    # H2: Reject requests with a Content-Length over 1 MB
    @app.middleware("http")
    async def limit_body_size(request: Request, call_next):
        cl = request.headers.get("content-length")
        if cl is not None and int(cl) > _MAX_BODY_BYTES:
            return JSONResponse({"detail": "Request body too large"}, status_code=413)
        return await call_next(request)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/hello")
    def hello() -> dict[str, str]:
        return {"message": "Hello from FastAPI"}

    # C1: Server-side credential validation endpoint
    @app.post("/api/auth/login")
    def auth_login(request: LoginRequest) -> dict:
        expected_username = os.getenv("AUTH_USERNAME", "user")
        expected_password = os.getenv("AUTH_PASSWORD", "password")
        if request.username == expected_username and request.password == expected_password:
            logger.info("Successful login: %s", request.username)
            return {"status": "ok", "username": request.username}
        logger.warning("Failed login attempt for: %s", request.username)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    @app.get("/api/board/{username}")
    def read_board(username: ValidUsername) -> dict:
        logger.info("GET board: %s", username)
        with connect(DB_PATH) as conn:
            board_id = ensure_user_board(conn, username)
            board = get_board(conn, board_id)
            return {"board": board}

    @app.put("/api/board/{username}")
    def save_board(username: ValidUsername, request: SaveBoardRequest) -> dict[str, str]:
        logger.info("PUT board: %s", username)
        try:
            with connect(DB_PATH) as conn:
                board_id = ensure_user_board(conn, username)
                replace_board(conn, board_id, request.board)
                # C3: Catch DB commit failures explicitly
                try:
                    conn.commit()
                except Exception as exc:
                    conn.rollback()
                    logger.error("DB commit failed for board save (%s): %s", username, exc)
                    raise HTTPException(
                        status_code=503,
                        detail="Board save failed. Please try again.",
                    ) from exc
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        logger.info("Board saved: %s", username)
        return {"status": "ok"}

    @app.get("/api/ai/test")
    def ai_test() -> dict[str, str]:
        try:
            content = call_openrouter([{"role": "user", "content": "What is 2+2?"}])
            return {"result": content}
        except AIConfigurationError as error:
            raise HTTPException(status_code=500, detail=str(error)) from error
        except httpx.HTTPError as error:
            raise HTTPException(status_code=502, detail=f"AI connectivity failed: {error}") from error

    @app.post("/api/ai/chat/{username}", response_model=AIChatResponse)
    def ai_chat(username: ValidUsername, request: AIChatRequest) -> AIChatResponse:
        # H1: Per-username rate limiting
        now = time.monotonic()
        last = _ai_rate_limit.get(username, 0.0)
        if now - last < _RATE_LIMIT_SECONDS:
            raise HTTPException(
                status_code=429,
                detail=f"Too many requests. Please wait {_RATE_LIMIT_SECONDS:.0f} seconds between AI requests.",
            )
        _ai_rate_limit[username] = now

        logger.info("AI chat request: %s — %r", username, request.question[:80])

        with connect(DB_PATH) as conn:
            board_id = ensure_user_board(conn, username)
            current_board = get_board(conn, board_id)

        messages = build_ai_chat_messages(
            question=request.question,
            history=[message.model_dump() for message in request.history],
            board=current_board,
        )

        try:
            raw_content = call_openrouter(messages)
            parsed = parse_structured_ai_response(raw_content)
        except AIConfigurationError as error:
            raise HTTPException(status_code=500, detail=str(error)) from error
        except httpx.HTTPError as error:
            raise HTTPException(status_code=502, detail=f"AI request failed: {error}") from error
        except Exception as error:
            raise HTTPException(status_code=400, detail=f"Invalid AI structured output: {error}") from error

        # C2: Fixed redundant condition
        board_updated = parsed.board_update is not None
        if parsed.board_update is not None:
            # C4: Prevent AI from silently deleting cards
            current_card_ids = set(current_board["cards"].keys())
            ai_card_ids = set(parsed.board_update.cards.keys())
            dropped_ids = current_card_ids - ai_card_ids
            if dropped_ids:
                logger.warning("AI attempted to drop cards %s — rejecting update", sorted(dropped_ids))
                raise HTTPException(
                    status_code=400,
                    detail=f"AI update would delete cards: {sorted(dropped_ids)}",
                )

            with connect(DB_PATH) as conn:
                board_id = ensure_user_board(conn, username)
                try:
                    replace_board(conn, board_id, parsed.board_update)
                    # C3: Catch DB commit failures explicitly
                    try:
                        conn.commit()
                    except Exception as exc:
                        conn.rollback()
                        logger.error("DB commit failed for AI update (%s): %s", username, exc)
                        raise HTTPException(
                            status_code=503,
                            detail="Board update failed. Please try again.",
                        ) from exc
                except ValueError as error:
                    raise HTTPException(status_code=400, detail=f"Invalid board update from AI: {error}") from error
                current_board = get_board(conn, board_id)

        logger.info("AI chat complete: %s boardUpdated=%s", username, board_updated)
        return AIChatResponse(
            assistantMessage=parsed.assistant_message,
            boardUpdated=board_updated,
            board=current_board,
        )

    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="frontend")
    return app


app = create_app()
