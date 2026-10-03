import os
import sys
import requests
from dynamic_agent import DynamicAgent

# Configuration
TOOLHUB_URL = os.getenv("TOOLHUB_URL", "http://localhost:3000")
GOOGLE_API_KEY = "AIzaSyD4FvQIQGSo9X88Ql4fafq7li35DBIxKVE"

if not GOOGLE_API_KEY:
    print("❌ GOOGLE_API_KEY environment variable is missing.")
    sys.exit(1)

# ── Auth & Connection ─────────────────────────────────────────────────────────
try:
    requests.post(f"{TOOLHUB_URL}/auth/register", json={"username": "agent", "password": "password123"})
    token_res = requests.post(f"{TOOLHUB_URL}/auth/token", json={"username": "agent", "password": "password123"})
    jwt = token_res.json().get("token")
except Exception as e:
    print(f"❌ Failed to connect to ToolHub at {TOOLHUB_URL}: {e}")
    sys.exit(1)

print("✅ Connected to ToolHub")

# ── Dynamic Agent Initialization ──────────────────────────────────────────────
agent = DynamicAgent(
    toolhub_url=TOOLHUB_URL,
    gemini_api_key=GOOGLE_API_KEY,
    token=jwt,
    agent_id="demo-skills-agent",
    verbose=True, # Set to True to see the inner thoughts and tool calls
    enable_tools=False,
    enable_skills=True,
)

# ── Run the Agent ─────────────────────────────────────────────────────────────
user_prompt = (
    "I need help setting up an A/B test. Please search ToolHub for any skills "
    "related to 'ab-test' or 'experimentation' and summarize the best approach for me."
)

print("\n" + "═"*60)
print("🚀 Testing Dynamic SKILLS Discovery")
print(f"   Prompt: {user_prompt}")
print("═"*60)

final_answer = agent.run(user_prompt)

print(f"\n{'═'*60}")
print("🎯 Final Answer:")
print(final_answer)
print("═"*60)
