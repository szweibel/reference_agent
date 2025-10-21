import type { HookCallback } from '@anthropic-ai/claude-agent-sdk';
import { searchGuides } from '../libguides/client.js';
import type { GuideSearchResult } from '../libguides/types.js';

/**
 * Cache for the complete guide catalog.
 * Refreshed every hour to balance freshness with API load.
 */
let guideCatalogCache: {
  catalog: string;
  expires: number;
} | null = null;

const CACHE_TTL_MS = 3600000; // 1 hour

/**
 * Formats the complete guide catalog as a concise reference list.
 * Excludes URLs (agent will get those from SearchGuides when needed).
 */
function formatGuideCatalog(result: GuideSearchResult): string {
  if (!result.guides || result.guides.length === 0) {
    return 'No LibGuides available.';
  }

  const lines = result.guides.map(guide => {
    const name = guide.name || 'Untitled Guide';
    // Truncate description to first 150 characters
    const description = guide.description
      ? guide.description.length > 150
        ? `${guide.description.substring(0, 150)}...`
        : guide.description
      : '';

    return description
      ? `- ${name}: ${description}`
      : `- ${name}`;
  });

  return `Available LibGuides at Mina Rees Library:\n\n${lines.join('\n')}`;
}

/**
 * Gets the complete guide catalog, using cache when available.
 * Cache expires after 1 hour to keep guide list reasonably fresh.
 */
async function getCachedGuideCatalog(): Promise<string> {
  const now = Date.now();

  // Return cached catalog if still valid
  if (guideCatalogCache && guideCatalogCache.expires > now) {
    return guideCatalogCache.catalog;
  }

  // Fetch all guides (empty search = all results)
  const result = await searchGuides({
    search: '',
    limit: 200,
    expand: '' // Don't need page details for catalog
  });

  const catalog = formatGuideCatalog(result);

  // Cache for 1 hour
  guideCatalogCache = {
    catalog,
    expires: now + CACHE_TTL_MS
  };

  return catalog;
}

/**
 * UserPromptSubmit hook that injects the complete LibGuides catalog
 * before the main agent runs. This helps the agent understand what
 * resources exist before deciding whether and how to search.
 */
export const userPromptSubmitHook: HookCallback = async (input, _toolUseID, options) => {
  // Type guard to ensure we have the right hook input
  if (input.hook_event_name !== 'UserPromptSubmit') {
    return {
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit'
      }
    };
  }

  try {
    // Get the complete guide catalog (cached for 1 hour)
    const catalog = await getCachedGuideCatalog();

    // Inject catalog as additional context
    return {
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: `\n\n=== LibGuides Catalog ===\n${catalog}\n=== End Catalog ===\n\n[LIBRARY CONTEXT: You are answering as Mina Rees Library's reference desk. You MUST search our LibGuides for ANY subject question, even if it seems routine. Our students need OUR recommended resources, not general information.]\n\nUse SearchGuides to retrieve specific guide content based on the catalog above.\n`
      }
    };
  } catch (error) {
    // If catalog fetch fails, don't block the agent - just log and continue
    console.error('[PreRetrieval] Failed to fetch guide catalog:', error instanceof Error ? error.message : String(error));

    return {
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit'
      }
    };
  }
};
