-- Durable usage ledger. The hot per-window counter lives in Redis
-- (usage:{userId}:{windowStart} -> float, TTL = window seconds); this table
-- is the durable source so a Redis flush can be rebuilt from.
-- Created at runtime by UsageService.onModuleInit (self-healing); kept here
-- as human-readable documentation of the canonical schema.

CREATE TABLE IF NOT EXISTS app.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  message_id uuid,
  model text,
  prompt_tokens int,
  completion_tokens int,
  cost_usd numeric(12,6) NOT NULL,
  estimated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_user
  ON app.usage_events(user_id, created_at DESC);
