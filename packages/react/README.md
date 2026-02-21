# @smallwebco/tinypivot-react

A lightweight data grid with pivot tables, charts, and optional AI-powered data exploration for React. **Under 40KB gzipped** — 10x smaller than AG Grid.

**[Live Demo](https://tiny-pivot.com)** · **[Buy License](https://tiny-pivot.com/#pricing)**

## Why TinyPivot?

- **Lightweight**: Under 40KB gzipped vs 500KB+ for AG Grid
- **Batteries Included**: Pivot tables, 6 chart types, Excel-like features out of the box
- **AI Data Analyst** (Pro): Natural language queries with BYOK — use your own OpenAI/Anthropic key
- **One-Time License**: No subscriptions — pay once, use forever

## Installation

```bash
pnpm add @smallwebco/tinypivot-react
```

## Quick Start

```tsx
import { DataGrid } from '@smallwebco/tinypivot-react'
import '@smallwebco/tinypivot-react/style.css'

const data = [
  { id: 1, region: 'North', product: 'Widget A', sales: 12500, units: 150 },
  { id: 2, region: 'North', product: 'Widget B', sales: 8300, units: 95 },
  { id: 3, region: 'South', product: 'Widget A', sales: 15200, units: 180 },
  { id: 4, region: 'South', product: 'Widget B', sales: 9800, units: 110 },
]

export default function App() {
  return (
    <DataGrid
      data={data}
      enableExport={true}
      enableSearch={true}
      enablePagination={true}
      pageSize={100}
      theme="light"
    />
  )
}
```

## Features

| Feature | Free | Pro |
|---------|:----:|:---:|
| Excel-like data grid | ✅ | ✅ |
| Column filtering & sorting | ✅ | ✅ |
| Global search | ✅ | ✅ |
| CSV export | ✅ | ✅ |
| Pagination | ✅ | ✅ |
| Column resizing | ✅ | ✅ |
| Clipboard (Ctrl+C) | ✅ | ✅ |
| Dark mode | ✅ | ✅ |
| **AI Data Analyst** (natural language, BYOK) | ❌ | ✅ |
| **Chart Builder** (6 chart types) | ❌ | ✅ |
| Pivot table | ❌ | ✅ |
| Aggregations (Sum, Avg, etc.) | ❌ | ✅ |
| Row/column totals | ❌ | ✅ |
| No watermark | ❌ | ✅ |

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `Record<string, unknown>[]` | **required** | Array of data objects |
| `loading` | `boolean` | `false` | Show loading spinner |
| `fontSize` | `'xs' \| 'sm' \| 'base'` | `'xs'` | Font size preset |
| `showPivot` | `boolean` | `true` | Show pivot toggle (Pro) |
| `enableExport` | `boolean` | `true` | Show CSV export button |
| `enableSearch` | `boolean` | `true` | Show global search |
| `enablePagination` | `boolean` | `false` | Enable pagination |
| `pageSize` | `number` | `50` | Rows per page |
| `enableColumnResize` | `boolean` | `true` | Drag to resize columns |
| `enableClipboard` | `boolean` | `true` | Ctrl+C to copy cells |
| `theme` | `'light' \| 'dark' \| 'auto'` | `'light'` | Color theme |
| `numberFormat` | `'us' \| 'eu' \| 'plain'` | `'us'` | Number display format: US (1,234.56), EU (1.234,56), plain (1234.56) |
| `dateFormat` | `'us' \| 'eu' \| 'iso'` | `'iso'` | Date display format: US (MM/DD/YYYY), EU (DD/MM/YYYY), ISO (YYYY-MM-DD) |
| `fieldRoleOverrides` | `Record<string, FieldRole>` | `undefined` | Override auto-detected chart field roles per column (`'dimension'` \| `'measure'` \| `'temporal'`) |

## Callbacks

| Prop | Type | Description |
|------|------|-------------|
| `onCellClick` | `(payload) => void` | Cell clicked |
| `onSelectionChange` | `(payload) => void` | Selection changed |
| `onExport` | `(payload) => void` | CSV exported |
| `onCopy` | `(payload) => void` | Cells copied |

## AI Data Analyst (Pro)

Optional AI-powered data analyst that lets users explore data using natural language. Ask questions like "What's the return rate by category?" and get instant results.

> See the [AI Analyst Demo](https://github.com/Small-Web-Co/tinypivot/tree/master/examples/ai-analyst-demo) for a complete working example.

```tsx
import { DataGrid } from '@smallwebco/tinypivot-react'
import '@smallwebco/tinypivot-react/style.css'

const data = [/* your data */]

const aiConfig = {
  enabled: true,
  aiEndpoint: '/api/ai-proxy',           // Your AI proxy endpoint
  databaseEndpoint: '/api/tp-database',  // Optional: auto-discover tables
  aiModelName: 'Claude Sonnet 4',        // Optional: display in UI
  persistToLocalStorage: true,           // Preserve conversation on tab switch
}

export default function App() {
  return (
    <DataGrid
      data={data}
      aiAnalyst={aiConfig}
    />
  )
}
```

### AI Analyst Config Options

| Option | Type | Description |
|--------|------|-------------|
| `enabled` | `boolean` | Enable the AI Analyst tab |
| `aiEndpoint` | `string` | Your AI proxy endpoint (keeps API keys secure) |
| `databaseEndpoint` | `string` | Unified endpoint for table discovery and queries |
| `dataSources` | `AIDataSource[]` | Manual list of available tables |
| `queryExecutor` | `function` | Custom query executor (e.g., client-side DuckDB) |
| `aiModelName` | `string` | Display name for the AI model in UI |
| `persistToLocalStorage` | `boolean` | Persist conversation across tab switches |
| `sessionId` | `string` | Unique session ID for conversation isolation |
| `maxRows` | `number` | Max rows to return (default: 10000) |
| `demoMode` | `boolean` | Use canned responses (no real AI calls) |

### AI Analyst Callbacks

| Prop | Type | Description |
|------|------|-------------|
| `onAIDataLoaded` | `(payload) => void` | Query results loaded |
| `onAIConversationUpdate` | `(payload) => void` | Conversation state changed |
| `onAIQueryExecuted` | `(payload) => void` | SQL query executed |
| `onAIError` | `(payload) => void` | Error occurred |

### State Preservation

The AI Analyst preserves state when switching between tabs (Grid, Pivot, Chart, AI):

- **Conversation history** is maintained in memory
- **Query results** are preserved
- **SQL queries** remain accessible via the SQL panel

To persist across page refreshes, enable `persistToLocalStorage: true`. The conversation will be saved to localStorage using the `sessionId` as the key.

For production apps, use `onAIConversationUpdate` to implement your own persistence:

```tsx
function App() {
  const saveConversation = ({ conversation }) => {
    // Save to your backend
    api.saveConversation(userId, conversation)
  }

  return (
    <DataGrid
      data={data}
      aiAnalyst={aiConfig}
      onAIConversationUpdate={saveConversation}
    />
  )
}
```

## Documentation

See the [full documentation](https://github.com/Small-Web-Co/tinypivot) for complete API reference, styling, and Pro license activation.

## License

- **Free Tier**: MIT License for basic grid features
- **Pro Features**: Commercial license required

**[Purchase at tiny-pivot.com/#pricing](https://tiny-pivot.com/#pricing)**

---

Built with ❤️ by [Small Web, LLC](https://thesmallweb.co)
