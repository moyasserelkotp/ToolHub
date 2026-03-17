import os
import json
from google import genai
from google.genai import types
from toolhub_sdk import ToolHub

# Connect to ToolHub using the local SDK
hub = ToolHub(base_url="http://localhost:3000", agent_id="gemini-math-agent")

print("\n🤖 Connecting to ToolHub...")

print("\n🔍 Fetching the math tool from the registry...")
tools = hub.list()
math_tool = next((t for t in tools if t.name == "math_evaluator"), None)

if not math_tool:
    print("❌ Could not find math_evaluator in ToolHub.")
    exit(1)
print(f"✅ Found Tool: {math_tool.name}")
print(f"   Description: {math_tool.description}")
print(f"   Endpoint:    {math_tool.endpoint_url}")

# 2. Format the tool for Gemini using our native SDK method
gemini_func = types.FunctionDeclaration(**hub.as_gemini_function(math_tool.id))

# A complex problem that LLMs struggle with natively but can solve using a calculator tool
prompt = "What is the exact result of 15.34 * 4.22 + sin(45 deg) ? Please use the math_evaluator tool to calculate it exactly."
print(f"\n🧠 Sending prompt to Gemini: '{prompt}'")

client = genai.Client()

try:
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=prompt,
        config=types.GenerateContentConfig(
            tools=[types.Tool(function_declarations=[gemini_func])]
        )
    )

    if response.function_calls:
        for tool_call in response.function_calls:
            print(f"\n⚡ Gemini decided to invoke: {tool_call.name}")
            print(f"   With arguments: {dict(tool_call.args)}")
            
            # 3. Securely handle the Gemini tool call using ToolHub
            # ToolHub proxies this out to the real Math.js API over the network!
            result_json_str = hub.handle_gemini_tool_call(tool_call)
            
            result_data = json.loads(result_json_str)

            print("\n✅ Real ToolHub Execution Result (from Math.js API):")
            print(json.dumps(result_data, indent=2))
            
    else:
        print("\nGemini didn't return a tool call.")
        print(response.text)

except Exception as e:
    print(f"\n❌ Error calling Gemini: {e}")
