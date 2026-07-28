-- Conversations, messages, and tool_calls tables
-- Run as the app user (not readonly_agent)

CREATE TABLE IF NOT EXISTS app.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON app.conversations(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS app.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES app.conversations(id) ON DELETE CASCADE,
  seq INT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('streaming', 'complete', 'stopped', 'error')) DEFAULT 'complete',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conversation_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_seq ON app.messages(conversation_id, seq);

CREATE TABLE IF NOT EXISTS app.tool_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES app.messages(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  arguments jsonb,
  result jsonb,
  row_count INT,
  duration_ms INT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tool_calls_message ON app.tool_calls(message_id);

-- Trigger to update updated_at on conversations
CREATE OR REPLACE FUNCTION app.update_conversation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE app.conversations SET updated_at = NOW() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_conversation_updated_at ON app.messages;
CREATE TRIGGER trg_update_conversation_updated_at
  AFTER INSERT OR UPDATE OF status ON app.messages
  FOR EACH ROW
  EXECUTE FUNCTION app.update_conversation_updated_at();
