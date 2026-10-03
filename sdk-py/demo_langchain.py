"""
demo_langchain.py — ToolHub + LangChain Integration
====================================================
This example shows how to wrap any ToolHub tool as a native LangChain BaseTool.
Your LangChain agent discovers and uses capabilities from ToolHub's registry —
without you hardcoding any API keys into your agent.

Flow:
  1. Connect to ToolHub
  2. Search for any tool using natural language
  3. Wrap it as a LangChain BaseTool via hub.as_langchain_tool()
  4. Pass the tool to a LangChain agent — it just works

Run:
    set OPENAI_API_KEY=your-key-here
    pip install langchain langchain-openai
    python demo_langchain.py
"""

import os
import sys
import requests

# ── ToolHub SDK ────────────────────────────────────────────────────────────────
from toolhub_sdk import ToolHub

# ── LangChain ──────────────────────────────────────────────────────────────────
try:
    # pyrefly: ignore [missing-import]
    from langchain.agents import initialize_agent, AgentType
    # pyrefly: ignore [missing-import]
    from langchain_openai import OpenAI
    # pyrefly: ignore [missing-import]
    from langchain.tools import BaseTool
except ImportError:
    print("❌ Install LangChain: pip install langchain langchain-openai")
    sys.exit(1)

# ── Config ─────────────────────────────────────────────────────────────────────
TOOLHUB_URL    = os.getenv("TOOLHUB_URL", "http://localhost:3000")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

if not OPENAI_API_KEY:
    print("❌ Set your OPENAI_API_KEY environment variable first.")
    sys.exit(1)

# ── Step 1: Connect to ToolHub ─────────────────────────────────────────────────
print("\n📡 Connecting to ToolHub…")
requests.post(f"{TOOLHUB_URL}/auth/register",
              json={"username": "lc-demo", "password": "password123"})
res = requests.post(f"{TOOLHUB_URL}/auth/token",
                    json={"username": "lc-demo", "password": "password123"})
jwt = res.json().get("token")
hub = ToolHub(base_url=TOOLHUB_URL, token=jwt, agent_id="langchain-demo-agent")
print("✅ Connected to ToolHub")

# ── Step 2: Search for the tools the agent will need ──────────────────────────
print("\n🔍 Discovering tools from ToolHub…")
queries = ["search the web", "translate text"]
langchain_tools = []

for query in queries:
    results = hub.search(query, limit=1)
    if results:
        tool = results[0]
        # Convert the ToolHub tool → LangChain BaseTool automatically
        lc_tool = hub.as_langchain_tool(tool.id)
        langchain_tools.append(lc_tool)
        print(f"   ✅ Registered: {tool.name} → {lc_tool.name}")

# ── Step 3: Build a LangChain agent with the discovered tools ─────────────────
print(f"\n🤖 Building LangChain agent with {len(langchain_tools)} ToolHub tools…")
llm = OpenAI(openai_api_key=OPENAI_API_KEY, temperature=0)

agent = initialize_agent(
    tools=langchain_tools,
    llm=llm,
    agent=AgentType.ZERO_SHOT_REACT_DESCRIPTION,
    verbose=True,   # Set to False to hide agent's chain-of-thought
)

# ── Step 4: Run the agent ─────────────────────────────────────────────────────
print("\n🚀 Running: 'What are the latest AI news? Translate the summary to Spanish.'")
try:
    answer = agent.run(
        "Search the web for the latest AI news, then translate the summary to Spanish."
    )
    print(f"\n✅ Final Answer:\n{answer}")
except Exception as e:
    print(f"\n❌ Agent error: {e}")
    print("   (This may be a rate limit or tool execution error — the wiring is correct.)")

print("\n✨ LangChain demo complete!\n")
