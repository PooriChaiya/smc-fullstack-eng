import { Module } from '@nestjs/common'
import { ChatController } from './chat.controller.js'
import { ChatService } from './chat.service.js'
import { ChatRepository } from './chat.repository.js'
import { ConversationsModule } from '../conversations/conversations.module.js'
import { LlmModule } from '../llm/llm.module.js'
import { RedisModule } from '../redis/redis.module.js'

@Module({
  imports: [ConversationsModule, LlmModule, RedisModule],
  controllers: [ChatController],
  providers: [ChatService, ChatRepository],
  exports: [ChatService],
})
export class ChatModule {}
