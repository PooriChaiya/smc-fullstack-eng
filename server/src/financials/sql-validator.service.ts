import { Injectable } from '@nestjs/common'

const ALLOWED_TABLES = ['financials.financial_data', 'financial_data']
const DEFAULT_LIMIT = 200

@Injectable()
export class SqlValidatorService {
  // Validate and normalize SQL query
  validate(sql: string): { error?: string; normalized?: string } {
    if (!sql || typeof sql !== 'string') {
      return { error: 'SQL query must be a non-empty string' }
    }

    const trimmed = sql.trim()

    // Remove trailing semicolon and anything after
    const normalized = trimmed.split(';')[0].trim()

    if (!normalized) {
      return { error: 'SQL query cannot be empty' }
    }

    // Convert to uppercase for checking
    const upper = normalized.toUpperCase()

    // Must start with SELECT or WITH
    if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) {
      return { error: 'Only SELECT queries are allowed' }
    }

    // Check for forbidden keywords (INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, etc.)
    const forbidden = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE', 'GRANT', 'REVOKE']
    for (const keyword of forbidden) {
      if (upper.includes(keyword)) {
        return { error: `Forbidden keyword: ${keyword}` }
      }
    }

    // Check for table references - only allowed tables
    // Handle both "table" and "schema.table" formats
    const fromMatches = upper.matchAll(/FROM\s+([\w.]+)/g)
    const joinMatches = upper.matchAll(/JOIN\s+([\w.]+)/g)

    const referencedTables: string[] = []
    for (const match of fromMatches) referencedTables.push(match[1])
    for (const match of joinMatches) referencedTables.push(match[1])

    for (const table of referencedTables) {
      const tableUpper = table.toUpperCase()
      const isAllowed = ALLOWED_TABLES.some(t => {
        const tUpper = t.toUpperCase()
        return tUpper === tableUpper || tUpper.endsWith(`.${tableUpper}`)
      })
      if (!isAllowed) {
        return { error: `Table not allowed: ${table}` }
      }
    }

    // Check for LIMIT clause, add if missing
    if (!upper.includes('LIMIT')) {
      return { normalized: `${normalized} LIMIT ${DEFAULT_LIMIT}` }
    }

    return { normalized }
  }
}
