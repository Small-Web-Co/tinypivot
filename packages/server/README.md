# @smallwebco/tinypivot-server

Server-side handlers for TinyPivot AI Data Analyst.

## Two Deployment Options

### Option 1: Full Server (PostgreSQL + AI)

Use this when you have a PostgreSQL database. The unified handler provides:
- Auto-discovery of tables from your database
- Schema introspection  
- SQL query execution with safety validation
- AI chat proxy

### Option 2: Client-Side Queries + AI Proxy Only

Use this when your data is already in the browser (e.g., DuckDB WASM, static data). You only need a server endpoint for AI chat to keep API keys secure.

---

## Option 1: Full Server Setup

### Requirements

- PostgreSQL database
- AI API key (OpenAI, Anthropic, or OpenRouter)
- Node.js 18+

### 1. Install

```bash
pnpm add @smallwebco/tinypivot-server pg
```

### 2. Set Environment Variables

```bash
# .env
DATABASE_URL=postgresql://user:password@localhost:5432/mydb
AI_API_KEY=sk-...  # Your API key

# Optional: Override the default model
AI_MODEL=claude-sonnet-4-20250514
```

The AI provider is **auto-detected** from your API key format:
- `sk-ant-...` → Anthropic (defaults to `claude-3-haiku-20240307`)
- `sk-or-...` → OpenRouter (defaults to `anthropic/claude-3-haiku`)
- `sk-...` → OpenAI (defaults to `gpt-4o-mini`)

Default models are cheap/fast. Override with `AI_MODEL` for better quality.

### 3. Create API Endpoint

**Next.js App Router**

```typescript
// app/api/tinypivot/route.ts
import { createTinyPivotHandler } from '@smallwebco/tinypivot-server'

export const POST = createTinyPivotHandler()
```

**Next.js Pages Router**

```typescript
// pages/api/tinypivot.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { createTinyPivotHandler } from '@smallwebco/tinypivot-server'

const handler = createTinyPivotHandler()

export default async function (req: NextApiRequest, res: NextApiResponse) {
  const response = await handler(
    new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify(req.body),
      headers: { 'Content-Type': 'application/json' },
    })
  )
  const data = await response.json()
  res.status(response.status).json(data)
}
```

**Express**

```typescript
import express from 'express'
import { createTinyPivotHandler } from '@smallwebco/tinypivot-server'

const app = express()
app.use(express.json())

const handler = createTinyPivotHandler()

app.post('/api/tinypivot', async (req, res) => {
  const response = await handler(
    new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify(req.body),
      headers: { 'Content-Type': 'application/json' },
    })
  )
  const data = await response.json()
  res.status(response.status).json(data)
})
```

### 4. Use in Frontend

**Vue 3**

```vue
<script setup>
import { DataGrid } from '@smallwebco/tinypivot-vue'
import '@smallwebco/tinypivot-vue/style.css'
</script>

<template>
  <DataGrid 
    :data="[]" 
    :ai-analyst="{ endpoint: '/api/tinypivot' }"
  />
</template>
```

**React**

```tsx
import { DataGrid } from '@smallwebco/tinypivot-react'
import '@smallwebco/tinypivot-react/style.css'

function App() {
  return (
    <DataGrid 
      data={[]} 
      aiAnalyst={{ endpoint: '/api/tinypivot' }}
    />
  )
}
```

---

## Option 2: Client-Side Queries + AI Proxy

Use this when you're executing queries in the browser (e.g., DuckDB WASM) and only need the server for AI chat.

### 1. Create AI-Only Endpoint

```typescript
// api/ai-proxy.ts (Vercel) or your framework equivalent
export default async function handler(req, res) {
  const apiKey = process.env.AI_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'AI_API_KEY not configured' })
  }

  const { messages } = req.body

  // Auto-detect provider from key format
  const isAnthropic = apiKey.startsWith('sk-ant-')
  const isOpenRouter = apiKey.startsWith('sk-or-')

  // Call the appropriate API...
  // (See full implementation in the TinyPivot demo)

  return res.json({ content: aiResponse })
}
```

### 2. Configure Frontend with queryExecutor

**Vue 3**

