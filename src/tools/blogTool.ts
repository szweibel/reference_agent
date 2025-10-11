import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

export const BLOG_TOOL_NAME = 'SearchBlog';

const inputSchema = z
  .object({
    search: z.string().optional(),
    limit: z.number().int().min(1).max(20).optional()
  })
  .shape;

interface WordPressPost {
  id: number;
  date: string;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  link: string;
}

interface BlogPost {
  title: string;
  date: string;
  excerpt: string;
  url: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchBlogPosts(search?: string, limit = 10): Promise<BlogPost[]> {
  const params = new URLSearchParams();
  params.set('per_page', String(Math.min(limit, 20)));
  params.set('_fields', 'id,date,title,excerpt,link');

  if (search) {
    params.set('search', search);
  }

  const url = `https://gclibrary.commons.gc.cuny.edu/wp-json/wp/v2/posts?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Blog API request failed with status ${response.status}`);
  }

  const posts = (await response.json()) as WordPressPost[];

  return posts.map((post) => ({
    title: stripHtml(post.title.rendered),
    date: new Date(post.date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }),
    excerpt: stripHtml(post.excerpt.rendered),
    url: post.link
  }));
}

export const blogSearchTool = tool(
  BLOG_TOOL_NAME,
  `Search the Mina Rees Library blog for recent posts, announcements, and library news.

Parameters:
- search: Optional search term to filter posts (searches title and content)
- limit: Maximum number of posts to return (1-20, default: 10)

Use this tool to:
- Find recent library announcements and news
- Search for specific topics or resources mentioned in blog posts
- Check for updates about library services, events, or policies

The blog covers library news, open educational resources, scholarly communication, and library services.

Examples:
- Recent posts: (no search parameter)
- Search for "open access": search="open access"
- Find workshop announcements: search="workshop"`,
  inputSchema,
  async ({ search, limit = 10 }) => {
    try {
      const posts = await fetchBlogPosts(search, limit);

      if (posts.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  message: search
                    ? `No blog posts found matching "${search}"`
                    : 'No recent blog posts found',
                  posts: []
                },
                null,
                2
              )
            }
          ]
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                count: posts.length,
                search: search ?? null,
                posts
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
                error: 'blog_search_failed',
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

export type BlogToolHandler = typeof blogSearchTool.handler;
