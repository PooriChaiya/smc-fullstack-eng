# Siametrics Full-Stack Take-Home — Build Plan

Grounded financial chat app. React \+ TypeScript frontend, SQL-grounded LLM answers, streaming with visible tool calls, per-user usage limits, auth, conversation management.

---

## 1\. Stack decision

### Comparison

|  | TypeScript \+ NestJS | Python \+ FastAPI | TypeScript \+ Express |
| :---- | :---- | :---- | :---- |
| Streaming | Vercel AI SDK gives you a typed stream protocol out of the box | Hand-roll SSE via `StreamingResponse` | Same as NestJS but you wire it yourself |
| **Visible tool-call streaming** | **Free** — AI SDK emits `tool-call` / `tool-result` stream parts, `useChat` exposes them as message parts | You must design \+ implement your own event protocol | Free (same SDK), less structure |
| Abort handling | `useChat().stop()` \+ `onAbort` server hook | `await request.is_disconnected()` \+ `try/finally` | Same as NestJS |
| "Well-separated code" (rubric) | Strongest — modules, DI, guards, repositories are idiomatic | Good with routers \+ service layer, but you impose it | Weakest — all convention |
| Shared types FE/BE | Yes | No | Yes |
| Ramp-up cost | Medium (DI/decorators) | Low | Lowest |

### Recommendation: **TypeScript \+ NestJS \+ Vercel AI SDK**

Two reasons that map straight to the rubric:

1. **The hardest requirement becomes near-free.** "The SQL tool call must be visibly rendered as it happens" is the requirement most likely to eat your time. The AI SDK's data-stream protocol already carries tool-call and tool-result parts to the client, and `useChat` surfaces them as renderable message parts. You spend your time on UI polish instead of inventing an SSE event schema.  
2. **NestJS's structure *is* the "engineering quality" score.** Guards for auth, modules for separation, repositories for data access — 25% of the grade asks for exactly this, and you get it by following the framework's defaults.

**Choose FastAPI instead if** you're materially faster in Python. Section 10 warns you'll walk through your design live and extend it on the spot — fluency beats framework fit. If you go FastAPI, budget an extra half-day for the SSE event protocol in Phase 4 and use the same event shapes listed in §4.

**Don't choose Express** unless you're very short on time. You'll rebuild NestJS's structure by hand and it'll read as less deliberate.

Everything below is stack-agnostic except where noted.

---

## 2\. Architecture

repo/

├─ docker-compose.yml          \# postgres \+ redis

├─ .env.example                \# all config incl. usage limit \+ window

├─ data/financial\_data.sql     \# provided dump

├─ scripts/load-data.ts        \# idempotent loader

├─ README.md

├─ server/

│  ├─ auth/                    \# register, login, session guard

│  ├─ conversations/           \# CRUD, ownership-scoped repository

│  ├─ chat/                    \# streaming orchestration

│  ├─ llm/                     \# provider, system prompt, tool defs

│  ├─ financials/              \# READ-ONLY sql executor \+ validator

│  ├─ usage/                   \# redis window counter \+ ledger

│  └─ common/                  \# config, errors, logging

└─ web/

   ├─ features/auth/

   ├─ features/chat/           \# composer, message list, stream renderer

   ├─ components/ToolCallCard.tsx

   ├─ components/MarkdownMessage.tsx  \# \+ table \+ chart renderers

   └─ lib/api.ts

### Two data planes, one Postgres instance

Run one Postgres container with **two schemas and two roles**:

- `app` schema — users, conversations, messages, usage ledger. Accessed by the app's normal pooled connection.  
- `financials` schema — the provided data. Accessed **only** through a second connection pool using a `readonly_agent` role with `SELECT`\-only grants on `financials` and no grants on `app`.

This is a small amount of work with an outsized payoff: it makes prompt injection ("ignore instructions and drop the users table") structurally impossible rather than prompt-dependent. It's also the kind of thing that's satisfying to point at during the live session.

### Schema

\-- app schema

