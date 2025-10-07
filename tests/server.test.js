import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
process.env.NODE_ENV = 'test';
const querySpy = vi.fn();
const createSdkMcpServerSpy = vi.fn();
const logInteractionSpy = vi.fn();
vi.mock('@anthropic-ai/claude-agent-sdk', async () => {
    const actual = await vi.importActual('@anthropic-ai/claude-agent-sdk');
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
async function loadCreateAppWithBasePath(basePath) {
    if (typeof basePath === 'string') {
        process.env.BASE_PATH = basePath;
    }
    else {
        delete process.env.BASE_PATH;
    }
    vi.resetModules();
    const mod = await import('../src/server.js');
    return mod.createApp;
}
function createStream(messages) {
    return {
        async *[Symbol.asyncIterator]() {
            for (const message of messages) {
                yield message;
            }
        }
    };
}
function parseSsePayload(payload) {
    return payload
        .split(/\r?\n\r?\n/)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block) => {
        const lines = block.split(/\r?\n/);
        let event = 'message';
        const dataLines = [];
        for (const line of lines) {
            if (line.startsWith('event:')) {
                event = line.slice(6).trim();
            }
            else if (line.startsWith('data:')) {
                dataLines.push(line.slice(5).trim());
            }
        }
        let data = null;
        if (dataLines.length > 0) {
            const raw = dataLines.join('\n');
            try {
                data = JSON.parse(raw);
            }
            catch {
                data = raw;
            }
        }
        return { event, data };
    });
}
describe('POST /api/query', () => {
    it('streams assistant text, tool events, and final completion payload', async () => {
        const createApp = await loadCreateAppWithBasePath();
        const messages = [
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
            },
            {
                type: 'stream_event',
                event: {
                    type: 'content_block_delta',
                    delta: { type: 'text_delta', text: 'Checking events… ' }
                }
            },
            {
                type: 'stream_event',
                event: {
                    type: 'content_block_stop',
                    block: { type: 'tool_use', id: 'tool-1' }
                }
            },
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
            },
            {
                type: 'assistant',
                message: {
                    content: [{ type: 'text', text: 'Here are upcoming workshops.' }]
                }
            },
            {
                type: 'result',
                is_error: false,
                total_cost_usd: 0.0012,
                usage: { input_tokens: 42, output_tokens: 128 }
            }
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
    it('serves the Tailwind bundle at the root when no BASE_PATH is set', async () => {
        const createApp = await loadCreateAppWithBasePath();
        const app = createApp();
        const response = await request(app).get('/tailwind.css').expect(200);
        expect(response.headers['content-type']).toContain('text/css');
        expect(response.text).toContain('tailwindcss');
    });
    it('redirects the bare root to the configured BASE_PATH', async () => {
        const createApp = await loadCreateAppWithBasePath('/reference-agent');
        const app = createApp();
        const response = await request(app).get('/').expect(302);
        expect(response.headers.location).toBe('/reference-agent/');
    });
    it('serves the Tailwind bundle under the configured BASE_PATH', async () => {
        const createApp = await loadCreateAppWithBasePath('/reference-agent');
        const app = createApp();
        const response = await request(app).get('/reference-agent/tailwind.css').expect(200);
        expect(response.headers['content-type']).toContain('text/css');
        expect(response.text).toContain('tailwindcss');
    });
});
//# sourceMappingURL=server.test.js.map