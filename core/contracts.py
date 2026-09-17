from dataclasses import dataclass
from typing import Any, Protocol


class ModelProvider(Protocol):
    async def chat(self, prompt: str, *, user_id: str, session_id: str) -> str:
        ...


class MemoryStore(Protocol):
    async def remember(self, user_id: str, content: str) -> None:
        ...

    async def recall(self, user_id: str, query: str) -> list[dict[str, Any]]:
        ...


@dataclass
class ChatRequest:
    user_id: str
    session_id: str
    prompt: str
