import time
import logging
from dataclasses import dataclass, field
from functools import wraps
from typing import Any, Dict, List, Optional

import requests

log = logging.getLogger("toolhub.skills")


# ── Retry decorator (identical to main client) ────────────────────────────────

def _retry(max_attempts: int = 3, base_delay: float = 1.0):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            last_exc = None
            for attempt in range(max_attempts):
                try:
                    return fn(*args, **kwargs)
                except requests.HTTPError as exc:
                    if exc.response is not None and exc.response.status_code < 500:
                        raise
                    last_exc = exc
                except (requests.ConnectionError, requests.Timeout) as exc:
                    last_exc = exc
                
                if attempt < max_attempts - 1:
                    delay = base_delay * (2 ** attempt)
                    log.warning("Attempt %d/%d failed (%s). Retrying in %.1fs…",
                                attempt + 1, max_attempts, last_exc, delay)
                    time.sleep(delay)
            
            if last_exc is not None:
                raise last_exc
            raise RuntimeError("Retry failed without capturing an exception")
        return wrapper
    return decorator

# ── Skill model ───────────────────────────────────────────────────────────────

@dataclass
class Skill:
    id:             str
    name:           str
    slug:           str
    description:    str
    tags:           List[str]       = field(default_factory=list)
    author:         Optional[str]   = None
    version:        str             = "1.0.0"
    status:         str             = "active"
    usage_count:    int             = 0
    is_builtin:     bool            = False
    frontmatter:    Dict[str, Any]  = field(default_factory=dict)
    raw_content:    Optional[str]   = None
    semantic_score: float           = 0.0
    score:          float           = 0.0

    @classmethod
    def from_dict(cls, d: dict) -> "Skill":
        return cls(
            id             = d["id"],
            name           = d["name"],
            slug           = d["slug"],
            description    = d["description"],
            tags           = d.get("tags", []),
            author         = d.get("author"),
            version        = d.get("version", "1.0.0"),
            status         = d.get("status", "active"),
            usage_count    = d.get("usage_count", 0),
            is_builtin     = d.get("is_builtin", False),
            frontmatter    = d.get("frontmatter", {}),
            raw_content    = d.get("raw_content"),
            semantic_score = d.get("semantic_score", 0.0),
            score          = d.get("score", 0.0),
        )

    def __repr__(self):
        builtin = " [built-in]" if self.is_builtin else ""
        return (
            f"<Skill '{self.name}' slug={self.slug} "
            f"score={self.score:.3f}{builtin}>"
        )


# ── Skills client ─────────────────────────────────────────────────────────────

