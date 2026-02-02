/**
 * Database Setup Script
 *
 * Creates the tinypivot_datasources table in your PostgreSQL database.
 *
 * Usage:
 *   DATABASE_URL=postgresql://user:pass@localhost:5432/mydb node setup-db.js
 */

import pg from 'pg'

const { Pool } = pg

async function setup() {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    console.error('Error: DATABASE_URL environment variable is required')
    console.error('')
    console.error('Usage:')
    console.error('  DATABASE_URL=postgresql://user:pass@localhost:5432/mydb node setup-db.js')
    process.exit(1)
  }

  const pool = new Pool({ connectionString })

  console.log('Connecting to database...')

  try {
    // Create the datasources table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tinypivot_datasources (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        description TEXT,
        tier VARCHAR(10) NOT NULL DEFAULT 'user',
        env_prefix VARCHAR(100),
        connection_config JSONB NOT NULL DEFAULT '{}',
        encrypted_credentials TEXT,
        credentials_iv VARCHAR(32),
        credentials_auth_tag VARCHAR(32),
        credentials_salt VARCHAR(32),
        encrypted_refresh_token TEXT,
        refresh_token_iv VARCHAR(32),
        refresh_token_auth_tag VARCHAR(32),
        refresh_token_salt VARCHAR(32),
        token_expires_at TIMESTAMPTZ,
        auth_method VARCHAR(20) NOT NULL DEFAULT 'password',
        user_id VARCHAR(255),
        last_tested_at TIMESTAMPTZ,
        last_test_result VARCHAR(20),
        last_test_error TEXT,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    console.log('Created tinypivot_datasources table')

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS tinypivot_datasources_user_id_idx
      ON tinypivot_datasources(user_id)
    `)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS tinypivot_datasources_type_idx
      ON tinypivot_datasources(type)
    `)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS tinypivot_datasources_tier_idx
      ON tinypivot_datasources(tier)
    `)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS tinypivot_datasources_active_idx
      ON tinypivot_datasources(active)
    `)

    console.log('Created indexes')
    console.log('')
    console.log('Setup complete! You can now run: npm start')
  }
  catch (error) {
    console.error('Setup failed:', error.message)
    process.exit(1)
  }
  finally {
    await pool.end()
  }
}

setup()
