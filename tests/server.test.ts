import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

process.env.NODE_ENV = 'test';

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

vi.mock('../src/lib/logger.js', () => ({
  logInteraction: logInteractionSpy
}));

vi.mock('../src/lib/prompt.js', () => ({
  buildSystemPrompt: () => 'system prompt'
}));

beforeEach(() => {
  querySpy.mockReset();
  createSdkMcpServerSpy.mockClear();
  logInteractionSpy.mockReset();
  logInteractionSpy.mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env.BASE_PATH;
});

async function loadCreateAppWithBasePath(basePath?: string) {
  if (typeof basePath === 'string') {
    process.env.BASE_PATH = basePath;
  } else {
    delete process.env.BASE_PATH;
  }

  vi.resetModules();
  const mod = await import('../src/server.js');
  return mod.createApp;
}

function createStream(messages: SDKMessage[]): AsyncIterable<SDKMessage> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const message of messages) {
        yield message;
      }
    }
  };
}

type ParsedSseEvent = { event: string; data: unknown };

function parseSsePayload(payload: string): ParsedSseEvent[] {
  return payload
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split(/\r?\n/);
      let event = 'message';
      const dataLines: string[] = [];

      for (const line of lines) {
        if (line.startsWith('event:')) {
          event = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim());
        }
      }

      let data: unknown = null;
      if (dataLines.length > 0) {
        const raw = dataLines.join('\n');
        try {
          data = JSON.parse(raw);
        } catch {
          data = raw;
        }
      }

      return { event, data };
    });
}

describe('POST /api/query', () => {
  it('streams assistant text, tool events, and final completion payload', async () => {
    const createApp = await loadCreateAppWithBasePath();
    const messages: SDKMessage[] = [
      {
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          block: {
            type: 'tool_use',
            id: 'tool-1',
            name: 'WebSearch',
            input: { query: 'Upcoming events' }
          }
        }
      } as SDKMessage,
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Checking events… ' }
        }
      } as SDKMessage,
      {
        type: 'stream_event',
        event: {
          type: 'content_block_stop',
          block: { type: 'tool_use', id: 'tool-1' }
        }
      } as SDKMessage,
      {
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-1',
              content: [{ type: 'text', text: 'Event list' }]
            }
          ]
        }
      } as SDKMessage,
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Here are upcoming workshops.' }]
        }
      } as SDKMessage,
      {
        type: 'result',
        is_error: false,
        total_cost_usd: 0.0012,
        usage: { input_tokens: 42, output_tokens: 128 }
      } as SDKMessage
    ];

    querySpy.mockReturnValueOnce(createStream(messages));

    const app = createApp();
    const response = await request(app)
      .post('/api/query')
      .set('Content-Type', 'application/json')
      .send({ prompt: 'Upcoming events?', libraryId: 'mina-rees' })
      .expect(200);

    expect(response.headers['content-type']).toContain('text/event-stream');

    const events = parseSsePayload(response.text);
    const eventNames = events.map((entry) => entry.event);

    expect(eventNames).toEqual([
      'start',
      'tool-use',
      'assistant-text',
      'tool-use',
      'tool-result',
      'assistant-text',
      'result',
      'done'
    ]);

    expect(events[1].data).toMatchObject({
      id: 'tool-1',
      name: 'WebSearch',
      stage: 'start'
    });

    expect(events[2].data).toMatchObject({
      text: 'Checking events… ',
      mode: 'delta'
    });

    expect(events[5].data).toMatchObject({
      text: 'Here are upcoming workshops.',
      mode: 'block'
    });

    expect(events[6].data).toMatchObject({
      isError: false,
      totalCostUsd: 0.0012
    });

    expect(events[7].data).toMatchObject({
      response: 'Here are upcoming workshops.',
      libraryId: 'mina-rees'
    });

    expect(logInteractionSpy).toHaveBeenCalledTimes(1);
    expect(logInteractionSpy.mock.calls[0][0]).toMatchObject({
      userPrompt: 'Upcoming events?',
      assistantResponse: 'Here are upcoming workshops.',
      success: true
    });
  });
});

describe('static assets and routing', () => {
  it('injects an empty BASE_PATH and serves assets when no BASE_PATH is set', async () => {
    const createApp = await loadCreateAppWithBasePath();
    const app = createApp();

    const indexResponse = await request(app).get('/').expect(200);

    expect(indexResponse.headers['content-type']).toContain('text/html');
    expect(indexResponse.text).toContain('window.__BASE_PATH__ = "";');
    expect(indexResponse.text).toContain('href="/tailwind.css"');

    const cssResponse = await request(app).get('/tailwind.css').expect(200);

    expect(cssResponse.headers['content-type']).toContain('text/css');
    expect(cssResponse.text).toContain('tailwindcss');
  });

  it('injects the configured BASE_PATH and serves the SPA at both the root and prefixed URLs', async () => {
    const basePath = '/reference-agent';
    const createApp = await loadCreateAppWithBasePath(basePath);
    const app = createApp();

    const rootResponse = await request(app).get('/').expect(200);
    expect(rootResponse.headers['content-type']).toContain('text/html');
    expect(rootResponse.text).toContain('window.__BASE_PATH__ = "/reference-agent";');
    expect(rootResponse.text).toContain('href="/reference-agent/tailwind.css"');

    const prefixedResponse = await request(app).get(`${basePath}/`).expect(200);
    expect(prefixedResponse.text).toContain('window.__BASE_PATH__ = "/reference-agent";');
    expect(prefixedResponse.text).toContain('href="/reference-agent/tailwind.css"');

    const cssResponse = await request(app).get(`${basePath}/tailwind.css`).expect(200);
    expect(cssResponse.headers['content-type']).toContain('text/css');
    expect(cssResponse.text).toContain('tailwindcss');
  });

  it('accepts API calls via prefixed and unprefixed routes when BASE_PATH is set', async () => {
    const basePath = '/reference-agent';
    const createApp = await loadCreateAppWithBasePath(basePath);
    const app = createApp();

    await request(app)
      .post(`${basePath}/api/primo/search`)
      .set('Content-Type', 'application/json')
      .send({})
      .expect(400);

    await request(app)
      .post('/api/primo/search')
      .set('Content-Type', 'application/json')
      .send({})
      .expect(400);
  });
});
