import { Controller, Post, Get, Body, Req, Res, HttpStatus, UseGuards } from '@nestjs/common'
import type { Request, Response } from 'express'
import { AuthService } from './auth.service.js'
import { SessionGuard } from './session.guard.js'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() body: { email: string; password: string }, @Res() res: Response) {
    if (!body.email || !body.password) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'email and password required' })
    }
    const result = await this.authService.register(body.email, body.password)

    // Auto-login by setting session cookie
    res.cookie('session', result.token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: parseInt(process.env.SESSION_TTL_SECONDS ?? '86400', 10) * 1000,
    })

    res.json({ userId: result.userId })
  }

  @Post('login')
  async login(@Body() body: { email: string; password: string }, @Res() res: Response) {
    if (!body.email || !body.password) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'email and password required' })
    }
    const result = await this.authService.login(body.email, body.password)

    // Set httpOnly cookie
    res.cookie('session', result.token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: parseInt(process.env.SESSION_TTL_SECONDS ?? '86400', 10) * 1000,
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
  async me(@Req() req: Request) {
    const userId = req.userId
    if (!userId) {
      return { error: 'User not found' }
    }
    const user = await this.authService.getUserById(userId)
    if (!user) {
      return { error: 'User not found' }
    }
    return user
  }
}
