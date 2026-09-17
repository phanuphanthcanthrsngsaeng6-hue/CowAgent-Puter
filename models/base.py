from typing import Protocol


class ChatModel(Protocol):
    async def chat(self, prompt: str, *, user_id: str, session_id: str) -> str:
        ...
