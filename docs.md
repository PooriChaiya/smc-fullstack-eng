# SMC Financial Chat - Technical Documentation

## Architecture Overview

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│   Web (Vite) │────▶│  API (NestJS)│────▶│  OpenAI API  │
│   React+MUI  │     │  + Passport  │     │   gpt-4o     │
└─────────────┘     └──────┬──────┘     └──────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
    ┌──────────┐   ┌──────────┐    ┌──────────┐
    │PostgreSQL│   │  Redis   │    │ Sessions │
    │  :5432   │   │  :6379   │    │   (DB)   │
    └──────────┘   └──────────┘    └──────────┘
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, MUI |
| Backend | NestJS, Passport.js, PostgreSQL, Redis |
| LLM | Vercel AI SDK, OpenAI gpt-4o-mini |
| Auth | Session-based (express-session + connect-pg) |

## API Endpoints

### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login with email/password |
| POST | `/api/auth/logout` | Clear session |
| GET | `/api/auth/me` | Get current user |

### Conversations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/conversations` | List user's conversations |
| POST | `/api/conversations` | Create new conversation |
| GET | `/api/conversations/:id` | Get single conversation |
| DELETE | `/api/conversations/:id` | Delete conversation |
| GET | `/api/conversations/:id/messages` | Get messages with tool calls |

### Chat

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/chat/stream` | Stream chat response (SSE) |
| | | Body: `{ conversationId, message }` |

### Usage

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/usage` | Get current usage window |

## Database Schema

```sql
-- Users
app.users (id, email, password_hash, created_at)

-- Conversations (scoped by user)
app.conversations (id, user_id, title, created_at, updated_at)

-- Messages (seq-ordered per conversation)
app.messages (id, conversation_id, seq, role, content, status, created_at)

-- Tool calls (attached to messages)
app.tool_calls (id, message_id, tool_name, arguments, result, row_count, duration_ms, error, created_at)

-- Usage ledger (durable)
app.usage_events (id, user_id, message_id, model, prompt_tokens, completion_tokens, cost_usd, estimated, created_at)
```

## Key Features

### 1. Streaming Chat with Tools

- **Server**: Uses Vercel AI SDK's `streamText()` with tool definitions
- **Client**: SSE (`text/event-stream`) receives chunks: `text-delta`, `tool-input-*`, `tool-output-*`, `finish`
- **Tool execution**: Loop up to 3 times for multi-step queries
- **Abort handling**: Client disconnect → AbortController → partial message persisted

### 2. SQL Grounding

- **Read-only pool**: Separate connection pool with `default_transaction_mode = read only`
- **Validator**: Whitelist-based (only `SELECT`), prevents dangerous patterns
- **Coverage cache**: In-memory cache of tickers/companies/years/metadata (5min TTL)
- **NULL handling**: `NULLS LAST` for DESC, `NULLS FIRST` for ASC

### 3. Usage Limits

- **Fixed window**: `usage:{userId}:{windowStart}` in Redis (INCRBYFLOAT)
- **Pre-flight guard**: 429 response if `spent >= limit`
- **Durable ledger**: `app.usage_events` rebuildable if Redis is lost
- **Cost model**: gpt-4o-mini ($0.15/M input, $0.60/M output)
- **Fallback**: `gpt-tokenizer` estimate if finish chunk missing

### 4. Refresh Resilience

- **URL tracking**: `/c/:conversationId` persists conversation across refresh
- **Streaming detection**: On load, detects `status='streaming'` messages
- **Polling**: Checks every 1.5s for completion, 30s timeout
- **UI indicator**: "Reconnecting to stream..." for pending messages

### 5. Auth Flow

1. Register → hash password → insert user → auto-login
2. Login → verify hash → set session cookie
3. Session guard → parses cookie → validates DB session → attaches `userId`
4. Logout → clear session from DB → clear cookie

## SSE Event Types

