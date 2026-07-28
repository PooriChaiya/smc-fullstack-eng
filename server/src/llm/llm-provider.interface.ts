/**
 * Interface for LLM providers (OpenAI, Claude, Grok, etc.).
 * All providers implement this to work with the ChatService.
 */
export interface ILlmProvider {
  /**
   * Get a language model instance for streaming with tools.
   * @param modelName - Model identifier (e.g., "gpt-4o", "claude-3-5-sonnet")
   */
  getModel(modelName: string): LanguageModel
}

/**
 * A language model compatible with Vercel AI SDK's streamText.
 * This is essentially the return type of provider(modelName) functions.
 */
export type LanguageModel = ReturnType<ReturnType<typeof import('@ai-sdk/openai')['createOpenAI']>>
