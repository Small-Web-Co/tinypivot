# @smallwebco/tinypivot-vue

A lightweight data grid with pivot tables, charts, and optional AI-powered data exploration for Vue 3. **Under 50KB gzipped** — 10x smaller than AG Grid.

**[Live Demo](https://tiny-pivot.com)** · **[Buy License](https://tiny-pivot.com/#pricing)**

## Why TinyPivot?

- **Lightweight**: Under 50KB gzipped vs 500KB+ for AG Grid
- **Batteries Included**: Pivot tables, 6 chart types, Excel-like features out of the box
- **AI Data Analyst** (Pro): Natural language queries with BYOK — use your own OpenAI/Anthropic key
- **One-Time License**: No subscriptions — pay once, use forever

## Installation

```bash
pnpm add @smallwebco/tinypivot-vue
```

## Quick Start

```vue
<script setup lang="ts">
import { DataGrid } from '@smallwebco/tinypivot-vue'
import '@smallwebco/tinypivot-vue/style.css'

const data = [
  { id: 1, region: 'North', product: 'Widget A', sales: 12500, units: 150 },
  { id: 2, region: 'North', product: 'Widget B', sales: 8300, units: 95 },
  { id: 3, region: 'South', product: 'Widget A', sales: 15200, units: 180 },
  { id: 4, region: 'South', product: 'Widget B', sales: 9800, units: 110 },
]
</script>

<template>
  <DataGrid
    :data="data"
    :enable-export="true"
    :enable-search="true"
    :enable-pagination="true"
    :page-size="100"
    theme="light"
  />
</template>
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

## Events

| Event | Payload | Description |
|-------|---------|-------------|
| `@cell-click` | `{ row, col, value, rowData }` | Cell clicked |
| `@selection-change` | `{ cells, values }` | Selection changed |
| `@export` | `{ rowCount, filename }` | CSV exported |
| `@copy` | `{ text, cellCount }` | Cells copied |

## AI Data Analyst (Pro)

Optional AI-powered data analyst that lets users explore data using natural language. Ask questions like "What's the return rate by category?" and get instant results.

> See the [AI Analyst Demo](https://github.com/Small-Web-Co/tinypivot/tree/master/examples/ai-analyst-demo) for a complete working example.

```vue
<script setup lang="ts">
import { DataGrid } from '@smallwebco/tinypivot-vue'
import '@smallwebco/tinypivot-vue/style.css'

const data = [/* your data */]

const aiConfig = {
  enabled: true,
  aiEndpoint: '/api/ai-proxy',           // Your AI proxy endpoint
  databaseEndpoint: '/api/tp-database',  // Optional: auto-discover tables
  aiModelName: 'Claude Sonnet 4',        // Optional: display in UI
  persistToLocalStorage: true,           // Preserve conversation on tab switch
}
</script>

<template>
  <DataGrid
    :data="data"
    :ai-analyst="aiConfig"
  />
</template>
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

### AI Analyst Events

| Event | Payload | Description |
|-------|---------|-------------|
| `@ai-data-loaded` | `{ data, query, rowCount }` | Query results loaded |
| `@ai-conversation-update` | `{ conversation }` | Conversation state changed |
| `@ai-query-executed` | `{ query, rowCount, duration, success }` | SQL query executed |
| `@ai-error` | `{ message, type }` | Error occurred |

### State Preservation

The AI Analyst preserves state when switching between tabs (Grid, Pivot, Chart, AI):

- **Conversation history** is maintained in memory
- **Query results** are preserved
- **SQL queries** remain accessible via the SQL panel

To persist across page refreshes, enable `persistToLocalStorage: true`. The conversation will be saved to localStorage using the `sessionId` as the key.

For production apps, listen to `@ai-conversation-update` to implement your own persistence:

```vue
<template>
  <DataGrid
    :data="data"
    :ai-analyst="aiConfig"
    @ai-conversation-update="saveConversation"
  />
</template>

<script setup>
function saveConversation({ conversation }) {
  // Save to your backend
  api.saveConversation(userId, conversation)
}
</script>
```

## Documentation

See the [full documentation](https://github.com/Small-Web-Co/tinypivot) for complete API reference, styling, and Pro license activation.

## License

- **Free Tier**: MIT License for basic grid features
- **Pro Features**: Commercial license required

**[Purchase at tiny-pivot.com/#pricing](https://tiny-pivot.com/#pricing)**

---

Built with ❤️ by [Small Web, LLC](https://thesmallweb.co)
