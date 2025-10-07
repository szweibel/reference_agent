import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKAssistantMessage, SDKMessage } from '@anthropic-ai/claude-agent-sdk';

import { buildSystemPrompt } from '../lib/prompt.js';
import { logInteraction, type InteractionLogEntry } from '../lib/logger.js';
import { getPrimoMcpServer, PRIMO_MCP_SERVER_ID, PRIMO_TOOL_NAME } from '../tools/primoMcpServer.js';
import { getLogNoteMcpServer, LOG_NOTE_MCP_SERVER_ID, LOG_NOTE_TOOL_NAME } from '../tools/logNoteMcpServer.js';

export const ALLOWED_TOOLS = ['WebSearch', 'WebFetch', PRIMO_TOOL_NAME, LOG_NOTE_TOOL_NAME] as const;

export type ConversationTurn = {
  role: 'user' | 'assistant';
  content: string;
};

export type RunAgentOptions = {
  prompt: string;
  onTextChunk?: (chunk: string) => void;
  metadata?: Record<string, unknown>;
  history?: ConversationTurn[];
};

export type RunAgentResult = {
  response: string;
  streamed: boolean;
};

export type ProcessAgentStreamOptions = {
  prompt: string;
  metadata?: Record<string, unknown>;
  onMessage?: (message: SDKMessage) => void | Promise<void>;
  abortController?: AbortController;
  history?: ConversationTurn[];
};

export type ProcessAgentStreamResult = RunAgentResult;

const MAX_HISTORY_TURNS = 20;

function sanitiseHistory(history: ConversationTurn[] | undefined): ConversationTurn[] {
  if (!Array.isArray(history) || history.length === 0) {
    return [];
  }

  const turns: ConversationTurn[] = [];
  for (const entry of history) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const role = entry.role;
    const content = typeof entry.content === 'string' ? entry.content.trim() : '';
    if ((role === 'user' || role === 'assistant') && content) {
      turns.push({ role, content });
    }
  }

  if (turns.length <= MAX_HISTORY_TURNS) {
    return turns;
  }

  return turns.slice(turns.length - MAX_HISTORY_TURNS);
}

function buildPromptWithHistory(history: ConversationTurn[] | undefined, nextPrompt: string): string {
  const trimmedPrompt = nextPrompt.trim();
  const validHistory = sanitiseHistory(history);
  if (validHistory.length === 0) {
    return trimmedPrompt;
  }

  const transcript = validHistory
    .map((turn) => {
      const speaker = turn.role === 'assistant' ? 'Agent' : 'Patron';
      return `${speaker}: ${turn.content}`;
    })
    .join('\n\n');

  return `${transcript}\n\nPatron: ${trimmedPrompt}`;
}

function extractTextFromAssistantMessage(message: SDKAssistantMessage): string {
  const blocks = message?.message?.content;
  if (!Array.isArray(blocks)) {
    return '';
  }

  return blocks
    .filter((block: any) => block?.type === 'text')
    .map((block: any) => block.text as string)
    .join('');
}

function createAgentQuery(prompt: string, history: ConversationTurn[] | undefined, abortController?: AbortController) {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    throw new Error('Prompt is required');
  }

  const systemPrompt = buildSystemPrompt();
  const effectivePrompt = buildPromptWithHistory(history, trimmedPrompt);
  const primoServer = getPrimoMcpServer();
  const logNoteServer = getLogNoteMcpServer();
  const responseStream = query({
    prompt: effectivePrompt,
    options: {
      systemPrompt,
      permissionMode: 'bypassPermissions',
      allowedTools: ALLOWED_TOOLS as unknown as string[],
      mcpServers: {
        [PRIMO_MCP_SERVER_ID]: primoServer,
        [LOG_NOTE_MCP_SERVER_ID]: logNoteServer
      },
      ...(abortController ? { abortController } : {})
    }
  });

  return { trimmedPrompt, responseStream: responseStream as AsyncIterable<SDKMessage> };
}

export async function processAgentStream({
  prompt,
  history,
  metadata,
  onMessage,
  abortController
}: ProcessAgentStreamOptions): Promise<ProcessAgentStreamResult> {
  const normalisedHistory = sanitiseHistory(history);
  const { trimmedPrompt, responseStream } = createAgentQuery(prompt, normalisedHistory, abortController);

  let assembledResponse = '';
  let hasStreamedContent = false;
  let agentExecutionFailed = false;
  let capturedError: unknown = null;

  try {
    for await (const message of responseStream) {
      if (onMessage) {
        await onMessage(message);
      }

      if (message.type === 'stream_event') {
        const event = message.event;
        if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          const chunk = event.delta.text ?? '';
          if (chunk) {
            hasStreamedContent = true;
          }
        }
        continue;
      }

      if (message.type === 'assistant') {
        const text = extractTextFromAssistantMessage(message);
        if (text) {
          assembledResponse = text;
        }
        continue;
      }

      if (message.type === 'result' && message.is_error) {
        agentExecutionFailed = true;
      }
    }

    if (agentExecutionFailed) {
      throw new Error('Agent execution failed.');
    }
  } catch (error) {
    capturedError = error;
    throw error;
  } finally {
    const logEntry: InteractionLogEntry = {
      timestamp: new Date().toISOString(),
      userPrompt: trimmedPrompt,
      assistantResponse: assembledResponse,
      success: !capturedError
    };

    if (metadata && Object.keys(metadata).length > 0) {
      logEntry.metadata = metadata;
    }

    if (normalisedHistory.length > 0) {
      logEntry.history = normalisedHistory;
    }

    if (capturedError) {
      logEntry.error = capturedError instanceof Error ? capturedError.message : String(capturedError);
      logEntry.success = false;
    } else if (agentExecutionFailed) {
      logEntry.error = 'Agent execution failed.';
      logEntry.success = false;
    }

    await logInteraction(logEntry).catch((error) => {
      console.error('Failed to write interaction log:', error);
    });
  }

  return { response: assembledResponse, streamed: hasStreamedContent };
}

export async function runAgent({ prompt, onTextChunk, metadata, history }: RunAgentOptions): Promise<RunAgentResult> {
  let emittedText = false;
  const normalisedHistory = sanitiseHistory(history);

  const streamOptions: ProcessAgentStreamOptions = {
    prompt,
    history: normalisedHistory,
    onMessage: async (message) => {
      if (!onTextChunk) {
        return;
      }

      if (message.type === 'stream_event') {
        const event = message.event;
        if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          const chunk = event.delta.text ?? '';
          if (chunk) {
            emittedText = true;
            onTextChunk(chunk);
          }
        }
        return;
      }

      if (message.type === 'assistant') {
        const text = extractTextFromAssistantMessage(message);
        if (text) {
          if (!emittedText) {
            emittedText = true;
            onTextChunk(text);
          }
        }
      }
    }
  };

  if (metadata && Object.keys(metadata).length > 0) {
    streamOptions.metadata = metadata;
  }

  const result = await processAgentStream(streamOptions);

  return {
    response: result.response,
    streamed: emittedText || result.streamed
  };
}

export { extractTextFromAssistantMessage };
