"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  ToolHub: () => ToolHub
});
module.exports = __toCommonJS(index_exports);

// src/ToolHub.ts
var import_axios = __toESM(require("axios"));
var ToolHub = class {
  client;
  operatorId;
  agentId;
  constructor(config = {}) {
    this.operatorId = config.operatorId || "default-operator";
    this.agentId = config.agentId || "default-ts-agent";
    this.client = import_axios.default.create({
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ToolHub
});
//# sourceMappingURL=index.js.map