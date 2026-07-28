import { Module, Global } from '@nestjs/common'
import pg from 'pg'

const { Pool } = pg

@Global()
@Module({
  providers: [
    {
      provide: 'DATABASE_POOL',
      useFactory: () => {
        const url = process.env.DATABASE_URL ?? 'postgresql://app:dev@localhost:5432/smc'
        return new Pool({ connectionString: url })
      },
    },
    {
      provide: 'READONLY_POOL',
      useFactory: () => {
        const url = process.env.DATABASE_READONLY_URL ?? 'postgresql://readonly_agent:readonly@localhost:5432/smc'
        return new Pool({
          connectionString: url,
          statement_timeout: 5000,
        })
      },
    },
  ],
  exports: ['DATABASE_POOL', 'READONLY_POOL'],
})
export class DatabaseModule {}
