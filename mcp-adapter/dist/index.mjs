#!/usr/bin/env node
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/index.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import { ToolHub } from "sdk";
var require_index = __commonJS({
  "src/index.ts"() {
    var args = process.argv.slice(2);
    var baseUrl = process.env.TOOLHUB_URL || "http://localhost:3000";
    var adminToken = process.env.TOOLHUB_ADMIN_TOKEN || "";
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--url" && args[i + 1]) baseUrl = args[++i];
      if (args[i] === "--token" && args[i + 1]) adminToken = args[++i];
    }
    var hub = new ToolHub({
      baseUrl,
      adminToken,
      agentId: "mcp-adapter-agent"
    });
    var server = new Server(
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
    server.setRequestHandler(ListToolsRequestSchema, async () => {
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
        throw new McpError(ErrorCode.InternalError, "Failed to fetch tools from ToolHub");
      }
    });
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args2 } = request.params;
      try {
        const rawRes = await hub.client.get(`/tools?limit=50`).catch(() => ({ data: { tools: [] } }));
        const tools = rawRes.data?.tools || [];
        const targetTool = tools.find((t) => t.name === name);
        if (!targetTool) {
          throw new McpError(ErrorCode.MethodNotFound, `Tool not found in ToolHub: ${name}`);
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
      const transport = new StdioServerTransport();
      await server.connect(transport);
      console.error("\u{1F680} ToolHub MCP Adapter running on stdio");
    }
    run().catch((error) => {
      console.error("Fatal error in main():", error);
      process.exit(1);
    });
  }
});
export default require_index();
//# sourceMappingURL=index.mjs.map