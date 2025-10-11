import { createSdkMcpServer, type McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';

import { blogSearchTool, BLOG_TOOL_NAME } from './blogTool.js';

export const BLOG_MCP_SERVER_ID = 'library-blog';

let cachedServer: McpSdkServerConfigWithInstance | null = null;

export function getBlogMcpServer(): McpSdkServerConfigWithInstance {
  if (!cachedServer) {
    cachedServer = createSdkMcpServer({
      name: BLOG_MCP_SERVER_ID,
      version: '0.1.0',
      tools: [blogSearchTool]
    });
  }
  return cachedServer;
}

export { BLOG_TOOL_NAME, blogSearchTool };
