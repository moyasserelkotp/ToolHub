from dataclasses import dataclass, field
from typing import Any, Dict, Optional


@dataclass
class Tool:
    id: str
    name: str
    description: str
    category: str
    auth_type: str
    version: str
    security_score: int
    usage_count: int
    json_schema: Dict   = field(default_factory=dict)
    endpoint_url: Optional[str] = None
    status: str         = "active"
    semantic_score: float = 0.0
    score: float          = 0.0

    @classmethod
    def from_dict(cls, d: dict) -> "Tool":
        return cls(
            id             = d["id"],
            name           = d["name"],
            description    = d["description"],
            category       = d["category"],
            auth_type      = d.get("auth_type", "none"),
            version        = d.get("version", "1.0.0"),
            security_score = d.get("security_score", 0),
            usage_count    = d.get("usage_count", 0),
            json_schema    = d.get("json_schema", {}),
            endpoint_url   = d.get("endpoint_url"),
            status         = d.get("status", "active"),
            semantic_score = d.get("semantic_score", 0.0),
            score          = d.get("score", 0.0),
        )

    def __repr__(self):
        return f"<Tool '{self.name}' [{self.category}] security={self.security_score}/100 score={self.score:.3f}>"


@dataclass
class InvokeResult:
    tool_id:    str
    tool_name:  Optional[str]
    success:    bool
    data:       Any
    latency_ms: int
    error:      Optional[str] = None

    def __repr__(self):
        icon = "✅" if self.success else "❌"
        return f"{icon} InvokeResult({self.tool_name}, {self.latency_ms}ms)"

