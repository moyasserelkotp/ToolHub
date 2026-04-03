import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export function asLangChainTool(hub: any, toolId: string): DynamicStructuredTool {
  // In a real implementation this would fetch the tool JSON schema and convert it to Zod.
  // For simplicity, we accept a generic payload.
  return new DynamicStructuredTool({
    name: toolId.replace(/-/g, "_").substring(0, 64),
    description: `ToolHub wrapper for tool ${toolId}`,
    schema: z.object({
      payload: z.any().describe("JSON payload for the tool invocation")
    }),
    func: async ({ payload }) => {
      const result = await hub.invoke(toolId, payload);
      if (!result.success) return `Error: ${result.error}`;
      return JSON.stringify(result.data);
    }
  });
}
