import { Injectable } from '@nestjs/common'
import { createOpenAI } from '@ai-sdk/openai'
import { ILlmProvider } from '../llm-provider.interface.js'

/**
 * OpenAI provider implementation.
 * Uses GPT-4o and GPT-4o-mini models via OpenAI API.
 */
@Injectable()
export class OpenAIProvider implements ILlmProvider {
  private readonly client = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
  })

  getModel(modelName: string) {
    return this.client(modelName)
  }
}
