import { Module } from '@nestjs/common'
import { ChatController } from './chat.controller.js'
import { ChatService } from './chat.service.js'
import { ConversationsModule } from '../conversations/conversations.module.js'
import { LlmModule } from '../llm/llm.module.js'
import { RedisModule } from '../redis/redis.module.js'
import { UsageModule } from '../usage/usage.module.js'

@Module({
  imports: [ConversationsModule, LlmModule, RedisModule, UsageModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
