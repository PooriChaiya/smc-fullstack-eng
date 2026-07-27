import { Inject, Injectable, UnauthorizedException, ConflictException } from '@nestjs/common'
import { randomBytes, scrypt, timingSafeEqual } from 'crypto'
import { promisify } from 'util'
import { Redis } from 'ioredis'
import pg from 'pg'

const scryptAsync = promisify(scrypt)

// ponytail: read once at startup; the env is static for the process lifetime.
export const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS ?? 86400)

@Injectable()
export class AuthService {
  constructor(
    @Inject('DATABASE_POOL') private db: pg.Pool,
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

    // Create session token for auto-login
    const token = randomBytes(32).toString('base64url')
    await this.redis.set(`session:${token}`, rows[0].id, 'EX', SESSION_TTL_SECONDS)

    return { token, userId: rows[0].id }
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
    await this.redis.set(`session:${token}`, rows[0].id, 'EX', SESSION_TTL_SECONDS)

    return { token, userId: rows[0].id }
  }

  async logout(token: string) {
    await this.redis.del(`session:${token}`)
  }

  async getUserById(userId: string) {
    const { rows } = await this.db.query('SELECT id, email, created_at FROM app.users WHERE id = $1', [userId])
    if (rows.length === 0) return null
    return { id: rows[0].id, email: rows[0].email, createdAt: rows[0].created_at }
  }
}
