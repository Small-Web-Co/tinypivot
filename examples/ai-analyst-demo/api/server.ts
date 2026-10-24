/**
 * TinyPivot AI Server with PostgreSQL backend
 *
 * Uses @smallwebco/tinypivot-server for:
 * - Auto-discovery of database tables
 * - Schema introspection
 * - SQL query execution with safety validation
 * - AI chat proxy
 *
 * Run with: pnpm server
 *
 * Security notes:
 * - Set `TINYPIVOT_API_TOKEN` and send it as `Authorization: Bearer <token>`.
 *   Without it, this server refuses to start when NODE_ENV=production.
 * - Browser requests are only accepted from `ALLOWED_ORIGINS` (comma-separated)
 *   plus localhost during development.
 * - The database session used for queries is READ ONLY, and every table
 *   reference is checked against the tables exposed by this server.
 */

import { timingSafeEqual } from 'node:crypto'
import { createTinyPivotHandler } from '@smallwebco/tinypivot-server'
import express from 'express'
import 'dotenv/config'

const app = express()
app.disable('x-powered-by')

const PORT = process.env.PORT || 3001

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const apiToken = process.env.TINYPIVOT_API_TOKEN

const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
]

const allowedOrigins = new Set([
  ...defaultOrigins,
  ...(process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean),
])

// Validate required environment variables
if (!process.env.DATABASE_URL) {
  console.error('\n❌ DATABASE_URL is required')
  console.error('   Set it in .env or as an environment variable\n')
  process.exit(1)
}

if (!process.env.AI_API_KEY) {
  console.warn('\n⚠️  AI_API_KEY not set - AI chat will be disabled')
  console.warn('   Set it in .env to enable AI features\n')
}

if (!apiToken) {
  if (process.env.NODE_ENV === 'production') {
    console.error('\n❌ TINYPIVOT_API_TOKEN is required in production')
    console.error('   This endpoint exposes database queries and AI chat.\n')
    process.exit(1)
  }
  console.warn('\n⚠️  TINYPIVOT_API_TOKEN not set - the API is unauthenticated.')
  console.warn('   This is only safe for local development.\n')
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(express.json({ limit: '1mb' }))

// CORS: only the configured origins may call this API from a browser.
app.use((req, res, next) => {
  const origin = req.headers.origin

  if (!origin) {
    return next()
  }

  if (!allowedOrigins.has(origin)) {
    return res.status(403).json({ error: 'Origin not allowed' })
  }

  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  return next()
})

// Light per-IP rate limiting (best effort, per process).
const RATE_LIMIT_PER_MINUTE = Number(process.env.RATE_LIMIT_PER_MINUTE) || 120
const rateBuckets = new Map<string, { count: number, resetAt: number }>()

function rateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  const now = Date.now()
  const key = req.socket.remoteAddress || 'unknown'
  const bucket = rateBuckets.get(key)

  if (bucket && now < bucket.resetAt) {
    if (bucket.count >= RATE_LIMIT_PER_MINUTE) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000)
      res.setHeader('Retry-After', String(retryAfter))
      return res.status(429).json({
        error: `Rate limit exceeded. Max ${RATE_LIMIT_PER_MINUTE} requests per minute.`,
        retryAfter,
      })
    }
    bucket.count++
  }
  else {
    rateBuckets.set(key, { count: 1, resetAt: now + 60_000 })
    if (rateBuckets.size > 5000) {
      for (const [bucketKey, entry] of rateBuckets) {
        if (now >= entry.resetAt) {
          rateBuckets.delete(bucketKey)
        }
      }
    }
  }

  return next()
}

function safeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a)
  const bufferB = Buffer.from(b)
  if (bufferA.length !== bufferB.length) {
    return false
  }
  return timingSafeEqual(bufferA, bufferB)
}

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!apiToken) {
    // Local development without a token - warned about at startup.
    return next()
  }

  const authorization = req.headers.authorization
  const provided = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : (req.headers['x-api-token'] as string | undefined)

  if (!provided || !safeCompare(provided, apiToken)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  return next()
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

// Create the TinyPivot handler with PostgreSQL connection
const tinyPivotHandler = createTinyPivotHandler({
  // Optional: filter which tables are exposed
  // tables: {
  //   include: ['users', 'orders', 'products'],
  //   exclude: ['migrations', 'sessions'],
  //   descriptions: {
  //     users: 'User accounts and profiles',
  //     orders: 'Customer orders with line items',
  //   }
  // },

  // Optional: limit query results
  // maxRows: 10000,
  // timeout: 30000,

  // Reject SQL the parser cannot understand (fail closed).
  strictSqlValidation: process.env.STRICT_SQL_VALIDATION === '1',
})

// Mount the unified TinyPivot endpoint
app.post('/api/tinypivot', requireAuth, rateLimit, async (req, res) => {
  try {
    const response = await tinyPivotHandler(
      new Request('http://localhost/api/tinypivot', {
        method: 'POST',
        body: JSON.stringify(req.body),
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const data = await response.json()
    res.status(response.status).json(data)
  }
  catch (error) {
    console.error('TinyPivot error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    database: !!process.env.DATABASE_URL,
    ai: !!process.env.AI_API_KEY,
  })
})

app.listen(PORT, () => {
  console.log(`\n🚀 TinyPivot AI Server running at http://localhost:${PORT}`)
  console.log(`📊 Database: Connected`)
  console.log(`🤖 AI: ${process.env.AI_API_KEY ? 'Enabled' : 'Disabled'}`)
  console.log(`🔐 Auth: ${apiToken ? 'Bearer token required' : 'disabled (development only)'}`)
  console.log(`\n💡 Open http://localhost:5173 in your browser\n`)
})
