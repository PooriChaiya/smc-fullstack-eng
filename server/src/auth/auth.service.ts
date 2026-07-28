import { Inject, Injectable, UnauthorizedException, ConflictException } from '@nestjs/common'
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'crypto'
import { Redis } from 'ioredis'
import pg from 'pg'

// hand-rolled promisify — `util.promisify(scrypt)` picks the
// no-options overload, so passing OWASP params silently fails to typecheck.
const scryptAsync = (password: string, salt: string, keylen: number, options: ScryptOptions): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key)))
  })

// N=131072, r=8, p=1 needs ~128MB; node's scrypt requires maxmem > actual usage.
const SCRYPT_OPTS: ScryptOptions = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }

// ponytail: read once at startup; the env is static for the process lifetime.
export const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS ?? 86400)

@Injectable()
export class AuthService {
  constructor(
    @Inject('DATABASE_POOL') private db: pg.Pool,
    @Inject('REDIS') private redis: Redis,
  ) {}

  async register(email: string, password: string) {
    // Hash password using scrypt with OWASP params (N=131072, r=8, p=1).
    // Store N in the hash so future param changes don't lock users out —
    // legacy hashes (2 parts) implicitly use Node's default N=16384.
    const salt = randomBytes(16).toString('hex')
    const derivedKey = await scryptAsync(password, salt, 64, SCRYPT_OPTS)
    const passwordHash = `${salt}:${SCRYPT_OPTS.N}:${derivedKey.toString('hex')}`

    try {
      const { rows } = await this.db.query(
        'INSERT INTO app.users (email, password_hash) VALUES ($1, $2) RETURNING id',
        [email.toLowerCase(), passwordHash],
      )

      // Create session token for auto-login
      const token = randomBytes(32).toString('base64url')
      await this.redis.set(`session:${token}`, rows[0].id, 'EX', SESSION_TTL_SECONDS)

      return { token, userId: rows[0].id }
    } catch (e: unknown) {
      // ponytail: rely on UNIQUE constraint for race safety, catch PostgreSQL 23505
      if (e && typeof e === 'object' && 'code' in e && e.code === '23505') {
        throw new ConflictException('Email already registered')
      }
      throw e
    }
  }

  async login(email: string, password: string) {
    const { rows } = await this.db.query('SELECT id, password_hash FROM app.users WHERE email = $1', [
      email.toLowerCase(),
    ])
    if (rows.length === 0) {
      throw new UnauthorizedException('Invalid credentials')
    }

    // Format: "salt:N:key" (current) or "salt:key" (legacy N=16384).
    const parts = rows[0].password_hash.split(':')
    const [salt, key, N] = parts.length === 3
      ? [parts[0], parts[2], Number(parts[1])]
      : [parts[0], parts[1], 16384]
    const derivedKey = await scryptAsync(password, salt, 64, { ...SCRYPT_OPTS, N })
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
