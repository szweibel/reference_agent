import { createSdkMcpServer, type McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';

import { databaseSearchTool, DATABASE_TOOL_NAME } from './databaseTool.js';

export const DATABASE_MCP_SERVER_ID = 'databases-az';

let cachedServer: McpSdkServerConfigWithInstance | null = null;

export function getDatabaseMcpServer(): McpSdkServerConfigWithInstance {
  if (!cachedServer) {
    cachedServer = createSdkMcpServer({
      name: DATABASE_MCP_SERVER_ID,
      version: '0.1.0',
      tools: [databaseSearchTool]
    });
  }
  return cachedServer;
}

export { DATABASE_TOOL_NAME, databaseSearchTool };
