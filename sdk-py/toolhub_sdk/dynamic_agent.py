from __future__ import annotations

import json
import logging
import os
import time
from typing import Any, Dict, List, Optional

import requests
# pyrefly: ignore [missing-import]
from google import genai
# pyrefly: ignore [missing-import]
from google.genai import types

from toolhub_sdk.client import ToolHub
from toolhub_sdk.skills import SkillsClient

log = logging.getLogger("toolhub.dynamic_agent")

# ── Constants ─────────────────────────────────────────────────────────────────

MAX_ITERATIONS       = 20      # hard cap — prevents infinite discovery loops
MAX_SAME_QUERY       = 3       # max times the same search_tools query is allowed
MAX_RETRIES          = 3       # retries on transient 429 / 503 errors
RETRY_BASE_DELAY     = 5.0     # seconds — doubles on each retry (exponential backoff)
DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite"

SYSTEM_INSTRUCTION = """\
You are an autonomous assistant with access to a large registry of tools and skills via ToolHub.

You MUST follow this protocol:
1. When you need a capability (web search, email, database, etc.), call search_tools first.
2. When you need an agent skill or workflow, call search_skills first.
3. After discovering tools/skills, use the ones returned to complete the task.
4. You may call search_tools or search_skills multiple times to discover different capabilities.
5. Never assume a tool exists — always discover it first through search_tools or search_skills.
6. If search_tools returns no useful results, try a different, broader query.
"""

# ── Meta-tool declarations (what Gemini receives initially) ───────────────────

SEARCH_TOOLS_DECLARATION = types.FunctionDeclaration(
    name="search_tools",
    description=(
        "Search ToolHub for executable tools that can perform a specific capability. "
        "Use this whenever you need to do something (web search, send email, query database, etc.). "
        "Returns a list of discovered tools that are then made available for you to call."
    ),
    parameters={
        "type": "OBJECT",
        "properties": {
            "query": {
                "type": "STRING",
                "description": (
                    "Plain-English description of the capability you need. "
                    "Examples: 'search the web', 'send email', 'query PostgreSQL', 'create GitHub issue'"
                ),
            },
            "limit": {
                "type": "INTEGER",
                "description": "Max number of tools to discover (default 3, max 5)",
            },
        },
        "required": ["query"],
    },
)

SEARCH_SKILLS_DECLARATION = types.FunctionDeclaration(
    name="search_skills",
    description=(
        "Search ToolHub for agent skills — reusable AI agent workflow templates. "
        "Use this when you need a multi-step workflow, specialized agent pattern, or guidance "
        "on how to approach a complex task. "
        "Returns skill names, descriptions and key instructions."
    ),
    parameters={
        "type": "OBJECT",
        "properties": {
            "query": {
                "type": "STRING",
                "description": (
                    "Plain-English description of the workflow or skill you need. "
                    "Examples: 'deep research', 'code review workflow', 'SEO content writing'"
                ),
            },
            "limit": {
                "type": "INTEGER",
                "description": "Max number of skills to return (default 3, max 5)",
            },
        },
        "required": ["query"],
    },
)

