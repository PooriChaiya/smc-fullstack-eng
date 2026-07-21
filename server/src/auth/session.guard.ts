import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { Request } from 'express'
import { AuthService } from './auth.service.js'

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>()
    const token = req.cookies?.session

    if (!token) {
      throw new UnauthorizedException()
    }

    const userId = await this.authService.validateSession(token)
    if (!userId) {
      throw new UnauthorizedException()
    }

    req['userId'] = userId
    return true
  }
}
