const express = require('express');
const router = express.Router();
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } = require('@modelcontextprotocol/sdk/types.js');
const db = require('../db');
const axios = require('axios');
const { decrypt } = require('../services/security');

// MCP Server initialization
const mcpServer = new Server({ name: 'toolhub-mcp', version: '2.0.0' }, { capabilities: { tools: {} } });

// Store active transport
let transport;

// ── MCP List Tools ───────────────────────────────────────────────────────────
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  try {
    const { rows } = await db.query(
      `SELECT name, description, json_schema FROM tools 
       WHERE status = 'active' AND is_public = true LIMIT 100`
    );

    return {
       tools: rows.map(t => ({
         name: t.name,
         description: t.description,
         inputSchema: t.json_schema || { type: 'object', properties: {} }
       }))
    };
  } catch (err) {
    console.error('MCP ListTools Error:', err);
    throw new McpError(ErrorCode.InternalError, 'Failed to fetch tools from ToolHub');
  }
});

// ── MCP Call Tool ────────────────────────────────────────────────────────────
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    const { rows: toolRows } = await db.query(`SELECT id, endpoint_url, auth_type FROM tools WHERE name = $1 AND status = 'active'`, [name]);
    if (!toolRows[0]) throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
    const tool = toolRows[0];

    // In a real multi-tenant MCP, credentials would be resolved based on session context.
    // For this bridge, we assume a generic 'mcp_agent' operator or fallback proxy.
    const { rows: credRows } = await db.query(
      `SELECT encrypted_key FROM credentials WHERE tool_id = $1 AND operator_id = 'default' AND is_active = true`,
      [tool.id]
    );

    const headers = { 'Content-Type': 'application/json', 'X-ToolHub-Agent': 'mcp-sse-bridge' };
    if (credRows[0]) {
      const rawKey = decrypt(credRows[0].encrypted_key);
      if (tool.auth_type === 'api_key') headers['X-API-Key'] = rawKey;
      else if (tool.auth_type === 'bearer_token') headers['Authorization'] = `Bearer ${rawKey}`;
    }

    if (!tool.endpoint_url) {
      return { content: [{ type: 'text', text: `Stub response for ${name}` }] };
    }

    const { data } = await axios.post(tool.endpoint_url, args, { headers, timeout: 10000 });
    return { content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `MCP API Error: ${err.message}` }], isError: true };
  }
});

// ── SSE Endpoint ─────────────────────────────────────────────────────────────
router.get('/sse', async (req, res) => {
  console.log('Got new MCP SSE connection');
  transport = new SSEServerTransport('/mcp/message', res);
  await mcpServer.connect(transport);
});

// ── Message Endpoint ─────────────────────────────────────────────────────────
router.post('/message', async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(503).json({ error: 'SSE Transport not initialized' });
  }
});

module.exports = router;