META_TOOL = types.Tool(
    function_declarations=[SEARCH_TOOLS_DECLARATION, SEARCH_SKILLS_DECLARATION]
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _safe_args(fn_call) -> dict:
    """Safely extract args from a Gemini function_call object."""
    try:
        return dict(fn_call.args) if fn_call.args else {}
    except Exception:
        return fn_call.args if isinstance(fn_call.args, dict) else {}


def _content(role: str, text: str) -> types.Content:
    return types.Content(role=role, parts=[types.Part(text=text)])


def _tool_result_content(fn_name: str, result_json: str) -> types.Content:
    """Build a function-response Content for the history."""
    try:
        result_data = json.loads(result_json)
    except Exception:
        result_data = {"raw": result_json}
    return types.Content(
        role="tool",
        parts=[types.Part(
            function_response=types.FunctionResponse(
                name=fn_name,
                response=result_data,
            )
        )],
    )


# ── Main agent ────────────────────────────────────────────────────────────────

class DynamicAgent:
    """
    Agent-driven dynamic tool discovery loop for Gemini + ToolHub.

    Args:
        toolhub_url:    ToolHub server base URL.
        gemini_api_key: Google Gemini API key.
        token:          JWT token for ToolHub auth (required for invoke).
        operator_id:    ToolHub operator namespace for credential vault.
        agent_id:       Identifier logged in ToolHub analytics.
        gemini_model:   Gemini model name (default: gemini-3.1-flash-lite).
        max_iterations: Hard cap on agent loop turns.
        verbose:        Print discovery progress to stdout.
        enable_tools:   Expose search_tools to Gemini (default True).
        enable_skills:  Expose search_skills to Gemini (default True).
    """

    def __init__(
        self,
        toolhub_url:    str            = "http://localhost:3000",
        gemini_api_key: Optional[str]  = None,
        token:          Optional[str]  = None,
        operator_id:    str            = "default",
        agent_id:       str            = "dynamic-agent",
        gemini_model:   str            = DEFAULT_GEMINI_MODEL,
        max_iterations: int            = MAX_ITERATIONS,
        verbose:        bool           = True,
        enable_tools:   bool           = True,
        enable_skills:  bool           = True,
    ):
        self.model         = gemini_model
        self.max_iterations = max_iterations
        self.verbose       = verbose
        self.enable_tools  = enable_tools
        self.enable_skills = enable_skills

        # ToolHub clients — reuse existing SDK methods, never duplicate
        self.hub = ToolHub(
            base_url=toolhub_url,
            token=token,
            operator_id=operator_id,
            agent_id=agent_id,
        )
        self.skills_client = SkillsClient(base_url=toolhub_url, token=token)

        # Gemini client
        api_key = gemini_api_key or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("gemini_api_key or GOOGLE_API_KEY env var is required")
        self.gemini = genai.Client(api_key=api_key)

    # ── Per-run state (reset on each .run() call) ─────────────────────────────

    def _reset(self):
        """Reset per-run state so agent runs are fully isolated."""
        # Maps tool_name → FunctionDeclaration dict (as returned by hub.as_gemini_function)
        self._loaded_tools:  Dict[str, dict] = {}
        # Maps skill_slug → Skill summary dict (no credentials, no raw_content)
        self._loaded_skills: Dict[str, dict] = {}
        # Track how many times each search query was issued (loop prevention)
        self._query_counts:  Dict[str, int]  = {}

    def _log(self, msg: str):
        if self.verbose:
            print(msg)

    # ── Discovery handlers ────────────────────────────────────────────────────

    def _handle_search_tools(self, query: str, limit: int = 3) -> str:
        """
        Execute ToolHub semantic search and dynamically register discovered tools.
        Returns a JSON string describing discovered tools — safe for Gemini.
        Credentials are NEVER included.
        """
        limit = min(int(limit), 5)

        # Loop prevention: cap repeated identical queries
        self._query_counts[query] = self._query_counts.get(query, 0) + 1
        if self._query_counts[query] > MAX_SAME_QUERY:
            return json.dumps({
                "warning": f"Query '{query}' already searched {MAX_SAME_QUERY} times. Try a different query.",
                "discovered": [],
            })

        self._log(f"\n🔎 ToolHub discovery (tools): \"{query}\"")

        try:
            tools = self.hub.search(query, limit=limit)  # reuses hub.search() exactly
        except Exception as exc:
            log.warning("ToolHub search failed: %s", exc)
            return json.dumps({"error": f"ToolHub unavailable: {exc}", "discovered": []})

        if not tools:
            self._log("   📭 No matching tools found.")
            return json.dumps({
                "message": f"No tools found for '{query}'. Try a broader or different query.",
                "discovered": [],
            })

        discovered = []
        newly_loaded = []

        for tool in tools:
            safe_name = tool.name.replace("-", "_")

            # De-duplicate: don't register the same tool twice
            if safe_name not in self._loaded_tools:
                try:
                    fn_dict = self.hub.as_gemini_function(tool.id)  # reuses existing method
                    self._loaded_tools[safe_name] = fn_dict
                    newly_loaded.append(safe_name)
                    self._log(f"   📦 Loaded tool: {tool.name} (score={tool.score:.3f})")
                except Exception as exc:
                    log.warning("Could not load tool %s: %s", tool.name, exc)
                    continue
            else:
                self._log(f"   ♻️  Already loaded: {tool.name}")

            # Build safe summary for Gemini — no credentials, no endpoint secrets
            discovered.append({
                "name":        safe_name,
                "description": tool.description,
                "category":    tool.category,
                "score":       round(tool.score, 3),
                "status":      "newly_loaded" if safe_name in newly_loaded else "already_available",
            })

        self._log(f"   ✅ {len(newly_loaded)} new tool(s) added: {newly_loaded}")

        return json.dumps({
            "query":     query,
            "discovered": discovered,
            "message":   (
                f"Discovered {len(discovered)} tool(s). "
                f"The following are now available for you to call: "
                f"{[d['name'] for d in discovered]}"
            ),
        })

    def _handle_search_skills(self, query: str, limit: int = 3) -> str:
        """
        Execute ToolHub skills semantic search.
        Skills are informational (workflow instructions) — they are not callable functions.
        Returns a JSON summary safe for Gemini.
        """
        limit = min(int(limit), 5)

        self._log(f"\n🔎 ToolHub discovery (skills): \"{query}\"")

        try:
            skills = self.skills_client.search(query, limit=limit)  # reuses SkillsClient.search()
        except Exception as exc:
            log.warning("Skills search failed: %s", exc)
            return json.dumps({"error": f"Skills registry unavailable: {exc}", "skills": []})

        if not skills:
            return json.dumps({
                "message": f"No skills found for '{query}'.",
                "skills": [],
            })

        skill_summaries = []
        for skill in skills:
            if skill.slug not in self._loaded_skills:
                summary = {
                    "name":        skill.name,
                    "slug":        skill.slug,
                    "description": skill.description,
                    "tags":        skill.tags[:5],
                    "score":       round(skill.score, 3),
                }
                self._loaded_skills[skill.slug] = summary
                self._log(f"   📦 Found skill: {skill.name} (score={skill.score:.3f})")
            skill_summaries.append(self._loaded_skills[skill.slug])

        return json.dumps({
            "query":   query,
            "skills":  skill_summaries,
            "message": (
                f"Found {len(skill_summaries)} skill(s). "
                "These are workflow templates — use the descriptions to guide your approach."
            ),
        })

    # ── Tool execution ────────────────────────────────────────────────────────

    def _handle_discovered_tool(self, fn_call) -> str:
        """
        Execute a tool that was previously discovered via search_tools.
        Delegates entirely to hub.handle_gemini_tool_call() — no duplication.
        """
        tool_name = fn_call.name
        self._log(f"\n⚡ Executing tool: {tool_name}")
        args = _safe_args(fn_call)
        self._log(f"   Args: {json.dumps(args, default=str)[:200]}")

        # Verify the tool was properly discovered in this run (security: no ghost calls)
        if tool_name not in self._loaded_tools and tool_name not in ("search_tools", "search_skills"):
            return json.dumps({
                "error": (
                    f"Tool '{tool_name}' was not discovered in this session. "
                    "Call search_tools first to discover it."
                )
            })

        # Reuse existing hub.handle_gemini_tool_call() — handles name resolution + invoke
        result_json = self.hub.handle_gemini_tool_call(fn_call)
        result_data = json.loads(result_json)

        if "error" in result_data:
            self._log(f"   ❌ Tool error: {result_data['error']}")
        else:
            preview = json.dumps(result_data, default=str)[:200]
            self._log(f"   ✅ Result: {preview}{'…' if len(str(result_data)) > 200 else ''}")

        return result_json

    # ── Current tools visible to Gemini ──────────────────────────────────────

    def _build_tools_config(self) -> List[types.Tool]:
        """
        Build the current tools list for Gemini:
          [META_TOOL] + dynamically loaded tools (as a single Tool object).
        """
        if not self._loaded_tools:
            return [META_TOOL]

        dynamic_declarations = []
        for fn_dict in self._loaded_tools.values():
            try:
                decl = types.FunctionDeclaration(**fn_dict)
                dynamic_declarations.append(decl)
            except Exception as exc:
                log.warning("Could not build FunctionDeclaration for %s: %s", fn_dict.get("name"), exc)

        all_declarations = []
        if self.enable_tools:
            all_declarations.append(SEARCH_TOOLS_DECLARATION)
        if self.enable_skills:
            all_declarations.append(SEARCH_SKILLS_DECLARATION)

        all_declarations.extend(dynamic_declarations)

        if not all_declarations:
            return None

        return [types.Tool(function_declarations=all_declarations)]

    # ── Main loop ─────────────────────────────────────────────────────────────

    def run(self, user_prompt: str) -> str:
        """
        Run the agent loop.

        Gemini starts with only [search_tools, search_skills].
        As it calls search_tools, tools are dynamically exposed on subsequent turns.
        The loop continues until Gemini produces a final text response or
        the max iteration limit is reached.

        Returns:
            The final text answer from Gemini.
        """
        self._reset()

        self._log(f"\n{'═'*60}")
        self._log(f"🤖 DynamicAgent starting")
        self._log(f"   Prompt: {user_prompt[:100]}")

        initial_tools = []
        if self.enable_tools: initial_tools.append("search_tools")
        if self.enable_skills: initial_tools.append("search_skills")
        self._log(f"   Initial tools: [{', '.join(initial_tools)}]")
        self._log(f"{'═'*60}")

        # Conversation history — mutable list passed to Gemini each turn
        history: List[types.Content] = [_content("user", user_prompt)]

        for iteration in range(self.max_iterations):
            self._log(f"\n── Turn {iteration + 1}/{self.max_iterations} ──────────────────────────────")

            current_tools = self._build_tools_config()

            tool_names = []
            if self.enable_tools: tool_names.append(SEARCH_TOOLS_DECLARATION.name)
            if self.enable_skills: tool_names.append(SEARCH_SKILLS_DECLARATION.name)
            tool_names.extend(list(self._loaded_tools.keys()))

            self._log(f"   Gemini sees {len(tool_names)} tool(s): {tool_names[:6]}{'…' if len(tool_names) > 6 else ''}")

            # ── Call Gemini with exponential backoff for 429 / 503 ──────────────
            response = None
            for attempt in range(1, MAX_RETRIES + 1):
                try:
                    response = self.gemini.models.generate_content(
                        model=self.model,
                        contents=history,
                        config=types.GenerateContentConfig(
                            system_instruction=SYSTEM_INSTRUCTION,
                            tools=current_tools,
                        ),
                    )
                    break  # success — exit retry loop
                except Exception as exc:
                    err_str = str(exc)
                    is_retryable = ("429" in err_str or "503" in err_str
                                    or "RESOURCE_EXHAUSTED" in err_str
                                    or "UNAVAILABLE" in err_str)
                    if is_retryable and attempt < MAX_RETRIES:
                        wait = RETRY_BASE_DELAY * (2 ** (attempt - 1))  # 5s, 10s, 20s
                        self._log(
                            f"\n   ⚠️  Transient API error (attempt {attempt}/{MAX_RETRIES}): "
                            f"{err_str[:80]}\n   ⏳ Retrying in {wait:.0f}s…"
                        )
                        time.sleep(wait)
                    else:
                        log.error("Gemini API error: %s", exc)
                        return f"❌ Gemini API error: {exc}"

            if response is None:
                return "❌ Gemini returned no response after retries."

            if not response.candidates:
                return "❌ Gemini returned no candidates."

            candidate = response.candidates[0]

            # Collect all function calls in this response
            function_calls = [
                part.function_call
                for part in candidate.content.parts
                if part.function_call
            ]
            text_parts = [
                part.text
                for part in candidate.content.parts
                if part.text
            ]

            # ── No function calls → final answer ──────────────────────────────
            if not function_calls:
                final_text = "\n".join(text_parts) if text_parts else "✅ Task completed."
                self._log(f"\n🤖 Final answer:\n{final_text}")
                self._log(f"\n{'═'*60}")
                self._log(f"📊 Session summary:")
                self._log(f"   Turns used: {iteration + 1}")
                self._log(f"   Tools loaded: {list(self._loaded_tools.keys())}")
                self._log(f"   Skills found: {list(self._loaded_skills.keys())}")
                self._log(f"{'═'*60}\n")
                return final_text

            # ── Append model's response to history ────────────────────────────
            history.append(candidate.content)

            # ── Process each function call ─────────────────────────────────────
            tool_results = []
            for fn_call in function_calls:
                fn_name = fn_call.name
                args    = _safe_args(fn_call)

                self._log(f"\n🤖 Gemini calling: {fn_name}({json.dumps(args, default=str)[:120]})")

                if fn_name == "search_tools":
                    query = args.get("query", "")
                    limit = int(args.get("limit", 3))
                    result_json = self._handle_search_tools(query, limit)

                elif fn_name == "search_skills":
                    query = args.get("query", "")
                    limit = int(args.get("limit", 3))
                    result_json = self._handle_search_skills(query, limit)

                else:
                    # Discovered tool execution
                    result_json = self._handle_discovered_tool(fn_call)

                tool_results.append((fn_name, result_json))

            # Append all tool results as a single user-role Content
            history.append(types.Content(
                role="user",
                parts=[
                    types.Part(
                        function_response=types.FunctionResponse(
                            name=fn_name,
                            response=(json.loads(result_json) if result_json else {}),
                        )
                    )
                    for fn_name, result_json in tool_results
                ],
            ))

        # Max iterations reached
        self._log(f"\n⚠️  Max iterations ({self.max_iterations}) reached.")
        return (
            f"⚠️ Agent reached maximum iterations ({self.max_iterations}). "
            f"Tools loaded in this session: {list(self._loaded_tools.keys())}. "
            "Try a more specific prompt or increase max_iterations."
        )
