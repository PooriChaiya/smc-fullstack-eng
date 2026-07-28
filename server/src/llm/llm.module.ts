import { Module } from '@nestjs/common'
import { LlmService } from './llm.service.js'
import { OpenAIProvider } from './providers/openai.provider.js'
import { LlmProviderFactory } from './providers/llm-provider.factory.js'
import { FinancialsModule } from '../financials/financials.module.js'

@Module({
  imports: [FinancialsModule],
  providers: [LlmService, OpenAIProvider, LlmProviderFactory],
  exports: [LlmService, LlmProviderFactory],
})
export class LlmModule {}
