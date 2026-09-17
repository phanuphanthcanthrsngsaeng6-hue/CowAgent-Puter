from dataclasses import dataclass, field


@dataclass
class ToolPolicy:
    """Deny-by-default policy for future agent tools."""

    allowed: set[str] = field(default_factory=set)

    def is_allowed(self, tool_name: str) -> bool:
        return tool_name in self.allowed
