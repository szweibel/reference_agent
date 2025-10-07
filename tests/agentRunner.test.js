import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
vi.mock('../src/lib/prompt.js', () => ({
    buildSystemPrompt: () => 'system prompt'
}));
vi.mock('../src/lib/logger.js', () => ({
    logInteraction: logInteractionSpy
}));
let processAgentStream;
let PRIMO_MCP_SERVER_ID;
let PRIMO_TOOL_NAME;
beforeAll(async () => {
    ({ PRIMO_MCP_SERVER_ID, PRIMO_TOOL_NAME } = await import('../src/tools/primoMcpServer.js'));
    ({ processAgentStream } = await import('../src/services/agentRunner.js'));
});
beforeEach(() => {
    querySpy.mockReset();
    createSdkMcpServerSpy.mockClear();
    logInteractionSpy.mockReset();
    logInteractionSpy.mockResolvedValue(undefined);
});
function createAsyncIterable(messages) {
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
                    content: [
                        { type: 'text', text: 'Partial ' },
                        { type: 'text', text: 'answer with citation.' }
                    ]
                }
            },
            { type: 'result', is_error: false }
        ]);
        querySpy.mockReturnValueOnce(stream);
        const result = await processAgentStream({
            prompt: ' Opening hours? ',
            metadata: { source: 'web' }
        });
        expect(result).toEqual({ response: 'Partial answer with citation.', streamed: true });
        expect(querySpy).toHaveBeenCalledTimes(1);
        const queryArgs = querySpy.mock.calls[0][0];
        expect(queryArgs.prompt).toBe('Opening hours?');
        expect(queryArgs.options).toMatchObject({
            systemPrompt: 'system prompt',
            permissionMode: 'bypassPermissions'
        });
        expect(queryArgs.options.allowedTools).toEqual(['WebSearch', 'WebFetch', PRIMO_TOOL_NAME]);
        const mcpServers = queryArgs.options.mcpServers;
        expect(mcpServers).toBeTruthy();
        const primoServer = mcpServers?.[PRIMO_MCP_SERVER_ID];
        expect(primoServer).toMatchObject({ type: 'sdk', name: PRIMO_MCP_SERVER_ID });
        expect(primoServer?.instance).toBeDefined();
        expect(logInteractionSpy).toHaveBeenCalledTimes(1);
        const entry = logInteractionSpy.mock.calls[0][0];
        expect(entry.userPrompt).toBe('Opening hours?');
        expect(entry.assistantResponse).toBe('Partial answer with citation.');
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
        await expect(processAgentStream({ prompt: 'Broken request' })).rejects.toThrow('Agent execution failed.');
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
});
//# sourceMappingURL=agentRunner.test.js.map