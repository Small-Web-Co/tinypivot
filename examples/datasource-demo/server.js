/**
 * Datasource Demo Server
 *
 * A simple HTTP server demonstrating the TinyPivot datasource connections API.
 *
 * Usage:
 *   node server.js              # Loads .env file automatically
 *   DATABASE_URL=... node server.js  # Or pass env vars directly
 *
 * For Snowflake SSO testing, also set:
 *   SNOWFLAKE_OAUTH_ACCOUNT=xy12345.us-east-1
 *   SNOWFLAKE_OAUTH_CLIENT_ID=your-client-id
 *   SNOWFLAKE_OAUTH_CLIENT_SECRET=your-client-secret
 *   SNOWFLAKE_OAUTH_REDIRECT_URI=http://localhost:3456/api/tinypivot/auth/snowflake/callback
 *
 * Then open http://localhost:3456 in your browser.
 */

import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTinyPivotHandler } from '@smallwebco/tinypivot-server'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env file if it exists (simple parser, no dependencies)
const envPath = join(__dirname, '.env')
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#'))
      continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1)
      continue
    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()
    // Remove surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1)
    }
    // Only set if not already defined (env vars take precedence)
    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

const PORT = process.env.PORT || 3456

// Check required environment variables
if (!process.env.DATABASE_URL) {
  console.error('Error: DATABASE_URL environment variable is required')
  process.exit(1)
}

if (!process.env.CREDENTIAL_ENCRYPTION_KEY) {
  console.warn('Warning: CREDENTIAL_ENCRYPTION_KEY not set, using default (NOT SECURE FOR PRODUCTION)')
  process.env.CREDENTIAL_ENCRYPTION_KEY = 'demo-encryption-key-min-32-chars!'
}

// Build Snowflake OAuth config if environment variables are set
const snowflakeOAuthConfig = process.env.SNOWFLAKE_OAUTH_CLIENT_ID
  ? {
      account: process.env.SNOWFLAKE_OAUTH_ACCOUNT,
      clientId: process.env.SNOWFLAKE_OAUTH_CLIENT_ID,
      clientSecret: process.env.SNOWFLAKE_OAUTH_CLIENT_SECRET,
      redirectUri: process.env.SNOWFLAKE_OAUTH_REDIRECT_URI || `http://localhost:${PORT}/api/tinypivot/auth/snowflake/callback`,
    }
  : undefined

// Build org datasources list
const orgDatasources = []

// PostgreSQL org datasource (if configured)
if (process.env.ANALYTICS_HOST) {
  orgDatasources.push({
    prefix: 'ANALYTICS',
    name: 'Analytics DB (Org)',
    type: 'postgres',
  })
}

// Snowflake org datasource with keypair auth (if configured)
// Supports custom env var names via envMapping
if (process.env.SNOWFLAKE_ACCOUNT || process.env.SF_ACCOUNT) {
  orgDatasources.push({
    prefix: 'SNOWFLAKE',
    name: 'Snowflake (Org)',
    type: 'snowflake',
    description: 'Organization Snowflake warehouse',
    // Map to your existing env var names
    envMapping: {
      account: process.env.SF_ACCOUNT ? 'SF_ACCOUNT' : 'SNOWFLAKE_ACCOUNT',
      user: process.env.SF_USER ? 'SF_USER' : 'SNOWFLAKE_USER',
      password: process.env.SF_PASSWORD ? 'SF_PASSWORD' : 'SNOWFLAKE_PASSWORD',
      privateKey: process.env.SF_PRIVATE_KEY ? 'SF_PRIVATE_KEY' : 'SNOWFLAKE_PRIVATE_KEY',
      privateKeyPath: process.env.SF_PRIVATE_KEY_PATH ? 'SF_PRIVATE_KEY_PATH' : 'SNOWFLAKE_PRIVATE_KEY_PATH',
      privateKeyPassphrase: process.env.SF_PRIVATE_KEY_PASSPHRASE ? 'SF_PRIVATE_KEY_PASSPHRASE' : 'SNOWFLAKE_PRIVATE_KEY_PASSPHRASE',
      warehouse: process.env.SF_WAREHOUSE ? 'SF_WAREHOUSE' : 'SNOWFLAKE_WAREHOUSE',
      database: process.env.SF_DATABASE ? 'SF_DATABASE' : 'SNOWFLAKE_DATABASE',
      schema: process.env.SF_SCHEMA ? 'SF_SCHEMA' : 'SNOWFLAKE_SCHEMA',
      role: process.env.SF_ROLE ? 'SF_ROLE' : 'SNOWFLAKE_ROLE',
    },
  })
}

