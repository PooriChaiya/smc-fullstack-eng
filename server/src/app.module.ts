import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from './auth/auth.module.js'
import { HealthModule } from './health/health.module.js'
import { DatabaseModule } from './database/database.module.js'
import { RedisModule } from './redis/redis.module.js'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    RedisModule,
    AuthModule,
    HealthModule,
  ],
})
export class AppModule {}
