import logging
import os
import sqlite3
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
from .db import (
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
from .schemas import (
    AIChatRequest,
    AIChatResponse,
    BoardInfo,
    CreateBoardRequest,
    LoginRequest,
    RegisterRequest,
    SaveBoardRequest,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parents[1]


def _commit_board(conn: sqlite3.Connection, context: str) -> None:
    """Commit conn; on failure roll back and raise HTTP 503."""
    try:
        conn.commit()
    except Exception as exc:
        conn.rollback()
        logger.error("DB commit failed (%s): %s", context, exc)
        raise HTTPException(
            status_code=503, detail="Board save failed. Please try again."
        ) from exc
STATIC_DIR = BASE_DIR / "static"
DB_PATH = BASE_DIR / "data" / "pm.db"

ValidUsername = Annotated[
    str,
    FastAPIPath(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$"),
]

_MAX_BODY_BYTES = 1_048_576  # 1 MB
_RATE_LIMIT_SECONDS = 3.0


def create_app() -> FastAPI:
    app = FastAPI(title="PM Backend", version="0.2.0")
    _ai_rate_limit: dict[str, float] = {}

    init_db(DB_PATH)

    if not os.getenv("OPENROUTER_API_KEY") and not os.getenv("OPENAI_API_KEY"):
        logger.warning(
            "Neither OPENROUTER_API_KEY nor OPENAI_API_KEY is set — AI features will be unavailable."
        )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://localhost:8000"],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type"],
    )

    @app.middleware("http")
    async def limit_body_size(request: Request, call_next):
        cl = request.headers.get("content-length")
        if cl is not None and int(cl) > _MAX_BODY_BYTES:
            return JSONResponse({"detail": "Request body too large"}, status_code=413)
        return await call_next(request)

    # -----------------------------------------------------------------------
    # Health
    # -----------------------------------------------------------------------

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/hello")
    def hello() -> dict[str, str]:
        return {"message": "Hello from FastAPI"}

    # -----------------------------------------------------------------------
    # Auth: login + registration
    # -----------------------------------------------------------------------

    @app.post("/api/auth/login")
    def auth_login(request: LoginRequest) -> dict:
        """Login — supports both registered users and the legacy env-var account."""
        expected_username = os.getenv("AUTH_USERNAME", "user")
        expected_password = os.getenv("AUTH_PASSWORD", "password")

        with connect(DB_PATH) as conn:
            # Registered user takes precedence over env-var credentials
            if user_exists(conn, request.username):
                if verify_user(conn, request.username, request.password):
                    logger.info("Successful login (registered): %s", request.username)
                    return {"status": "ok", "username": request.username}
                # User exists but password wrong — reject immediately
                logger.warning("Bad password for registered user: %s", request.username)
                raise HTTPException(status_code=401, detail="Invalid credentials")

        # Fall back to env-var credentials (legacy / demo account)
        if request.username == expected_username and request.password == expected_password:
            logger.info("Successful login (env): %s", request.username)
            return {"status": "ok", "username": request.username}

        logger.warning("Failed login attempt for: %s", request.username)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    @app.post("/api/auth/register", status_code=201)
    def auth_register(request: RegisterRequest) -> dict:
        """Register a new user account."""
        with connect(DB_PATH) as conn:
            if user_exists(conn, request.username):
                raise HTTPException(status_code=409, detail="Username already taken.")
            user_id = create_user(conn, request.username, request.password)
            # Auto-create default board
            ensure_user_board(conn, request.username)
            conn.commit()
            logger.info("Registered new user: %s (id=%d)", request.username, user_id)
        return {"status": "ok", "username": request.username}

    # -----------------------------------------------------------------------
    # Board list management (multi-board)
    # -----------------------------------------------------------------------

    @app.get("/api/boards/{username}")
    def list_boards(username: ValidUsername) -> dict:
        """List all boards for a user."""
        with connect(DB_PATH) as conn:
            boards = get_user_boards(conn, username)
            conn.commit()  # may have auto-created user/board
        return {"boards": boards}

    @app.post("/api/boards/{username}", status_code=201)
    def new_board(username: ValidUsername, request: CreateBoardRequest) -> dict:
        """Create a new board for a user."""
        with connect(DB_PATH) as conn:
            board_id = create_board(conn, username, request.name)
            conn.commit()
        logger.info("Created board %d (%r) for %s", board_id, request.name, username)
        return {"status": "ok", "board_id": board_id}

    @app.delete("/api/boards/{username}/{board_id}")
    def remove_board(username: ValidUsername, board_id: int) -> dict:
        """Delete a board (cannot delete the last board)."""
        try:
            with connect(DB_PATH) as conn:
                found = delete_board(conn, username, board_id)
                conn.commit()
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if not found:
            raise HTTPException(status_code=404, detail="Board not found.")
        logger.info("Deleted board %d for %s", board_id, username)
        return {"status": "ok"}

    # -----------------------------------------------------------------------
    # Per-board data (specific board_id)
    # -----------------------------------------------------------------------

    @app.get("/api/boards/{username}/{board_id}/data")
    def read_board_by_id(username: ValidUsername, board_id: int) -> dict:
        """Fetch board data for a specific board."""
        with connect(DB_PATH) as conn:
            board = get_board_by_id(conn, username, board_id)
        if board is None:
            raise HTTPException(status_code=404, detail="Board not found.")
        return {"board": board}

    @app.put("/api/boards/{username}/{board_id}/data")
    def save_board_by_id(
        username: ValidUsername, board_id: int, request: SaveBoardRequest
    ) -> dict[str, str]:
        """Save board data for a specific board."""
        try:
            with connect(DB_PATH) as conn:
                if get_board_by_id(conn, username, board_id) is None:
                    raise HTTPException(status_code=404, detail="Board not found.")
                replace_board(conn, board_id, request.board)
                _commit_board(conn, f"{username}/{board_id}")
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        return {"status": "ok"}

    # -----------------------------------------------------------------------
    # Legacy single-board endpoints (kept for backwards compatibility)
    # -----------------------------------------------------------------------

    @app.get("/api/board/{username}")
    def read_board(username: ValidUsername) -> dict:
        logger.info("GET board (legacy): %s", username)
        with connect(DB_PATH) as conn:
            board_id = ensure_user_board(conn, username)
            board = get_board(conn, board_id)
            conn.commit()
            return {"board": board}

    @app.put("/api/board/{username}")
    def save_board(username: ValidUsername, request: SaveBoardRequest) -> dict[str, str]:
        logger.info("PUT board (legacy): %s", username)
        try:
            with connect(DB_PATH) as conn:
                board_id = ensure_user_board(conn, username)
                replace_board(conn, board_id, request.board)
                _commit_board(conn, username)
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        logger.info("Board saved: %s", username)
        return {"status": "ok"}

    # -----------------------------------------------------------------------
    # AI
    # -----------------------------------------------------------------------

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
        # Per-username rate limiting (prune stale entries to prevent unbounded growth)
        now = time.monotonic()
        last = _ai_rate_limit.get(username, 0.0)
        if now - last < _RATE_LIMIT_SECONDS:
            raise HTTPException(
                status_code=429,
                detail=f"Too many requests. Please wait {_RATE_LIMIT_SECONDS:.0f} seconds between AI requests.",
            )
        _ai_rate_limit[username] = now
        if len(_ai_rate_limit) > 500:
            cutoff = now - 60.0
            stale = [k for k, v in _ai_rate_limit.items() if v < cutoff]
            for k in stale:
                del _ai_rate_limit[k]

        logger.info("AI chat request: %s — %r", username, request.question[:80])

        with connect(DB_PATH) as conn:
            if request.board_id is not None:
                board = get_board_by_id(conn, username, request.board_id)
                if board is None:
                    raise HTTPException(status_code=404, detail="Board not found.")
                board_id = request.board_id
            else:
                board_id = ensure_user_board(conn, username)
                board = get_board(conn, board_id)
                conn.commit()
            current_board = board

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

        board_updated = parsed.board_update is not None
        if board_updated:
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
                try:
                    replace_board(conn, board_id, parsed.board_update)
                except ValueError as error:
                    raise HTTPException(status_code=400, detail=f"Invalid board update from AI: {error}") from error
                _commit_board(conn, f"ai/{username}")
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
