import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { hoursTool, HOURS_TOOL_NAME } from './hoursTool.js';

export const HOURS_MCP_SERVER_ID = 'library-hours';

export function getHoursMcpServer() {
  return createSdkMcpServer({
    name: HOURS_MCP_SERVER_ID,
    version: '1.0.0',
    tools: [hoursTool]
  });
}

export { HOURS_TOOL_NAME, hoursTool };
