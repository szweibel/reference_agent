import express from 'express';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rateLimit } from 'express-rate-limit';

import { processAgentStream, type ConversationTurn, substituteCitationTokens } from './services/agentRunner.js';
import { sanitizeHistory } from './lib/conversationHistory.js';
import { searchPrimo } from './primo/client.js';

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);
const staticDir = join(currentDir, '..', 'public');

const normalizeBasePath = (input: string | undefined): string => {
  if (!input) {
    return '/';
  }
  let value = input.trim();
  if (value === '') {
    return '/';
  }
  if (!value.startsWith('/')) {
    value = `/${value}`;
  }
  if (value.length > 1 && value.endsWith('/')) {
    value = value.slice(0, -1);
  }
  return value;
};

const BASE_PATH = normalizeBasePath(process.env.BASE_PATH);
const API_PREFIX = BASE_PATH === '/' ? '/api' : `${BASE_PATH}/api`;
const API_PREFIXES = BASE_PATH === '/' ? [API_PREFIX] : ['/api', API_PREFIX];
const MAX_HISTORY_TURNS_SERVER = 20; // Server limit is more conservative than agent limit
const MAX_PROMPT_LENGTH = 10000;

// Simple structured logger
function logError(message: string, error: unknown, context?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  console.error(JSON.stringify({
    timestamp,
    level: 'error',
    message,
    error: errorMessage,
    stack: errorStack,
    ...context
  }));
}

function logInfo(message: string, context?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console.log(JSON.stringify({
    timestamp,
    level: 'info',
    message,
    ...context
  }));
}

