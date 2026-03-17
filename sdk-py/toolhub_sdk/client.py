"""
ToolHub Python SDK
==================
Zero-config AI tool discovery and invocation.

    from toolhub_sdk import ToolHub

    hub    = ToolHub(base_url="http://localhost:3000")
    tools  = hub.search("I need to search the web")
    result = hub.invoke(tools[0].id, {"query": "latest AI news"})
    print(result.data)
"""

import json
import logging
import time
from functools import wraps
from typing import Any, Dict, List, Optional

import requests

from .models import InvokeResult, Tool

log = logging.getLogger("toolhub")


# ── Retry decorator ───────────────────────────────────────────────────────────

def _retry(max_attempts: int = 3, base_delay: float = 1.0):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            last_exc = None
            for attempt in range(max_attempts):
                try:
                    return fn(*args, **kwargs)
                except requests.HTTPError as exc:
                    # Don't retry 4xx — those are caller errors
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
            raise last_exc
        return wrapper
    return decorator


class ToolHubError(Exception):
    pass


# ── Main client ───────────────────────────────────────────────────────────────

class ToolHub:
    """
    ToolHub client — connects AI agents to any registered tool.

    Args:
        base_url:    ToolHub server URL (default http://localhost:3000)
        api_key:     Optional API key sent as X-API-Key header
        operator_id: Credential namespace — used for vault lookups
        agent_id:    Logged against every tool call for analytics
        timeout:     Default HTTP timeout in seconds
    """

    def __init__(
        self,
        base_url:    str = "http://localhost:3000",
        api_key:     Optional[str] = None,
        operator_id: str = "default",
        agent_id:    Optional[str] = None,
        timeout:     int = 30,
    ):
        self.base_url    = base_url.rstrip("/")
        self.operator_id = operator_id
        self.agent_id    = agent_id or f"sdk-{int(time.time())}"
        self.timeout     = timeout

        self._session = requests.Session()
        self._session.headers.update({
            "Content-Type":  "application/json",
            "X-Operator-Id": operator_id,
            "X-Agent-Id":    self.agent_id,
        })
        if api_key:
            self._session.headers["X-API-Key"] = api_key

        # token cache: tool_id → {"token": str, "expires_at": float}
        self._token_cache: Dict[str, dict] = {}

    # ── Discovery ─────────────────────────────────────────────────────────────

    @_retry()
    def search(self, query: str, limit: int = 5) -> List[Tool]:
        """Semantic tool search — plain English → ranked tool list."""
        resp = self._session.post(
            f"{self.base_url}/tools/search",
            json={"query": query, "limit": limit},
            timeout=self.timeout,
        )
        resp.raise_for_status()
        return [Tool.from_dict(t) for t in resp.json().get("results", [])]

    @_retry()
    def get(self, tool_id: str) -> Tool:
        """Fetch full tool details including JSON schema."""
        resp = self._session.get(f"{self.base_url}/tools/{tool_id}", timeout=self.timeout)
        resp.raise_for_status()
        return Tool.from_dict(resp.json())

    @_retry()
    def list(
        self,
        category:  Optional[str] = None,
        auth_type: Optional[str] = None,
        limit:     int = 50,
    ) -> List[Tool]:
        """List available tools with optional filters."""
        params: Dict[str, Any] = {"limit": limit}
        if category:  params["category"]  = category
        if auth_type: params["auth_type"] = auth_type
        resp = self._session.get(f"{self.base_url}/tools", params=params, timeout=self.timeout)
        resp.raise_for_status()
        return [Tool.from_dict(t) for t in resp.json().get("tools", [])]

    # ── Credentials ───────────────────────────────────────────────────────────

    @_retry()
    def register_credential(
        self,
        tool_id:  str,
        api_key:  str,
        auth_type: Optional[str] = None,
    ) -> dict:
        """Register an encrypted API key for a tool in the vault."""
        resp = self._session.post(
            f"{self.base_url}/credentials",
            json={"tool_id": tool_id, "operator_id": self.operator_id,
                 "api_key": api_key, "auth_type": auth_type},
            timeout=self.timeout,
        )
        resp.raise_for_status()
        return resp.json()

    def _get_invoke_config(self, tool_id: str) -> Optional[dict]:
        """Fetch (and cache) a short-lived invoke token for a tool."""
        cached = self._token_cache.get(tool_id)
        if cached and cached["expires_at"] > time.time() + 60:
            return cached

        try:
            resp = self._session.get(
                f"{self.base_url}/tools/{tool_id}/invoke-config",
                params={"operator_id": self.operator_id},
                timeout=10,
            )
            if resp.ok:
                data = resp.json()
                entry = {
                    "token":       data.get("invoke_token"),
                    "api_key":     data.get("api_key"),
                    "auth_type":   data.get("auth_type"),
                    "endpoint_url":data.get("endpoint_url"),
                    "expires_at":  time.time() + data.get("expires_in", 900),
                }
                self._token_cache[tool_id] = entry
                return entry
        except Exception as exc:
            log.debug("Could not fetch invoke-config for %s: %s", tool_id, exc)
        return None

    # ── Invocation ────────────────────────────────────────────────────────────

    @_retry()
    def invoke(self, tool_id: str, params: Dict[str, Any]) -> InvokeResult:
        """
        Invoke a tool with secure server-side credential injection.

        The agent sends the request to ToolHub, which injects credentials
        and proxies the call to the upstream tool. The agent never
        handles raw secrets directly.

        Retries automatically up to 3× with exponential back-off.
        """
        start = time.time()
        
        # Use the server-side /invoke endpoint
        url = f"{self.base_url}/tools/{tool_id}/invoke"
        
        try:
            resp    = self._session.post(url, json=params, timeout=self.timeout)
            latency = int((time.time() - start) * 1000)
            ok      = resp.status_code < 400
            try:
                data = resp.json()
            except Exception:
                data = resp.text
            
            return InvokeResult(
                tool_id=tool_id, 
                tool_name=None, # Server only returns tool data, name lookup skipped for performance
                success=ok,
                data=data if ok else None,
                latency_ms=latency,
                error=None if ok else f"HTTP {resp.status_code}: {str(data)[:200]}",
            )
        except Exception as exc:
            latency = int((time.time() - start) * 1000)
            return InvokeResult(
                tool_id=tool_id, tool_name=None, success=False,
                data=None, latency_ms=latency, error=str(exc),
            )

    # ── Framework integrations ────────────────────────────────────────────────

    def as_langchain_tool(self, tool_id: str):
        """Wrap a ToolHub tool as a LangChain Tool object."""
        try:
            from langchain.tools import Tool as LCTool
        except ImportError:
            raise ImportError("pip install toolhub-sdk[langchain]")

        tool = self.get(tool_id)
        hub  = self

        def _run(input_str: str) -> str:
            try:
                params = json.loads(input_str)
            except (json.JSONDecodeError, TypeError):
                params = {"query": input_str}
            result = hub.invoke(tool_id, params)
            return json.dumps(result.data, ensure_ascii=False, default=str) if result.success \
                else f"Error: {result.error}"

        return LCTool(
            name=tool.name,
            description=f"{tool.description} (category: {tool.category})",
            func=_run,
        )

    def as_openai_function(self, tool_id: str) -> Dict:
        """
        Return a tool in OpenAI function-calling format.

            functions = [hub.as_openai_function(t.id) for t in hub.search("email")]
            response  = openai.chat.completions.create(
                model="gpt-4o",
                messages=[...],
                tools=[{"type": "function", "function": f} for f in functions],
            )
        """
        tool = self.get(tool_id)
        return {
            "name":        tool.name.replace("-", "_"),
            "description": tool.description,
            "parameters":  tool.json_schema or {"type": "object", "properties": {}, "required": []},
            "_toolhub_id": tool.id,
        }

    def handle_openai_tool_call(self, tool_call) -> str:
        """Execute an OpenAI/OpenRouter tool_call object and return a JSON string result."""
        raw_name = tool_call.function.name
        # Our tools are stored with names like "web_search". Some models may emit
        # "web_search" or "web-search" regardless of how we declared them.
        candidate_names = {
            raw_name,
            raw_name.replace("-", "_"),
            raw_name.replace("_", "-"),
        }

        tools = self.list()
        match = next((t for t in tools if t.name in candidate_names), None)
        if not match:
            return json.dumps({"error": f"Tool '{raw_name}' not found in registry"})

        params = json.loads(tool_call.function.arguments)
        result = self.invoke(match.id, params)
        return json.dumps(result.data if result.success else {"error": result.error}, default=str)

    def as_gemini_function(self, tool_id: str) -> Dict:
        """
        Return a tool mapped to a Gemini FunctionDeclaration dict layout.
        
        Example with `google-genai`:
            from google.genai import types
            
            decl = types.FunctionDeclaration(**hub.as_gemini_function(tool.id))
            client.models.generate_content(
                model='gemini-2.5-flash',
                contents='...',
                config=types.GenerateContentConfig(
                    tools=[types.Tool(function_declarations=[decl])]
                )
            )
        """
        tool = self.get(tool_id)
        
        def _map_schema(schema: dict) -> dict:
            if not schema: return {"type": "OBJECT", "properties": {}}
            mapped = {}
            if "type" in schema:
                # Handle union types like ['string', 'array'] by picking the first
                type_val = schema["type"][0] if isinstance(schema["type"], list) else schema["type"]
                mapped["type"] = type_val.upper()
            if "properties" in schema:
                mapped["properties"] = {k: _map_schema(v) for k, v in schema["properties"].items()}
            if "required" in schema:
                mapped["required"] = schema["required"]
            if "items" in schema:
                mapped["items"] = _map_schema(schema["items"])
            elif mapped.get("type") == "ARRAY":
                # Gemini explicitly requires `items` for arrays
                mapped["items"] = {"type": "STRING"}
            if "description" in schema:
                mapped["description"] = schema["description"]
            return mapped

        return {
            "name": tool.name.replace("-", "_"),
            "description": str(tool.description or tool.name),
            "parameters": _map_schema(tool.json_schema)
        }

    def handle_gemini_tool_call(self, tool_call) -> str:
        """Execute a Gemini function_call object and return a JSON string result."""
        raw_name = tool_call.name
        candidate_names = {
            raw_name,
            raw_name.replace("-", "_"),
            raw_name.replace("_", "-"),
        }

        tools = self.list()
        match = next((t for t in tools if t.name in candidate_names), None)
        if not match:
            return json.dumps({"error": f"Tool '{raw_name}' not found in registry"})

        # Convert Gemini protobuf args map or dict into standard dict
        try:
            params = dict(tool_call.args)
        except Exception:
            params = tool_call.args if hasattr(tool_call, "args") else {}
            
        result = self.invoke(match.id, params)
        return json.dumps(result.data if result.success else {"error": result.error}, default=str)

    # ── Analytics ─────────────────────────────────────────────────────────────

    @_retry()
    def get_analytics(self, tool_id: str, days: int = 30) -> dict:
        resp = self._session.get(
            f"{self.base_url}/analytics/tools/{tool_id}",
            params={"days": days}, timeout=self.timeout,
        )
        resp.raise_for_status()
        return resp.json()

    @_retry()
    def get_agent_analytics(self) -> dict:
        resp = self._session.get(
            f"{self.base_url}/analytics/agent/{self.agent_id}",
            timeout=self.timeout,
        )
        resp.raise_for_status()
        return resp.json()

    def __repr__(self):
        return f"<ToolHub agent={self.agent_id} url={self.base_url}>"

