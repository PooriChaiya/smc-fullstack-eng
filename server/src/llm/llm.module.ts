import { Module } from '@nestjs/common'
import { LlmService } from './llm.service.js'
import { FinancialsModule } from '../financials/financials.module.js'

@Module({
  imports: [FinancialsModule],
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmModule {}
