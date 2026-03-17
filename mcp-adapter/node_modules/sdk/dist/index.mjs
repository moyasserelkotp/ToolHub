// src/ToolHub.ts
import axios from "axios";
var ToolHub = class {
  client;
  operatorId;
  agentId;
  constructor(config = {}) {
    this.operatorId = config.operatorId || "default-operator";
    this.agentId = config.agentId || "default-ts-agent";
    this.client = axios.create({
      baseURL: config.baseUrl || "http://localhost:3000",
      headers: {
        "Content-Type": "application/json"
      }
    });
    if (config.adminToken) {
      this.client.defaults.headers.common["Authorization"] = `Bearer ${config.adminToken}`;
    }
  }
  /**
   * Semantically search the tool registry.
   */
  async search(query, limit = 5) {
    const res = await this.client.post("/tools/search", { query, limit });
    return res.data.results;
  }
  /**
   * Get full details of a specific tool by ID.
   */
  async get(id) {
    const res = await this.client.get(`/tools/${id}`);
    return res.data;
  }
  /**
   * Register a new tool. Requires adminToken.
   */
  async registerTool(tool) {
    const res = await this.client.post("/tools", tool);
    return res.data.tool;
  }
  /**
   * Store AES-encrypted credentials for a tool in the vault.
   */
  async registerCredential(toolId, apiKey, authType = "api_key") {
    const res = await this.client.post("/credentials", {
      tool_id: toolId,
      operator_id: this.operatorId,
      api_key: apiKey,
      auth_type: authType
    });
    return res.data;
  }
  /**
   * Invoke a tool transparently, automatically injecting credentials from the vault.
   */
  async invoke(toolId, payload, options = {}) {
    const maxRetries = options.maxRetries ?? 3;
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        const res = await this.client.post(`/tools/${toolId}/invoke`, {
          agent_id: this.agentId,
          operator_id: this.operatorId,
          payload
        });
        return res.data;
      } catch (error) {
        attempt++;
        const status = error.response?.status;
        if (status && status >= 400 && status < 500 && status !== 429) {
          throw error;
        }
        if (attempt >= maxRetries) {
          throw error;
        }
        await new Promise((r) => setTimeout(r, 2 ** (attempt - 1) * 500));
      }
    }
    throw new Error("Invoke failed");
  }
  /**
   * Get related tools based on embeddings.
   */
  async getRelatedTools(toolId, limit = 5) {
    const res = await this.client.get(`/tools/${toolId}/related?limit=${limit}`);
    return res.data.related;
  }
  /**
   * Subscribe to tool webhooks (e.g. schema_change, degraded).
   */
  async registerWebhook(subscription) {
    const res = await this.client.post("/webhooks", {
      ...subscription,
      agent_id: this.agentId
    });
    return res.data.webhook;
  }
};
export {
  ToolHub
};
//# sourceMappingURL=index.mjs.map