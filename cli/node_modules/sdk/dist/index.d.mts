interface Tool {
    id: string;
    name: string;
    description: string;
    category: string;
    auth_type: string;
    status: string;
    security_score: number;
    usage_count: number;
    version: string;
    json_schema: any;
    semantic_score?: number;
    score?: number;
}
interface ToolInvokeResult {
    success: boolean;
    latency_ms: number;
    data?: any;
    error?: string;
    error_type?: string;
}
interface SearchResult {
    query: string;
    count: number;
    results: Tool[];
}
interface WebhookSubscription {
    id: string;
    tool_id: string;
    agent_id: string;
    callback_url: string;
    events: string[];
    secret?: string;
}

interface ToolHubConfig {
    baseUrl?: string;
    adminToken?: string;
    operatorId?: string;
    agentId?: string;
}
declare class ToolHub {
    private client;
    private operatorId;
    private agentId;
    constructor(config?: ToolHubConfig);
    /**
     * Semantically search the tool registry.
     */
    search(query: string, limit?: number): Promise<Tool[]>;
    /**
     * Get full details of a specific tool by ID.
     */
    get(id: string): Promise<Tool>;
    /**
     * Register a new tool. Requires adminToken.
     */
    registerTool(tool: Partial<Tool>): Promise<Tool>;
    /**
     * Store AES-encrypted credentials for a tool in the vault.
     */
    registerCredential(toolId: string, apiKey: string, authType?: string): Promise<any>;
    /**
     * Invoke a tool transparently, automatically injecting credentials from the vault.
     */
    invoke(toolId: string, payload: Record<string, any>, options?: {
        maxRetries?: number;
    }): Promise<ToolInvokeResult>;
    /**
     * Get related tools based on embeddings.
     */
    getRelatedTools(toolId: string, limit?: number): Promise<Tool[]>;
    /**
     * Subscribe to tool webhooks (e.g. schema_change, degraded).
     */
    registerWebhook(subscription: Partial<WebhookSubscription>): Promise<WebhookSubscription>;
}

export { type SearchResult, type Tool, ToolHub, type ToolHubConfig, type ToolInvokeResult, type WebhookSubscription };