users(id uuid pk, email citext unique, password\_hash text, created\_at timestamptz)

conversations(id uuid pk, user\_id uuid fk-\>users on delete cascade,

              title text, created\_at timestamptz, updated\_at timestamptz)

  index (user\_id, updated\_at desc)

messages(id uuid pk, conversation\_id uuid fk-\>conversations on delete cascade,

         seq int not null,              \-- monotonic per conversation

         role text,                     \-- user | assistant

         content text,

         status text,                   \-- streaming | complete | stopped | error

         created\_at timestamptz)

  unique (conversation\_id, seq)

tool\_calls(id uuid pk, message\_id uuid fk-\>messages on delete cascade,

           tool\_name text, arguments jsonb, result jsonb,

           row\_count int, duration\_ms int, error text, created\_at timestamptz)

usage\_events(id uuid pk, user\_id uuid fk, message\_id uuid null,

             model text, prompt\_tokens int, completion\_tokens int,

             cost\_usd numeric(12,6), estimated bool, created\_at timestamptz)

  index (user\_id, created\_at desc)

\-- financials schema (from provided dump)

company\_financials(company, ticker, sector, year,

                   revenue, gross\_profit, operating\_income, net\_income)

The `seq` column is what makes S5 (refresh mid-conversation) deterministic — never order by `created_at` alone, timestamps collide.

### Redis

- **Usage window counter**: `usage:{userId}:{windowStart}` → float, `TTL = window seconds`. Fast atomic `INCRBYFLOAT`, and expiry gives you the fixed-window reset for free.  
- **Sessions**: `session:{token}` → userId, TTL \= session lifetime. Enables real logout/revocation.  
- Optional: cache identical SQL results within a window.

`usage_events` in Postgres is the durable ledger; Redis is the hot counter. If Redis is flushed you can rebuild the window from Postgres. Say this in the README — it shows you know Redis is volatile.

---

## 3\. Grounding design (40% of the grade lives here)

### The SQL tool

Let the model write real SQL — showing actual SQL in the tool-call card is more impressive than showing opaque JSON args — but run it through a hard gate:

execute\_financial\_query(sql: string, rationale: string)

Validator, before execution:

1. Single statement only (reject anything after the first `;`)  
2. Must parse as a `SELECT` (or `WITH … SELECT`)  
3. Referenced tables must be in an allowlist (`financials.company_financials`)  
4. Auto-append `LIMIT 200` if absent  
5. Execute on the read-only pool with `SET LOCAL statement_timeout = '5s'`  
6. Return `{ columns, rows, rowCount, durationMs }`

The read-only role means even a validator bypass can't write. Belt and braces.

### Second tool: coverage

get\_data\_coverage()  →  { tickers: \[...48\], companies: \[...\], years: \[2022..2025\], metrics: \[...\] }

Better still: inject a compact coverage summary (48 tickers \+ year range \+ metric names, a few hundred tokens) directly into the system prompt at conversation start. The model then knows the boundary **before** it queries, so S2 ("Tesla in 2019") resolves without a wasted round trip and with no chance of a confident guess.

### Five anti-hallucination layers

1. **System prompt**: state explicitly that the model has no knowledge of company financials and must treat its own priors as unreliable; every figure must come from a tool result in this conversation.  
2. **Coverage in context** — the model knows what it doesn't have.  
3. **Forced tool use** on any question involving a figure (`toolChoice: 'required'` on the first step of a financial turn).  
4. **Empty-result contract**: zero rows ⇒ the model must say the data isn't available and name what's missing (company? year? metric?). Give it a worked example in the prompt.  
5. **Provenance in the UI**: the tool-call card shows the SQL and row count. A grader can verify any number against the query that produced it — which is exactly what they'll try to do.

### Tables and charts

Instruct the model to emit a Markdown table for any multi-row result, and for trends/comparisons additionally emit a fenced block:

