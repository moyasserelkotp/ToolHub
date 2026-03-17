import axios, { AxiosInstance } from 'axios';
import { Tool, SearchResult, ToolInvokeResult, WebhookSubscription } from './types';

export interface ToolHubConfig {
  baseUrl?: string;
  adminToken?: string;
  operatorId?: string;
  agentId?: string;
}

export class ToolHub {
  private client: AxiosInstance;
  private operatorId: string;
  private agentId: string;

  constructor(config: ToolHubConfig = {}) {
    this.operatorId = config.operatorId || 'default-operator';
    this.agentId = config.agentId || 'default-ts-agent';
    
    this.client = axios.create({
      baseURL: config.baseUrl || 'http://localhost:3000',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (config.adminToken) {
      this.client.defaults.headers.common['Authorization'] = `Bearer ${config.adminToken}`;
    }
  }

  /**
   * Semantically search the tool registry.
   */
  async search(query: string, limit: number = 5): Promise<Tool[]> {
    const res = await this.client.post<SearchResult>('/tools/search', { query, limit });
    return res.data.results;
  }

  /**
   * Get full details of a specific tool by ID.
   */
  async get(id: string): Promise<Tool> {
    const res = await this.client.get<Tool>(`/tools/${id}`);
    return res.data;
  }

  /**
   * Register a new tool. Requires adminToken.
   */
  async registerTool(tool: Partial<Tool>): Promise<Tool> {
    const res = await this.client.post('/tools', tool);
    return res.data.tool;
  }

  /**
   * Store AES-encrypted credentials for a tool in the vault.
   */
  async registerCredential(toolId: string, apiKey: string, authType: string = 'api_key'): Promise<any> {
    const res = await this.client.post('/credentials', {
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
  async invoke(toolId: string, payload: Record<string, any>, options: { maxRetries?: number } = {}): Promise<ToolInvokeResult> {
    const maxRetries = options.maxRetries ?? 3;
    let attempt = 0;
    
    while (attempt < maxRetries) {
      try {
        const res = await this.client.post<ToolInvokeResult>(`/tools/${toolId}/invoke`, {
          agent_id: this.agentId,
          operator_id: this.operatorId,
          payload
        });
        return res.data;
      } catch (error: any) {
        attempt++;
        const status = error.response?.status;
        
        // Don't retry client errors (4xx) except 429
        if (status && status >= 400 && status < 500 && status !== 429) {
          throw error;
        }
        
        if (attempt >= maxRetries) {
          throw error;
        }
        
        // Exponential backoff: 0.5s, 1s, 2s...
        await new Promise(r => setTimeout(r, (2 ** (attempt - 1)) * 500));
      }
    }
    throw new Error('Invoke failed');
  }

  /**
   * Get related tools based on embeddings.
   */
  async getRelatedTools(toolId: string, limit: number = 5): Promise<Tool[]> {
    const res = await this.client.get<{related: Tool[]}>(`/tools/${toolId}/related?limit=${limit}`);
    return res.data.related;
  }

  /**
   * Subscribe to tool webhooks (e.g. schema_change, degraded).
   */
  async registerWebhook(subscription: Partial<WebhookSubscription>): Promise<WebhookSubscription> {
    const res = await this.client.post('/webhooks', {
      ...subscription,
      agent_id: this.agentId
    });
    return res.data.webhook;
  }
}
