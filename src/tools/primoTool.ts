import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

import { searchPrimo } from '../primo/client.js';
import type { PrimoItemSummary, PrimoSearchResult, PrimoSearchInput } from '../primo/types.js';
import { getActiveSearchCache } from '../lib/searchCache.js';

export const PRIMO_TOOL_NAME = 'SearchPrimo';

const inputSchema = z
  .object({
    value: z.string().min(1, 'Search value is required'),
    field: z.enum(['any', 'title', 'creator', 'sub', 'isbn', 'issn']).optional(),
    operator: z.enum(['contains', 'exact']).optional(),
    limit: z.number().int().min(1).max(10).optional(),
    offset: z.number().int().min(0).optional(),
    journalsOnly: z.boolean().optional()
  })
  .shape;

function buildQuery(value: string, field: string, operator: string): string {
  const escaped = value.replace(/"/g, '\\"');
  return `${field},${operator},"${escaped}"`;
}

function formatAuthors(authors: string[]): string[] {
  return authors.slice(0, 6);
}

function formatSubjects(subjects: string[]): string[] {
  return subjects.slice(0, 6);
}

function formatIdentifiers(identifiers: string[]): string[] {
  return identifiers.slice(0, 6);
}

function formatConsortiumAvailability(
  entries: PrimoItemSummary['availability']['consortium']
): Array<{ institutionCode: string; institutionName: string; status: string | null }> {
  return entries.slice(0, 5).map((entry) => ({
    institutionCode: entry.institutionCode,
    institutionName: entry.institutionName,
    status: entry.status
  }));
}

function formatLocalAvailability(item: PrimoItemSummary['availability']['local']) {
  if (!item) {
    return null;
  }

  return {
    isAvailable: item.isAvailable,
    status: item.status,
    mainLocation: item.mainLocation,
    subLocation: item.subLocation,
    callNumber: item.callNumber,
    libraryCode: item.libraryCode
  };
}

function formatItem(item: PrimoItemSummary, index: number) {
  return {
    title: item.title,
    citationToken: `{{CITE_${index}}}`,
    publicationYear: item.publicationYear,
    authors: formatAuthors(item.authors),
    description: item.description,
    format: item.format,
    publisher: item.publisher,
    language: item.language,
    subjects: formatSubjects(item.subjects),
    identifiers: formatIdentifiers(item.identifiers),
    availability: {
      displayedAvailability: item.availability.displayedAvailability,
      isElectronic: item.availability.isElectronic,
      local: formatLocalAvailability(item.availability.local),
      consortium: formatConsortiumAvailability(item.availability.consortium)
    }
  };
}

function summariseResult(result: PrimoSearchResult) {
  return {
    citationInstructions: 'To cite any result in your response, use the citationToken field (e.g., {{CITE_0}}, {{CITE_1}}, etc.). Never copy record IDs or permalinks directly - always use the citation tokens which will be automatically converted to properly formatted links.',
    info: result.info,
    items: result.items.map((item, index) => formatItem(item, index))
  };
}

export const primoSearchTool = tool(
  PRIMO_TOOL_NAME,
  `Search the Mina Rees Library Primo catalog and return availability details.

Parameters:
- value: The search term (e.g., book title, author name, keywords, journal name)
- field: Which field to search (default: 'any')
  * 'any' - Search all fields (general keyword search)
  * 'title' - Search title field only
  * 'creator' - Search author/creator field
  * 'sub' - Search subject field
  * 'isbn' - Search by ISBN
  * 'issn' - Search by ISSN
- operator: How to match (default: 'contains')
  * 'contains' - Find records containing all words in any order
  * 'exact' - Find exact phrase match
- journalsOnly: Set to true to search only journals/periodicals (default: false)

Search strategy:
1. For known-item (specific title) searches: Use field='title', operator='exact'
2. For author searches: Use field='creator', operator='contains'
3. For subject/topic searches: Use field='sub' or 'any', operator='contains'
4. For ISBN/ISSN lookups: Use field='isbn'/'issn', operator='exact'
5. For journal/newspaper searches: Use field='title' or 'any', journalsOnly=true
6. For general searches: Use field='any', operator='contains'
7. If first search returns 0 results, try again with operator='contains' or field='any'

Examples:
- Find "Washington Post": value="Washington Post", field="title", journalsOnly=true
- Find journal by ISSN: value="1234-5678", field="issn", journalsOnly=true`,
  inputSchema,
  async ({ value, field = 'any', operator = 'contains', limit, offset, journalsOnly = false }) => {
    try {
      const query = buildQuery(value, field, operator);
      const searchInput: PrimoSearchInput = { query };

      if (typeof limit === 'number') {
        searchInput.limit = limit;
      }
      if (typeof offset === 'number') {
        searchInput.offset = offset;
      }

      if (journalsOnly) {
        searchInput.tabOverride = 'jsearch_slot';
      }

      const result = await searchPrimo(searchInput);
      const payload = summariseResult(result);

      // Store in cache for citation token substitution
      const cacheItems = result.items.map((item, index) => ({
        title: item.title ?? '',
        permalink: item.permalink ?? '',
        recordId: item.recordId ?? '',
        catalogLink: `[Catalog link ${index + 1}](${item.permalink})`
      }));
      getActiveSearchCache().addSearch(cacheItems);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(payload, null, 2)
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
            text: JSON.stringify(
              {
                error: 'search_primo_failed',
                message
              },
              null,
              2
            )
          }
        ]
      };
    }
  }
);

export type PrimoToolHandler = typeof primoSearchTool.handler;
