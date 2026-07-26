import { Controller, Get, UseGuards, Req } from '@nestjs/common'
import type { Request } from 'express'
import { SessionGuard } from '../auth/session.guard.js'
import { UsageService } from './usage.service.js'

@Controller('usage')
@UseGuards(SessionGuard)
export class UsageController {
  constructor(private usage: UsageService) {}

  // Returns { limit, spent, resetsAt, windowSeconds } for the budget indicator
  // and the live countdown on a 429.
  @Get()
  async get(@Req() req: Request) {
    return this.usage.getUsage(req['userId'] as string)
  }
}
