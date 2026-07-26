import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Inject } from '@nestjs/common'
import type { Request } from 'express'
import { Redis } from 'ioredis'

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
    const ttl = parseInt(process.env.SESSION_TTL_SECONDS ?? '86400', 10)
    await this.redis.expire(`session:${token}`, ttl)

    req['userId'] = userId
    return true
  }
}
