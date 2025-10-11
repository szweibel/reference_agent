import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { getActiveSearchCache, SearchCache } from '../src/lib/searchCache.js';

type ProcessAgentStreamType = (typeof import('../src/services/agentRunner.js'))['processAgentStream'];

type SDKMessageLike = {
  type: string;
  [key: string]: unknown;
};

const querySpy = vi.fn();
const createSdkMcpServerSpy = vi.fn();
const logInteractionSpy = vi.fn();

vi.mock('@anthropic-ai/claude-agent-sdk', async () => {
  const actual = await vi.importActual<typeof import('@anthropic-ai/claude-agent-sdk')>(
    '@anthropic-ai/claude-agent-sdk'
  );

  createSdkMcpServerSpy.mockImplementation(actual.createSdkMcpServer);

  return {
    ...actual,
    query: querySpy,
    createSdkMcpServer: createSdkMcpServerSpy
  };
});

vi.mock('../src/lib/prompt.js', () => ({
  buildSystemPrompt: () => 'system prompt'
}));

vi.mock('../src/lib/logger.js', () => ({
  logInteraction: logInteractionSpy
}));

let processAgentStream: ProcessAgentStreamType;
let PRIMO_MCP_SERVER_ID: string;
let PRIMO_TOOL_NAME: string;
let LOG_NOTE_TOOL_NAME: string;

beforeAll(async () => {
  ({ PRIMO_MCP_SERVER_ID, PRIMO_TOOL_NAME } = await import('../src/tools/primoMcpServer.js'));
  ({ LOG_NOTE_TOOL_NAME } = await import('../src/tools/logNoteMcpServer.js'));
  ({ processAgentStream } = await import('../src/services/agentRunner.js'));
});

beforeEach(() => {
  querySpy.mockReset();
  createSdkMcpServerSpy.mockClear();
  logInteractionSpy.mockReset();
  logInteractionSpy.mockResolvedValue(undefined);
});

function createAsyncIterable(messages: SDKMessageLike[]): AsyncIterable<SDKMessageLike> {
  return {
    [Symbol.asyncIterator]() {
      let index = 0;
      return {
        async next() {
          if (index < messages.length) {
            return { value: messages[index++], done: false };
          }
          return { value: undefined, done: true };
        }
      };
    }
  };
}

