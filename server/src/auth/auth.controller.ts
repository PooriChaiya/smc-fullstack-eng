import { Controller, Post, Get, Body, Req, Res, HttpStatus, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { Request, Response } from 'express'
import { AuthService, SESSION_TTL_SECONDS } from './auth.service.js'
import { SessionGuard } from './session.guard.js'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 registrations/min
  async register(@Body() body: { email: string; password: string }, @Res() res: Response) {
    if (!body.email || !body.password) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'email and password required' })
    }
    const result = await this.authService.register(body.email, body.password)

    // Auto-login by setting session cookie
    res.cookie('session', result.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_TTL_SECONDS * 1000,
    })

    res.json({ userId: result.userId })
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 logins/min
  async login(@Body() body: { email: string; password: string }, @Res() res: Response) {
    if (!body.email || !body.password) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'email and password required' })
    }
    const result = await this.authService.login(body.email, body.password)

    // Set httpOnly cookie
    res.cookie('session', result.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_TTL_SECONDS * 1000,
    })

    res.json({ userId: result.userId })
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    const token = req.cookies?.session
    if (token) {
      await this.authService.logout(token)
    }
    res.clearCookie('session')
    res.json({ success: true })
  }

  @UseGuards(SessionGuard)
  @Get('me')
  async me(@Req() req: Request, @Res() res: Response) {
    const userId = req.userId
    if (!userId) {
      return res.status(HttpStatus.UNAUTHORIZED).json({ error: 'Unauthorized' })
    }
    const user = await this.authService.getUserById(userId)
    if (!user) {
      return res.status(HttpStatus.NOT_FOUND).json({ error: 'User not found' })
    }
    return res.json(user)
  }
}
