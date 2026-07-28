import { Controller, Get, Post, Delete, Body, Param, UseGuards, Req } from '@nestjs/common'
import { ConversationsService } from './conversations.service.js'
import { SessionGuard } from '../auth/session.guard.js'

@Controller('conversations')
@UseGuards(SessionGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  async findAll(@Req() req: { userId: string }) {
    return this.conversationsService.findAll(req.userId)
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: { userId: string }) {
    return this.conversationsService.findOne(id, req.userId)
  }

  @Get(':id/messages')
  async getMessages(@Param('id') id: string, @Req() req: { userId: string }) {
    return this.conversationsService.getMessages(id, req.userId)
  }

  @Post()
  async create(@Body() body: { title?: string }, @Req() req: { userId: string }) {
    return this.conversationsService.create(req.userId, body.title)
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: { userId: string }) {
    await this.conversationsService.delete(id, req.userId)
    return { success: true }
  }
}
