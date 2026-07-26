import { Inject, Injectable } from '@nestjs/common'
import { streamText, isStepCount } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { ModelMessage } from '@ai-sdk/provider-utils'
import * as tiktoken from 'gpt-tokenizer'
import { LlmService } from '../llm/llm.service.js'
import { ConversationsService } from '../conversations/conversations.service.js'
import { MessagesRepository } from '../conversations/messages.repository.js'

@Injectable()
export class ChatService {
  constructor(
    private llm: LlmService,
    private conversations: ConversationsService,
    private messagesRepo: MessagesRepository,
    @Inject('REDIS') private redis: any,
  ) {}

  async streamChat(
    conversationId: string,
    userId: string,
    userMessage: string,
    onChunk: (chunk: {
      type: 'text-delta' | 'tool-input-start' | 'tool-input-delta' | 'tool-output-available' | 'tool-output-error' | 'finish' | 'error'
      data?: unknown
    }) => void,
    signal?: AbortSignal,
  ) {
    const openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    })

    // Create user message
    await this.conversations.addUserMessage(conversationId, userId, userMessage)

    // Create placeholder assistant message
    const assistantMsg = await this.conversations.createAssistantMessage(conversationId, userId)

    // Get conversation history
    const conversation = await this.conversations.findOne(conversationId, userId)
    const messages: ModelMessage[] = (conversation.messages || []).map((m: any) => {
      const baseMsg: any = {
        role: m.role,
        content: m.content,
      }

      // Add tool calls if present
      if (m.tool_calls && m.tool_calls.length > 0) {
        baseMsg.toolCalls = m.tool_calls.map((tc: any) => ({
          toolCallId: tc.id,
          toolName: tc.toolName,
          args: tc.arguments,
        }))
      }

      return baseMsg
    })

    // Accumulators
    let accumulatedText = ''
    let accumulatedToolCalls: Map<string, { toolName: string; args: string; result?: unknown; rowCount?: number; durationMs?: number; error?: string }> = new Map()
    let currentToolId: string | null = null
    let currentToolArgs = ''
    let status: 'streaming' | 'complete' | 'stopped' | 'error' = 'streaming'

    try {
      const result = await streamText({
        model: openai('gpt-4o-mini'),
        system: this.llm.getSystemPrompt(),
        messages,
        tools: this.llm.getTools() as any,
        stopWhen: isStepCount(5),
        abortSignal: signal,
      })

      for await (const chunk of result.fullStream) {
        switch (chunk.type) {
          case 'text-delta':
            accumulatedText += chunk.text
            onChunk({ type: 'text-delta', data: chunk.text })
            break

          case 'tool-input-start':
            currentToolId = chunk.id
            currentToolArgs = ''
            accumulatedToolCalls.set(chunk.id, {
              toolName: chunk.toolName,
              args: '',
            })
            onChunk({
              type: 'tool-input-start',
              data: { toolCallId: chunk.id, toolName: chunk.toolName },
            })
            break

          case 'tool-input-delta':
            if (currentToolId) {
              currentToolArgs += chunk.delta
              accumulatedToolCalls.get(currentToolId)!.args = currentToolArgs
              onChunk({
                type: 'tool-input-delta',
                data: { toolCallId: currentToolId, argsDelta: chunk.delta },
              })
            }
            break

          case 'tool-result': {
            const toolEntry = accumulatedToolCalls.get(chunk.toolCallId)
            if (!toolEntry) break

            const parsedArgs = JSON.parse(toolEntry.args)
            const toolResult = await this.llm.executeToolCall(toolEntry.toolName, parsedArgs)

            // Update accumulated with result
            accumulatedToolCalls.set(chunk.toolCallId, {
              ...toolEntry,
              result: toolResult.result,
              rowCount: toolResult.rowCount,
              durationMs: toolResult.durationMs,
              error: toolResult.error,
            })

            if (toolResult.error) {
              onChunk({
                type: 'tool-output-error',
                data: { toolCallId: chunk.toolCallId, error: toolResult.error },
              })
            } else {
              onChunk({
                type: 'tool-output-available',
                data: {
                  toolCallId: chunk.toolCallId,
                  result: toolResult.result,
                  rowCount: toolResult.rowCount,
                  durationMs: toolResult.durationMs,
                },
              })
            }

            // Persist tool call to DB
            await this.messagesRepo.createToolCall({
              messageId: assistantMsg.id,
              toolName: toolEntry.toolName,
              arguments: parsedArgs,
              result: toolResult.result as Record<string, unknown> | undefined,
              rowCount: toolResult.rowCount,
              durationMs: toolResult.durationMs,
              error: toolResult.error,
            })
            break
          }

          case 'finish': {
            const { totalUsage, finishReason } = chunk
            status = finishReason === 'error' ? 'error' : 'complete'
            onChunk({
              type: 'finish',
              data: { usage: totalUsage, finishReason },
            })
            break
          }

          case 'abort':
            status = 'stopped'
            onChunk({ type: 'finish', data: { finishReason: 'stopped' } })
            break

          case 'error':
            status = 'error'
            onChunk({ type: 'error', data: { message: (chunk as any).error?.message || 'Unknown error' } })
            break
        }
      }
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
        status = 'stopped'
      } else {
        status = 'error'
        onChunk({ type: 'error', data: { message: error instanceof Error ? error.message : 'Unknown error' } })
      }
    } finally {
      // Persist assistant message
      await this.messagesRepo.updateContent(assistantMsg.id, accumulatedText)
      await this.messagesRepo.updateStatus(assistantMsg.id, status)

      // Calculate cost (estimate from accumulated text)
      const totalTokens = tiktoken.encode(accumulatedText).length
      const promptTokens = messages.reduce((sum, m) => sum + tiktoken.encode((m.content as string) || '').length, 0)
      const costUsd = ((promptTokens + totalTokens) / 1_000_000) * 0.15 // gpt-4o-mini pricing

      // Record usage event (fixed window: 1 hour)
      const windowStart = Math.floor(Date.now() / 3600000) * 3600
      await this.redis.incrbyfloat(`usage:${userId}:${windowStart}`, costUsd)
      await this.redis.expire(`usage:${userId}:${windowStart}`, 3600)
    }
  }
}
