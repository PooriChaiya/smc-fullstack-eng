import { Injectable } from '@nestjs/common'
import { streamText } from 'ai'
import type { ModelMessage } from '@ai-sdk/provider-utils'
import * as tiktoken from 'gpt-tokenizer'
import { LlmService } from '../llm/llm.service.js'
import { ConversationsService } from '../conversations/conversations.service.js'
import { MessagesRepository } from '../conversations/messages.repository.js'
import { UsageService, TokenUsage } from '../usage/usage.service.js'
import { LlmProviderFactory } from '../llm/providers/llm-provider.factory.js'

export type StreamPartType =
  | 'text-delta'
  | 'tool-input-start'
  | 'tool-input-delta'
  | 'tool-output-available'
  | 'tool-output-error'
  | 'finish'
  | 'error'

export interface StreamChunk {
  type: StreamPartType
  data?: unknown
}

interface ToolCallData {
  toolCallId: string
  toolName: string
  args: string
  result?: unknown
  error?: string
  rowCount?: number
  durationMs?: number
}

@Injectable()
export class ChatService {
  constructor(
    private llm: LlmService,
    private conversations: ConversationsService,
    private messagesRepo: MessagesRepository,
    private usage: UsageService,
    private llmProvider: LlmProviderFactory,
  ) {}

