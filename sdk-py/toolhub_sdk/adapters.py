import json

def as_langchain_tool(hub, tool_id: str):
    """Returns a LangChain-compatible tool wrapping a ToolHub invocation."""
    try:
        from langchain.tools import Tool as LCTool
    except ImportError:
        raise ImportError("Please install LangChain adapter: pip install 'toolhub-sdk[langchain]'")
    
    tool = hub.get(tool_id)
    
    def _run(input_str: str) -> str:
        try:
            params = json.loads(input_str)
        except (json.JSONDecodeError, TypeError):
            params = {"query": input_str}
        result = hub.invoke(tool_id, params)
        return json.dumps(result.data, ensure_ascii=False, default=str) if result.success else f"Error: {result.error}"

    return LCTool(
        name=tool.name.replace("-", "_").lower()[:64],
        description=f"{tool.description} (category: {tool.category})",
        func=_run,
    )

def as_llamaindex_tool(hub, tool_id: str):
    """Returns a LlamaIndex-compatible FunctionTool wrapping a ToolHub invocation."""
    try:
        from llama_index.core.tools import FunctionTool
    except ImportError:
        raise ImportError("Please install LlamaIndex adapter: pip install 'toolhub-sdk[llama]'")
    
    tool = hub.get(tool_id)
    
    def _run(**kwargs) -> str:
        result = hub.invoke(tool_id, kwargs)
        return json.dumps(result.data, ensure_ascii=False, default=str) if result.success else f"Error: {result.error}"
        
    return FunctionTool.from_defaults(
        fn=_run,
        name=tool.name.replace("-", "_").lower()[:64],
        description=tool.description
    )
