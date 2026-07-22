import { Injectable, Inject, NotFoundException } from '@nestjs/common'
import pg from 'pg'

const { Pool } = pg

@Injectable()
export class ConversationsRepository {
  constructor(@Inject('DATABASE_POOL') private db: pg.Pool) {}

  async create(userId: string, title?: string) {
    const { rows } = await this.db.query(
      `INSERT INTO app.conversations (user_id, title)
       VALUES ($1, $2)
       RETURNING id, title, created_at, updated_at`,
      [userId, title || null]
    )
    return rows[0]
  }

  async findAll(userId: string) {
    const { rows } = await this.db.query(
      `SELECT id, title, created_at, updated_at
       FROM app.conversations
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [userId]
    )
    return rows
  }

  async findOne(id: string, userId: string) {
    const { rows } = await this.db.query(
      `SELECT id, title, created_at, updated_at
       FROM app.conversations
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    )
    if (rows.length === 0) {
      throw new NotFoundException('Conversation not found')
    }
    return rows[0]
  }

  async delete(id: string, userId: string) {
    const result = await this.db.query(
      `DELETE FROM app.conversations
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, userId]
    )
    if (result.rows.length === 0) {
      throw new NotFoundException('Conversation not found')
    }
  }

  // Next sequence number for a conversation
  async nextSeq(conversationId: string): Promise<number> {
    const { rows } = await this.db.query(
      `SELECT COALESCE(MAX(seq), -1) + 1 as next_seq FROM app.messages WHERE conversation_id = $1`,
      [conversationId]
    )
    return rows[0].next_seq
  }
}
