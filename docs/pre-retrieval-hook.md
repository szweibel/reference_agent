# Pre-Retrieval Hook Implementation

## Overview

The pre-retrieval hook ensures that **every query automatically searches LibGuides** before the main agent processes the user's question. This grounds agent responses in actual library resources and prevents hallucination on meta-questions and library-related topics.

## Architecture

The implementation uses the SDK's `UserPromptSubmit` hook to inject LibGuides search results as additional context before Claude begins reasoning.

### Flow

```
User Query
    ↓
UserPromptSubmit Hook Fires
    ↓
Extract Search Terms (lightweight heuristics)
    ↓
Search LibGuides API (limit: 5 results)
    ↓
Format Results as Context String
    ↓
Inject as additionalContext
    ↓
Main Agent Receives:
  - User's original prompt
  - LibGuides context (automatically prepended)
    ↓
Agent processes with grounding in actual library resources
```

## Implementation Files

### `src/services/preRetrieval.ts`

Main hook implementation with three key functions:

1. **`extractSearchTerms(prompt: string)`**
   - Uses simple heuristics to extract key terms from user prompt
   - Filters out common question words
   - Returns first 5 meaningful keywords
   - Fallback: uses entire prompt if short or no keywords found

2. **`formatGuideResults(result: GuideSearchResult)`**
   - Formats LibGuides search results into readable context
   - Includes guide names, URLs, descriptions, and page listings
   - Returns "No relevant LibGuides found" if empty

3. **`userPromptSubmitHook: HookCallback`**
   - Main hook handler registered with the SDK
   - Calls `searchGuides({ search, limit: 5, expand: 'pages' })`
   - Injects results via `hookSpecificOutput.additionalContext`
   - Gracefully handles errors (logs and continues without blocking)

### `src/services/agentRunner.ts`

Integration point where hook is registered:

```typescript
import { userPromptSubmitHook } from './preRetrieval.js';

// In createAgentQuery():
const responseStream = query({
  prompt: effectivePrompt,
  options: {
    systemPrompt,
    hooks: {
      UserPromptSubmit: [{
        hooks: [userPromptSubmitHook]
      }]
    },
    // ... other options
  }
});
```

## Benefits

### Before (Without Hook)

- Agent could answer meta-questions ("What are you bad at?") from training data
- No guarantee that LibGuides was consulted
- Potential for hallucination about library services

### After (With Hook)

- **Every query** triggers LibGuides search automatically
- Agent receives grounding context before reasoning
- Meta-questions answered by referencing actual guides
- Reduced hallucination on library-related topics

## Example

**Query:** "What kind of questions are you bad at answering?"

**Hook Behavior:**
1. Extracts terms: `"kind questions bad answering"`
2. Searches LibGuides with those terms
3. Finds relevant guides (e.g., "Ask a Librarian", "Library Directory")
4. Injects context:
   ```
   --- LibGuides Pre-Retrieval Context ---
   Found 3 relevant LibGuides:

   1. Ask a Librarian
      URL: https://libguides.gc.cuny.edu/ask-a-librarian
      Description: Live chat, email, and consultation requests
      Pages: Home, Contact Us, FAQ

   2. Library Directory
      URL: https://libguides.gc.cuny.edu/directory
      ...
   --- End Pre-Retrieval Context ---
   ```

**Agent Response:** Now grounded in actual resources, the agent can reference specific guides about research consultations, subject liaisons, and escalation paths rather than inventing capabilities.

## Testing

### Unit Tests
Run: `npm test -- tests/preRetrieval.test.ts`

Tests:
- ✓ Search and context injection
- ✓ Empty results handling
- ✓ Error resilience (network failures don't break agent)
- ✓ Type safety (wrong hook events ignored)

### Manual Integration Test
Run: `tsx tests/test-preretrieval-hook.ts`

Verifies end-to-end hook execution with the agent runner.

## Design Decisions

### Why Not Router Agent?

- **Router agent approach:** Separate agent decides whether tools are needed, then passes to main agent
  - More complex: Two agent calls per query
  - Higher latency and cost
  - Still requires deciding "when" to retrieve

- **Hook approach (chosen):** Always retrieve LibGuides first
  - Simpler: Single hook function
  - Lower overhead: Direct API call, no LLM reasoning
  - Proactive: No decision needed, always grounds in library resources
  - Modular: Easy to extend with more pre-retrieval sources

### Why Heuristic Search Term Extraction?

Alternative: Use LLM to generate search terms

- **Heuristic approach (chosen):**
  - Fast: No API call overhead
  - Predictable: Same terms every time
  - Good enough: Simple keyword extraction works for most queries
  - Cheap: No additional LLM cost

- **LLM approach:**
  - Slower: Adds latency
  - More expensive: Extra API call per query
  - Potentially better: Could generate more relevant search terms
  - **Recommendation:** Implement if heuristics prove insufficient in practice

### Error Handling

The hook is **fail-safe**: If LibGuides search fails (network error, API issues), the hook:
1. Logs the error to console
2. Returns without `additionalContext`
3. Agent continues normally with original prompt

This ensures uptime - a broken LibGuides API never blocks the agent.

## Future Enhancements

1. **Multi-source pre-retrieval**
   - Add Blog search to pre-retrieval
   - Add Database A-Z search for database questions
   - Configure per-query-type

2. **Smarter search term extraction**
   - Use lightweight LLM call (e.g., Claude Haiku)
   - Extract entities and intent
   - Generate multiple search variants

3. **Caching**
   - Cache LibGuides search results (5-minute TTL)
   - Reduce API load for repeated queries

4. **Metrics**
   - Track hook execution time
   - Measure context injection effectiveness
   - Monitor search result quality

## Related Files

- `src/services/agentRunner.ts` - Main agent runner with hook registration
- `src/libguides/client.ts` - LibGuides API client
- `docs/agentSDK.md` - SDK hook documentation
- `tests/preRetrieval.test.ts` - Unit tests
