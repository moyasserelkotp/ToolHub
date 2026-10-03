"""
demo_gemini.py — ToolHub + Gemini Integration
==============================================
This example shows the APPLICATION-DRIVEN approach where YOUR CODE
decides which tool to use, and Gemini executes it via function calling.

Flow:
  1. Connect to ToolHub
  2. Search for a tool by natural language
  3. Format it as a Gemini FunctionDeclaration (one line!)
  4. Ask Gemini a question — it decides to call the tool
  5. ToolHub executes the tool and injects credentials securely

Run:
    set GOOGLE_API_KEY=your-key-here
    python demo_gemini.py
"""

import os
import sys
import json
import requests

# ── ToolHub SDK ────────────────────────────────────────────────────────────────
from toolhub_sdk import ToolHub

# ── Gemini SDK ─────────────────────────────────────────────────────────────────
try:
    # pyrefly: ignore [missing-import]
    from google import genai
    # pyrefly: ignore [missing-import]
    from google.genai import types
except ImportError:
    print("❌ Install Gemini: pip install google-genai")
    sys.exit(1)

# ── Config ─────────────────────────────────────────────────────────────────────
TOOLHUB_URL    = os.getenv("TOOLHUB_URL", "http://localhost:3000")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
GEMINI_MODEL   = "gemini-2.5-flash-8b"

if not GOOGLE_API_KEY:
    print("❌ Set your GOOGLE_API_KEY environment variable first.")
    sys.exit(1)

# ── Step 1: Connect to ToolHub ─────────────────────────────────────────────────
print("\n📡 Connecting to ToolHub…")
requests.post(f"{TOOLHUB_URL}/auth/register",
              json={"username": "gemini-demo", "password": "password123"})
res = requests.post(f"{TOOLHUB_URL}/auth/token",
                    json={"username": "gemini-demo", "password": "password123"})
jwt = res.json().get("token")
hub = ToolHub(base_url=TOOLHUB_URL, token=jwt, agent_id="gemini-demo-agent")
print("✅ Connected to ToolHub")

# ── Step 2: Find the tool you need ────────────────────────────────────────────
print("\n🔍 Searching ToolHub for 'search the web'…")
results = hub.search("search the web", limit=1)
web_tool = results[0]
print(f"   Found: {web_tool.name} (score={web_tool.score:.3f})")

# ── Step 3: Convert to Gemini FunctionDeclaration ─────────────────────────────
# hub.as_gemini_function() returns a dict ready for types.FunctionDeclaration
gemini_func = types.FunctionDeclaration(**hub.as_gemini_function(web_tool.id))
print(f"   Schema ready for Gemini: {gemini_func.name}")

# ── Step 4: Ask Gemini — it will call the tool ────────────────────────────────
print("\n🤖 Asking Gemini: 'What are the latest AI developments?'")
client = genai.Client(api_key=GOOGLE_API_KEY)

response = client.models.generate_content(
    model=GEMINI_MODEL,
    contents="What are the latest developments in artificial intelligence?",
    config=types.GenerateContentConfig(
        system_instruction="You are a helpful assistant. Use the available tools to answer questions.",
        tools=[types.Tool(function_declarations=[gemini_func])],
    ),
)

# ── Step 5: ToolHub executes the tool call ────────────────────────────────────
if response.candidates and response.candidates[0].content.parts:
    for part in response.candidates[0].content.parts:
        if part.function_call:
            fn = part.function_call
            print(f"\n⚡ Gemini is calling: {fn.name}")
            print(f"   Args: {dict(fn.args)}")

            # ToolHub handles auth, rate-limits, logging — you just pass the call
            result_str = hub.handle_gemini_tool_call(fn)
            result = json.loads(result_str)

            print(f"\n✅ ToolHub Response (first result):")
            if isinstance(result, dict) and "results" in result:
                for r in result["results"][:2]:
                    print(f"   • {r.get('title','?')}: {r.get('snippet','')[:100]}…")
            else:
                print(f"   {str(result)[:300]}")
        elif part.text:
            print(f"\n🤖 Gemini says: {part.text[:300]}")

print("\n✨ Gemini demo complete!\n")
