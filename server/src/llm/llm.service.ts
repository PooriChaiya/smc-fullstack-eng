import { Injectable, OnModuleInit } from '@nestjs/common'
import { FinancialsService } from '../financials/financials.service.js'
import { SqlValidatorService } from '../financials/sql-validator.service.js'
import { jsonSchema } from 'ai'

interface DataCoverage {
  tickers: string[]
  companies: string[]
  years: number[]
  metrics: string[]
}

// ponytail: simple in-memory cache with TTL, no external cache service
let cachedCoverage: DataCoverage | null = null
let cacheTime = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

interface ToolResult {
  result?: unknown
  rowCount?: number
  durationMs?: number
  error?: string
}

// Tool definitions using JSON Schema format (not Zod) to ensure 'required' field is set correctly
const TOOLS = {
  execute_financial_query: {
    description: 'Execute a SQL query against the financial data. REQUIRED: You MUST provide the "sql" parameter with a valid SELECT query. Do NOT call this tool without a SQL query.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: 'The SQL SELECT query to execute. Use table name: financials.financial_data or financial_data.',
        },
        rationale: {
          type: 'string',
          description: 'Brief explanation of why this query answers the user question',
        },
      },
      required: ['sql'],
    }),
  },
  get_data_coverage: {
    description: 'Get information about what data is available - tickers, companies, years, and metrics.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {},
    }),
  },
}

@Injectable()
export class LlmService implements OnModuleInit {
  constructor(
    private financials: FinancialsService,
    private validator: SqlValidatorService,
  ) {}

  async onModuleInit() {
    // Pre-fetch coverage on startup
    await this.getCoverageWithCache()
  }

  private async getCoverageWithCache(): Promise<DataCoverage> {
    const now = Date.now()
    if (cachedCoverage && (now - cacheTime) < CACHE_TTL) {
      return cachedCoverage
    }
    cachedCoverage = await this.financials.getDataCoverage()
    cacheTime = now
    return cachedCoverage
  }

  private hasDataFor(ticker?: string, company?: string, year?: number): boolean {
    if (!cachedCoverage) return true
    if (ticker && !cachedCoverage.tickers.includes(ticker.toUpperCase())) return false
    if (company) {
      const normalizedSearch = company.toLowerCase().replace(/[^a-z0-9]/g, '')
      const match = cachedCoverage.companies.some(c => {
        const normalizedCompany = c.toLowerCase().replace(/[^a-z0-9]/g, '')
        return normalizedCompany.includes(normalizedSearch) || normalizedSearch.includes(normalizedCompany)
      })
      if (!match) return false
    }
    if (year && !cachedCoverage.years.includes(year)) return false
    return true
  }

  async getDataCoverage(): Promise<DataCoverage> {
    return this.getCoverageWithCache()
  }

  async getSystemPrompt(): Promise<string> {
    const coverage = await this.getCoverageWithCache()
    const coverageInfo = `AVAILABLE DATA:
- Tickers: ${coverage.tickers.slice(0, 10).join(', ')}${coverage.tickers.length > 10 ? '...' : ''} (${coverage.tickers.length} total)
- Companies: ${coverage.companies.slice(0, 5).join(', ')}${coverage.companies.length > 5 ? '...' : ''} (${coverage.companies.length} total)
- Years: ${coverage.years.join(', ')} (${coverage.years.length} years)
- Metrics: ${coverage.metrics.join(', ')}`

    return `You are a financial analysis assistant that helps users query company financial data.

${coverageInfo}

IMPORTANT RULES:
1. You have NO prior knowledge of company financials beyond what tool results provide. Never answer from training data - always use tools.
2. When a user asks about specific financial figures, you MUST use the execute_financial_query tool with a complete SQL query.
3. Check if data exists BEFORE querying. If user asks for unavailable data (ticker/company/year not in AVAILABLE DATA), tell them immediately: "No data available for [X]. Available: [list what exists]."
4. For questions about what data is available, use get_data_coverage.
5. When you get zero rows from a query, explicitly state that the data is unavailable and what's missing (company, year, or metric).

CRITICAL: After receiving tool results, you MUST present the data in a human-readable format. NEVER output raw JSON or tool results directly.

RESPONSE FORMAT:
- Single data point: State it directly in text (e.g., "Apple's 2024 revenue was $X billion").
- Multi-row results (2+ rows): ALWAYS format as a Markdown table. Example:
  | Ticker | Year | Revenue | Net Income |
  |-------|------|---------|------------|
  | AAPL  | 2024 | 391B    | 97B        |
  | MSFT  | 2024 | 245B    | 88B        |

- Large numbers: Format with B (billions) or M (millions) for readability.

Table schema for financial_data:
- ticker (e.g., "AAPL", "TSLA")
- company (e.g., "Apple Inc.", "Tesla Inc.")
- year (2022-2025)
- revenue (numeric) - in raw dollars (e.g., 391035000000 = $391B)
- gross_profit (numeric) - in raw dollars
- operating_income (numeric) - in raw dollars
- net_income (numeric) - in raw dollars

HOW TO USE execute_financial_query:
You MUST provide a complete SQL query in the "sql" parameter. Examples:
- "SELECT revenue, net_income FROM financials.financial_data WHERE ticker='AAPL' AND year=2024"
- "SELECT ticker, revenue FROM financials.financial_data ORDER BY revenue DESC NULLS LAST LIMIT 10"
- "SELECT year, AVG(revenue) as avg_revenue FROM financials.financial_data WHERE ticker='AAPL' GROUP BY year ORDER BY year NULLS LAST"

CRITICAL: When using ORDER BY, ALWAYS add NULLS LAST for DESC and NULLS FIRST for ASC to ensure NULL values don't misleadingly appear at the top/bottom.

CRITICAL - NATURAL LANGUAGE QUERIES:
- Users often say "80B profit" meaning approximately $80 billion, NOT exactly 80,000,000,000
- Use range operators (>=, <=, BETWEEN) instead of exact match (=) for financial figures
- "companies that make 80B in profit" → WHERE net_income >= 80000000000
- "companies with revenue around 100B" → WHERE revenue BETWEEN 90000000000 AND 11000000000
- "most profitable companies" → ORDER BY net_income DESC
- Convert billions/trillions to full numbers: 80B = 80000000000, 1T = 1000000000000

Always include the sql parameter with a valid SELECT query. Never call the tool with empty arguments.

Keep responses concise and focused on the data.`
  }

  getTools() {
    return TOOLS
  }

  // Execute tool and return result
  async executeToolCall(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (toolName === 'execute_financial_query') {
      const { sql, rationale } = args as { sql?: string; rationale?: string }

      // Validate required params
      if (!sql || typeof sql !== 'string' || !sql.trim()) {
        return { error: 'SQL query is required and cannot be empty', result: null }
      }

      // Validate SQL
      const validation = this.validator.validate(sql)
      if (validation.error) {
        return { error: validation.error, result: null }
      }

      const normalizedSql = validation.normalized!

      try {
        const queryResult = await this.financials.executeQuery(normalizedSql)
        return {
          result: {
            columns: queryResult.columns,
            rows: queryResult.rows,
            rationale,
          },
          rowCount: queryResult.rowCount,
          durationMs: queryResult.durationMs,
        }
      } catch (e) {
        return { error: e instanceof Error ? e.message : 'Query failed', result: null }
      }
    }

    if (toolName === 'get_data_coverage') {
      const coverage = await this.getCoverageWithCache()
      return { result: coverage }
    }

    return { error: `Unknown tool: ${toolName}`, result: null }
  }

}