  async streamChat(
    conversationId: string,
    userId: string,
    userMessage: string,
    onChunk: (chunk: StreamChunk) => void,
    signal?: AbortSignal,
  ) {
    // 1. Persist user message
    await this.conversations.addUserMessage(conversationId, userId, userMessage)
    await this.conversations.setTitleIfEmpty(conversationId, userId, userMessage.slice(0, 60).trim())

    // 2. Create assistant placeholder
    const assistantMsg = await this.conversations.createAssistantMessage(conversationId, userId)

    // 3. Load conversation history
    const messages = await this.buildMessages(conversationId, userId)

    let accumulatedText = ''
    const toolCalls: ToolCallData[] = []
    let status: 'complete' | 'error' | 'stopped' = 'complete'
    let finishTokens: TokenUsage | null = null
    const MAX_LOOPS = 5

    try {
      // 4. Tool-calling loop
      for (let loop = 0; loop < MAX_LOOPS; loop++) {

        const toolsDef = this.llm.getTools()

        const result = await streamText({
          model: this.llmProvider.getProvider().getModel(
            this.llmProvider.getDefaultModel(),
            { nonRetrying: true },
          ),
          system: await this.llm.getSystemPrompt(),
          messages,
          tools: toolsDef as any,
          abortSignal: signal,
        })

        // Stream chunks and collect tool calls
        for await (const chunk of result.fullStream) {
          switch (chunk.type) {
            case 'text-delta':
              accumulatedText += chunk.text
              onChunk({ type: 'text-delta', data: chunk.text })
              break

            case 'tool-call':
              const tc = chunk as any
              const existing = toolCalls.find(x => x.toolCallId === tc.toolCallId)
              if (existing && (!existing.args || existing.args === '{}')) {
                existing.args = JSON.stringify(tc.args || tc.input || {})
              }
              break

            case 'tool-input-start':
              toolCalls.push({
                toolCallId: chunk.id,
                toolName: chunk.toolName,
                args: '',
              })
              onChunk({ type: 'tool-input-start', data: { toolCallId: chunk.id, toolName: chunk.toolName } })
              break

            case 'tool-input-delta':
              const tc2 = toolCalls.find(x => x.toolCallId === chunk.id)
              if (tc2) {
                tc2.args += chunk.delta
                onChunk({ type: 'tool-input-delta', data: { toolCallId: chunk.id, argsDelta: chunk.delta } })
              }
              break

            case 'tool-input-end':
              break

            case 'finish':
              finishTokens = {
                promptTokens: (chunk as any).totalUsage?.inputTokens ?? 0,
                completionTokens: (chunk as any).totalUsage?.outputTokens ?? 0,
              }
              break

            case 'error':
              onChunk({ type: 'error', data: { message: (chunk as any).error?.message } })
              break
          }
        }

        // 5. Execute tools and collect results (filter current loop: calls without result yet)
        const pendingCalls = toolCalls.filter(tc => !tc.result && !tc.error)
        if (pendingCalls.length === 0) break

        const toolCallParts: Array<{ type: 'tool-call'; toolCallId: string; toolName: string; input: any }> = []
        const toolResultParts: Array<{ type: 'tool-result'; toolCallId: string; toolName: string; output: { type: 'json'; value: any } }> = []

        for (const tc of pendingCalls) {

          let parsedArgs: Record<string, unknown>
          try {
            parsedArgs = JSON.parse(tc.args || '{}')
          } catch (e) {
            parsedArgs = {}
          }
          const result = await this.llm.executeToolCall(tc.toolName, parsedArgs)

          // Update tool call data
          tc.result = result.result
          tc.error = result.error
          tc.rowCount = result.rowCount
          tc.durationMs = result.durationMs

          // Emit to client
          if (result.error) {
            onChunk({ type: 'tool-output-error', data: { toolCallId: tc.toolCallId, error: result.error } })
          } else {
            onChunk({ type: 'tool-output-available', data: { toolCallId: tc.toolCallId, result: result.result, rowCount: result.rowCount } })
          }

          // Persist tool call
          await this.messagesRepo.createToolCall({
            messageId: assistantMsg.id,
            toolName: tc.toolName,
            arguments: parsedArgs,
            result: result.result as Record<string, unknown> | undefined,
            rowCount: result.rowCount,
            durationMs: result.durationMs,
            error: result.error,
          })

          // Add to message parts for next loop
          toolCallParts.push({ type: 'tool-call', toolCallId: tc.toolCallId, toolName: tc.toolName, input: parsedArgs })
          const resultValue = result.error ? { error: result.error } : (result.result ?? {})
          toolResultParts.push({ type: 'tool-result', toolCallId: tc.toolCallId, toolName: tc.toolName, output: { type: 'json', value: resultValue } })
        }

        // Add tool calls + results to message history
        messages.push({ role: 'assistant', content: toolCallParts } as any)
        messages.push({ role: 'tool', content: toolResultParts } as any)
      }

      onChunk({ type: 'finish', data: { usage: finishTokens } })
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'name' in e && e.name === 'AbortError') {
        status = 'stopped'
      } else {
        status = 'error'
        onChunk({ type: 'error', data: { message: e instanceof Error ? e.message : 'Unknown error' } })
      }
    } finally {
      // 6. Persist assistant message
      // Only store text content. Tool calls are persisted separately in tool_calls table.
      // If LLM didn't generate text (empty after tool results), that's a partial response — still OK.
      const content = accumulatedText || ''

      await this.messagesRepo.updateContent(assistantMsg.id, content)
      await this.messagesRepo.updateStatus(assistantMsg.id, status)

      // Cost tracking
      let costUsd: number
      let estimated: boolean
      if (finishTokens) {
        costUsd = this.usage.costFromUsage(finishTokens)
        estimated = false
      } else {
        const promptTokens = messages.reduce(
          (sum, m) => sum + (typeof m.content === 'string' ? tiktoken.encode(m.content).length : 0),
          0,
        )
        const completionTokens = tiktoken.encode(accumulatedText).length
        costUsd = this.usage.costFromUsage({ promptTokens, completionTokens })
        estimated = true
      }
      await this.usage.record(userId, assistantMsg.id, costUsd, estimated, finishTokens ?? undefined)
    }
  }

  /**
   * Build ModelMessage[] from conversation history.
   * Reconstructs tool calls and results from persisted JSON.
   */
  private async buildMessages(conversationId: string, userId: string): Promise<ModelMessage[]> {
    const conversation = await this.conversations.findOne(conversationId, userId)
    const messages: ModelMessage[] = []

    for (const m of conversation.messages || []) {
      // Check for persisted tool calls (stored as JSON array)
      if (m.role === 'assistant' && m.content) {
        try {
          const parsed = JSON.parse(m.content)
          if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].toolCallId) {
            // Reconstruct tool calls
            const toolCallParts = parsed.map((tc: any) => ({
              type: 'tool-call' as const,
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              input: JSON.parse(tc.args || '{}'),
            }))
            messages.push({ role: 'assistant', content: toolCallParts } as any)

            // Reconstruct tool results
            const toolResultParts = parsed.map((tc: any) => ({
              type: 'tool-result' as const,
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              output: { type: 'json' as const, value: tc.error ? { error: tc.error } : (tc.result ?? {}) },
            }))
            messages.push({ role: 'tool', content: toolResultParts } as any)
            continue
          }
        } catch {
          // Not JSON, fall through
        }
      }
      messages.push({ role: m.role, content: m.content })
    }

    return messages
  }
}
