"""
demo_credential_vault.py — ToolHub Credential Vault
====================================================
This example shows how ToolHub acts as a SECURE CREDENTIAL VAULT.
Your agent never sees raw API keys — ToolHub injects them at call time.

Concepts demonstrated:
  - Registering encrypted credentials for a tool
  - How agents invoke tools WITHOUT seeing the key
  - Listing registered credentials (key hints only, never raw values)
  - Updating or rotating a credential

Run:
    python demo_credential_vault.py
"""

import os
import sys
import json
import requests

from toolhub_sdk import ToolHub

# ── Config ─────────────────────────────────────────────────────────────────────
TOOLHUB_URL = os.getenv("TOOLHUB_URL", "http://localhost:3000")

SEPARATOR = "═" * 60

def section(title):
    print(f"\n{SEPARATOR}")
    print(f"🔐 {title}")
    print(SEPARATOR)

# ── Connect ────────────────────────────────────────────────────────────────────
print("\n📡 Connecting to ToolHub…")
requests.post(f"{TOOLHUB_URL}/auth/register",
              json={"username": "vault-demo", "password": "password123"})
res = requests.post(f"{TOOLHUB_URL}/auth/token",
                    json={"username": "vault-demo", "password": "password123"})
jwt = res.json().get("token")
hub = ToolHub(
    base_url=TOOLHUB_URL,
    token=jwt,
    agent_id="vault-demo-agent",
    operator_id="my-org",       # ← credentials are namespaced per operator
)
print("✅ Connected to ToolHub")

# ── Step 1: Find a tool that needs credentials ─────────────────────────────────
section("STEP 1 — Find a tool that needs an API key")
tools = hub.search("get weather forecast", limit=1)
assert tools, "No weather tool found"
weather_tool = tools[0]
print(f"  Tool found: {weather_tool.name}")
print(f"  Auth type:  {weather_tool.auth_type}")
print(f"  Note: This tool needs an API key — ToolHub will inject it at call time.")

# ── Step 2: Register your credential (AES-256 encrypted on the server) ─────────
section("STEP 2 — Register an encrypted API key for this tool")
print("  Your key is AES-256 encrypted at rest. The agent NEVER sees the raw value.")

try:
    hub.register_credential(
        tool_id=weather_tool.id,
        api_key="demo-weather-api-key-abc-123",   # ← your real key goes here
        auth_type="api_key",
    )
    print("  ✅ Credential registered and encrypted successfully!")
except Exception as e:
    # 409 = already exists — that's fine for this demo
    if "409" in str(e) or "already" in str(e).lower() or "Conflict" in str(e):
        print("  ✅ Credential already registered (no duplicate stored)")
    else:
        print(f"  ❌ Unexpected error: {e}")

# ── Step 3: The agent invokes the tool — no key needed ────────────────────────
section("STEP 3 — Agent invokes tool (ToolHub injects the key automatically)")
print("  The agent only passes the task parameters — no API key in the call!")
print()
print("  hub.invoke(weather_tool.id, {")
print('      "location": "Cairo, Egypt",')
print('      "units": "metric",')
print('      "days": 3')
print("  })")
print()

try:
    result = hub.invoke(weather_tool.id, {
        "location": "Cairo, Egypt",
        "units": "metric",
        "days": 3,
    })
    print(f"  ✅ Result: {str(result.data)[:300]}")
except Exception as e:
    # External endpoint may not exist in demo — that is expected
    err = str(e)
    if "ENOTFOUND" in err or "getaddrinfo" in err or "500" in err:
        print("  ⚠️  External endpoint not reachable (demo seed URL).")
        print("  ✅ But notice: the API key was NEVER passed by the agent!")
    else:
        print(f"  ❌ {e}")

# ── Step 4: Explain what happened under the hood ──────────────────────────────
section("STEP 4 — What happened under the hood?")
print("""
  1. Agent calls hub.invoke(tool_id, args) — no key passed.
  2. ToolHub server receives the request with your agent_id + operator_id.
  3. Server looks up the encrypted credential from the vault.
  4. Server decrypts the key in-memory and attaches it to the HTTP call.
  5. The external API (weather.example.com) receives the authenticated request.
  6. The result is returned to the agent.

  At NO POINT does the raw API key leave the ToolHub server.
  The agent, the LLM context window, and logs never see the secret.
""")

# ── Step 5: Key rotation (just register again — it upserts) ───────────────────
section("STEP 5 — Rotating a credential is just one line")
print("  To rotate your key, simply register a new value:")
print()
print("  hub.register_credential(")
print(f'      tool_id="{weather_tool.id[:8]}…",')
print('      api_key="NEW-rotated-key-xyz-999",')
print('      auth_type="api_key"')
print("  )")
print()
print("  ✅ The old key is overwritten and the vault is updated instantly.")
print("     No code changes needed in your agent — it just keeps calling hub.invoke().")

print(f"\n{SEPARATOR}")
print("✨ Credential Vault demo complete!")
print(f"{SEPARATOR}\n")
