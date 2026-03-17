#!/usr/bin/env node

/**
 * ToolHub MCP Adapter
 * Bridges ToolHub's semantic registry to the standard Model Context Protocol (MCP).
 * 
 * Usage:
 *   npx toolhub-mcp --url http://localhost:3000 --token <admin_token>
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { ToolHub } from 'sdk'; // Our local sibling sdk-js

// Parse basic args or use env vars
const args = process.argv.slice(2);
let baseUrl = process.env.TOOLHUB_URL || 'http://localhost:3000';
let adminToken = process.env.TOOLHUB_ADMIN_TOKEN || '';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--url' && args[i + 1]) baseUrl = args[++i];
  if (args[i] === '--token' && args[i + 1]) adminToken = args[++i];
}

const hub = new ToolHub({
  baseUrl,
  adminToken,
  agentId: 'mcp-adapter-agent'
});

const server = new Server(
  {
    name: 'toolhub-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ── 1. List Available Tools ────────────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => {
  try {
    // We fetch the top 100 active tools to expose to the LLM. 
    // In a massive deployment, we might expose a specific "collection" or use semantic search via custom MCP resources.
    // For now, list them all to the native MCP tools capability.
    
    // SDK doesn't have a listAll() yet, but we can hit /tools via search with empty string or directly via axios
    // Actually, we can use search with a generic prompt to get top ones, or access client directly
    // Let's implement a quick workaround since sdk-js doesn't expose list() yet:
    
    // We already have generic search:
    const tools = await hub.search('', 50); // Empty semantic search might not work perfectly with TF-IDF, let's use a broad term or fetch manually
    
    // Fallback manual fetch for a clean list of 50
    const rawRes = await (hub as any).client.get('/tools?limit=50').catch(() => ({ data: { tools: tools } }));
    const activeTools = rawRes.data?.tools || tools;

    return {
      tools: activeTools.map((t: any) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.json_schema || {
          type: 'object',
          properties: {},
        },
      })),
    };
  } catch (err: any) {
    console.error('Failed to list tools:', err.message);
    throw new McpError(ErrorCode.InternalError, 'Failed to fetch tools from ToolHub');
  }
});

// ── 2. Invoke Tools ────────────────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // We need the tool ID. Let's find it.
    // Since we only have the name in MCP CallTool, we search for it.
    const rawRes = await (hub as any).client.get(`/tools?limit=50`).catch(() => ({ data: { tools: [] } }));
    const tools = rawRes.data?.tools || [];
    const targetTool = tools.find((t: any) => t.name === name);

    if (!targetTool) {
      throw new McpError(ErrorCode.MethodNotFound, `Tool not found in ToolHub: ${name}`);
    }

    // Proxy the invocation through ToolHub so credentials are automatically injected
    const result = await hub.invoke(targetTool.id, args as Record<string, any>);

    if (!result.success) {
      return {
        content: [
          {
            type: 'text',
            text: `Tool error (${result.error_type}): ${result.error}`,
          },
        ],
        isError: true,
      };
    }

    // Format the successful result
    return {
      content: [
        {
          type: 'text',
          text: typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2),
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `MCP Adapter caught error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// ── Start Server ───────────────────────────────────────────────────────────
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('🚀 ToolHub MCP Adapter running on stdio');
}

run().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
