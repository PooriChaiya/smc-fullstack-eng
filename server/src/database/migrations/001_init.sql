-- Enable citext extension for case-insensitive email
CREATE EXTENSION IF NOT EXISTS citext;

-- Create schemas and roles
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS financials;

-- Create users table (email CITEXT UNIQUE already creates the lookup index)
CREATE TABLE IF NOT EXISTS app.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email CITEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create readonly_agent role for financials queries. Password must match
-- DATABASE_READONLY_URL in .env.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'readonly_agent') THEN
    CREATE ROLE readonly_agent WITH LOGIN PASSWORD 'readonly';
  END IF;
END
$$;

-- Grant readonly_agent access to financials schema only
GRANT USAGE ON SCHEMA financials TO readonly_agent;
GRANT SELECT ON ALL TABLES IN SCHEMA financials TO readonly_agent;
ALTER DEFAULT PRIVILEGES IN SCHEMA financials GRANT SELECT ON TABLES TO readonly_agent;

-- Ensure app user has access to app schema
GRANT ALL ON SCHEMA app TO app;
GRANT ALL ON ALL TABLES IN SCHEMA app TO app;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT ALL ON TABLES TO app;