class SkillsClient:
    """
    Client for the ToolHub Skills Registry.

    Args:
        base_url:  ToolHub server URL (default http://localhost:3000)
        api_key:   Optional API key or Bearer token for write endpoints
        token:     Bearer token (alternative to api_key)
        timeout:   HTTP timeout in seconds
    """

    def __init__(
        self,
        base_url: str = "http://localhost:3000",
        api_key:  Optional[str] = None,
        token:    Optional[str] = None,
        timeout:  int = 30,
    ):
        self.base_url = base_url.rstrip("/")
        self.timeout  = timeout
        self._session = requests.Session()
        self._session.headers.update({"Content-Type": "application/json"})
        if api_key:
            self._session.headers["X-API-Key"] = api_key
        if token:
            self._session.headers["Authorization"] = f"Bearer {token}"

    # ── Search ────────────────────────────────────────────────────────────────

    @_retry()
    def search(self, query: str, limit: int = 5) -> List[Skill]:
        """
        Semantic search across all indexed skills.

        Args:
            query: Plain-English description of the skill needed.
            limit: Max number of results (max 20).

        Returns:
            List of Skill objects sorted by relevance score.

        Example::

            results = skills.search("I need to scrape websites", limit=5)
            for s in results:
                print(s.name, s.score)
        """
        resp = self._session.post(
            f"{self.base_url}/skills/search",
            json={"query": query, "limit": min(int(limit), 20)},
            timeout=self.timeout,
        )
        resp.raise_for_status()
        return [Skill.from_dict(s) for s in resp.json().get("results", [])]

    @_retry()
    def list(
        self,
        status:     str               = "active",
        tags:       Optional[List[str]] = None,
        is_builtin: Optional[bool]    = None,
        limit:      int               = 50,
        offset:     int               = 0,
    ) -> List[Skill]:
        """List all skills with optional filters."""
        params: Dict[str, Any] = {"status": status, "limit": limit, "offset": offset}
        if tags:
            params["tags"] = ",".join(tags)
        if is_builtin is not None:
            params["is_builtin"] = str(is_builtin).lower()

        resp = self._session.get(
            f"{self.base_url}/skills",
            params=params,
            timeout=self.timeout,
        )
        resp.raise_for_status()
        return [Skill.from_dict(s) for s in resp.json().get("skills", [])]

    # ── Get ───────────────────────────────────────────────────────────────────

    @_retry()
    def get(self, skill_id: str) -> Skill:
        """Fetch full skill details by UUID."""
        resp = self._session.get(
            f"{self.base_url}/skills/{skill_id}",
            timeout=self.timeout,
        )
        resp.raise_for_status()
        return Skill.from_dict(resp.json())

    @_retry()
    def get_by_slug(self, slug: str) -> Skill:
        """
        Fetch full skill details by folder slug (e.g. 'deep-research').

        Example::

            skill = skills.get_by_slug("deep-research")
            print(skill.raw_content)
        """
        resp = self._session.get(
            f"{self.base_url}/skills/slug/{slug}",
            timeout=self.timeout,
        )
        resp.raise_for_status()
        return Skill.from_dict(resp.json())

    @_retry()
    def related(self, skill_id: str, limit: int = 5) -> List[Skill]:
        """Get semantically related skills by embedding similarity."""
        resp = self._session.get(
            f"{self.base_url}/skills/{skill_id}/related",
            params={"limit": limit},
            timeout=self.timeout,
        )
        resp.raise_for_status()
        return [Skill.from_dict(s) for s in resp.json().get("related", [])]

    # ── Write (auth required) ─────────────────────────────────────────────────

    @_retry()
    def register(
        self,
        name:        str,
        slug:        str,
        description: str,
        tags:        Optional[List[str]] = None,
        author:      Optional[str]       = None,
        version:     str                 = "1.0.0",
        raw_content: Optional[str]       = None,
        source_path: Optional[str]       = None,
    ) -> Skill:
        """Manually register a skill (requires auth token)."""
        resp = self._session.post(
            f"{self.base_url}/skills",
            json={
                "name": name, "slug": slug, "description": description,
                "tags": tags or [], "author": author, "version": version,
                "raw_content": raw_content, "source_path": source_path,
            },
            timeout=self.timeout,
        )
        resp.raise_for_status()
        return Skill.from_dict(resp.json()["skill"])

    @_retry()
    def invoke(self, skill_id: str) -> Dict[str, Any]:
        """Mark a skill as used — increments usage_count (requires auth)."""
        resp = self._session.post(
            f"{self.base_url}/skills/{skill_id}/invoke",
            timeout=self.timeout,
        )
        resp.raise_for_status()
        return resp.json()

    @_retry()
    def reindex(self) -> Dict[str, Any]:
        """
        Trigger a re-index of all configured SKILLS_DIRS on the server.
        Requires admin auth token.
        """
        resp = self._session.post(
            f"{self.base_url}/skills/index",
            timeout=self.timeout,
        )
        resp.raise_for_status()
        return resp.json()

    @_retry()
    def delete(self, skill_id: str) -> bool:
        """Remove a skill from the registry (requires auth)."""
        resp = self._session.delete(
            f"{self.base_url}/skills/{skill_id}",
            timeout=self.timeout,
        )
        resp.raise_for_status()
        return resp.json().get("deleted", False)


"""
ToolHub Skills SDK
==================
Client for discovering and interacting with the Skills Registry.

    from toolhub_sdk import ToolHub
    from toolhub_sdk.skills import SkillsClient, Skill

    skills = SkillsClient(base_url="http://localhost:3000")
    results = skills.search("I need to do deep web research")
    for skill in results:
        print(skill)

    skill = skills.get_by_slug("deep-research")
    print(skill.raw_content)
"""