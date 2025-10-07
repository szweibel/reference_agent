import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOG_PATH = new URL('../../logs/interactions.log', import.meta.url);

export type InteractionLogEntry = {
  timestamp: string;
  userPrompt: string;
  assistantResponse: string;
  metadata?: Record<string, unknown>;
  history?: Array<{ role: string; content: string }>;
  success?: boolean;
  error?: string;
};

async function ensureDirectoryExists(pathUrl: URL) {
  const dir = dirname(fileURLToPath(pathUrl));
  await fs.mkdir(dir, { recursive: true });
}

export async function logInteraction(entry: InteractionLogEntry): Promise<void> {
  await ensureDirectoryExists(LOG_PATH);
  const line = JSON.stringify(entry);
  await fs.appendFile(LOG_PATH, `${line}\n`, { encoding: 'utf8' });
}
