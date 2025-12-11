import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKAssistantMessage, SDKMessage } from '@anthropic-ai/claude-agent-sdk';

import { buildSystemPrompt } from '../lib/prompt.js';
import { logInteraction, type InteractionLogEntry } from '../lib/logger.js';
import { getPrimoMcpServer, PRIMO_MCP_SERVER_ID, PRIMO_TOOL_NAME } from '../tools/primoMcpServer.js';
import { getLogNoteMcpServer, LOG_NOTE_MCP_SERVER_ID, LOG_NOTE_TOOL_NAME } from '../tools/logNoteMcpServer.js';
import { getBlogMcpServer, BLOG_MCP_SERVER_ID, BLOG_TOOL_NAME } from '../tools/blogMcpServer.js';
import { getDatabaseMcpServer, DATABASE_MCP_SERVER_ID, DATABASE_TOOL_NAME } from '../tools/databaseMcpServer.js';
import { getGuidesMcpServer, GUIDES_MCP_SERVER_ID, GUIDES_TOOL_NAME } from '../tools/guidesMcpServer.js';
import { getActiveSearchCache, runWithSearchCache, SearchCache } from '../lib/searchCache.js';
import { userPromptSubmitHook } from './preRetrieval.js';

export const ALLOWED_TOOLS = ['WebSearch', 'WebFetch', PRIMO_TOOL_NAME, LOG_NOTE_TOOL_NAME, BLOG_TOOL_NAME, DATABASE_TOOL_NAME, GUIDES_TOOL_NAME] as const;

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

const MAX_HISTORY_TURNS = 50;

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

function substituteCitationTokens(text: string, cache: SearchCache = getActiveSearchCache()): string {
  // Replace {{CITE_N}} tokens with actual catalog links from cache
  return text.replace(/\{\{CITE_(\d+)\}\}/g, (match, indexStr) => {
    const index = parseInt(indexStr, 10);
    if (isNaN(index)) {
      return match; // Keep original if not a valid number
    }
    const link = cache.getCitationLink(index);
    return link ?? match; // Keep original if not found in cache
  });
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
  const blogServer = getBlogMcpServer();
  const databaseServer = getDatabaseMcpServer();
  const guidesServer = getGuidesMcpServer();
  const responseStream = query({
    prompt: effectivePrompt,
    options: {
      model: 'opus',
      systemPrompt,
      permissionMode: 'bypassPermissions',
      allowedTools: ALLOWED_TOOLS as unknown as string[],
      mcpServers: {
        [PRIMO_MCP_SERVER_ID]: primoServer,
        [LOG_NOTE_MCP_SERVER_ID]: logNoteServer,
        [BLOG_MCP_SERVER_ID]: blogServer,
        [DATABASE_MCP_SERVER_ID]: databaseServer,
        [GUIDES_MCP_SERVER_ID]: guidesServer
      },
      hooks: {
        UserPromptSubmit: [{
          hooks: [userPromptSubmitHook]
        }]
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
  const cache = new SearchCache();
  let trimmedPrompt = '';

  return runWithSearchCache(async () => {
    const created = createAgentQuery(prompt, normalisedHistory, abortController);
    trimmedPrompt = created.trimmedPrompt;
    const responseStream = created.responseStream;

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
          const blocks = message.message?.content ?? [];
          for (const block of blocks) {
            if (block?.type === 'text') {
              const text = block.text ?? '';
              if (text) {
                assembledResponse = text;
              }
            }
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
      // Substitute citation tokens before logging so logs reflect what user actually sees
      const finalResponse = substituteCitationTokens(assembledResponse, cache);

      // Log the interaction with substituted response
      const logEntry: InteractionLogEntry = {
        timestamp: new Date().toISOString(),
        userPrompt: trimmedPrompt,
        assistantResponse: finalResponse,
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

    // Substitute citation tokens for the return value
    const finalResponse = substituteCitationTokens(assembledResponse, cache);

    return { response: finalResponse, streamed: hasStreamedContent };
  }, cache);
}

// Export for testing
export { substituteCitationTokens };

type StreamEmitter = {
  push: (chunk: string) => void;
  flush: () => void;
};

function createCitationAwareEmitter(emit: (chunk: string) => void): StreamEmitter {
  const TOKEN_PREFIX = '{{CITE_';
  let buffer = '';

  const emitSubstituted = (text: string) => {
    if (!text) {
      return;
    }
    const substituted = substituteCitationTokens(text);
    if (substituted) {
      emit(substituted);
    }
  };

  const splitBuffer = (text: string): { ready: string; remainder: string } => {
    const lastOpen = text.lastIndexOf('{{');
    if (lastOpen === -1) {
      return { ready: text, remainder: '' };
    }

    const closing = text.indexOf('}}', lastOpen);
    if (closing !== -1) {
      return { ready: text, remainder: '' };
    }

    const tail = text.slice(lastOpen);
    const looksLikeTokenPrefix =
      TOKEN_PREFIX.startsWith(tail) ||
      (tail.startsWith(TOKEN_PREFIX) && /^\d*$/.test(tail.slice(TOKEN_PREFIX.length)));

    if (looksLikeTokenPrefix) {
      return { ready: text.slice(0, lastOpen), remainder: tail };
    }

    return { ready: text, remainder: '' };
  };

  return {
    push(chunk: string) {
      if (!chunk) {
        return;
      }
      buffer += chunk;
      const { ready, remainder } = splitBuffer(buffer);
      buffer = remainder;
      if (ready) {
        emitSubstituted(ready);
      }
    },
    flush() {
      if (!buffer) {
        return;
      }
      emitSubstituted(buffer);
      buffer = '';
    }
  };
}

export async function runAgent({ prompt, onTextChunk, metadata, history }: RunAgentOptions): Promise<RunAgentResult> {
  let emittedText = false;
  const normalisedHistory = sanitiseHistory(history);

  const streamEmitter = onTextChunk
    ? createCitationAwareEmitter((text) => {
        if (!text) {
          return;
        }
        emittedText = true;
        onTextChunk(text);
      })
    : null;

  const streamOptions: ProcessAgentStreamOptions = {
    prompt,
    history: normalisedHistory,
    onMessage: async (message) => {
      if (!streamEmitter) {
        return;
      }

      if (message.type === 'stream_event') {
        const event = message.event;
        if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          const chunk = event.delta.text ?? '';
          if (chunk) {
            streamEmitter.push(chunk);
          }
        }
        return;
      }

      if (message.type === 'assistant') {
        const text = extractTextFromAssistantMessage(message);
        if (text) {
          streamEmitter.push(text);
        }
        return;
      }

      if (message.type === 'result') {
        streamEmitter.flush();
      }
    }
  };

  if (metadata && Object.keys(metadata).length > 0) {
    streamOptions.metadata = metadata;
  }

  try {
    const result = await processAgentStream(streamOptions);
    streamEmitter?.flush();
    return {
      response: result.response,
      streamed: emittedText || result.streamed
    };
  } catch (error) {
    streamEmitter?.flush();
    throw error;
  }
}

export { extractTextFromAssistantMessage };
