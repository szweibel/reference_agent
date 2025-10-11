# Reference Agent

A lightweight Node/TypeScript service that exposes a Mina Rees Library “reference agent.”  It offers:

- A CLI runner (`src/index.ts`) for ad-hoc prompts
- An Express web app (`src/server.ts`) that streams SSE responses to the front-end in `public/`
- Live tooling that hits Ex Libris Primo to confirm local holdings and availability

## Prerequisites

- Node.js 20+
- npm (ships with Node)

## Installation

```bash
npm install
```

## Development scripts

| Command          | Description                               |
| ---------------- | ----------------------------------------- |
| `npm run dev`    | Run the CLI entrypoint with ts-node       |
| `npm run dev:server` | Start the Express server with ts-node |
| `npm run build`  | Emit transpiled files into `dist/`        |
| `npm test`       | Execute Vitest suites (including live Primo checks) |

## Primo integration

The server now exposes `POST /api/primo/search`, which wraps the Primo REST API through `src/primo/client.ts`. The endpoint returns normalized availability data so the agent can stay within READ Level 2 while confirming whether Mina Rees holds a specific item.

Create `primo/.env` to configure live credentials (this file is gitignored):

```
PRIMO_API_KEY="<your-key>"
primo_base_url="https://api-na.hosted.exlibrisgroup.com/primo/v1/search"
primo_vid="01CUNY_GC"
primo_tab="Everything"
primo_scope="IZ_CI_AW"
```

The integration and API tests load that file directly, so the keys must exist locally before running `npm test`.

## Testing philosophy

The Vitest suite includes:

- Unit coverage for the Agent runner and SSE interface
- Live Primo integration checks (`tests/primoIntegration.test.ts`, `tests/primoApi.test.ts`)

Because the Primo calls hit real infrastructure, expect slower runs and make sure the API key has the necessary permissions.

## Front-end stream preview

`public/index.html` is a static shell that consumes the SSE stream provided by the server. Styling changes ship instantly when the server runs in dev mode, so no build step is required.

## Reference notes (institutional knowledge)

The agent maintains a knowledge base in `docs/reference-notes.md` for hard-to-find information and institutional gotchas. This file is automatically loaded into the system prompt.

**Workflow:**
1. When you discover something difficult to find or non-obvious, add it to `docs/pending-notes.md` with confidence level (HIGH/MEDIUM/LOW)
2. Review pending notes periodically (weekly suggested)
3. Move verified HIGH confidence entries to `docs/reference-notes.md`
4. Delete incorrect or low-value entries from pending
5. Keep `reference-notes.md` concise - aim for exceptions only, not common knowledge

The agent sees approved notes on every query and uses them naturally in responses.

## Running the reference agent service

For local development you can:

- Run the CLI entrypoint with `npm run dev` (prompts for a single patron question).
- Start the web server via `npm run dev:server` and open the UI served from `public/`.
- Build once with `npm run build`, then launch the compiled server using `npm run start:server`.

Production deployments can wrap `npm run start:server` in whichever process manager suits your environment (systemd, launchd, PM2, etc.).

## Contributing

1. Create a feature branch
2. Ensure `npm test` passes (requires the Primo env values)
3. Keep secrets out of git—`primo/.env` is ignored on purpose
4. Open a PR summarizing behaviour changes and any new READ-scale safeguards
