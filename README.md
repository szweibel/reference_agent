# Reference Agent

An AI reference librarian for academic libraries, built with Anthropic's Claude. It answers patron questions by actually searching library systems—the catalog, research guides, databases, and blog posts—rather than making things up.

This is a working implementation for the Mina Rees Library at CUNY Graduate Center, but the architecture should work for other academic libraries with similar systems (Ex Libris Primo, SpringShare LibGuides).

## What it does

The agent can handle typical reference desk questions:

- "Do you have books about Byzantine art?"
- "What databases should I use for psychology research?"
- "What are your hours today?"
- "How do I request something through interlibrary loan?"

It searches the actual library catalog, finds real research guides, checks the blog for announcements, and builds responses from verified information. When it finds resources, it includes proper citations with stable URLs.

## How it works

The agent uses [Anthropic's Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) to orchestrate Claude with several tools exposed via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/):

**Tools available to the agent:**
- `SearchPrimo` - Searches the library catalog (Ex Libris Primo API)
- `SearchGuides` - Finds LibGuides research guides (SpringShare API)
- `SearchDatabases` - Looks up databases from the A-Z list (LibGuides API)
- `SearchBlog` - Reads recent blog posts for announcements (WordPress API)
- `LogNote` - Saves insights about patron questions to institutional knowledge

**Pre-retrieval hook:**
Before processing any query, the agent automatically fetches the complete LibGuides catalog (200+ guides) and injects it as context. This prevents hallucination on meta-questions like "What research guides do you have?" The catalog is cached for an hour and reused across queries via Claude's prompt caching.

**Response flow:**
1. User asks a question
2. Pre-retrieval hook fetches LibGuides catalog (cached)
3. Agent receives question + catalog context
4. Agent decides which tools to call and formulates searches
5. Tools return results with citation tokens like `{{CITE_0}}`
6. Agent drafts response using citation tokens
7. Server substitutes tokens with actual URLs
8. Response streams back to user via Server-Sent Events

The agent stays within "READ Scale Level 2" reference—directional help and known-item searches. Complex research questions get escalated with a suggestion to contact a subject librarian.

## Getting started

### Prerequisites

- Node.js 20+
- npm (ships with Node)
- API credentials for your library systems (see Configuration below)

### Installation

```bash
git clone https://github.com/yourusername/reference_agent.git
cd reference_agent
npm install
```

### Configuration

Create `primo/.env` with your library system credentials:

```bash
# Ex Libris Primo (catalog search)
PRIMO_API_KEY="your-primo-key"
primo_base_url="https://api-na.hosted.exlibrisgroup.com/primo/v1/search"
primo_vid="YOUR_VIEW_ID"
primo_tab="Everything"
primo_scope="YOUR_SCOPE"

# SpringShare LibGuides (guides and databases)
LIBGUIDES_SITE_ID="your-site-id"
LIBGUIDES_CLIENT_ID="your-client-id"
LIBGUIDES_CLIENT_SECRET="your-client-secret"
```

**Where to get credentials:**
- **Primo API key**: Your Ex Libris representative or institutional API portal
- **LibGuides credentials**: Admin panel → API / Widgets section

**Note on Anthropic authentication:**
This project uses the Agent SDK with Claude Code's authentication path. If you have Claude Code set up and authenticated, no separate Anthropic API key is needed. If you're running this outside of Claude Code, you'll need to add `ANTHROPIC_API_KEY` to your environment.

### Running locally

```bash
# Start the web server
npm run dev:server

# Visit http://localhost:3110
# (or http://localhost:3110/your-base-path if you set BASE_PATH env var)

# Run CLI for single queries
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

## Project structure

```
src/
├── server.ts              # Express server with SSE streaming
├── index.ts               # CLI runner
├── services/
│   ├── agentRunner.ts     # Agent orchestration
│   └── preRetrieval.ts    # Pre-query LibGuides hook
├── tools/                 # MCP tool implementations
│   ├── primoTool.ts       # Catalog search
│   ├── guidesTool.ts      # Research guides
│   ├── databaseTool.ts    # Database lookup
│   ├── blogTool.ts        # Blog search
│   └── logNoteTool.ts     # Knowledge capture
├── primo/                 # Primo API client
├── libguides/             # LibGuides API client
└── lib/
    ├── prompt.ts          # System prompt
    ├── searchCache.ts     # Citation cache
    └── siteMap.ts         # Library sitemap

public/
└── index.html             # Web UI (static, no build)

docs/
├── reference-notes.md     # Institutional knowledge
└── pending-notes.md       # Unverified notes

tests/                     # Vitest tests
```

## Testing

Tests hit real APIs, so you need credentials in `primo/.env`:

```bash
npm test                   # Run all tests
npm run test:watch         # Watch mode
```

Expect slower runs because of live API calls—this verifies integrations actually work.

## Institutional knowledge

The agent loads `docs/reference-notes.md` into its system prompt—use this for hard-to-find information and institutional exceptions. Keep it concise.

**Workflow:**
1. Discover something non-obvious? Add it to `docs/pending-notes.md` with confidence level (HIGH/MEDIUM/LOW)
2. Review pending notes periodically
3. Move verified HIGH confidence entries to `docs/reference-notes.md`
4. Delete incorrect or low-value entries

The agent sees approved notes on every query and references them naturally.

## Production deployment

Build and run the compiled server:

```bash
npm run build
npm run start:server
```

Use your preferred process manager (systemd, launchd, PM2) to keep it running. The server listens on port 3110 by default (configure with `PORT` env var) and supports a `BASE_PATH` environment variable for reverse proxy deployments.

## Contributing

1. Create a feature branch
2. Make your changes
3. Ensure `npm test` passes
4. Open a PR

Keep secrets out of git—`primo/.env` is gitignored for a reason.

## License

ISC
