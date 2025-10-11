import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

import { searchDatabases } from '../libguides/client.js';
import type { LibGuidesDatabase, DatabaseSearchInput } from '../libguides/types.js';

export const DATABASE_TOOL_NAME = 'SearchDatabases';

const inputSchema = z
  .object({
    search: z.string().optional(),
    limit: z.number().int().min(1).max(20).optional()
  })
  .shape;

interface DatabaseSummary {
  name: string;
  description: string | null;
  url: string | null;
  subjects: string[];
  types: string[];
  requiresProxy: boolean;
}

function formatDatabase(db: LibGuidesDatabase): DatabaseSummary {
  return {
    name: db.name,
    description: db.description ?? null,
    url: db.url ?? null,
    subjects: (db.subjects ?? []).map((s) => s.name),
    types: (db.types ?? []).map((t) => t.name),
    requiresProxy: db.enable_proxy ?? false
  };
}

export const databaseSearchTool = tool(
  DATABASE_TOOL_NAME,
  `Search the Mina Rees Library Databases A-Z list to find available databases by name or topic.

Parameters:
- search: Optional search term to filter databases (searches name and description)
- limit: Maximum number of results to return (1-20, default: 10)

Use this tool to:
- Verify if a specific database is available (e.g., "JSTOR", "ProQuest", "Web of Science")
- Find databases by subject area or topic
- Get access URLs and proxy information for databases

Important:
- Always use this tool to verify database availability before claiming a database is or isn't available
- Do not guess or assume database access without checking this tool first
- The tool returns the database name, description, URL, subjects, types, and proxy requirements

Examples:
- Check if JSTOR is available: search="JSTOR"
- Find psychology databases: search="psychology"
- Search for newspaper databases: search="newspaper"
- Verify ProQuest access: search="ProQuest"`,
  inputSchema,
  async ({ search, limit = 10 }) => {
    try {
      const searchInput: DatabaseSearchInput = { limit };

      if (search) {
        searchInput.search = search;
      }

      const result = await searchDatabases(searchInput);

      if (result.databases.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  message: search
                    ? `No databases found matching "${search}"`
                    : 'No databases found',
                  total: 0,
                  databases: []
                },
                null,
                2
              )
            }
          ]
        };
      }

      const formatted = result.databases.map(formatDatabase);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                search: search ?? null,
                total: result.total,
                showing: formatted.length,
                databases: formatted
              },
              null,
              2
            )
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
                error: 'database_search_failed',
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

export type DatabaseToolHandler = typeof databaseSearchTool.handler;
