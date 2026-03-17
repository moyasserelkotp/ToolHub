export interface Tool {
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

export interface ToolInvokeResult {
  success: boolean;
  latency_ms: number;
  data?: any;
  error?: string;
  error_type?: string;
}

export interface SearchResult {
  query: string;
  count: number;
  results: Tool[];
}

export interface WebhookSubscription {
  id: string;
  tool_id: string;
  agent_id: string;
  callback_url: string;
  events: string[];
  secret?: string;
}
