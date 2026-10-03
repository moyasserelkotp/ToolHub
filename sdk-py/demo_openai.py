"""
demo_openai.py — ToolHub + OpenAI Function Calling
====================================================
This example shows how to use ToolHub with OpenAI's function calling.
ToolHub acts as a secure proxy — OpenAI never sees your API keys.

Flow:
  1. Connect to ToolHub
  2. Search for any tool using natural language
  3. Format it as an OpenAI function spec (one line!)
  4. GPT-4o decides to call the tool
  5. ToolHub handles execution, credential injection, and logging

Run:
    set OPENAI_API_KEY=your-key-here
    python demo_openai.py
"""

import os
import sys
import json
import requests

# ── ToolHub SDK ────────────────────────────────────────────────────────────────
from toolhub_sdk import ToolHub

# ── OpenAI SDK ─────────────────────────────────────────────────────────────────
try:
    # pyrefly: ignore [missing-import]
    import openai
except ImportError:
    print("❌ Install OpenAI: pip install openai")
    sys.exit(1)

# ── Config ─────────────────────────────────────────────────────────────────────
TOOLHUB_URL   = os.getenv("TOOLHUB_URL", "http://localhost:3000")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

if not OPENAI_API_KEY:
    print("❌ Set your OPENAI_API_KEY environment variable first.")
    sys.exit(1)

# ── Step 1: Connect to ToolHub ─────────────────────────────────────────────────
print("\n📡 Connecting to ToolHub…")
requests.post(f"{TOOLHUB_URL}/auth/register",
              json={"username": "openai-demo", "password": "password123"})
res = requests.post(f"{TOOLHUB_URL}/auth/token",
                    json={"username": "openai-demo", "password": "password123"})
jwt = res.json().get("token")
hub = ToolHub(base_url=TOOLHUB_URL, token=jwt, agent_id="openai-demo-agent")
print("✅ Connected to ToolHub")

# ── Step 2: Find the tools you need ───────────────────────────────────────────
print("\n🔍 Searching ToolHub…")
web_results  = hub.search("search the web", limit=1)
email_results = hub.search("send email", limit=1)

tools_to_use = []
for result in [*web_results, *email_results]:
    print(f"   Found: {result.name}")
    # hub.as_openai_function() returns a dict ready for OpenAI's `tools` parameter
    tools_to_use.append({
        "type": "function",
        "function": hub.as_openai_function(result.id)
    })

# ── Step 3: Send to GPT-4o ────────────────────────────────────────────────────
print("\n🤖 Asking GPT-4o: 'Search for Python news and summarize it'")
oai = openai.OpenAI(api_key=OPENAI_API_KEY)

response = oai.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": "You are a helpful assistant. Use the tools provided to answer questions."},
        {"role": "user",   "content": "Search the web for the latest Python programming news and give me a short summary."},
    ],
    tools=tools_to_use,
    tool_choice="auto",
)

message = response.choices[0].message

# ── Step 4: Execute each tool call via ToolHub ────────────────────────────────
if message.tool_calls:
    for tool_call in message.tool_calls:
        fn = tool_call.function
        print(f"\n⚡ GPT-4o is calling: {fn.name}")
        print(f"   Args: {fn.arguments[:150]}")

        # ToolHub proxies the call — API keys stay on the server!
        result_str = hub.handle_openai_tool_call(tool_call)
        result = json.loads(result_str)

        print(f"\n✅ ToolHub Response:")
        if isinstance(result, dict) and "results" in result:
            for r in result["results"][:2]:
                print(f"   • {r.get('title','?')}: {r.get('snippet','')[:100]}…")
        else:
            print(f"   {str(result)[:300]}")
elif message.content:
    print(f"\n🤖 GPT-4o says: {message.content[:300]}")

print("\n✨ OpenAI demo complete!\n")
