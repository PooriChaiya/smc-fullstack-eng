import { Injectable } from '@nestjs/common'
import { OpenAI } from 'openai'
import { FinancialsService } from '../financials/financials.service.js'
import { SqlValidatorService } from '../financials/sql-validator.service.js'

interface ToolResult {
  result?: unknown
  rowCount?: number
  durationMs?: number
  error?: string
}

// Tool definitions for OpenAI
const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'execute_financial_query',
      description: 'Execute a SQL query against the financial data. Use this to retrieve specific financial metrics.',
      parameters: {
        type: 'object',
        properties: {
          sql: {
            type: 'string',
            description: 'The SQL SELECT query to execute. Use table name: financials.financial_data or financial_data',
          },
          rationale: {
            type: 'string',
            description: 'Brief explanation of why this query answers the user question',
          },
        },
        required: ['sql', 'rationale'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_data_coverage',
      description: 'Get information about what data is available - tickers, companies, years, and metrics.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
]

@Injectable()
export class LlmService {
  private openai: OpenAI

  constructor(
    private financials: FinancialsService,
    private validator: SqlValidatorService,
  ) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }

  getSystemPrompt(): string {
    return `You are a financial analysis assistant that helps users query company financial data.

IMPORTANT RULES:
1. You have NO prior knowledge of company financials beyond what tool results provide. Never answer from training data - always use tools.
2. When a user asks about specific financial figures, you MUST use the execute_financial_query tool.
3. For questions about what data is available, use get_data_coverage.
4. When you get zero rows from a query, explicitly state that the data is unavailable and what's missing (company, year, or metric).
5. For multi-row results, present them as a Markdown table.
6. For trends and comparisons, present a table AND a fenced chart block using this format:
\`\`\`chart
{"type":"bar","x":"year","series":["revenue","net_income"],"data":[...],"title":"Title here"}
\`\`\`

Table schema for financial_data:
- ticker (e.g., "AAPL", "TSLA")
- company (e.g., "Apple Inc.", "Tesla Inc.")
- year (2022-2025)
- revenue (numeric)
- gross_profit (numeric)
- operating_income (numeric)
- net_income (numeric)

Keep responses concise and focused on the data.`
  }

  getTools() {
    return TOOLS
  }

  // Execute tool and return result
  async executeToolCall(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (toolName === 'execute_financial_query') {
      const { sql, rationale } = args as { sql: string; rationale: string }

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

  getOpenai() {
    return this.openai
  }
}