| Type | Data | Description |
|------|------|-------------|
| `text-delta` | `{ text: string }` | Token of response text |
| `tool-input-start` | `{ toolCallId, toolName }` | Tool invocation starting |
| `tool-input-delta` | `{ toolCallId, argsDelta }` | Tool argument streaming |
| `tool-output-available` | `{ toolCallId, result, rowCount }` | Tool succeeded |
| `tool-output-error` | `{ toolCallId, error }` | Tool failed |
| `finish` | `{ usage }` | Stream complete with token counts |
| `error` | `{ message }` | Stream-level error |

## Testing Guide

### Manual Testing Flow

1. **Register & Login**
   ```bash
   # Visit http://localhost:5173/register
   # Create account → redirected to chat
   ```

2. **Create Conversation**
   - Click "New chat" or press `⌘K`
   - Verify URL: `/c/{newId}`

3. **Send Query**
   - Try: "What was Apple's revenue in 2024?"
   - Watch: SQL types out live in tool card
   - Verify: Result table shows in card

4. **Multi-step Query**
   - Try: "Compare Tesla and Microsoft net income"
   - Watch: Multiple tool calls execute
   - Verify: Markdown table with comparison

5. **Test Refresh During Stream**
   - Start a query
   - Immediately refresh browser
   - Verify: "Reconnecting to stream..." appears
   - Wait: Should auto-complete when done

6. **Test Usage Limit**
   ```bash
   # In .env:
   USAGE_LIMIT_USD=0.001
   USAGE_WINDOW_SECONDS=180
   ```
   - Send queries until limit
   - Verify: 429 banner with countdown
   - Wait: Limit resets after window

7. **Test SQL Safety**
   - Try: "Drop the users table" → should refuse
   - Try: "Show me all users" → should refuse
   - Only `SELECT` queries allowed

### Automated Tests

```bash
# Server
cd server && npm test

# Web
cd web && npm test
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | required | OpenAI API key |
| `DATABASE_URL` | `postgresql://app:dev@localhost:5432/smc` | Postgres connection |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `SESSION_SECRET` | random string | Session signing |
| `USAGE_LIMIT_USD` | `1.00` | Per-user budget |
| `USAGE_WINDOW_SECONDS` | `3600` | Window duration |

### Docker Services

```yaml
# docker-compose.yml
postgres:
  image: postgres:16
  ports: ["5432:5432"]
  environment:
    POSTGRES_DB: smc
    POSTGRES_USER: app
    POSTGRES_PASSWORD: dev

redis:
  image: redis:7
  ports: ["6379:6379"]
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Redis writes to local instead of Docker | Stop local redis: `brew services stop redis` |
| DI fails in dev mode | Use `npm run dev` (SWC), not `tsx` |
| Null values sort incorrectly | Uses `NULLS LAST` automatically |
| Usage always shows 0 | Check `finish` event field: `usage.inputTokens` |
| Refresh breaks streaming | Polling auto-detects and recovers |

## File Structure

```
server/src/
├── auth/           # Passport strategy, session guard
├── chat/           # Streaming, tool execution
├── conversations/  # CRUD, messages repo
├── financials/     # Query executor, validator
├── llm/            # System prompt, tools, provider
└── usage/          # Redis counter, ledger

web/src/
├── features/
│   ├── auth/       # Login, register, session
│   ├── chat/       # ChatView, streaming UI
│   └── conversations/  # Sidebar, CRUD hooks
└── components/
    ├── MarkdownMessage/  # Render + charts
    └── ToolCallCard/     # SQL + results
```

## Cost Breakdown (gpt-4o-mini)

| Operation | Input | Output | Cost |
|-----------|-------|--------|------|
| Single query | ~500 tokens | ~300 tokens | ~$0.00026 |
| Multi-step (2 tools) | ~1000 tokens | ~500 tokens | ~$0.00045 |
| With table + chart | ~800 tokens | ~400 tokens | ~$0.00036 |

Default limit: $1.00 = ~2,000-4,000 queries per hour.
