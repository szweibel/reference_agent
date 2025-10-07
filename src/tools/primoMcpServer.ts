import { createSdkMcpServer, type McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';

import { primoSearchTool, PRIMO_TOOL_NAME } from './primoTool.js';

export const PRIMO_MCP_SERVER_ID = 'primo-catalog';

let cachedServer: McpSdkServerConfigWithInstance | null = null;

export function getPrimoMcpServer(): McpSdkServerConfigWithInstance {
  if (!cachedServer) {
    cachedServer = createSdkMcpServer({
      name: PRIMO_MCP_SERVER_ID,
      version: '0.1.0',
      tools: [primoSearchTool]
    });
  }
  return cachedServer;
}

export { PRIMO_TOOL_NAME, primoSearchTool };