\`\`\`chart

{ "type": "bar", "x": "year", "series": \["revenue","net\_income"\],

  "data": \[...\], "title": "Apple revenue vs net income" }

\`\`\`

Front end uses `react-markdown` \+ `remark-gfm` for tables, with a custom code-block renderer that intercepts `lang === "chart"` and renders Recharts. Guard it: only parse the JSON once the fence closes, and fall back to showing the raw block if parsing fails — a half-streamed chart spec must never crash the message.

---

## 4\. Streaming protocol

Stream parts the client must handle (AI SDK names; mirror these if using FastAPI \+ SSE):

| Part | Payload | UI effect |
| :---- | :---- | :---- |
| `text-delta` | token | append to bubble |
| `tool-input-start` | tool name | tool card appears, "Querying…" |
| `tool-input-delta` | partial args | SQL types out live |
| `tool-output-available` | rows, rowCount, ms | card flips to result, collapsible |
| `tool-output-error` | error | card shows failure |
| `finish` | usage, cost, remaining budget | update budget indicator |
| `error` | friendly message | inline error state |

Letting the SQL *type itself out* character by character in the tool card is a cheap, high-impact UI moment. It directly satisfies "visibly rendered as it happens" and looks great in a demo.

---

## 5\. Usage limits and stop — the two that break people

These are the same code path, so build them together.

### The core rule

**Accounting runs in a `finally`, not in the success path.** Whatever happens — completion, user abort, client disconnect, upstream error — the server persists the partial assistant message and records cost. If you attach persistence to the "stream finished" callback, S3 fails silently.

try {

  for await (part of stream) { accumulate(part); yield part }

} catch (AbortError) {

  status \= 'stopped'

} finally {

  persistMessage(accumulatedText, status)   // partial text preserved

  persistToolCalls(accumulatedToolCalls)

  cost \= usage ? priceFrom(usage) : estimateFromTokenizer(accumulated)

  await redis.incrbyfloat(windowKey, cost)

  await db.insert(usage\_events, { cost, estimated: \!usage })

}

**The gotcha:** on abort, OpenAI never sends the final usage chunk. Count the accumulated output with `gpt-tokenizer` / `tiktoken` and flag the row `estimated = true`. Most candidates either bill $0 for stopped responses or crash here — handling it deliberately is a visible differentiator.

Never reconstruct the partial message from what the client sends back. The client may have closed the tab.

### Limit enforcement

- Guard runs **before** any LLM call: read `usage:{userId}:{window}`, compare to `USAGE_LIMIT_USD`.  
- Over limit → `429` with `{ error: "limit_exceeded", resetsAt, limit, spent }`. Front end renders a friendly inline notice with a live countdown to reset — never a raw error toast (S4 explicitly grades this).  
- Window start \= `floor(now / windowSeconds) * windowSeconds`. Fixed window, as specified.  
- Config: `USAGE_LIMIT_USD=1.00`, `USAGE_WINDOW_SECONDS=3600` in `.env`, documented in the README with the $0.001 / 180s test values called out.  
- Show remaining budget persistently in the UI header. Small touch, reads as product thinking.

---

## 6\. Auth and isolation

- Email \+ password, **argon2id** hashing (bcrypt is acceptable; never plain SHA).  
- **Session token in an httpOnly, SameSite=Lax cookie**, backed by Redis. Simpler than JWT refresh rotation and immune to XSS token theft. A take-home doesn't need stateless scaling.  
- A single `AuthGuard` populates `req.userId`. **Every conversation/message repository method takes `userId` as a required argument** — there is no code path that can read a conversation without scoping. Don't check ownership ad hoc in controllers; make it impossible at the data layer.  
- Requesting another user's conversation returns `404`, not `403` (don't leak existence).  
- Section 7 says they may build on the auth layer live, so keep it boring and legible.

---

## 7\. Phased plan

Roughly 5–6 focused days. Order matters — each phase leaves the app runnable.

**Phase 0 — Infra (½ day)** docker-compose (postgres \+ redis, healthchecks, named volumes). Idempotent loader script that creates both schemas, runs the DDL, streams the COPY block, creates the `readonly_agent` role, and verifies 192 rows. `.env.example`. Skeleton FE/BE that boot. ✔ `docker compose up` then one command loads data and prints a row count.

**Phase 1 — Auth (½ day)** Register, login, logout, session guard, `GET /me`. Protected-route wrapper on the front end. ✔ Two users can register; neither sees anything of the other's.

**Phase 2 — Conversations (1 day)** CRUD scoped by userId. `seq`\-ordered message persistence. Sidebar with list, select, delete-with-confirmation-modal. Full history reload on mount. ✔ **S5** and **S6** pass before any LLM code exists — these are pure CRUD and are much easier to get right while the surface is small.

**Phase 3 — Grounding (1 day)** Read-only pool, SQL validator, both tools, system prompt with coverage. Test non-streaming first via curl/REST — verify correctness before adding streaming complexity. ✔ **S1** and **S2** answer correctly as plain JSON responses.

**Phase 4 — Streaming \+ stop (1 day)** Wire the stream protocol. `ToolCallCard` with live-typing SQL. Markdown renderer with tables and the chart block. AbortController \+ stop button. `finally`\-block persistence and token estimation. ✔ **S3** passes: partial text saved, visible after refresh, cost recorded.

**Phase 5 — Usage limits (½ day)** Redis counter, pre-flight guard, cost calculation, friendly 429 UI with countdown, budget indicator. ✔ **S4** passes at `$0.001 / 180s`, then reset to defaults.

**Phase 6 — Polish (1 day)** This is 25% of the grade — treat it as a real phase, not leftover time. Auto-scroll that respects manual scroll-up. Skeleton/typing indicator. Empty state with example prompts (steer graders toward S1/S2). Keyboard shortcuts (Enter/Shift+Enter, ⌘K new chat). Responsive layout. Focus states, transitions. Auto-generated conversation titles from the first message. Dark mode if time allows.

**Phase 7 — Docs \+ verification (½ day)** README: prerequisites, compose up, data load, env vars (with the usage-limit/reset table), run FE \+ BE, and a walkthrough of S1–S6 with copy-pasteable example prompts. Then run all six scenarios from a clean clone on a clean volume.

---

## 8\. Risk register

| Risk | Mitigation |
| :---- | :---- |
| Cost not deducted on stop (S3) | `finally`\-block accounting \+ tokenizer estimate. Build in Phase 4, test explicitly. |
| Model answers from memory instead of SQL | Forced tool use \+ coverage in prompt \+ explicit "your priors are unreliable" instruction. Test with a 2019 question and a fake ticker. |
| Chart JSON parsed mid-stream → crash | Only parse on closed fence; try/catch with raw-block fallback. |
| Duplicate messages on refresh (S5) | Client-generated message UUID \+ unique `(conversation_id, seq)`. |
| SQL injection via prompt injection | Read-only role \+ SELECT-only validator \+ table allowlist \+ statement timeout. |
| Streaming works locally, buffers behind a proxy | Set `X-Accel-Buffering: no`, `Cache-Control: no-cache`, flush per chunk. |
| $10 key drained by test loops | Use `gpt-4o-mini` or similar for iteration; cap `maxSteps`; log per-request cost from day one (you're building the meter anyway). |
| Can't explain the code live | After each phase, delete AI-generated comments and re-read the diff. If a file surprises you, rewrite it. |

## 9\. Live-session prep

They will ask you to walk the design and extend it. Be ready to explain, without notes:

- Why two DB roles, and what attack the read-only pool stops  
- The exact lifecycle of an aborted stream, from click to persisted row  
- Why fixed window and not sliding, and what changes if they ask for sliding  
- How the tool-call parts travel from OpenAI through your server to a React component  
- Where you'd add a new tool (e.g. sector aggregates) — likely the extension they ask for

Rehearse adding one small feature end to end. The most probable asks: a new metric or tool, sector-level aggregation, per-user configurable limits in the DB, or conversation renaming.  
