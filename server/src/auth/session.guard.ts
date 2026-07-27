import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Inject } from '@nestjs/common'
import type { Request } from 'express'
import { Redis } from 'ioredis'
import { SESSION_TTL_SECONDS } from './auth.service.js'

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject('REDIS') private redis: Redis) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>()
    const token = req.cookies?.session

    if (!token) {
      throw new UnauthorizedException()
    }

    const userId = await this.redis.get(`session:${token}`)
    if (!userId) {
      throw new UnauthorizedException()
    }

    // Refresh TTL on activity
    await this.redis.expire(`session:${token}`, SESSION_TTL_SECONDS)

    req['userId'] = userId
    return true
  }
}
