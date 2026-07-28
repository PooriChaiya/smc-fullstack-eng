#!/usr/bin/env tsx
/**
 * Idempotent DB bootstrap:
 *   1. Runs every .sql file in ../src/database/migrations in filename order
 *      (single source of truth for schema; each file must be re-runnable).
 *   2. Loads the financial-data seed from ../../data/financial_data.sql.
 *
 * Run from server/: npm run load-data
 */

import { Client } from 'pg'
import { readFileSync, readdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '../src/database/migrations')
const SEED_FILE = join(__dirname, '../../data/financial_data.sql')

async function runMigrations(client: Client) {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8')
    await client.query(sql)
    console.log(`  ✓ ${f}`)
  }
}

async function loadSeed(client: Client) {
  // The dump is psql's `COPY ... FROM stdin` text format (tab-delimited,
  // \N = NULL), which pg's query() can't stream — parse into one batched
  // INSERT (192 rows × 8 cols fits a single statement).
  const sql = readFileSync(SEED_FILE, 'utf8')
  const lines = sql.split('\n')
  const copyStart = lines.findIndex((l) => /^COPY\s+\w+/.test(l))
  const copyEnd = lines.findIndex((l, i) => i > copyStart && l === '\\.')

  // Run the DDL block above COPY, rewritten into the financials schema.
  const ddl = lines
    .slice(0, copyStart)
    .join('\n')
    .replace(/CREATE TABLE financial_data/, 'CREATE TABLE IF NOT EXISTS financials.financial_data')
    .replace(/DROP TABLE IF EXISTS financial_data;/, '')
  await client.query(ddl)

  const cols = lines[copyStart].match(/\((.*)\)/)![1].split(',').map((c) => c.trim())
  const dataRows = lines.slice(copyStart + 1, copyEnd).filter((r) => r.trim() !== '')
  const values: (string | null)[] = []
  for (const r of dataRows) values.push(...r.split('\t').map((v) => (v === '\\N' ? null : v)))
  const colCount = cols.length
  const placeholders = dataRows
    .map((_, i) => '(' + Array.from({ length: colCount }, (_, j) => `$${i * colCount + j + 1}`).join(', ') + ')')
    .join(', ')

  await client.query('TRUNCATE financials.financial_data')
  await client.query(
    `INSERT INTO financials.financial_data (${cols.join(', ')}) VALUES ${placeholders}`,
    values,
  )

  const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM financials.financial_data')
  console.log(`  ✓ seeded ${rows[0].count} rows`)
  if (rows[0].count !== 192) console.warn(`  ! expected 192 rows, got ${rows[0].count}`)
}

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://app:dev@localhost:5432/smc',
  })
  await client.connect()
  try {
    console.log('Migrations:')
    await runMigrations(client)
    console.log('Seed:')
    await loadSeed(client)
    // Re-grant SELECT after seed table creation — DEFAULT PRIVILEGES in 001
    // only fires for tables created AFTER that GRANT was set, so a fresh
    // financials.financial_data still needs an explicit grant.
    await client.query('GRANT SELECT ON financials.financial_data TO readonly_agent')
    console.log('Done.')
  } catch (err) {
    console.error('Error:', err)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
