"""
demo_chained_tools.py — Multi-Step Chained Tool Discovery
==========================================================
This demo shows the FULL POWER of agent-driven dynamic discovery.

The agent is given ONE high-level goal and it figures out EVERYTHING:
  - What tools it needs (it doesn't know upfront)
  - In what order to call them
  - How to pass results from one tool into the next

Chained flow (Gemini plans this automatically):

  Gemini
    ↓
  search_tools("find contact email address")
    ↓
  contact/search tool discovered
    ↓
  use contact tool → gets "alice@example.com"
    ↓
  search_tools("send email")
    ↓
  email tool discovered
    ↓
  use email tool with alice@example.com → task complete

No step is hardcoded. Gemini plans the chain on its own.

Usage:
    set GOOGLE_API_KEY=your-key
    python demo_chained_tools.py
"""

import os
import sys
import requests
from dynamic_agent import DynamicAgent

# ── Config ─────────────────────────────────────────────────────────────────────
TOOLHUB_URL    = os.getenv("TOOLHUB_URL", "http://localhost:3000")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "AIzaSyD4FvQIQGSo9X88Ql4fafq7li35DBIxKVE")

if not GOOGLE_API_KEY:
    print("❌ Set GOOGLE_API_KEY environment variable first.")
    sys.exit(1)

SEPARATOR = "═" * 60

# ── Auth ───────────────────────────────────────────────────────────────────────
try:
    requests.post(f"{TOOLHUB_URL}/auth/register",
                  json={"username": "chain-agent", "password": "password123"})
    res = requests.post(f"{TOOLHUB_URL}/auth/token",
                        json={"username": "chain-agent", "password": "password123"})
    jwt = res.json().get("token")
    assert jwt
    print(f"✅ Connected to ToolHub")
except Exception as e:
    print(f"❌ Cannot reach ToolHub at {TOOLHUB_URL}: {e}")
    sys.exit(1)

# ── Agent ──────────────────────────────────────────────────────────────────────
# Only exposes search_tools — Gemini must discover everything else itself
agent = DynamicAgent(
    toolhub_url=TOOLHUB_URL,
    gemini_api_key=GOOGLE_API_KEY,
    token=jwt,
    agent_id="chain-demo-agent",
    verbose=True,
    enable_tools=True,
    enable_skills=False,  # Tools only for this demo
)

# ── Scenario 1: Simple one-hop chain ──────────────────────────────────────────
#
#   Gemini → search_tools("web search") → web_search tool
#         → web_search("Python news")
#         → final answer
#
print(f"\n{SEPARATOR}")
print("🔗 SCENARIO 1 — Single-hop discovery")
print("   Goal: find Python news (Gemini must discover web_search first)")
print(SEPARATOR)

answer1 = agent.run(
    "Find the 3 most important recent developments in Python programming. "
    "You do not have any tools yet — search ToolHub first to find what you need."
)
print(f"\n{'─'*60}")
print("🎯 Answer:", answer1[:400])

# ── Scenario 2: Two-hop chain (tool A feeds into tool B) ──────────────────────
#
#   Gemini → search_tools("search web for contact") → web_search
#         → web_search("Guido van Rossum email or contact")
#         → search_tools("send email")            → email tool
#         → email tool(to=found_address, body=...)
#         → task complete
#
print(f"\n{SEPARATOR}")
print("🔗 SCENARIO 2 — Two-hop chain (output of one tool feeds the next)")
print("   Goal: search for a contact, then draft an email to them")
print(SEPARATOR)

answer2 = agent.run(
    "I want to reach out to the creator of Python. "
    "First, search the web to find a public contact or email address for Guido van Rossum. "
    "Then, draft and attempt to send a short email introducing ToolHub to them. "
    "Discover all tools you need from ToolHub as you go."
)
print(f"\n{'─'*60}")
print("🎯 Answer:", answer2[:400])

# ── Scenario 3: Parallel discovery (two independent goals) ────────────────────
#
#   Gemini → search_tools("weather")     → weather tool
#         → search_tools("translate")    → translation tool
#         → weather("Cairo")
#         → translate(result → Arabic)
#         → combined answer
#
print(f"\n{SEPARATOR}")
print("🔗 SCENARIO 3 — Parallel discovery + chaining")
print("   Goal: get weather and translate the result to Arabic")
print(SEPARATOR)

answer3 = agent.run(
    "Get the current weather in Cairo, Egypt. "
    "Then translate the weather summary into Arabic. "
    "You must discover both tools from ToolHub — do not assume any tool exists."
)
print(f"\n{'─'*60}")
print("🎯 Answer:", answer3[:400])

# ── Summary ────────────────────────────────────────────────────────────────────
print(f"\n{SEPARATOR}")
print("📊 What just happened in each scenario:")
print()
print("  Scenario 1 — 1-hop:  Gemini → [search_tools] → web_search → answer")
print()
print("  Scenario 2 — 2-hop:  Gemini → [search_tools] → web_search")
print("                               → uses result →  [search_tools] → email")
print("                               → sends email with found address")
print()
print("  Scenario 3 — parallel: Gemini → [search_tools×2] → weather + translation")
print("                                → chains weather output into translate input")
print()
print("  At NO point did the application tell Gemini which tools to use.")
print("  Gemini planned the entire chain by calling search_tools autonomously.")
print(f"{SEPARATOR}\n")
