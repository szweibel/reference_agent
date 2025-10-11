import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { searchGuides } from '../libguides/client.js';

const SearchGuidesInputSchema = z.object({
  search: z.string().optional().describe('Search terms to find guides. Can be multiple keywords - they will be searched with OR logic (finds guides containing ANY of the terms)'),
  guideId: z.string().optional().describe('Specific guide ID to fetch (e.g., from URL like /c.php?g=1234)'),
  limit: z.number().min(1).max(20).default(5).optional().describe('Number of guides to return (default: 5, max: 20)')
});

export const searchGuidesTool = tool(
  'SearchGuides',
  'Search LibGuides to find relevant guides and get URLs for all their pages/tabs. Returns page URLs that you can then WebFetch individually to get actual content. This solves the JavaScript tabs problem by giving you direct URLs to each tab. Multiple search terms are automatically combined with OR logic.',
  SearchGuidesInputSchema.shape,
  async (args) => {
    try {
      let result;

      if (args.guideId) {
        // Fetching specific guide by ID - get full content
        result = await searchGuides({
          guideId: args.guideId,
          expand: 'pages.boxes'
        });
      } else if (args.search) {
        // Two-step process: search then fetch details
        const trimmed = args.search.trim();

        // Convert multi-word searches to OR queries (LibGuides uses pipe | for OR)
        const searchQuery = trimmed.includes(' ') && !trimmed.includes('|')
          ? trimmed.split(/\s+/).join(' | ')
          : trimmed;

        // Step 1: Search to get guide IDs (fast, no expand)
        const searchResult = await searchGuides({
          search: searchQuery,
          fullTextSearch: true,
          limit: args.limit || 5
        });

        // Step 2: Fetch each guide by ID with full content
        if (searchResult.total > 0 && searchResult.guides.length > 0) {
          const detailedGuides = await Promise.all(
            searchResult.guides.map(async (guide) => {
              if (!guide.id) return guide;

              const detailed = await searchGuides({
                guideId: guide.id.toString(),
                expand: 'pages.boxes'
              });

              return detailed.guides[0] || guide;
            })
          );

          result = {
            guides: detailedGuides,
            total: searchResult.total
          };
        } else {
          result = searchResult;
        }
      } else {
        return {
          content: [{
            type: 'text',
            text: 'Please provide either a search term or guide ID.'
          }],
          isError: true
        };
      }

      if (result.total === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No guides found matching your search criteria.'
            }
          ]
        };
      }

      // Format the response with page URLs for WebFetch
      const formatted = result.guides.map((guide) => {
        let output = `# ${guide.name}\n`;

        if (guide.description) {
          output += `\n${guide.description}\n`;
        }

        if (guide.url || guide.friendly_url) {
          output += `\nGuide URL: ${guide.friendly_url || guide.url}\n`;
        }

        if (guide.pages && guide.pages.length > 0) {
          output += `\n## Pages/Tabs (use WebFetch on these URLs to get actual content):\n\n`;

          for (const page of guide.pages) {
            output += `### ${page.name}\n`;

            if (page.url) {
              output += `Page URL: ${page.url}\n`;
              output += `To get content from this tab, use: WebFetch(url="${page.url}")\n`;
            }

            output += `\n`;
          }
        }

        output += `---\n`;
        return output;
      }).join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found ${result.total} guide(s):\n\n${formatted}`
          }
        ]
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: `LibGuides search failed: ${message}`
          }
        ],
        isError: true
      };
    }
  }
);
