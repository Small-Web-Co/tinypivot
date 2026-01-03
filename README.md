# TinyPivot

**Embed an AI Data Analyst in your React or Vue app.** Ask questions in plain English, get instant SQL-powered insights. AI-enabled data grid with pivot tables and charts — all under 40KB gzipped.

**[Live Demo](https://tiny-pivot.com)** · **[Buy License](https://tiny-pivot.com/#pricing)** · **[GitHub Sponsors](https://github.com/sponsors/Small-Web-Co)**

⭐ **If you find TinyPivot useful, please consider giving it a star!** It helps others discover the project.

[![Star on GitHub](https://img.shields.io/github/stars/Small-Web-Co/tinypivot?style=social)](https://github.com/Small-Web-Co/tinypivot)
[![React Bundle](https://img.shields.io/badge/React-37KB%20gzip-brightgreen)](https://bundlephobia.com/package/@smallwebco/tinypivot-react)
[![Vue Bundle](https://img.shields.io/badge/Vue-47KB%20gzip-brightgreen)](https://bundlephobia.com/package/@smallwebco/tinypivot-vue)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue)](https://www.typescriptlang.org/)

![TinyPivot Demo](https://bvallieres.com/images/tinypivot_demo.gif)

## Why TinyPivot?

- **Embedded AI Data Analyst**: Let users ask questions in plain English — AI generates SQL and returns results instantly
- **Bring Your Own Key (BYOK)**: Use your own OpenAI, Anthropic, or any LLM API key — full control over costs and privacy
- **Lightweight**: Under 40KB gzipped vs 500KB+ for AG Grid (10x smaller)
- **Batteries Included**: Pivot tables, 6 chart types, Excel-like features out of the box
- **Framework Support**: First-class Vue 3 and React packages
- **One-Time License**: No subscriptions — pay once, use forever

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
| Keyboard navigation | ✅ | ✅ |
| Pivot table with Sum aggregation | ✅ | ✅ |
| Row/column totals | ✅ | ✅ |
| **AI Data Analyst** (natural language queries, BYOK) | ❌ | ✅ |
| **Chart Builder** (6 chart types, drag-and-drop) | ❌ | ✅ |
| All aggregations (Count, Avg, Min, Max, Unique, Median, Std Dev, %) | ❌ | ✅ |
| Custom aggregation functions | ❌ | ✅ |
| Calculated fields with formulas | ❌ | ✅ |
| No watermark | ❌ | ✅ |

## Installation

### Vue 3

```bash
pnpm add @smallwebco/tinypivot-vue
```

### React

```bash
pnpm add @smallwebco/tinypivot-react
```

## Quick Start

### Vue 3

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
    :enable-column-resize="true"
    :enable-clipboard="true"
    theme="light"
    export-filename="my-data.csv"
  />
</template>
```

### React

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
      enableColumnResize={true}
      enableClipboard={true}
      theme="light"
      exportFilename="my-data.csv"
    />
  )
}
```

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
| `stripedRows` | `boolean` | `true` | Alternating row colors |
| `exportFilename` | `string` | `'data-export.csv'` | CSV filename |

## Data Shape

TinyPivot accepts an array of flat objects. Each object represents a row, and keys become column headers.

```typescript
// ✅ Correct - flat objects with consistent keys
const data = [
  { id: 1, name: 'Alice', sales: 1500, region: 'North' },
  { id: 2, name: 'Bob', sales: 2300, region: 'South' },
  { id: 3, name: 'Carol', sales: 1800, region: 'North' },
]

// ❌ Avoid - nested objects (won't display correctly)
const badData = [
  { id: 1, user: { name: 'Alice' }, metrics: { sales: 1500 } }
]
```

### Supported Value Types

| Type | Example | Display |
|------|---------|---------|
| `string` | `'Hello'` | As-is |
| `number` | `1234.56` | Formatted with commas |
| `boolean` | `true` | `true` / `false` |
| `null` / `undefined` | `null` | Empty cell |
| `Date` | `new Date()` | ISO string |

## Events

### Vue

| Event | Payload | Description |
|-------|---------|-------------|
| `@cell-click` | `{ row, col, value, rowData }` | Cell clicked |
| `@selection-change` | `{ cells, values }` | Selection changed |
| `@export` | `{ rowCount, filename }` | CSV exported |
| `@copy` | `{ text, cellCount }` | Cells copied |

```vue
<template>
  <DataGrid
    :data="data"
    @cell-click="({ rowData }) => console.log(rowData)"
    @export="({ rowCount }) => console.log(`Exported ${rowCount} rows`)"
  />
</template>
```

### React

| Prop | Type | Description |
|------|------|-------------|
| `onCellClick` | `(payload) => void` | Cell clicked |
| `onSelectionChange` | `(payload) => void` | Selection changed |
| `onExport` | `(payload) => void` | CSV exported |
| `onCopy` | `(payload) => void` | Cells copied |

```tsx
<DataGrid
  data={data}
  onCellClick={({ rowData }) => console.log(rowData)}
  onExport={({ rowCount }) => console.log(`Exported ${rowCount} rows`)}
/>
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+C` / `Cmd+C` | Copy selected cells |
| `Ctrl+F` / `Cmd+F` | Focus search input |
| `Arrow keys` | Navigate cells |
| `Shift+Arrow` | Extend selection |
| `Escape` | Clear selection/search |

## Aggregation Functions

TinyPivot includes 9 built-in aggregation functions plus support for custom calculations:

| Function | Symbol | Description |
|----------|--------|-------------|
| **Sum** | Σ | Total of all values |
| **Count** | # | Number of values |
| **Average** | x̄ | Mean of all values |
| **Min** | ↓ | Minimum value |
| **Max** | ↑ | Maximum value |
| **Unique** | ◇ | Count of distinct values |
| **Median** | M̃ | Middle value (outlier-resistant) |
| **Std Dev** | σ | Standard deviation (spread measure) |
| **% of Total** | %Σ | Percentage contribution to grand total |
| **Custom** | ƒ | Your own aggregation function |

## Embedded AI Data Analyst (Pro)

TinyPivot Pro includes an **embedded AI Data Analyst** that lets users explore data using natural language. Ask questions like "What's the return rate by category?" or "Show me sales trends over time" and get instant SQL-generated results.

**This is conversational analytics for your app** — no need to build complex dashboards or teach users SQL. The AI understands your data schema and generates appropriate queries automatically.

### Requirements

To enable the AI Data Analyst, you need:

1. **Pro License**: Call `setLicenseKey('YOUR_LICENSE_KEY')` at app startup
2. **AI Config**: Pass the `aiAnalyst` prop with `enabled: true`
3. **Data Sources**: For client-side data, configure `dataSources` and `dataSourceLoader`
4. **API Endpoint**: A server endpoint to proxy AI requests (keeps your API key secure)

### Key Benefits

- **Bring Your Own Key (BYOK)**: Use your own OpenAI, Anthropic, or OpenRouter API key — full control over costs and rate limits
- **Privacy-First**: Your data never passes through TinyPivot servers
- **Natural Language**: Ask questions in plain English — no SQL knowledge required for end users
- **Simple Setup**: One endpoint handles everything

### How It Works

1. User types a natural language question
2. AI generates a SQL query based on your data schema
3. Query executes against your data
4. Results display in the grid, ready for pivot/chart analysis

### Setup

#### Environment Variables

```bash
# .env
DATABASE_URL=postgresql://user:password@localhost:5432/mydb
AI_API_KEY=sk-...  # OpenAI, Anthropic, or OpenRouter key

# Optional: Override the default model
AI_MODEL=claude-sonnet-4-20250514
```

The AI provider is **auto-detected** from your API key format:
- `sk-ant-...` → Anthropic (defaults to `claude-3-haiku-20240307`)
- `sk-or-...` → OpenRouter (defaults to `anthropic/claude-3-haiku`)
- `sk-...` → OpenAI (defaults to `gpt-4o-mini`)

Default models are cheap/fast. Set `AI_MODEL` for better quality.

#### Option A: PostgreSQL (Recommended)

One unified endpoint handles table discovery, schema, queries, and AI chat:

```typescript
// Backend: app/api/tinypivot/route.ts (Next.js App Router)
import { createTinyPivotHandler } from '@smallwebco/tinypivot-server'

export const POST = createTinyPivotHandler({
  tables: {
    include: ['sales', 'customers', 'products'],  // Only expose these tables
    descriptions: {
      sales: 'Sales transactions with revenue data',
    }
  }
})
```

```vue
<!-- Frontend: Vue -->
<script setup lang="ts">
import { DataGrid, setLicenseKey } from '@smallwebco/tinypivot-vue'
import '@smallwebco/tinypivot-vue/style.css'

// Activate Pro license
setLicenseKey('YOUR_LICENSE_KEY')

const aiAnalystConfig = {
  enabled: true,
  endpoint: '/api/tinypivot',
}
</script>

<template>
  <DataGrid 
    :data="[]" 
    :ai-analyst="aiAnalystConfig"
  />
</template>
```

```tsx
// Frontend: React
import { DataGrid, setLicenseKey } from '@smallwebco/tinypivot-react'
import '@smallwebco/tinypivot-react/style.css'

// Activate Pro license
setLicenseKey('YOUR_LICENSE_KEY')

function App() {
  return (
    <DataGrid 
      data={[]} 
      aiAnalyst={{ enabled: true, endpoint: '/api/tinypivot' }}
    />
  )
}
```

#### Option B: Client-Side Data (In-Memory)

For client-side data that's already loaded in the browser, you must configure `dataSources` and `dataSourceLoader` to make your data available to the AI Analyst:

```vue
<!-- Vue 3 -->
<script setup lang="ts">
import { ref } from 'vue'
import { DataGrid, setLicenseKey } from '@smallwebco/tinypivot-vue'
import '@smallwebco/tinypivot-vue/style.css'

// Activate Pro license
setLicenseKey('YOUR_LICENSE_KEY')

// Your data
const salesData = ref([
  { id: 1, region: 'North', product: 'Widget A', sales: 12500, units: 150 },
  { id: 2, region: 'South', product: 'Widget B', sales: 8300, units: 95 },
  // ... more data
])

// Helper to infer schema from data
function inferSchema(data: Record<string, unknown>[]) {
  if (!data.length) return []
  const sample = data[0]
  return Object.entries(sample).map(([name, value]) => ({
    name,
    type: typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string',
  }))
}

// AI Analyst configuration
const aiAnalystConfig = {
  enabled: true,                        // Required: explicitly enable
  endpoint: '/api/ai-chat',             // Your AI proxy endpoint
  dataSources: [                        // Required: define available data sources
    {
      id: 'sales',
      table: 'sales',
      name: 'Sales Data',
      description: 'Sales transactions with region, product, sales amount, and units',
    },
  ],
  dataSourceLoader: async (id: string) => {  // Required: return data + schema
    if (id === 'sales') {
      return {
        data: salesData.value,
        schema: inferSchema(salesData.value),
      }
    }
    throw new Error(`Unknown data source: ${id}`)
  },
  persistToLocalStorage: true,          // Optional: save conversations
  sessionId: 'my-session',              // Optional: conversation ID
}
</script>

<template>
  <DataGrid
    :data="salesData"
    :ai-analyst="aiAnalystConfig"
  />
</template>
```

```tsx
// React
import { useState } from 'react'
import { DataGrid, setLicenseKey } from '@smallwebco/tinypivot-react'
import '@smallwebco/tinypivot-react/style.css'

// Activate Pro license
setLicenseKey('YOUR_LICENSE_KEY')

function inferSchema(data: Record<string, unknown>[]) {
  if (!data.length) return []
  const sample = data[0]
  return Object.entries(sample).map(([name, value]) => ({
    name,
    type: typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string',
  }))
}

function App() {
  const [salesData] = useState([
    { id: 1, region: 'North', product: 'Widget A', sales: 12500, units: 150 },
    { id: 2, region: 'South', product: 'Widget B', sales: 8300, units: 95 },
    // ... more data
  ])

  const aiAnalystConfig = {
    enabled: true,
    endpoint: '/api/ai-chat',
    dataSources: [
      {
        id: 'sales',
        table: 'sales',
        name: 'Sales Data',
        description: 'Sales transactions with region, product, sales amount, and units',
      },
    ],
    dataSourceLoader: async (id: string) => {
      if (id === 'sales') {
        return {
          data: salesData,
          schema: inferSchema(salesData),
        }
      }
      throw new Error(`Unknown data source: ${id}`)
    },
    persistToLocalStorage: true,
    sessionId: 'my-session',
  }

  return (
    <DataGrid
      data={salesData}
      aiAnalyst={aiAnalystConfig}
    />
  )
}
```

#### Option C: Client-Side Queries (DuckDB WASM)

For browser-based SQL execution with DuckDB WASM, add a `queryExecutor`:

```typescript
const aiConfig = {
  enabled: true,
  endpoint: '/api/ai-proxy',  // Server endpoint for AI chat
  queryExecutor: async (sql, table) => {
    // Execute SQL via DuckDB WASM (client-side)
    const result = await duckdb.query(sql)
    return { data: result.toArray(), rowCount: result.numRows }
  },
  dataSources: [
    { id: 'sales', table: 'sales', name: 'Sales Data', description: '...' }
  ],
  dataSourceLoader: async (id) => {
    // Load data into DuckDB and return schema
    const data = await fetchData(id)
    await duckdb.loadTable(id, data)
    return { data, schema: inferSchema(data) }
  }
}
```

### Conversation Persistence

```typescript
const aiConfig = {
  endpoint: '/api/tinypivot',
  sessionId: 'user-123',
  persistToLocalStorage: true,  // Auto-save conversations
}
```

### Security

The server handler includes built-in protections:
- **SQL Validation**: Only SELECT queries allowed
- **Table Whitelisting**: Only configured tables are queryable
- **Error Sanitization**: Connection strings stripped from errors

See [@smallwebco/tinypivot-server](./packages/server/README.md) for full documentation

### Complete Example

For a complete working example with PostgreSQL backend, see the [AI Analyst Demo](./examples/ai-analyst-demo/):

```bash
cd examples/ai-analyst-demo
cp .env.example .env
# Edit .env with your DATABASE_URL and AI_API_KEY
pnpm install
pnpm dev:all
```

## Chart Builder (Pro)

TinyPivot Pro includes a drag-and-drop chart builder with 6 chart types. Simply drag fields to configure your visualization — dimensions go to the X-axis and measures to the Y-axis.

### Supported Chart Types

| Chart Type | Best For |
|------------|----------|
| **Bar** | Comparing categories, rankings |
| **Line** | Trends over time, continuous data |
| **Area** | Volume trends, stacked comparisons |
| **Pie** | Part-to-whole proportions |
| **Donut** | Proportions with center metric |
| **Radar** | Multi-metric comparison |

### How It Works

1. Click the **Chart** button in the view toggle
2. Select a chart type from the type bar
3. Drag a dimension field (text/date) to the **X-Axis**
4. Drag a measure field (number) to the **Y-Axis**
5. Optionally add a field to **Color/Series** for grouped charts

Charts automatically respect any filters applied in Grid view — filter your data, then visualize the subset.

## Custom Calculations

TinyPivot supports three types of custom calculations:

### 1. Custom Aggregation Functions (Developer API)

Pass your own aggregation logic via the `customFn` property:

```typescript
// Vue
const valueFields = ref([
  {
    field: 'sales',
    aggregation: 'custom',
    customFn: (values) => {
      // 90th percentile
      const sorted = [...values].sort((a, b) => a - b)
      return sorted[Math.floor(sorted.length * 0.9)]
    },
    customLabel: '90th Percentile',
    customSymbol: 'P90'
  }
])
```

```tsx
// React
const valueFields = [
  {
    field: 'sales',
    aggregation: 'custom',
    customFn: (values) => {
      // Interquartile mean
      const sorted = [...values].sort((a, b) => a - b)
      const q1 = Math.floor(sorted.length * 0.25)
      const q3 = Math.floor(sorted.length * 0.75)
      const middle = sorted.slice(q1, q3)
      return middle.reduce((a, b) => a + b, 0) / middle.length
    },
    customLabel: 'IQR Mean',
    customSymbol: 'IQM'
  }
]
```

### 2. Calculated Fields (UI-Based)

Create fields that compute values from other aggregations using a formula builder:

1. Click the **+** button in the "Calculated" section
2. Enter a name (e.g., "Profit Margin %")
3. Build a formula like `SUM(profit) / SUM(revenue) * 100`
4. Choose format (Number, Percent, Currency)

**Supported functions in formulas:**
- `SUM(field)` - Sum of values
- `AVG(field)` - Average of values
- `MIN(field)` - Minimum value
- `MAX(field)` - Maximum value
- `COUNT(field)` - Count of values
- `MEDIAN(field)` - Median value

**Example formulas:**
```
SUM(profit) / SUM(revenue) * 100      → Profit margin %
SUM(revenue) / SUM(units)              → Average price per unit
(MAX(sales) - MIN(sales)) / AVG(sales) → Coefficient of variation
```

### 3. Programmatic Calculated Fields

Add calculated fields via props:

```typescript
// Vue
const calculatedFields = ref([
  {
    id: 'margin',
    name: 'Profit Margin %',
    formula: 'SUM(profit) / SUM(revenue) * 100',
    formatAs: 'percent',
    decimals: 1
  },
  {
    id: 'avg_price',
    name: 'Avg Price',
    formula: 'SUM(revenue) / SUM(units)',
    formatAs: 'currency',
    decimals: 2
  }
])
```

### TypeScript Types

```typescript
import type {
  CalculatedField,
  CustomAggregationFn,
  PivotValueField
} from '@smallwebco/tinypivot-vue'

// Custom aggregation function signature
type CustomAggregationFn = (
  values: number[],
  allFieldValues?: Record<string, number[]>
) => number | null

// Calculated field definition
interface CalculatedField {
  id: string
  name: string
  formula: string
  formatAs?: 'number' | 'percent' | 'currency'
  decimals?: number
}
```

## Pro License

Unlock pivot table functionality and remove the watermark with a Pro license.

**Licenses are perpetual** — once purchased, Pro features work forever. The date in your license key indicates your update eligibility period, not an expiration.

### Activate License

#### Vue

```typescript
import { setLicenseKey } from '@smallwebco/tinypivot-vue'

// Call once at app startup
setLicenseKey('YOUR_LICENSE_KEY')
```

#### React

```typescript
import { setLicenseKey } from '@smallwebco/tinypivot-react'

// Call once at app startup
setLicenseKey('YOUR_LICENSE_KEY')
```

### Pricing

| Plan | Price | Use Case |
|------|-------|----------|
| Single Project | $49 | One application |
| Unlimited Projects | $149 | All your projects |
| Team License | $399 | Up to 10 developers |

**[Purchase at tiny-pivot.com/#pricing](https://tiny-pivot.com/#pricing)**

## Styling

TinyPivot uses scoped styles and won't conflict with your app. Import the base styles:

```typescript
// Vue
import '@smallwebco/tinypivot-vue/style.css'

// React
import '@smallwebco/tinypivot-react/style.css'
```

### Custom Theming

Override CSS variables for theming:

```css
.vpg-data-grid {
  --vpg-header-bg: #1e293b;
  --vpg-row-hover: #f1f5f9;
  --vpg-border-color: #e2e8f0;
}
```

## TypeScript

Full TypeScript support included. Import types as needed:

```typescript
// React
import type {
  AggregationFunction,
  DataGridProps,
  PivotConfig,
} from '@smallwebco/tinypivot-react'

// Vue
import type {
  AggregationFunction,
  CellClickEvent,
  DataGridProps,
  PivotConfig,
  SelectionChangeEvent,
} from '@smallwebco/tinypivot-vue'
```

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 14+
- Edge 80+

## License

- **Free Tier**: MIT License for basic grid features
- **Pro Features**: Commercial license required

See [LICENSE.md](./LICENSE.md) for details.

---

## GitHub Topics

This repository uses the following topics for discoverability:
`ai-data-analyst`, `embedded-analytics`, `conversational-bi`, `natural-language-query`, `text-to-sql`, `byok`, `llm-integration`, `vue`, `vue3`, `react`, `data-grid`, `pivot-table`, `chart-builder`, `data-visualization`, `excel`, `spreadsheet`, `datagrid`, `table-component`, `aggregation`, `csv-export`

---

Built with ❤️ by [Small Web, LLC](https://thesmallweb.co)

[![Sponsor](https://img.shields.io/badge/Sponsor-❤️-pink)](https://github.com/sponsors/Small-Web-Co)

## License

TinyPivot is licensed under the MIT License. See [LICENSE.md](./LICENSE.md) for details.
