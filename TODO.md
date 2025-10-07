# TODO

- Hook `searchPrimo` into the agent execution flow so READ Level 2 responses automatically invoke the catalog instead of relying on manual API calls.
- Add guardrails that inspect outgoing messages and trigger escalation if a Primo result indicates off-campus-only availability or patron requests drift toward READ Level 3.
- Cache Primo responses for the duration of a session to reduce latency and API usage when the agent revisits the same known item.
- Provide a mock Primo fixture so CI can run an offline test suite alongside the live integration checks.
