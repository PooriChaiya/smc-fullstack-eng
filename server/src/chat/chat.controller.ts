import { Controller, Post, Body, HttpCode, UseGuards, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
import { SessionGuard } from '../auth/session.guard.js'
import { ChatService } from './chat.service.js'
import { UsageService } from '../usage/usage.service.js'

@Controller('chat')
@UseGuards(SessionGuard)
export class ChatController {
  constructor(
    private chat: ChatService,
    private usage: UsageService,
  ) {}

  @Post('stream')
  @HttpCode(200)
  async stream(
    @Body() body: { conversationId: string; message: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const userId = req['userId'] as string
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    // Pre-flight budget guard. Throws 429 { error: 'limit_exceeded', limit, spent,
    // resetsAt, windowSeconds } before any LLM cost is incurred. Thrown before we
    // touch res, so the exception filter returns clean JSON (not an SSE stream).
    await this.usage.assertUnderLimit(userId)

    const { conversationId, message } = body

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('X-Accel-Buffering', 'no')
    res.setHeader('Connection', 'keep-alive')

    // Client disconnect → abort the upstream stream; finally still accounts cost.
    // ponytail: listen on both req and res — node fetch's abort only trips res.close.
    const abort = new AbortController()
    const onClose = () => { if (!abort.signal.aborted) abort.abort() }
    req.on('close', onClose)
    res.on('close', onClose)

    try {
      await this.chat.streamChat(
        conversationId,
        userId,
        message,
        (chunk) => res.write(`data: ${JSON.stringify(chunk)}\n\n`),
        abort.signal,
      )
    } catch (error) {
      res.write(`data: ${JSON.stringify({ type: 'error', data: { message: error instanceof Error ? error.message : 'Unknown error' } })}\n\n`)
    } finally {
      res.write('data: [DONE]\n\n')
      res.end()
    }
  }
}
