import os, json, requests
from google import genai
from google.genai import types
from toolhub_sdk import ToolHub

# Configuration
TOOLHUB_URL = os.getenv("TOOLHUB_URL", "http://localhost:3000")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

if not GOOGLE_API_KEY:
    print("❌ GOOGLE_API_KEY environment variable is missing.")
    exit(1)

# ── 1. Auth & Connection ──────────────────────────────────────────────────────
requests.post(f"{TOOLHUB_URL}/auth/register", json={"username": "agent", "password": "password123"})
token_res = requests.post(f"{TOOLHUB_URL}/auth/token", json={"username": "agent", "password": "password123"})
jwt = token_res.json().get("token")

hub = ToolHub(base_url=TOOLHUB_URL, token=jwt, agent_id="gemini-semantic-agent")
print("✅ Connected to ToolHub")

# ── 2. Discover Relevant Tools ───────────────────────────────────────────────
user_prompt = input("\nAI Agent Prompt: ")
print(f"🔍 Searching ToolHub for relevant tools...")

tools = hub.search(user_prompt, limit=5)
functions = [hub.as_gemini_function(t.id) for t in tools]

if functions:
    print(f"Found {len(functions)} tools: " + ", ".join([f['name'] for f in functions]))

# ── 3. Configure Gemini ──────────────────────────────────────────────────────
client = genai.Client(api_key=GOOGLE_API_KEY)

# System instruction: guide Gemini to prefer wiki_search for Wikipedia queries
SYSTEM_INSTRUCTION = (
    "You are a helpful assistant with access to tools. "
    "When the user asks about searching Wikipedia or looking up information, "
    "always prefer 'wiki_search' over 'web_search'. "
    "Use 'web_search' only when 'wiki_search' is not available."
)

# ── 4. Generate & Invoke ─────────────────────────────────────────────────────
print(f"🚀 Sending request to Gemini (google-genai)...")

try:
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=user_prompt,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            tools=[types.Tool(function_declarations=[
                types.FunctionDeclaration(**f) for f in functions
            ])] if functions else None
        )
    )

    if not response.candidates:
        print("No response from Gemini.")
        exit(0)

    candidate = response.candidates[0]

    for part in candidate.content.parts:
        if part.function_call:
            fn = part.function_call

            # ── Fallback: redirect web_search → wiki_search ──────────────────
            # web_search has no live endpoint; wiki_search is the real handler.
            if fn.name == "web_search":
                print(f"\n⚡ Gemini chose web_search — redirecting to wiki_search...")
                # Rebuild the call object with the correct tool name
                class _Redirect:
                    name = "wiki_search"
                    args = dict(fn.args)
                fn = _Redirect()
            
            print(f"\n⚡ Invoking: {fn.name}")
            print(f"   Args: {fn.args}")

            result_json = hub.handle_gemini_tool_call(fn)
            result_data = json.loads(result_json)

            if "error" in result_data:
                print(f"\n❌ Tool Error: {result_data['error']}")
            else:
                print(f"\n✅ ToolHub Execution Result:")
                print(json.dumps(result_data, indent=2))

        elif part.text:
            print(f"\n🤖 Gemini Summary:\n{part.text}")

except Exception as e:
    print(f"\n❌ Error during execution: {e}")





