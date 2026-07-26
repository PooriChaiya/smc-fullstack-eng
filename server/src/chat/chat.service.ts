import { Injectable } from '@nestjs/common'
import { streamText, isStepCount } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import type { ModelMessage } from '@ai-sdk/provider-utils'
import * as tiktoken from 'gpt-tokenizer'
import { LlmService } from '../llm/llm.service.js'
import { ConversationsService } from '../conversations/conversations.service.js'
import { MessagesRepository } from '../conversations/messages.repository.js'
import { UsageService, TokenUsage } from '../usage/usage.service.js'

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

@Injectable()
export class ChatService {
  constructor(
    private llm: LlmService,
    private conversations: ConversationsService,
    private messagesRepo: MessagesRepository,
    private usage: UsageService,
  ) {}

  async streamChat(
    conversationId: string,
    userId: string,
    userMessage: string,
    onChunk: (chunk: StreamChunk) => void,
    signal?: AbortSignal,
  ) {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! })

    // Persist the user turn, then auto-title from the first message.
    await this.conversations.addUserMessage(conversationId, userId, userMessage)
    await this.conversations.setTitleIfEmpty(
      conversationId,
      userId,
      userMessage.slice(0, 60).trim() || 'New chat',
    )

    // Placeholder assistant message updated in finally regardless of outcome.
    const assistantMsg = await this.conversations.createAssistantMessage(conversationId, userId)

    // Rebuild model history from persisted conversation.
    const conversation = await this.conversations.findOne(conversationId, userId)
    const messages: ModelMessage[] = (conversation.messages || []).map((m: any) => {
      const baseMsg: any = { role: m.role, content: m.content }
      if (m.tool_calls?.length) {
        baseMsg.toolCalls = m.tool_calls.map((tc: any) => ({
          toolCallId: tc.id,
          toolName: tc.toolName,
          args: tc.arguments,
        }))
      }
      return baseMsg
    })

    let accumulatedText = ''
    const tools = new Map<
      string,
      { toolName: string; args: string; result?: unknown; rowCount?: number; durationMs?: number; error?: string }
    >()
    let currentToolId: string | null = null
    let status: 'streaming' | 'complete' | 'stopped' | 'error' = 'streaming'
    let finishTokens: TokenUsage | null = null // populated by the finish part (absent on abort)

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
            tools.set(chunk.id, { toolName: chunk.toolName, args: '' })
            onChunk({ type: 'tool-input-start', data: { toolCallId: chunk.id, toolName: chunk.toolName } })
            break

          case 'tool-input-delta':
            if (currentToolId) {
              const entry = tools.get(currentToolId)!
              entry.args += chunk.delta
              onChunk({ type: 'tool-input-delta', data: { toolCallId: currentToolId, argsDelta: chunk.delta } })
            }
            break

          case 'tool-result': {
            const entry = tools.get(chunk.toolCallId)
            if (!entry) break
            const parsedArgs = JSON.parse(entry.args || '{}')
            const out = await this.llm.executeToolCall(entry.toolName, parsedArgs)
            entry.result = out.result
            entry.rowCount = out.rowCount
            entry.durationMs = out.durationMs
            entry.error = out.error

            if (out.error) {
              onChunk({ type: 'tool-output-error', data: { toolCallId: chunk.toolCallId, error: out.error } })
            } else {
              onChunk({
                type: 'tool-output-available',
                data: { toolCallId: chunk.toolCallId, result: out.result, rowCount: out.rowCount, durationMs: out.durationMs },
              })
            }

            await this.messagesRepo.createToolCall({
              messageId: assistantMsg.id,
              toolName: entry.toolName,
              arguments: parsedArgs,
              result: out.result as Record<string, unknown> | undefined,
              rowCount: out.rowCount,
              durationMs: out.durationMs,
              error: out.error,
            })
            break
          }

          case 'finish': {
            const { totalUsage, finishReason } = chunk as any
            status = finishReason === 'error' ? 'error' : 'complete'
            if (totalUsage) {
              finishTokens = {
                promptTokens: totalUsage.promptTokens ?? 0,
                completionTokens: totalUsage.completionTokens ?? 0,
              }
            }
            onChunk({ type: 'finish', data: { usage: totalUsage, finishReason } })
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
      // Accounting + persistence happen here so every exit path is covered:
      // completion, user abort, client disconnect, upstream error.
      await this.messagesRepo.updateContent(assistantMsg.id, accumulatedText)
      await this.messagesRepo.updateStatus(assistantMsg.id, status)

      let costUsd: number
      let estimated: boolean
      if (finishTokens) {
        costUsd = this.usage.costFromUsage(finishTokens)
        estimated = false
      } else {
        // Abort/disconnect: OpenAI never sends the final usage chunk, so
        // count accumulated output with a tokenizer and flag it estimated.
        const promptTokens = messages.reduce(
          (sum, m) => sum + tiktoken.encode((m.content as string) || '').length,
          0,
        )
        const completionTokens = tiktoken.encode(accumulatedText).length
        costUsd = this.usage.costFromUsage({ promptTokens, completionTokens })
        estimated = true
      }

      await this.usage.record(userId, assistantMsg.id, costUsd, estimated, finishTokens ?? undefined)
    }
  }
}
