export type ConversationTurn = {
  role: 'user' | 'assistant';
  content: string;
};

const MAX_HISTORY_TURNS = 50;

/**
 * Sanitizes and validates conversation history, filtering invalid entries
 * and limiting to the most recent turns.
 *
 * @param history - Raw conversation history
 * @param maxTurns - Maximum number of turns to keep (default: 50)
 * @returns Sanitized conversation history
 */
export function sanitizeHistory(
  history: ConversationTurn[] | undefined,
  maxTurns: number = MAX_HISTORY_TURNS
): ConversationTurn[] {
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

  if (turns.length <= maxTurns) {
    return turns;
  }

  return turns.slice(turns.length - maxTurns);
}
