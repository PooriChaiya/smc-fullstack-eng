import { Module } from '@nestjs/common'
import { UsageService } from './usage.service.js'
import { UsageController } from './usage.controller.js'
import { DatabaseModule } from '../database/database.module.js'

@Module({
  imports: [DatabaseModule],
  controllers: [UsageController],
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}
