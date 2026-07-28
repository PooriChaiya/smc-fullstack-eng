import { Injectable, Inject } from '@nestjs/common'
import { ILlmProvider } from '../llm-provider.interface.js'
import { OpenAIProvider } from './openai.provider.js'

/**
 * Provider types supported by the application.
 */
export type LlmProviderType = 'openai' | 'anthropic' | 'x-ai' // extendable

/**
 * Factory for creating LLM providers based on configuration.
 * Add new providers here by implementing ILlmProvider.
 */
@Injectable()
export class LlmProviderFactory {
  constructor(
    @Inject(OpenAIProvider) private openai: OpenAIProvider,
    // @Inject(AnthropicProvider) private anthropic: AnthropicProvider, // future
    // @Inject(XAIProvider) private xai: XAIProvider, // future
  ) {}

  /**
   * Get the configured LLM provider based on LLM_PROVIDER env var.
   * Defaults to 'openai'.
   */
  getProvider(): ILlmProvider {
    const providerType = (process.env.LLM_PROVIDER || 'openai') as LlmProviderType

    switch (providerType) {
      case 'openai':
        return this.openai
      // case 'anthropic':
      //   return this.anthropic
      // case 'x-ai':
      //   return this.xai
      default:
        throw new Error(`Unsupported LLM provider: ${providerType}`)
    }
  }

  /**
   * Get the default model name for the configured provider.
   */
  getDefaultModel(): string {
    const providerType = (process.env.LLM_PROVIDER || 'openai') as LlmProviderType

    switch (providerType) {
      case 'openai':
        return process.env.OPENAI_MODEL || 'gpt-4o'
      // case 'anthropic':
      //   return process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022'
      // case 'x-ai':
      //   return process.env.XAI_MODEL || 'grok-beta'
      default:
        throw new Error(`Unsupported LLM provider: ${providerType}`)
    }
  }
}
