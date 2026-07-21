import { Inject, Injectable, UnauthorizedException, ConflictException } from '@nestjs/common'
import { randomBytes, scrypt, timingSafeEqual } from 'crypto'
import { promisify } from 'util'
import Redis from 'ioredis'
import { Pool } from 'pg'

const scryptAsync = promisify(scrypt)

@Injectable()
export class AuthService {
  constructor(
    @Inject('DATABASE_POOL') private db: Pool,
    @Inject('REDIS') private redis: Redis,
  ) {}

  async register(email: string, password: string) {
    // Check existing user
    const existing = await this.db.query('SELECT id FROM app.users WHERE email = $1', [email])
    if (existing.rows.length > 0) {
      throw new ConflictException('Email already registered')
    }

    // Hash password with argon2-like security (scrypt with salt)
    const salt = randomBytes(16).toString('hex')
    const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer
    const passwordHash = salt + ':' + derivedKey.toString('hex')

    const { rows } = await this.db.query(
      'INSERT INTO app.users (email, password_hash) VALUES ($1, $2) RETURNING id',
      [email.toLowerCase(), passwordHash],
    )

    return { userId: rows[0].id }
  }

  async login(email: string, password: string) {
    const { rows } = await this.db.query('SELECT id, password_hash FROM app.users WHERE email = $1', [
      email.toLowerCase(),
    ])
    if (rows.length === 0) {
      throw new UnauthorizedException('Invalid credentials')
    }

    const [salt, key] = rows[0].password_hash.split(':')
    const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer
    const keyBuffer = Buffer.from(key, 'hex')

    if (!timingSafeEqual(derivedKey, keyBuffer)) {
      throw new UnauthorizedException('Invalid credentials')
    }

    // Create session token
    const token = randomBytes(32).toString('base64url')
    const ttl = parseInt(process.env.SESSION_TTL_SECONDS ?? '86400', 10)

    await this.redis.set(`session:${token}`, rows[0].id, 'EX', ttl)

    return { token, userId: rows[0].id }
  }

  async logout(token: string) {
    await this.redis.del(`session:${token}`)
  }

  async validateSession(token: string): Promise<string | null> {
    const userId = await this.redis.get(`session:${token}`)
    if (!userId) return null
    // Refresh TTL on activity
    const ttl = parseInt(process.env.SESSION_TTL_SECONDS ?? '86400', 10)
    await this.redis.expire(`session:${token}`, ttl)
    return userId
  }

  async getUserById(userId: string) {
    const { rows } = await this.db.query('SELECT id, email, created_at FROM app.users WHERE id = $1', [userId])
    if (rows.length === 0) return null
    return { id: rows[0].id, email: rows[0].email, createdAt: rows[0].created_at }
  }
}
