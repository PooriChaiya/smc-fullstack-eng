#!/usr/bin/env tsx
/**
 * Idempotent data loader.
 * Creates two schemas (app, financials), creates readonly_agent role, loads financial data.
 * Run from server/: npm run load-data
 */

import { Client } from 'pg'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SQL_FILE = join(__dirname, '../../data/financial_data.sql')

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL ?? 'postgresql://app:dev@localhost:5432/smc' })

  try {
    await client.connect()
    console.log('Connected to postgres')

    // Create schemas
    await client.query(`CREATE SCHEMA IF NOT EXISTS app`)
    await client.query(`CREATE SCHEMA IF NOT EXISTS financials`)
    console.log('Created schemas')

    // Create readonly_agent role
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'readonly_agent') THEN
          CREATE ROLE readonly_agent WITH LOGIN PASSWORD 'readonly';
        END IF;
      END $$;
    `)
    console.log('Created readonly_agent role')

    // Grant usage on schemas
    await client.query(`GRANT USAGE ON SCHEMA financials TO readonly_agent`)
    await client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA financials TO readonly_agent`)
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA financials GRANT SELECT ON TABLES TO readonly_agent`)

    // Revoke all on app schema from readonly_agent
    await client.query(`REVOKE ALL ON SCHEMA app FROM readonly_agent`)
    await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA app FROM readonly_agent`)
    console.log('Set up readonly_agent permissions')

    // Create app tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS app.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email citext UNIQUE NOT NULL,
        password_hash text NOT NULL,
        created_at timestamptz DEFAULT now()
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS app.conversations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
        title text,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      )
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS conversations_user_idx ON app.conversations(user_id, updated_at DESC)`)

    await client.query(`
      CREATE TABLE IF NOT EXISTS app.messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id uuid NOT NULL REFERENCES app.conversations(id) ON DELETE CASCADE,
        seq int NOT NULL,
        role text NOT NULL CHECK (role IN ('user', 'assistant')),
        content text,
        status text NOT NULL CHECK (status IN ('streaming', 'complete', 'stopped', 'error')) DEFAULT 'streaming',
        created_at timestamptz DEFAULT now(),
        UNIQUE (conversation_id, seq)
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS app.tool_calls (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id uuid NOT NULL REFERENCES app.messages(id) ON DELETE CASCADE,
        tool_name text NOT NULL,
        arguments jsonb,
        result jsonb,
        row_count int,
        duration_ms int,
        error text,
        created_at timestamptz DEFAULT now()
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS app.usage_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES app.users(id),
        message_id uuid REFERENCES app.messages(id) ON DELETE SET NULL,
        model text NOT NULL,
        prompt_tokens int NOT NULL,
        completion_tokens int NOT NULL,
        cost_usd numeric(12,6) NOT NULL,
        estimated boolean NOT NULL DEFAULT true,
        created_at timestamptz DEFAULT now()
      )
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS usage_events_user_idx ON app.usage_events(user_id, created_at DESC)`)

    // Enable citext extension
    await client.query(`CREATE EXTENSION IF NOT EXISTS citext`)
    console.log('Created app tables')

    // Load financial data
    const sql = readFileSync(SQL_FILE, 'utf8')

    // The dump is psql's `COPY ... FROM stdin` text format (tab-delimited
    // rows, \N = NULL), which the pg driver can't stream over query().
    // Parse it into a single batched INSERT — 192 rows × 8 cols fits one query.
    const lines = sql.split('\n')
    const copyStart = lines.findIndex((l) => /^COPY\s+\w+/.test(l))
    const copyEnd = lines.findIndex((l, i) => i > copyStart && l === '\\.')

    // DDL above the COPY line (CREATE TABLE), rewritten to the financials schema.
    const ddl = lines
      .slice(0, copyStart)
      .join('\n')
      .replace(/CREATE TABLE financial_data/, 'CREATE TABLE IF NOT EXISTS financials.company_financials')
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

    // Fresh load each run (table is CREATE IF NOT EXISTS).
    await client.query('TRUNCATE financials.company_financials')
    await client.query(
      `INSERT INTO financials.company_financials (${cols.join(', ')}) VALUES ${placeholders}`,
      values,
    )
    console.log('Loaded financial data')

    // Verify row count
    const { rows } = await client.query(`SELECT COUNT(*) as count FROM financials.company_financials`)
    const count = parseInt(rows[0].count, 10)
    console.log(`Financial data loaded: ${count} rows`)

    if (count !== 192) {
      console.warn(`Expected 192 rows, got ${count}`)
    }

    console.log('Done!')
  } catch (err) {
    console.error('Error:', err)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
