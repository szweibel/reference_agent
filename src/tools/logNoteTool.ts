import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);

export const LOG_NOTE_TOOL_NAME = 'LogNote';

const inputSchema = z
  .object({
    query: z.string().min(1, 'Provide the user query that prompted this note.'),
    finding: z.string().min(1, 'Describe what was discovered or learned.'),
    source: z.string().min(1, 'The URL or tool used to find this information.'),
    confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']).describe('Confidence level based on verification.')
  })
  .shape;

export const logNoteTool = tool(
  LOG_NOTE_TOOL_NAME,
  'Log institutional knowledge about hard-to-find information. Use this when you discover something non-obvious or when a query required unusual effort to answer. Only log exceptions and gotchas, not routine information.',
  inputSchema,
  async ({ query, finding, source, confidence }) => {
    try {
      const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const noteEntry = `
[${timestamp}] [Confidence: ${confidence}]
Query: "${query}"
Finding: ${finding}
Source: ${source}

`;

      const pendingNotesPath = join(currentDir, '..', '..', 'docs', 'pending-notes.md');
      appendFileSync(pendingNotesPath, noteEntry, 'utf8');

      return {
        content: [
          {
            type: 'text',
            text: 'Note logged successfully to pending-notes.md for review.'
          }
        ]
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Failed to log note: ${message}`
          }
        ]
      };
    }
  }
);
