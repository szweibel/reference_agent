import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { searchGuidesTool } from './guidesTool.js';

export const GUIDES_MCP_SERVER_ID = 'libguides';
export const GUIDES_TOOL_NAME = 'SearchGuides';

export function getGuidesMcpServer() {
  return createSdkMcpServer({
    name: GUIDES_MCP_SERVER_ID,
    version: '1.0.0',
    tools: [searchGuidesTool]
  });
}
