import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common'
import { FinancialsService } from './financials.service.js'
import { SqlValidatorService } from './sql-validator.service.js'
import { SessionGuard } from '../auth/session.guard.js'

@Controller('financials')
@UseGuards(SessionGuard)
export class FinancialsController {
  constructor(
    private readonly financialsService: FinancialsService,
    private readonly validator: SqlValidatorService,
  ) {}

  @Post('query')
  async executeQuery(@Body() body: { sql: string; rationale?: string }) {
    const { sql, rationale } = body

    if (!sql) {
      return { error: 'sql is required' }
    }

    // Validate SQL
    const validation = this.validator.validate(sql)
    if (validation.error) {
      return { error: validation.error }
    }

    const normalizedSql = validation.normalized!

    try {
      const result = await this.financialsService.executeQuery(normalizedSql)
      return { ...result, sql: normalizedSql, rationale }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Query failed' }
    }
  }

  @Get('coverage')
  async getCoverage() {
    return this.financialsService.getDataCoverage()
  }
}
