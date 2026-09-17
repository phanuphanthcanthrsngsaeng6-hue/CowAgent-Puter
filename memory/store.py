from collections import defaultdict


class InMemoryStore:
    """Small safe starter store; replace with persistent storage later."""

    def __init__(self) -> None:
        self._items: dict[str, list[str]] = defaultdict(list)

    async def remember(self, user_id: str, content: str) -> None:
        self._items[user_id].append(content)

    async def recall(self, user_id: str, query: str) -> list[dict[str, str]]:
        query_lower = query.lower()
        return [
            {"content": item}
            for item in self._items[user_id]
            if query_lower in item.lower()
        ]
