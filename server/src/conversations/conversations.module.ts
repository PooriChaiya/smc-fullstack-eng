import { Module } from '@nestjs/common'
import { ConversationsController } from './conversations.controller.js'
import { ConversationsService } from './conversations.service.js'
import { ConversationsRepository } from './conversations.repository.js'
import { MessagesRepository } from './messages.repository.js'
import { DatabaseModule } from '../database/database.module.js'

@Module({
  imports: [DatabaseModule],
  controllers: [ConversationsController],
  providers: [ConversationsService, ConversationsRepository, MessagesRepository],
  exports: [ConversationsService, ConversationsRepository, MessagesRepository],
})
export class ConversationsModule {}
