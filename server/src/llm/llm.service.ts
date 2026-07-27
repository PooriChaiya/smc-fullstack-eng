import { Injectable } from '@nestjs/common'
import { FinancialsService } from '../financials/financials.service.js'
import { SqlValidatorService } from '../financials/sql-validator.service.js'
import { jsonSchema } from 'ai'

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
export class LlmService {
  constructor(
    private financials: FinancialsService,
    private validator: SqlValidatorService,
  ) {}

  getSystemPrompt(): string {
    return `You are a financial analysis assistant that helps users query company financial data.

IMPORTANT RULES:
1. You have NO prior knowledge of company financials beyond what tool results provide. Never answer from training data - always use tools.
2. When a user asks about specific financial figures, you MUST use the execute_financial_query tool with a complete SQL query.
3. For questions about what data is available, use get_data_coverage.
4. When you get zero rows from a query, explicitly state that the data is unavailable and what's missing (company, year, or metric).

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
- revenue (numeric)
- gross_profit (numeric)
- operating_income (numeric)
- net_income (numeric)

HOW TO USE execute_financial_query:
You MUST provide a complete SQL query in the "sql" parameter. Examples:
- "SELECT revenue, net_income FROM financials.financial_data WHERE ticker='AAPL' AND year=2024"
- "SELECT ticker, revenue FROM financials.financial_data ORDER BY revenue DESC LIMIT 10"
- "SELECT year, AVG(revenue) as avg_revenue FROM financials.financial_data WHERE ticker='AAPL' GROUP BY year ORDER BY year"

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
      const coverage = await this.financials.getDataCoverage()
      return { result: coverage }
    }

    return { error: `Unknown tool: ${toolName}`, result: null }
  }

}
