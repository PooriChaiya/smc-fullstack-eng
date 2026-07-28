import { Injectable, Inject } from '@nestjs/common'
import pg from 'pg'

interface CreateMessageDto {
  conversationId: string
  seq: number
  role: 'user' | 'assistant'
  content: string
  status?: 'streaming' | 'complete' | 'stopped' | 'error'
}

interface CreateToolCallDto {
  messageId: string
  toolName: string
  arguments?: Record<string, unknown>
  result?: Record<string, unknown>
  rowCount?: number
  durationMs?: number
  error?: string
}

@Injectable()
export class MessagesRepository {
  constructor(@Inject('DATABASE_POOL') private db: pg.Pool) {}

  async create(dto: CreateMessageDto) {
    const { rows } = await this.db.query(
      `INSERT INTO app.messages (conversation_id, seq, role, content, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, conversation_id, seq, role, content, status, created_at`,
      [dto.conversationId, dto.seq, dto.role, dto.content, dto.status || 'complete']
    )
    return rows[0]
  }

  async updateStatus(messageId: string, status: 'streaming' | 'complete' | 'stopped' | 'error') {
    const { rows } = await this.db.query(
      `UPDATE app.messages SET status = $2 WHERE id = $1 RETURNING id`,
      [messageId, status]
    )
    return rows[0]
  }

  async updateContent(messageId: string, content: string) {
    const { rows } = await this.db.query(
      `UPDATE app.messages SET content = $2 WHERE id = $1 RETURNING id`,
      [messageId, content]
    )
    return rows[0]
  }

  async findByConversation(conversationId: string, userId: string) {
    // Ownership check via conversation
    const { rows } = await this.db.query(
      `SELECT m.id, m.conversation_id, m.seq, m.role, m.content, m.status, m.created_at,
              jsonb_agg(
                jsonb_build_object(
                  'id', tc.id,
                  'messageId', tc.message_id,
                  'tool_name', tc.tool_name,
                  'arguments', tc.arguments,
                  'result', tc.result,
                  'row_count', tc.row_count,
                  'duration_ms', tc.duration_ms,
                  'error', tc.error,
                  'createdAt', tc.created_at
                ) ORDER BY tc.created_at
              ) FILTER (WHERE tc.id IS NOT NULL) as tool_calls
       FROM app.messages m
       INNER JOIN app.conversations c ON c.id = m.conversation_id
       LEFT JOIN app.tool_calls tc ON tc.message_id = m.id
       WHERE m.conversation_id = $1 AND c.user_id = $2
       GROUP BY m.id, m.conversation_id, m.seq, m.role, m.content, m.status, m.created_at
       ORDER BY m.seq ASC`,
      [conversationId, userId]
    )
    return rows
  }

  async createToolCall(dto: CreateToolCallDto) {
    const { rows } = await this.db.query(
      `INSERT INTO app.tool_calls (message_id, tool_name, arguments, result, row_count, duration_ms, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, message_id, tool_name, arguments, result, row_count, duration_ms, error, created_at`,
      [dto.messageId, dto.toolName, dto.arguments ?? null, dto.result ?? null, dto.rowCount ?? null, dto.durationMs ?? null, dto.error ?? null]
    )
    return rows[0]
  }
}
