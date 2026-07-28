import { Injectable } from '@nestjs/common'
import { ConversationsRepository } from './conversations.repository.js'
import { MessagesRepository } from './messages.repository.js'

@Injectable()
export class ConversationsService {
  constructor(
    private conversationsRepo: ConversationsRepository,
    private messagesRepo: MessagesRepository,
  ) {}

  async create(userId: string, title?: string) {
    return this.conversationsRepo.create(userId, title)
  }

  async findAll(userId: string) {
    return this.conversationsRepo.findAll(userId)
  }

  async findOne(id: string, userId: string) {
    const conversation = await this.conversationsRepo.findOne(id, userId)
    const messages = await this.messagesRepo.findByConversation(id, userId)
    return { ...conversation, messages }
  }

  async delete(id: string, userId: string) {
    return this.conversationsRepo.delete(id, userId)
  }

  getMessages(id: string, userId: string) {
    return this.messagesRepo.findByConversation(id, userId)
  }

  // Auto-generate a title from the first user message (idempotent: no-op once set).
  async setTitleIfEmpty(id: string, userId: string, title: string) {
    return this.conversationsRepo.setTitleIfEmpty(id, userId, title)
  }

  // Add a user message to a conversation
  async addUserMessage(conversationId: string, userId: string, content: string) {
    // Verify ownership via findOne (will throw 404 if not owned)
    await this.conversationsRepo.findOne(conversationId, userId)
    return this.messagesRepo.create({
      conversationId,
      role: 'user',
      content,
      status: 'complete',
    })
  }

  // Create a placeholder assistant message for streaming
  async createAssistantMessage(conversationId: string, userId: string) {
    await this.conversationsRepo.findOne(conversationId, userId)
    return this.messagesRepo.create({
      conversationId,
      role: 'assistant',
      content: '',
      status: 'streaming',
    })
  }
}
