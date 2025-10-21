# Claude Quick Reference

Quick commands and context for working on this project.

## Server Management

### Restart Server
```bash
launchctl kickstart -k gui/$(id -u)/com.stephenzweibel.reference-agent
```

### Check Status
```bash
launchctl list | grep reference-agent
```

### View Logs
```bash
tail -f ~/Apps/reference_agent/logs/server.out
tail -f ~/Apps/reference_agent/logs/server.err
```

### Stop Server
```bash
launchctl stop com.stephenzweibel.reference-agent
```

### Start Server
```bash
launchctl start com.stephenzweibel.reference-agent
```

## Development

### Run Tests
```bash
npm test                    # Run all tests once
npm run test:watch          # Watch mode
```

### Build
```bash
npm run build              # TypeScript compilation
```

### Development Mode (local)
```bash
npm run dev:server         # Run server with ts-node
npm run dev:cli            # Run CLI with ts-node
```

## Key Files

### Core Implementation
- `src/server.ts` - Express server endpoint
- `src/services/agentRunner.ts` - Main agent orchestration
- `src/services/preRetrieval.ts` - Pre-message hook (injects LibGuides catalog + directive)
- `src/lib/prompt.ts` - System prompt builder

### Configuration
- `.env` - API keys (not committed)
- `docs/reference-notes.md` - Institutional knowledge (loaded into system prompt)

### Tools/MCP Servers
- `src/tools/primoMcpServer.ts` - Catalog search
- `src/tools/databaseMcpServer.ts` - Database search
- `src/tools/guidesMcpServer.ts` - LibGuides search
- `src/tools/blogMcpServer.ts` - Blog/announcement search
- `src/tools/logNoteMcpServer.ts` - Knowledge capture

### LibGuides Integration
- `src/libguides/client.ts` - API client
- `src/libguides/types.ts` - TypeScript types

## Common Tasks

### After Changing Code
1. Commit changes if needed: `git add . && git commit -m "description"`
2. Restart server: `launchctl kickstart -k gui/$(id -u)/com.stephenzweibel.reference-agent`
3. Test: `curl http://localhost:3110/reference-agent/health`

### Adding Institutional Knowledge
Edit `docs/reference-notes.md` - it's automatically loaded into the system prompt.

### Updating System Prompt
Edit `src/lib/prompt.ts:buildSystemPrompt()`, then restart server.

### Modifying Pre-Message Behavior
Edit `src/services/preRetrieval.ts:userPromptSubmitHook()` to change what gets injected before each user message.

## Architecture Notes

### Message Flow
```
User Query
    ↓
UserPromptSubmit Hook (preRetrieval.ts)
    ↓ Injects LibGuides catalog + directive
Main Agent (agentRunner.ts)
    ↓ Uses tools via MCP servers
Response with substituted citations
```

### Pre-Retrieval Hook
- Runs before every user message
- Injects complete LibGuides catalog (cached 1 hour)
- Adds directive: "You MUST search our LibGuides for ANY subject question"
- Makes agent prioritize local resources over training data

### Citation System
- Tools return `{{CITE_N}}` tokens
- Substituted with actual URLs before streaming to user
- Handled by `substituteCitationTokens()` in agentRunner.ts

## Testing Endpoints

### Health Check
```bash
curl http://localhost:3110/reference-agent/health
```

### Query Agent
```bash
curl -X POST http://localhost:3110/reference-agent/query \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What are your hours?"}'
```

## Environment

- **Working directory:** `~/Apps/reference_agent`
- **Port:** 3110
- **Base path:** `/reference-agent`
- **Node:** `/opt/homebrew/bin/node`
- **LaunchAgent plist:** `~/Library/LaunchAgents/com.stephenzweibel.reference-agent.plist`
