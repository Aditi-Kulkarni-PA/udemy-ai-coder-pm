from pydantic import BaseModel, Field


class CardPayload(BaseModel):
    id: str = Field(max_length=100)
    title: str = Field(max_length=255)
    details: str = Field(default="", max_length=5000)


class ColumnPayload(BaseModel):
    id: str = Field(max_length=100)
    title: str = Field(max_length=255)
    cardIds: list[str] = Field(default_factory=list)


class BoardPayload(BaseModel):
    columns: list[ColumnPayload]
    cards: dict[str, CardPayload]


class SaveBoardRequest(BaseModel):
    board: BoardPayload


class LoginRequest(BaseModel):
    username: str = Field(max_length=64)
    password: str = Field(max_length=128)


class ChatMessage(BaseModel):
    role: str = Field(max_length=20)
    content: str = Field(max_length=10000)


class AIChatRequest(BaseModel):
    question: str = Field(max_length=2000)
    history: list[ChatMessage] = Field(default_factory=list)


class AIChatResponse(BaseModel):
    assistantMessage: str
    boardUpdated: bool
    board: BoardPayload
