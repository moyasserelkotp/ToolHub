#!/usr/bin/env node
"use strict";

// src/index.ts
var import_server = require("@modelcontextprotocol/sdk/server/index.js");
var import_stdio = require("@modelcontextprotocol/sdk/server/stdio.js");
var import_types = require("@modelcontextprotocol/sdk/types.js");
var import_sdk = require("sdk");
var args = process.argv.slice(2);
var baseUrl = process.env.TOOLHUB_URL || "http://localhost:3000";
var adminToken = process.env.TOOLHUB_ADMIN_TOKEN || "";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--url" && args[i + 1]) baseUrl = args[++i];
  if (args[i] === "--token" && args[i + 1]) adminToken = args[++i];
}
var hub = new import_sdk.ToolHub({
  baseUrl,
  adminToken,
  agentId: "mcp-adapter-agent"
});
var server = new import_server.Server(
  {
    name: "toolhub-mcp",
    version: "1.0.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);
server.setRequestHandler(import_types.ListToolsRequestSchema, async () => {
  try {
    const tools = await hub.search("", 50);
    const rawRes = await hub.client.get("/tools?limit=50").catch(() => ({ data: { tools } }));
    const activeTools = rawRes.data?.tools || tools;
    return {
      tools: activeTools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.json_schema || {
          type: "object",
          properties: {}
        }
      }))
    };
  } catch (err) {
    console.error("Failed to list tools:", err.message);
    throw new import_types.McpError(import_types.ErrorCode.InternalError, "Failed to fetch tools from ToolHub");
  }
});
server.setRequestHandler(import_types.CallToolRequestSchema, async (request) => {
  const { name, arguments: args2 } = request.params;
  try {
    const rawRes = await hub.client.get(`/tools?limit=50`).catch(() => ({ data: { tools: [] } }));
    const tools = rawRes.data?.tools || [];
    const targetTool = tools.find((t) => t.name === name);
    if (!targetTool) {
      throw new import_types.McpError(import_types.ErrorCode.MethodNotFound, `Tool not found in ToolHub: ${name}`);
    }
    const result = await hub.invoke(targetTool.id, args2);
    if (!result.success) {
      return {
        content: [
          {
            type: "text",
            text: `Tool error (${result.error_type}): ${result.error}`
          }
        ],
        isError: true
      };
    }
    return {
      content: [
        {
          type: "text",
          text: typeof result.data === "string" ? result.data : JSON.stringify(result.data, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `MCP Adapter caught error: ${error.message}`
        }
      ],
      isError: true
    };
  }
});
async function run() {
  const transport = new import_stdio.StdioServerTransport();
  await server.connect(transport);
  console.error("\u{1F680} ToolHub MCP Adapter running on stdio");
}
run().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
//# sourceMappingURL=index.js.map