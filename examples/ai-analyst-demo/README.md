# TinyPivot AI Data Analyst Example

A complete example showing how to set up TinyPivot's AI Data Analyst with a PostgreSQL backend.

## Features

- **AI-Powered Data Exploration**: Ask questions about your data in natural language
- **Auto Table Discovery**: Tables are automatically discovered from your PostgreSQL database
- **Schema Introspection**: Column types are detected and displayed
- **Safe Query Execution**: Only SELECT queries are allowed, with built-in validation
- **Multi-Provider AI Support**: Works with OpenAI, Anthropic, and OpenRouter

## Quick Start

### 1. Install dependencies

From the TinyPivot monorepo root:

```bash
pnpm install
```

Or from this directory (standalone):

```bash
cd examples/ai-analyst-demo
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
# PostgreSQL connection (required)
DATABASE_URL=postgresql://user:password@localhost:5432/your_database

# AI API key (required for AI features)
AI_API_KEY=sk-your-api-key-here

# Optional: Override AI model
AI_MODEL=google/gemini-2.0-flash-001

# Optional: TinyPivot Pro license key
VITE_TINYPIVOT_LICENSE_KEY=TP-PRO1-...
```

### 3. Run the application

```bash
pnpm dev:all
```

This starts both:
- **API Server** on http://localhost:3001 - Handles database queries and AI chat
- **Frontend** on http://localhost:5173 - Vue 3 app with TinyPivot

### 4. Open in browser

Visit http://localhost:5173

## AI Provider Setup

The AI provider is auto-detected from your API key format:

| Key Format | Provider | Default Model |
|------------|----------|---------------|
| `sk-...` | OpenAI | gpt-4o-mini |
| `sk-ant-...` | Anthropic | claude-3-haiku-20240307 |
| `sk-or-...` | OpenRouter | anthropic/claude-3-haiku |

Override the model with `AI_MODEL` in your `.env`:

```env
# OpenRouter examples
AI_MODEL=google/gemini-2.0-flash-001
AI_MODEL=anthropic/claude-sonnet-4-20250514
AI_MODEL=openai/gpt-4o

# Direct Anthropic
AI_MODEL=claude-sonnet-4-20250514

# Direct OpenAI
AI_MODEL=gpt-4o
```

## Project Structure

```
ai-analyst-demo/
├── api/
│   └── server.ts      # Express server with tinypivot-server handler
├── src/
│   ├── App.vue        # Main Vue component
│   ├── main.ts        # Vue app entry
│   └── vite-env.d.ts  # TypeScript declarations
├── .env.example       # Environment template
├── .gitignore
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Customization

### Filter Exposed Tables

Edit `api/server.ts` to restrict which tables are visible:

```typescript
const tinyPivotHandler = createTinyPivotHandler({
  tables: {
    include: ['users', 'orders', 'products'],
    exclude: ['migrations', 'sessions', /^_/],
    descriptions: {
      users: 'User accounts and profiles',
      orders: 'Customer orders with line items',
    }
  }
})
```

### Limit Query Results

```typescript
const tinyPivotHandler = createTinyPivotHandler({
  maxRows: 10000,    // Max rows returned
  timeout: 30000,    // Query timeout in ms
})
```

## Security

The `@smallwebco/tinypivot-server` package includes built-in protections:

- **SQL Validation**: Only SELECT queries are allowed
- **Table Whitelisting**: Optionally restrict which tables are exposed
- **Error Sanitization**: Connection strings are stripped from error messages

## Learn More

- [TinyPivot Documentation](https://tiny-pivot.com)
- [GitHub Repository](https://github.com/Small-Web-Co/tinypivot)
- [Purchase Pro License](https://tiny-pivot.com/#pricing)
