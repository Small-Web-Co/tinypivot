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
 */

import { createTinyPivotHandler } from '@smallwebco/tinypivot-server'
import cors from 'cors'
import express from 'express'
import 'dotenv/config'

const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env.PORT || 3001

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
})

// Mount the unified TinyPivot endpoint
app.post('/api/tinypivot', async (req, res) => {
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
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    })
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
  console.log(`\n💡 Open http://localhost:5173 in your browser\n`)
})
