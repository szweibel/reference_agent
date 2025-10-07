import { createSdkMcpServer, type McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';

import { logNoteTool, LOG_NOTE_TOOL_NAME } from './logNoteTool.js';

export const LOG_NOTE_MCP_SERVER_ID = 'institutional-knowledge';

let cachedServer: McpSdkServerConfigWithInstance | null = null;

export function getLogNoteMcpServer(): McpSdkServerConfigWithInstance {
  if (!cachedServer) {
    cachedServer = createSdkMcpServer({
      name: LOG_NOTE_MCP_SERVER_ID,
      version: '0.1.0',
      tools: [logNoteTool]
    });
  }
  return cachedServer;
}

export { LOG_NOTE_TOOL_NAME, logNoteTool };