describe('processAgentStream', () => {
  it('returns the assembled response, reports streaming, and logs success', async () => {
    const stream = createAsyncIterable([
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Partial ' }
        }
      },
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Answer with citation https://example.test/info.' }]
        }
      },
      { type: 'result', is_error: false }
    ]);

    querySpy.mockReturnValueOnce(stream);

    const result = await processAgentStream({
      prompt: ' Opening hours? ',
      metadata: { source: 'web' }
    });

    expect(result).toEqual({ response: 'Answer with citation https://example.test/info.', streamed: true });

    expect(querySpy).toHaveBeenCalledTimes(1);
    const queryArgs = querySpy.mock.calls[0][0];
    expect(queryArgs.prompt).toBe('Opening hours?');
    expect(queryArgs.options).toMatchObject({
      systemPrompt: 'system prompt',
      permissionMode: 'bypassPermissions'
    });
    expect(queryArgs.options.allowedTools).toEqual(['WebSearch', 'WebFetch', PRIMO_TOOL_NAME, LOG_NOTE_TOOL_NAME, 'SearchBlog', 'SearchDatabases']);

    const mcpServers = queryArgs.options.mcpServers as Record<string, unknown> | undefined;
    expect(mcpServers).toBeTruthy();
    const primoServer = mcpServers?.[PRIMO_MCP_SERVER_ID] as Record<string, unknown> | undefined;
    expect(primoServer).toMatchObject({ type: 'sdk', name: PRIMO_MCP_SERVER_ID });
    expect(primoServer?.instance).toBeDefined();

    expect(logInteractionSpy).toHaveBeenCalledTimes(1);
    const entry = logInteractionSpy.mock.calls[0][0];
    expect(entry.userPrompt).toBe('Opening hours?');
    expect(entry.assistantResponse).toBe('Answer with citation https://example.test/info.');
    expect(entry.success).toBe(true);
    expect(entry.metadata).toEqual({ source: 'web' });
    expect(typeof entry.timestamp).toBe('string');
  });

  it('logs errors and rethrows when the agent reports a failure', async () => {
    const stream = createAsyncIterable([
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Working…' }
        }
      },
      { type: 'result', is_error: true }
    ]);

    querySpy.mockReturnValueOnce(stream);

    await expect(
      processAgentStream({ prompt: 'Broken request' })
    ).rejects.toThrow('Agent execution failed.');

    expect(logInteractionSpy).toHaveBeenCalledTimes(1);
    const entry = logInteractionSpy.mock.calls[0][0];
    expect(entry.userPrompt).toBe('Broken request');
    expect(entry.success).toBe(false);
    expect(entry.error).toBe('Agent execution failed.');
  });

  it('forwards abort controllers to the SDK query and still logs the interaction', async () => {
    const abortController = new AbortController();
    const stream = createAsyncIterable([]);

    querySpy.mockReturnValueOnce(stream);

    const result = await processAgentStream({
      prompt: 'Check connection',
      abortController
    });

    expect(result).toEqual({ response: '', streamed: false });

    expect(querySpy).toHaveBeenCalledTimes(1);
    const queryArgs = querySpy.mock.calls[0][0];
    expect(queryArgs.options.abortController).toBe(abortController);

    expect(logInteractionSpy).toHaveBeenCalledTimes(1);
    const entry = logInteractionSpy.mock.calls[0][0];
    expect(entry.userPrompt).toBe('Check connection');
    expect(entry.success).toBe(true);
  });

  it('creates an isolated search cache for each agent run', async () => {
    const messages = [
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Chunk' }
        }
      },
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Final response with link https://example.test/resource' }]
        }
      },
      { type: 'result', is_error: false }
    ];

    querySpy.mockReturnValueOnce(createAsyncIterable(messages));
    const firstCaches: SearchCache[] = [];

    await processAgentStream({
      prompt: 'First run',
      onMessage: async () => {
        firstCaches.push(getActiveSearchCache());
      }
    });

    expect(firstCaches.length).toBeGreaterThan(0);
    const firstCache = firstCaches[0];

    querySpy.mockReturnValueOnce(createAsyncIterable(messages));
    const secondCaches: SearchCache[] = [];

    await processAgentStream({
      prompt: 'Second run',
      onMessage: async () => {
        secondCaches.push(getActiveSearchCache());
      }
    });

    expect(secondCaches.length).toBeGreaterThan(0);
    const secondCache = secondCaches[0];

    expect(secondCache).not.toBe(firstCache);
  });
});

describe('runAgent', () => {
  it('streams substituted citation links to onTextChunk listeners', async () => {
    getActiveSearchCache().clear();

    const searchItems = [
      {
        title: 'Example Resource',
        permalink: 'https://example.test/resource',
        recordId: 'abc',
        catalogLink: '[Catalog link 1](https://example.test/resource)'
      }
    ];

    const messages: SDKMessageLike[] = [
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Resource {{CITE_' }
        }
      },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: '0}} is available.' }
        }
      },
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Resource {{CITE_0}} is available.' }]
        }
      },
      { type: 'result', is_error: false }
    ];

    querySpy.mockReturnValueOnce({
      [Symbol.asyncIterator]() {
        let index = 0;
        let seeded = false;
        return {
          async next() {
            if (!seeded) {
              getActiveSearchCache().addSearch(searchItems);
              seeded = true;
            }
            if (index < messages.length) {
              return { value: messages[index++], done: false };
            }
            return { value: undefined, done: true };
          }
        };
      }
    });

    const chunks: string[] = [];

    const { runAgent } = await import('../src/services/agentRunner.js');

    const result = await runAgent({
      prompt: 'Test citation streaming',
      onTextChunk: (chunk) => {
        chunks.push(chunk);
      }
    });

    expect(chunks.length).toBeGreaterThan(0);
    const streamed = chunks.join('');
    expect(streamed).toContain('[Catalog link 1](https://example.test/resource)');
    expect(streamed).not.toContain('{{CITE_0}}');

    expect(result.streamed).toBe(true);
    expect(result.response).toContain('[Catalog link 1](https://example.test/resource)');
  });
});
