import { Injectable, HttpException, HttpStatus, Inject } from '@nestjs/common'
import pg from 'pg'

// gpt-4o-mini pricing per 1M tokens (USD). Change here if the model changes.
const PRICE_INPUT_PER_M = 0.15
const PRICE_OUTPUT_PER_M = 0.6

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
}

@Injectable()
export class UsageService {
  constructor(
    @Inject('REDIS') private redis: any,
    @Inject('DATABASE_POOL') private db: pg.Pool,
  ) {}

  private get windowSeconds(): number {
    return Number(process.env.USAGE_WINDOW_SECONDS ?? 3600)
  }

  private get limitUsd(): number {
    return Number(process.env.USAGE_LIMIT_USD ?? 1)
  }

  // Fixed-window start in seconds: floor(now / window) * window.
  windowStart(nowMs = Date.now()): number {
    const w = this.windowSeconds
    return Math.floor(nowMs / 1000 / w) * w
  }

  private key(userId: string, windowStart = this.windowStart()): string {
    return `usage:${userId}:${windowStart}`
  }

  async getUsage(userId: string) {
    const ws = this.windowStart()
    const raw = await this.redis.get(this.key(userId, ws))
    const spent = raw ? Number(raw) : 0
    return {
      limit: this.limitUsd,
      spent: Number(spent.toFixed(6)),
      resetsAt: new Date((ws + this.windowSeconds) * 1000).toISOString(),
      windowSeconds: this.windowSeconds,
    }
  }

  // Pre-flight guard: throws 429 if the user is over budget. Call before any
  // LLM cost is incurred.
  async assertUnderLimit(userId: string) {
    const usage = await this.getUsage(userId)
    if (usage.spent >= usage.limit) {
      throw new HttpException(
        { error: 'limit_exceeded', ...usage },
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
    return usage
  }

  // Hot counter (Redis, atomic INCRBYFLOAT) + durable ledger (Postgres).
  // If Redis is flushed, the window can be rebuilt from usage_events.
  async record(
    userId: string,
    messageId: string | null,
    costUsd: number,
    estimated: boolean,
    tokens?: TokenUsage,
  ) {
    const ws = this.windowStart()
    const k = this.key(userId, ws)
    await this.redis.incrbyfloat(k, costUsd)
    await this.redis.expire(k, this.windowSeconds)
    await this.db.query(
      `INSERT INTO app.usage_events
         (user_id, message_id, model, prompt_tokens, completion_tokens, cost_usd, estimated)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, messageId, 'gpt-4o-mini', tokens?.promptTokens ?? null, tokens?.completionTokens ?? null, costUsd, estimated],
    )
  }

  // Cost from real usage tokens reported in the finish chunk (estimated = false).
  costFromUsage(tokens: TokenUsage): number {
    const cost =
      (tokens.promptTokens / 1_000_000) * PRICE_INPUT_PER_M +
      (tokens.completionTokens / 1_000_000) * PRICE_OUTPUT_PER_M
    return Number(cost.toFixed(6))
  }
}