// Create the TinyPivot handler with datasource support
const tinyPivotHandler = createTinyPivotHandler({
  connectionString: process.env.DATABASE_URL,
  credentialEncryptionKey: process.env.CREDENTIAL_ENCRYPTION_KEY,
  orgDatasources,
  // Snowflake OAuth configuration for browser SSO (optional)
  snowflakeOAuth: snowflakeOAuthConfig,
})

// Simple HTTP server
const server = createServer(async (req, res) => {
  // CORS headers for local development
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  // Serve the demo HTML page
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    try {
      const html = await readFile(join(__dirname, 'index.html'), 'utf-8')
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(html)
    }
    catch {
      res.writeHead(500)
      res.end('Failed to load index.html')
    }
    return
  }

  // Handle OAuth callback (GET request from Snowflake)
  if (req.method === 'GET' && req.url?.startsWith('/api/tinypivot/auth/snowflake/callback')) {
    try {
      const url = new URL(req.url, `http://localhost:${PORT}`)
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')
      const error = url.searchParams.get('error')
      const errorDescription = url.searchParams.get('error_description')

      // Forward to the TinyPivot handler as a POST request
      const request = new Request(`http://localhost:${PORT}/api/tinypivot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'snowflake-oauth-callback',
          code,
          state,
          oauthError: error,
          oauthErrorDescription: errorDescription,
        }),
      })

      const response = await tinyPivotHandler(request)
      const responseBody = await response.text()

      // The response is HTML for the popup
      res.writeHead(response.status, {
        'Content-Type': response.headers.get('Content-Type') || 'text/html',
      })
      res.end(responseBody)
    }
    catch (error) {
      console.error('OAuth callback error:', error)
      res.writeHead(500, { 'Content-Type': 'text/html' })
      res.end(`<html><body><h1>Error</h1><p>${error.message}</p></body></html>`)
    }
    return
  }

  // Handle API requests
  if (req.method === 'POST' && req.url === '/api/tinypivot') {
    try {
      // Read request body
      const chunks = []
      for await (const chunk of req) {
        chunks.push(chunk)
      }
      const body = Buffer.concat(chunks).toString()

      // Create a Request object for the handler
      const request = new Request(`http://localhost:${PORT}/api/tinypivot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })

      // Call the TinyPivot handler
      const response = await tinyPivotHandler(request)
      const responseBody = await response.text()

      res.writeHead(response.status, {
        'Content-Type': 'application/json',
      })
      res.end(responseBody)
    }
    catch (error) {
      console.error('API error:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
    return
  }

  // 404 for everything else
  res.writeHead(404)
  res.end('Not Found')
})

server.listen(PORT, () => {
  console.log('')
  console.log('='.repeat(60))
  console.log('  TinyPivot Datasource Demo')
  console.log('='.repeat(60))
  console.log('')
  console.log(`  Server running at: http://localhost:${PORT}`)
  console.log('')
  console.log('  Environment:')
  console.log(`    DATABASE_URL: ${process.env.DATABASE_URL.replace(/:[^@]+@/, ':***@')}`)
  console.log(`    CREDENTIAL_ENCRYPTION_KEY: ${process.env.CREDENTIAL_ENCRYPTION_KEY ? '(set)' : '(default)'}`)
  if (process.env.ANALYTICS_HOST) {
    console.log(`    ANALYTICS_HOST: ${process.env.ANALYTICS_HOST} (org datasource)`)
  }
  const sfAccount = process.env.SNOWFLAKE_ACCOUNT || process.env.SF_ACCOUNT
  if (sfAccount) {
    const hasPrivateKey = !!(process.env.SNOWFLAKE_PRIVATE_KEY || process.env.SF_PRIVATE_KEY
      || process.env.SNOWFLAKE_PRIVATE_KEY_PATH || process.env.SF_PRIVATE_KEY_PATH)
    console.log(`    SNOWFLAKE: ${sfAccount} (org datasource, ${hasPrivateKey ? 'keypair' : 'password'} auth)`)
  }
  if (snowflakeOAuthConfig) {
    console.log(`    SNOWFLAKE_OAUTH: enabled (account: ${snowflakeOAuthConfig.account})`)
    console.log(`      Callback URL: ${snowflakeOAuthConfig.redirectUri}`)
  }
  else {
    console.log('    SNOWFLAKE_OAUTH: not configured (set SNOWFLAKE_OAUTH_* env vars for browser SSO)')
  }
  // AI configuration
  if (process.env.AI_API_KEY) {
    const keyPreview = `${process.env.AI_API_KEY.slice(0, 10)}...`
    const model = process.env.AI_MODEL || '(provider default)'
    console.log(`    AI_API_KEY: ${keyPreview}`)
    console.log(`    AI_MODEL: ${model}`)
  }
  else {
    console.log('    AI: not configured (set AI_API_KEY env var to enable)')
  }
  console.log('')
  console.log('  Open your browser to test the datasource API!')
  console.log('='.repeat(60))
  console.log('')
})
