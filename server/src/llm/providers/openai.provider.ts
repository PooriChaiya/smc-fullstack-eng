import { Injectable } from '@nestjs/common'
import { createOpenAI } from '@ai-sdk/openai'
import { ILlmProvider, LlmModelOptions } from '../llm-provider.interface.js'

/**
 * OpenAI provider implementation.
 * Uses GPT-4o and GPT-4o-mini models via OpenAI API.
 */
@Injectable()
export class OpenAIProvider implements ILlmProvider {
  private readonly defaultClient = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
  })

  private readonly nonRetryingClient = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
    fetch: this.createNonRetryingFetch(),
  })

  getModel(modelName: string, options: LlmModelOptions = {}) {
    const client = options.nonRetrying ? this.nonRetryingClient : this.defaultClient
    return client(modelName)
  }

  private createNonRetryingFetch() {
    return async (input: Request | string | URL, init?: RequestInit) => {
      const response = await fetch(input, init)
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new Error(`HTTP ${response.status}: ${body || response.statusText}`)
      }
      return response
    }
  }
}
