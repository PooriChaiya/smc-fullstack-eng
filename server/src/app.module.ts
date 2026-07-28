import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
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
    ThrottlerModule.forRoot([{
      ttl: 60000, // 1 minute
      limit: 20, // 20 requests per minute
    }]),
    DatabaseModule,
    RedisModule,
    AuthModule,
    ConversationsModule,
    FinancialsModule,
    ChatModule,
    UsageModule,
    HealthModule,
  ],
  // works when ThrottlerGuard is applied. Register globally.
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