```vue
<script setup>
import { DataGrid } from '@smallwebco/tinypivot-vue'
import '@smallwebco/tinypivot-vue/style.css'

// Your client-side query function (e.g., DuckDB WASM)
async function executeQuery(sql: string, table: string) {
  const result = await duckdb.query(sql)
  return {
    data: result.toArray(),
    rowCount: result.numRows,
  }
}

const aiConfig = {
  endpoint: '/api/ai-proxy',      // Server endpoint for AI chat only
  queryExecutor: executeQuery,     // Client-side SQL execution
  dataSources: [
    { id: 'sales', table: 'sales', name: 'Sales Data', description: 'Sales transactions' }
  ],
  dataSourceLoader: async (id) => {
    // Load data into your client-side DB and return schema
    const data = await loadDataset(id)
    return { data, schema: inferSchema(data) }
  }
}
</script>

<template>
  <DataGrid :data="myData" :ai-analyst="aiConfig" />
</template>
```

**React**

```tsx
import { DataGrid } from '@smallwebco/tinypivot-react'
import '@smallwebco/tinypivot-react/style.css'

function App() {
  const executeQuery = async (sql: string, table: string) => {
    const result = await duckdb.query(sql)
    return { data: result.toArray(), rowCount: result.numRows }
  }

  const aiConfig = {
    endpoint: '/api/ai-proxy',
    queryExecutor: executeQuery,
    dataSources: [
      { id: 'sales', table: 'sales', name: 'Sales Data', description: 'Sales transactions' }
    ],
    dataSourceLoader: async (id) => {
      const data = await loadDataset(id)
      return { data, schema: inferSchema(data) }
    }
  }

  return <DataGrid data={myData} aiAnalyst={aiConfig} />
}
```

---

## Configuration Options

### Handler Options (Full Server)

```typescript
createTinyPivotHandler({
  // PostgreSQL connection (default: process.env.DATABASE_URL)
  connectionString: 'postgresql://...',
  
  // AI API key (default: process.env.AI_API_KEY)
  apiKey: 'sk-...',
  
  // Table filtering
  tables: {
    include: ['sales', 'customers'],      // Only these tables
    exclude: [/^_/, 'migrations'],         // Exclude patterns
    schemas: ['public'],                   // PostgreSQL schemas
    descriptions: {                        // Context for AI
      sales: 'Sales transactions with revenue data',
    }
  },
  
  // Query limits (optional)
  maxRows: 10000,
  timeout: 30000,
  
  // AI settings
  model: 'claude-sonnet-4-20250514',      // Override default model
  maxTokens: 2048,
  
  // Error handling
  onError: (error) => console.error(error),
})
```

### AI Analyst Config (Frontend)

```typescript
interface AIAnalystConfig {
  // Required: API endpoint
  endpoint: string
  
  // For client-side queries (Option 2)
  queryExecutor?: (sql: string, table: string) => Promise<QueryResult>
  dataSources?: AIDataSource[]
  dataSourceLoader?: (id: string) => Promise<{ data: any[], schema?: Schema }>
  
  // Optional
  enabled?: boolean
  persistToLocalStorage?: boolean
  sessionId?: string
  maxRows?: number
  aiModelName?: string  // Display name in UI
}
```

---

## API Contract

The endpoint accepts POST requests with an `action` field:

### `list-tables`
```typescript
// Request
{ action: 'list-tables' }

// Response
{ tables: [{ name: 'sales', description: '...' }] }
```

### `get-schema`
```typescript
// Request
{ action: 'get-schema', tables: ['sales'] }

// Response
{ schemas: [{ table: 'sales', columns: [...] }] }
```

### `query`
```typescript
// Request
{ action: 'query', sql: 'SELECT ...', table: 'sales' }

// Response
{ success: true, data: [...], rowCount: 100, truncated: false }
```

### `chat`
```typescript
// Request
{ action: 'chat', messages: [{ role: 'user', content: '...' }] }

// Response
{ content: 'AI response with SQL...' }
```

---

## Security

Built-in protections:

1. **SQL Validation**: Only SELECT queries allowed
2. **Table Whitelisting**: Only configured tables are queryable
3. **LIMIT Enforcement**: Auto-added if missing
4. **Error Sanitization**: Connection strings stripped from errors

---

## Troubleshooting

| Error | Solution |
|-------|----------|
| "PostgreSQL driver not installed" | `pnpm add pg` |
| "Database connection not configured" | Set `DATABASE_URL` |
| "AI API key not configured" | Set `AI_API_KEY` |
| "Table X is not allowed" | Add to `tables.include` or remove from `tables.exclude` |

## License

MIT
