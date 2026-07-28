# SMC Full-Stack Take-Home

## Prerequisites
- Docker
- Node.js 18+
- pnpm (optional, npm works too)

## Quick Start

1. Start infra:
```bash
docker compose up
```

2. Install dependencies:
```bash
cd server && npm install
cd ../web && npm install
```

3. Load data:
```bash
cd server
npm run load-data
```

4. Run dev servers:
```bash
# Terminal 1: backend
cd server && npm run dev

# Terminal 2: frontend
cd web && npm run dev
```

Visit http://localhost:5173 (or 5174 if 5173 is in use)

## Current Status

✅ Phase 0: Infra (postgres + redis, data loader, skeleton FE/BE)
✅ Phase 1: Auth (register, login, logout, session guard, protected routes)
✅ Phase 2: Conversations (CRUD scoped by userId, seq-ordered messages, sidebar UI)
✅ Phase 3: Grounding (read-only DB pool, SQL validator, query/coverage endpoints)
✅ Phase 4: Streaming chat (ToolCallCard with live SQL, Markdown renderer + charts, stop button, token estimation)
✅ Phase 5: Usage limits (Redis fixed-window counter, pre-flight 429 guard, durable ledger, budget indicator + countdown)
✅ Phase 6: Polish (MUI UI, dark mode, live token streaming, example-prompt empty state, typing dots, ⌘K new chat, auto-titles, delete dialog)

**To test Phases 1-6:**
1. Register at `/register` → auto-logs in
2. Create conversations via "New chat" (or `⌘K`)
3. Send a message — text streams in token-by-token; the SQL tool card shows the query typing live, then the result table
4. Expand a tool card to inspect the SQL and rows; ask for a comparison to get a Markdown table + chart
5. The header shows a live **budget** bar; "Stop" aborts mid-stream (partial answer is still saved + costed)
6. Auto-titles each conversation from its first message

✅ Phase 7: Docs + verification (see [docs.md](./docs.md))

## Usage limits (Phase 5)

- **Hot counter**: `usage:{userId}:{windowStart}` → float in Redis, `INCRBYFLOAT` + TTL = window. Expiry gives the fixed-window reset for free.
- **Durable ledger**: `app.usage_events` (model, tokens, `cost_usd`, `estimated`). Rebuild the window from here if Redis is flushed.
- **Accounting runs in `finally`** — completion, user abort, client disconnect, and upstream error all persist the partial message and record cost. On abort the model never sends a usage chunk, so output is counted with `gpt-tokenizer` and the row is flagged `estimated = true`.
- **Pre-flight guard**: before any LLM call, `spent >= limit` returns `429 { error: "limit_exceeded", limit, spent, resetsAt, windowSeconds }` — the front end renders a friendly inline banner with a live countdown, never a raw toast.
- Cost uses real `promptTokens`/`completionTokens` from the finish chunk (gpt-4o-mini: $0.15/M in, $0.60/M out), falling back to the tokenizer estimate when unavailable.
- `GET /usage` returns the current window for the header indicator.

**Test values** (from the build plan): set `USAGE_LIMIT_USD=0.001` and `USAGE_WINDOW_SECONDS=180` to trip the limit quickly, then reset to the defaults.

## Environment Variables

Copy `.env.example` to `.env` and fill in:
- `OPENAI_API_KEY` — required for LLM features

Usage limits:
- `USAGE_LIMIT_USD=1.00` — per-user budget per window
- `USAGE_WINDOW_SECONDS=3600` — window duration (fixed)

## Notes / troubleshooting

- **Backend dev runner**: `npm run dev` uses `node --import @swc-node/register --watch`, not `tsx`. SWC emits the `design:paramtypes` metadata NestJS needs for constructor DI; `tsx`/esbuild silently drops it, which breaks class-type injection (e.g. `AuthService` into `AuthController`) in dev. `reflect-metadata` is imported in `main.ts`. `tsx` is still used by `npm run load-data` (no DI there).
- **Two Redis on :6379**: if a local Redis (e.g. Homebrew `redis-server`) is bound to `localhost:6379`, it shadows the Docker container and the app writes there instead. `brew services stop redis` (or `redis-cli shutdown`) to use the container.
