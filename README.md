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


## Environment Variables

Copy `.env.example` to `.env` and fill in:
- `OPENAI_API_KEY` — required for LLM features

Usage limits:
- `USAGE_LIMIT_USD=1.00` — per-user budget per window
- `USAGE_WINDOW_SECONDS=3600` — window duration (fixed)

## Notes / troubleshooting

- **Backend dev runner**: `npm run dev` uses `node --import @swc-node/register --watch`, not `tsx`. SWC emits the `design:paramtypes` metadata NestJS needs for constructor DI; `tsx`/esbuild silently drops it, which breaks class-type injection (e.g. `AuthService` into `AuthController`) in dev. `reflect-metadata` is imported in `main.ts`. `tsx` is still used by `npm run load-data` (no DI there).
- **Two Redis on :6379**: if a local Redis (e.g. Homebrew `redis-server`) is bound to `localhost:6379`, it shadows the Docker container and the app writes there instead. `brew services stop redis` (or `redis-cli shutdown`) to use the container.
