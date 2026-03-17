# ToolHub Python SDK

ToolHub is an AI-native tool discovery and secure credential injection registry. This SDK allows your AI Agents to securely interact with external APIs without ever storing or handling raw API keys directly in the agent's context window.

## Installation

```bash
pip install toolhub-sdk
```

For specific LLM framework wrappers:
```bash
pip install "toolhub-sdk[openai]"      # For OpenAI function calling
pip install "toolhub-sdk[langchain]"   # For LangChain tools
pip install google-genai               # For Gemini integration
```

---

## 🚀 Quick Start (Zero-Config)

```python
from toolhub_sdk import ToolHub

# 1. Connect to your registry (agent never touches keys)
hub = ToolHub(base_url="http://localhost:3000", agent_id="my-agent-123")

# 2. Semantic search for a tool using natural language
tools = hub.search("I need to send an email")
email_tool = tools[0]

# 3. Invoke! ToolHub dynamically injects the API keys on the backend
response = hub.invoke(email_tool.id, {"to": "team@example.com", "body": "Hello!"})
print(response.data)
```

---

## 🤖 Real-World Agent Frameworks

The SDK natively formats ToolHub schemas into function-calling arrays for major LLM providers. When the LLM decides to fire a tool, ToolHub's built-in handlers instantly convert the execution back to your private registry proxy.

### 🌟 Gemini 2.5 Flash Integration

```python
import os
import json
from google import genai
from google.genai import types
from toolhub_sdk import ToolHub

hub = ToolHub(base_url="http://localhost:3000")
math_tool = hub.search("evaluate math expression")[0]

# Automatically format ToolHub schema to Gemini protobuf types
gemini_func = types.FunctionDeclaration(**hub.as_gemini_function(math_tool.id))

client = genai.Client() # Assumes GEMINI_API_KEY is in env
response = client.models.generate_content(
    model='gemini-2.5-flash',
    contents='What is the exact result of 15.34 * 4.22 + sin(45 deg) ? Please use the math_evaluator tool to calculate it exactly.',
    config=types.GenerateContentConfig(
        tools=[types.Tool(function_declarations=[gemini_func])]
    )
)

if response.function_calls:
    for tool_call in response.function_calls:
        print(f"Gemini decided to invoke: {tool_call.name}")
        
        # ToolHub maps the Gemini protobuf arguments and securely proxies the network request!
        result_json_str = hub.handle_gemini_tool_call(tool_call)
        print(json.loads(result_json_str))
```

### 🧠 OpenAI Function Calling

```python
import openai
from toolhub_sdk import ToolHub

hub = ToolHub(base_url="http://localhost:3000")
web_tool = hub.search("search the web")[0]

response = openai.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Search the web for AI news."}],
    tools=[{"type": "function", "function": hub.as_openai_function(web_tool.id)}],
)

tool_call = response.choices[0].message.tool_calls[0]
result_json_str = hub.handle_openai_tool_call(tool_call)
print(result_json_str)
```

---

## 🗄️ Credential Management

You can seamlessly register new AES-256 encrypted credentials from Python.

```python
hub.register_credential(
    tool_id="some-uuid",
    api_key="sk-live-12345",
    auth_type="bearer_token"
)
```
