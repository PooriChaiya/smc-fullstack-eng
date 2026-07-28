import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from './auth/auth.module.js'
import { HealthModule } from './health/health.module.js'
import { DatabaseModule } from './database/database.module.js'
import { RedisModule } from './redis/redis.module.js'
import { ConversationsModule } from './conversations/conversations.module.js'
import { FinancialsModule } from './financials/financials.module.js'
import { ChatModule } from './chat/chat.module.js'
import { UsageModule } from './usage/usage.module.js'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../.env' }),
    DatabaseModule,
    RedisModule,
    AuthModule,
    ConversationsModule,
    FinancialsModule,
    ChatModule,
    UsageModule,
    HealthModule,
  ],
})
export class AppModule {}
