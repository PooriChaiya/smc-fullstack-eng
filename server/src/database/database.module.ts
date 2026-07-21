import { Module, Global } from '@nestjs/common'
import pg from 'pg'

const { Pool } = pg

@Global()
@Module({
  providers: [
    {
      provide: 'DATABASE_POOL',
      useFactory: () => {
        return new Pool({ connectionString: process.env.DATABASE_URL })
      },
    },
    {
      provide: 'READONLY_POOL',
      useFactory: () => {
        return new Pool({ connectionString: process.env.DATABASE_READONLY_URL })
      },
    },
  ],
  exports: ['DATABASE_POOL', 'READONLY_POOL'],
})
export class DatabaseModule {}