// Rate limiting configuration
const queryRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // limit each IP to 30 requests per windowMs
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const primoRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // limit each IP to 60 requests per minute
  message: { error: 'Too many Primo search requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export function createApp(): express.Express {
  const app = express();

  app.use(express.json({ limit: '1mb' }));

  const staticOptions = {
    index: false,
    setHeaders: (res: express.Response, filePath: string) => {
      if (filePath.endsWith('.css')) {
        res.type('text/css');
      }
    }
  } as const;

  const rootStaticMiddleware = express.static(staticDir, staticOptions);

  const indexFile = join(staticDir, 'index.html');
  const indexTemplate = readFileSync(indexFile, 'utf8');
  const clientBasePath = BASE_PATH === '/' ? '' : BASE_PATH;
  const serializedBasePath = JSON.stringify(clientBasePath);
  const tailwindHref = clientBasePath ? `${clientBasePath}/tailwind.css` : '/tailwind.css';
  const indexHtml = indexTemplate
    .replace(/'__BASE_PATH__'/g, serializedBasePath)
    .replace(/__TAILWIND_PATH__/g, tailwindHref);

  const sendIndex = (_req: express.Request, res: express.Response) => {
    res.type('text/html');
    res.send(indexHtml);
  };

  app.get(/.*\/tailwind\.css$/, (_req, res) => {
    res.type('text/css');
    res.sendFile(join(staticDir, 'tailwind.css'));
  });

  const indexRoutes = new Set<string>();

  const addIndexRoute = (path: string) => {
    if (indexRoutes.has(path)) {
      return;
    }
    indexRoutes.add(path);
    app.get(path, sendIndex);
  };

  addIndexRoute('/');
  addIndexRoute('/index.html');

  if (BASE_PATH !== '/') {
    addIndexRoute(BASE_PATH);
    addIndexRoute(`${BASE_PATH}/`);
    addIndexRoute(`${BASE_PATH}/index.html`);
    app.use(BASE_PATH, express.static(staticDir, staticOptions));
  }

  app.use(rootStaticMiddleware);

  const registerPostRoute = (suffix: string, ...handlers: express.RequestHandler[]) => {
    for (const prefix of API_PREFIXES) {
      app.post(`${prefix}${suffix}`, ...handlers);
    }
  };

  registerPostRoute('/primo/search', primoRateLimiter, async (req, res) => {
    const { query, limit } = req.body ?? {};
    const queryText = typeof query === 'string' ? query.trim() : '';

    if (!queryText) {
      res.status(400).json({ error: 'Query is required' });
      return;
    }

    const resolvedLimit =
      typeof limit === 'number' && Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 10)) : 5;

    try {
      const result = await searchPrimo({ query: queryText, limit: resolvedLimit });
      const payload = {
        info: result.info,
        items: result.items.map((item) => ({
          title: item.title,
          authors: item.authors,
          publicationYear: item.publicationYear,
          description: item.description,
          recordId: item.recordId,
          permalink: item.permalink,
          subjects: item.subjects,
          identifiers: item.identifiers,
          publisher: item.publisher,
          language: item.language,
          format: item.format,
          availability: {
            displayedAvailability: item.availability.displayedAvailability,
            isElectronic: item.availability.isElectronic,
            local: item.availability.local,
            consortium: item.availability.consortium
          }
        }))
      };

      res.json(payload);
    } catch (error) {
      logError('Primo search failed', error, { query: queryText, limit: resolvedLimit });

      const statusCode = error instanceof Error && error.message.includes('not configured') ? 503 : 502;
      res.status(statusCode).json({
        error: 'Primo search failed',
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  });

  registerPostRoute('/query', queryRateLimiter, async (req, res) => {
    const { prompt, libraryId, history: rawHistory } = req.body ?? {};
    const promptText = typeof prompt === 'string' ? prompt.trim() : '';
    const history = sanitizeHistory(rawHistory as ConversationTurn[] | undefined, MAX_HISTORY_TURNS_SERVER);

    if (!promptText) {
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }

    if (promptText.length > MAX_PROMPT_LENGTH) {
      res.status(400).json({
        error: `Prompt too long (max ${MAX_PROMPT_LENGTH} characters)`,
        length: promptText.length
      });
      return;
    }

    const resolvedLibraryId =
      typeof libraryId === 'string' && libraryId.trim() ? libraryId.trim() : 'mina-rees';

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    const sendEvent = (event: string, data: unknown) => {
      if (res.writableEnded) {
        return;
      }
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const seenToolStarts = new Set<string>();
    const shouldEmitToolStart = (id: unknown): boolean => {
      if (typeof id !== 'string' || id.length === 0) {
        return true;
      }
      if (seenToolStarts.has(id)) {
        return false;
      }
      seenToolStarts.add(id);
      return true;
    };

    logInfo('Received streaming request', {
      promptLength: promptText.length,
      libraryId: resolvedLibraryId,
      hasHistory: history.length > 0
    });
    sendEvent('start', { libraryId: resolvedLibraryId });

    let clientClosed = false;
    let streamFinished = false;
    const abortController = new AbortController();

    const handleDisconnect = () => {
      if (streamFinished || clientClosed) {
        return;
      }
      clientClosed = true;
      abortController.abort();
    };

    req.on('aborted', handleDisconnect);
    res.on('close', handleDisconnect);

    try {
      const { response } = await processAgentStream({
        prompt: promptText,
        history,
        metadata: { source: 'web', libraryId: resolvedLibraryId },
        abortController,
        onMessage: async (message) => {
          if (clientClosed) {
            return;
          }

          if (message.type === 'stream_event') {
            const event = message.event;
            if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
              const rawText = event.delta.text ?? '';
              if (rawText) {
                const text = substituteCitationTokens(rawText);
                sendEvent('assistant-text', { text, mode: 'delta' });
              }
            } else if (event?.type === 'content_block_start' && event.block?.type === 'tool_use') {
              const block = event.block;
              if (shouldEmitToolStart(block.id)) {
                sendEvent('tool-use', {
                  id: block.id ?? null,
                  name: block.name,
                  input: block.input ?? null,
                  stage: 'start'
                });
              }
            } else if (event?.type === 'content_block_stop' && event.block?.type === 'tool_use') {
              const block = event.block;
              sendEvent('tool-use', {
                id: block.id ?? null,
                stage: 'end'
              });
            } else if (event) {
              sendEvent('stream-event', event);
            }
            return;
          }

          if (message.type === 'assistant') {
            const blocks = message.message?.content ?? [];
            for (const block of blocks) {
              if (block?.type === 'text') {
                const rawText = block.text ?? '';
                if (rawText) {
                  const text = substituteCitationTokens(rawText);
                  sendEvent('assistant-text', { text, mode: 'block' });
                }
                continue;
              }

              if (block?.type === 'tool_use') {
                if (shouldEmitToolStart(block.id)) {
                  sendEvent('tool-use', {
                    id: block.id ?? null,
                    name: block.name,
                    input: block.input ?? null,
                    stage: 'start'
                  });
                }
              }
            }
            return;
          }

          if (message.type === 'user') {
            const blocks = message.message?.content ?? [];
            for (const block of blocks) {
              if (block?.type === 'tool_result') {
                sendEvent('tool-result', {
                  id: block.tool_use_id ?? null,
                  output: block.content ?? null
                });
              }
            }
            return;
          }

          if (message.type === 'result') {
            const resultPayload: Record<string, unknown> = {
              isError: message.is_error,
              totalCostUsd: message.total_cost_usd,
              usage: message.usage
            };

            if (message.subtype === 'success') {
              resultPayload.result = message.result;
            }

            sendEvent('result', resultPayload);
            return;
          }

          sendEvent(message.type, message);
        }
      });

      if (!clientClosed) {
        streamFinished = true;
        sendEvent('done', { response, libraryId: resolvedLibraryId });
        res.end();
      }
    } catch (error) {
      logError('Agent request failed', error, {
        promptLength: promptText.length,
        libraryId: resolvedLibraryId,
        clientClosed,
        streamFinished
      });

      if (!res.writableEnded && !clientClosed) {
        streamFinished = true;
        const errorMessage = error instanceof Error ? error.message : 'Agent request failed';
        sendEvent('error', { error: errorMessage });
        res.end();
      }
    }
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/favicon.ico', (_req, res) => {
    res.status(204).end();
  });

  app.use((req, res, next) => {
    if (req.method !== 'GET') {
      next();
      return;
    }

    if (API_PREFIXES.some((prefix) => req.path.startsWith(prefix))) {
      next();
      return;
    }

    const inBasePath =
      BASE_PATH === '/'
        ? true
        : req.path === BASE_PATH || req.path.startsWith(`${BASE_PATH}/`);

    if (!inBasePath) {
      next();
      return;
    }

    sendIndex(req, res);
  });

  return app;
}

const PORT = Number(process.env.PORT) || 3110;
const app = createApp();

if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(PORT, () => {
    const basePathSuffix = BASE_PATH === '/' ? '/' : `${BASE_PATH}/`;
    logInfo('Server started', {
      port: PORT,
      basePath: BASE_PATH,
      url: `http://localhost:${PORT}${basePathSuffix}`
    });
  });

  // Graceful shutdown handling
  const gracefulShutdown = (signal: string) => {
    logInfo('Shutdown signal received', { signal });
    server.close(() => {
      logInfo('Server closed gracefully');
      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      logError('Forced shutdown after timeout', new Error('Shutdown timeout'));
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

export default app;
