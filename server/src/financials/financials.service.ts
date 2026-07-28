import { Injectable, Inject } from '@nestjs/common'
import pg from 'pg'

interface QueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  durationMs: number
}

@Injectable()
export class FinancialsService {
  constructor(@Inject('READONLY_POOL') private db: pg.Pool) {}

  async executeQuery(sql: string): Promise<QueryResult> {
    const startTime = Date.now()

    const result = await this.db.query(sql)

    return {
      columns: result.fields.map(f => f.name),
      rows: result.rows,
      rowCount: result.rowCount || 0,
      durationMs: Date.now() - startTime,
    }
  }

  async getDataCoverage(): Promise<{
    tickers: string[]
    companies: string[]
    years: number[]
    metrics: string[]
  }> {
    const result = await this.db.query(`
      SELECT
        JSON_AGG(DISTINCT ticker) as tickers,
        JSON_AGG(DISTINCT company) as companies,
        JSON_AGG(DISTINCT year) as years
      FROM financials.financial_data
    `)

    const row = result.rows[0]
    const metrics = ['revenue', 'gross_profit', 'operating_income', 'net_income']

    return {
      tickers: (row.tickers || []).sort(),
      companies: (row.companies || []).sort(),
      years: (row.years || []).sort((a: number, b: number) => a - b),
      metrics,
    }
  }
}
