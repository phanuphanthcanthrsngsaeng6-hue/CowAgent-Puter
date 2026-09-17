from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class UserSession:
    """Application-level identity; no Puter token is stored here."""

    user_id: str
    username: Optional[str] = None
    email: Optional[str] = None


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, UserSession] = {}

    def set(self, session: UserSession) -> None:
        self._sessions[session.user_id] = session

    def get(self, user_id: str) -> Optional[UserSession]:
        return self._sessions.get(user_id)

    def remove(self, user_id: str) -> None:
        self._sessions.pop(user_id, None)
