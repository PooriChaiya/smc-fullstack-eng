import { Controller, Post, Body, HttpCode, UseGuards, Req, Res } from '@nestjs/common'
import { Request, Response } from 'express'
import { SessionGuard } from '../auth/session.guard.js'
import { ChatService } from './chat.service.js'

@Controller('chat')
@UseGuards(SessionGuard)
export class ChatController {
  constructor(private chat: ChatService) {}

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
    const { conversationId, message } = body

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('X-Accel-Buffering', 'no')
    res.setHeader('Connection', 'keep-alive')

    // Handle client disconnect
    req.on('close', () => {
      res.end()
    })

    try {
      await this.chat.streamChat(conversationId, userId, message, async (chunk) => {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`)
      })
    } catch (error) {
      res.write(`data: ${JSON.stringify({ type: 'error', data: { message: error instanceof Error ? error.message : 'Unknown error' } })}\n\n`)
    } finally {
      res.write('data: [DONE]\n\n')
      res.end()
    }
  }
}
