# TinyPivot

A lightweight data grid with free pivot tables, Pro charts, and optional AI-powered data exploration for Vue 3 and React. Focused, batteries-included, and easy to adopt.

**[Live Demo](https://tiny-pivot.com)** · **[Buy License](https://tiny-pivot.com/#pricing)** · **[GitHub Sponsors](https://github.com/sponsors/Small-Web-Co)**

⭐ **If you find TinyPivot useful, please consider giving it a star!** It helps others discover the project.

[![Star on GitHub](https://img.shields.io/github/stars/Small-Web-Co/tinypivot?style=social)](https://github.com/Small-Web-Co/tinypivot)
[![React Package](https://img.shields.io/badge/npm-React-61dafb)](https://www.npmjs.com/package/@smallwebco/tinypivot-react)
[![Vue Package](https://img.shields.io/badge/npm-Vue%203-42b883)](https://www.npmjs.com/package/@smallwebco/tinypivot-vue)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue)](https://www.typescriptlang.org/)

**Try it instantly:**
[![Open React example in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/Small-Web-Co/tinypivot/tree/master/examples/stackblitz-react)
[![Open Vue example in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/Small-Web-Co/tinypivot/tree/master/examples/stackblitz-vue)

![TinyPivot Demo](https://bvallieres.com/images/tinypivot_demo.gif)

## Why TinyPivot?

- **Focused**: A batteries-included analytics grid without adopting a broad enterprise suite
- **Free Pivot Tables**: Sum aggregations, totals, and calculated fields included out of the box
- **Pro Upgrade**: Advanced aggregations, charts, AI Data Analyst, and no watermark
- **AI Data Analyst** (Pro): Natural language queries with BYOK — use your own OpenAI/Anthropic key
- **Framework Support**: First-class Vue 3 and React packages
- **Lifetime License**: No subscriptions — buy once, use forever

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
| Calculated fields with formulas | ✅ | ✅ |
| Pivot row group expand/collapse | ✅ | ✅ |
| **Pivot drill-through** (double-click to inspect source rows) | ❌ | ✅ |
| **Excel (XLSX) Export** (styled, multi-level pivot headers, lazy-loaded) | ❌ | ✅ |
| **AI Data Analyst** (natural language queries, BYOK) | ❌ | ✅ |
| **Chart Builder** (6 chart types, drag-and-drop) | ❌ | ✅ |
| All aggregations (Count, Avg, Min, Max, Unique, Median, Std Dev, %) | ❌ | ✅ |
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
| `showPivot` | `boolean` | `true` | Show pivot toggle |
| `enableExport` | `boolean` | `true` | Show CSV export button |
| `enableSearch` | `boolean` | `true` | Show global search |
| `enablePagination` | `boolean` | `false` | Enable pagination |
| `pageSize` | `number` | `50` | Rows per page |
| `enableColumnResize` | `boolean` | `true` | Drag to resize columns |
| `enableClipboard` | `boolean` | `true` | Ctrl+C to copy cells |
| `theme` | `string` | `'light'` | Color theme — see [Theming](#theming) for the full list (22 presets) |
| `numberFormat` | `'us' \| 'eu' \| 'plain'` | `'us'` | Number display format |
| `dateFormat` | `'us' \| 'eu' \| 'iso'` | `'iso'` | Date display format |
| `fieldRoleOverrides` | `Record<string, FieldRole>` | `undefined` | Override auto-detected chart field roles |
| `stripedRows` | `boolean` | `true` | Alternating row colors |
| `exportFilename` | `string` | `'data-export.csv'` | CSV filename |
| `enableDrillDown` | `boolean` | `true` | Enable pivot row group expand/collapse chevrons |
| `enableDrillThrough` | `boolean` | `true` | Enable double-click drill-through on pivot cells (Pro feature) |

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
| `number` | `1234.56` | Formatted per `numberFormat` prop |
| `boolean` | `true` | `true` / `false` |
| `null` / `undefined` | `null` | Empty cell |
| `Date` | `new Date()` | Formatted per `dateFormat` prop |

## Number & Date Formatting

Control how numbers and dates are displayed using the `numberFormat` and `dateFormat` props.

### Number Formats

| Format | Example | Description |
|--------|---------|-------------|
| `'us'` (default) | `1,234,567.89` | US format with comma separators |
| `'eu'` | `1.234.567,89` | European format with period separators |
| `'plain'` | `1234567.89` | No formatting or separators |

### Date Formats

| Format | Example | Description |
|--------|---------|-------------|
| `'iso'` (default) | `2024-03-15` | ISO 8601 (YYYY-MM-DD) |
| `'us'` | `03/15/2024` | US format (MM/DD/YYYY) |
| `'eu'` | `15/03/2024` | European format (DD/MM/YYYY) |

Date columns also support date range filtering. When a column is detected as date type, the filter UI shows date range inputs (From/To) with the appropriate format placeholder.

```vue
<!-- Vue -->
<DataGrid :data="data" number-format="eu" date-format="eu" />
```

```tsx
{/* React */}
<DataGrid data={data} numberFormat="eu" dateFormat="eu" />
```

## Events

### Vue

| Event | Payload | Description |
|-------|---------|-------------|
| `@cell-click` | `{ row, col, value, rowData }` | Cell clicked |
| `@selection-change` | `{ cells, values }` | Selection changed |
| `@export` | `{ rowCount, filename }` | CSV exported |
| `@copy` | `{ text, cellCount }` | Cells copied |
| `@collapse-change` | `string[]` | Pivot row groups collapsed/expanded (array of collapsed path keys) |
| `@drill-through` | `DrillThroughResult` | Pivot cell double-clicked and drill-through opened (Pro) |

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
| `onCollapseChange` | `(collapsedPaths: string[]) => void` | Pivot row groups collapsed/expanded |
| `onDrillThrough` | `(result: DrillThroughResult) => void` | Pivot cell double-clicked and drill-through opened (Pro) |

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

## AI Data Analyst (Pro)

TinyPivot Pro includes an optional AI Data Analyst that lets users explore data using natural language. Ask questions like "What's the return rate by category?" or "Show me sales trends over time" and get instant SQL-generated results.

![AI Data Analyst Demo](./assets/tinypivot-ai.gif)

> **Want to try it?** See the complete working example in [`examples/ai-analyst-demo/`](./examples/ai-analyst-demo/) with PostgreSQL backend and DuckDB WASM for client-side queries.

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

### Cross-Table JOINs

The AI Analyst automatically understands relationships between your tables and can generate JOIN queries when needed. Ask questions like:

- "Show me sales with customer names" (joins sales → customers)
- "What products are selling best by category?" (joins sales → products)
- "List orders with product details and customer info" (multi-table join)

The AI sees all available table schemas and identifies foreign key relationships (columns ending in `_id`) to construct proper JOINs.

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

### Field Role Detection

The Chart Builder automatically classifies each column as a **dimension** (category/grouping), **measure** (aggregatable number), or **temporal** (date/time) using heuristics on your data.

**How it works:**
- Columns where values are native JS `number` types are classified as **measures** — if your data layer has already cast values to numbers, TinyPivot trusts that intent regardless of cardinality
- Numeric strings with high cardinality (many unique values) are classified as **measures**
- Numeric strings with low cardinality (e.g., `"1"`, `"2"`, `"3"`) are classified as **dimensions** (they could be category IDs)
- Date-like strings are classified as **temporal**
- Everything else is classified as **dimensions**

**Overriding field roles:**

When the auto-detection doesn't match your intent, use `fieldRoleOverrides` to explicitly set roles:

```vue
<!-- Vue -->
<DataGrid
  :data="data"
  :field-role-overrides="{
    'Answer Score': 'measure',
    'Question Order': 'dimension',
    'Company Size': 'measure',
  }"
/>
```

```tsx
{/* React */}
<DataGrid
  data={data}
  fieldRoleOverrides={{
    "Answer Score": "measure",
    "Question Order": "dimension",
    "Company Size": "measure",
  }}
/>
```

Available roles: `'dimension'` | `'measure'` | `'temporal'`

This is useful when:
- Low-cardinality numbers (like Likert scores 1-5) arrive as strings and get classified as dimensions
- You want to force a numeric column to be used as a grouping axis (dimension) instead of an aggregated value
- A column should be treated as temporal but isn't in a recognizable date format

## Export

### CSV Export (Free)

CSV export is enabled by default. Set `enableExport={true}` and optionally `exportFilename="data.csv"`. The Export CSV button appears in the toolbar. Programmatic API:

```typescript
import { exportToCSV, exportPivotToCSV } from '@smallwebco/tinypivot-vue' // or -react

exportToCSV(data, columns, { filename: 'my-data.csv' })
```

### Excel (XLSX) Export (Pro)

Pro licenses unlock styled `.xlsx` downloads for both the flat grid and the pivot table. The "Export XLSX" button appears in the toolbar automatically when `enableExport` is `true` and a Pro license is active. `exceljs` (~250 KB) is loaded **lazily** via dynamic import — it is never included in your main bundle.

Programmatic API (both functions are `async` and trigger a browser download):

```typescript
import { exportToXLSX, exportPivotToXLSX } from '@smallwebco/tinypivot-vue' // or -react
import type { XlsxExportOptions } from '@smallwebco/tinypivot-vue'

// Flat grid
await exportToXLSX(data, columns, {
  filename: 'report.xlsx',
  sheetName: 'Sales',
  numberFormats: { revenue: '#,##0.00', units: '#,##0' },
})

// Pivot table — pass the PivotExportData, field arrays, and options
await exportPivotToXLSX(pivotData, rowFields, columnFields, valueFields, {
  filename: 'pivot-report.xlsx',
  sheetName: 'Pivot',
})
```

`XlsxExportOptions` extends `ExportOptions` and adds `sheetName?: string` and `numberFormats?: Record<string, string>`.

## Pivot Drill-Down

TinyPivot supports two complementary pivot drill-down capabilities:

### Row Group Expand/Collapse (Free)

When a pivot has two or more row fields, each group row displays a `▸`/`▾` chevron. Click to collapse or expand that group. Alt-click collapses/expands every group at the same depth at once. Collapsed groups still show correct aggregated values (sum, median, stdDev, etc.) over all rows in the group.

Controlled with the `enableDrillDown` prop (default `true`).

```vue
<!-- Vue -->
<DataGrid
  :data="data"
  @collapse-change="(collapsedPaths) => console.log('Collapsed:', collapsedPaths)"
/>
```

```tsx
// React
<DataGrid
  data={data}
  onCollapseChange={(collapsedPaths) => console.log('Collapsed:', collapsedPaths)}
/>
```

### Drill-Through to Source Rows (Pro)

Double-click any pivot value cell (including totals) to open a modal showing the underlying source rows that contributed to that cell. The modal includes a header with the slice description, paginated rows (50/page), and a CSV export of the drill-through result.

Requires a Pro license. Controlled with the `enableDrillThrough` prop (default `true`).

```vue
<!-- Vue -->
<DataGrid
  :data="data"
  @drill-through="({ rows, descriptor }) => console.log(`${descriptor.rowCount} rows for ${descriptor.rowPath.join(' > ')}`)"
/>
```

```tsx
// React
<DataGrid
  data={data}
  onDrillThrough={({ rows, descriptor }) =>
    console.log(`${descriptor.rowCount} rows for ${descriptor.rowPath.join(' > ')}`)
  }
/>
```

### TypeScript Types

```typescript
import type { DrillThroughResult, DrillThroughDescriptor, PivotRowMeta } from '@smallwebco/tinypivot-vue'
// or '@smallwebco/tinypivot-react'

// DrillThroughResult — payload of the drill-through event
interface DrillThroughResult {
  rows: Record<string, unknown>[]   // Source rows matching the clicked cell's slice
  descriptor: DrillThroughDescriptor
}

interface DrillThroughDescriptor {
  rowPath: string[]          // e.g. ['West', 'Widgets']
  columnPath: string[]       // e.g. ['Q3']
  valueField: string         // e.g. 'sales'
  aggregation: AggregationFunction
  formattedValue: string     // Pre-formatted result, e.g. '1,234'
  rowCount: number
}
```

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

Unlock advanced aggregations, charts, AI Data Analyst, and remove the watermark with a Pro license.

**TinyPivot Pro uses a lifetime license** — buy once, set your key, and keep shipping.

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

## Theming

TinyPivot ships **22 themes** — 2 neutral (`light`, `dark`) plus 10 brand themes each with a light and dark variant. Themes are applied via the `theme` prop on `DataGrid`.

```vue
<!-- Vue -->
<DataGrid :data="data" theme="slate-dark" />
```

```tsx
{/* React */}
<DataGrid data={data} theme="slate-dark" />
```

`theme="auto"` resolves to `'light'` or `'dark'` based on the user's system preference.

### Available themes

| Theme | Accent | Vibe |
|---|---|---|
| `light` / `dark` / `auto` | indigo / violet | Default — neutral cool grays |
| `slate` / `slate-dark` | `#4f46e5` indigo | Linear / Stripe — cool neutral |
| `zinc` / `zinc-dark` | near-mono | Vercel / Anthropic — minimalist |
| `indigo` / `indigo-dark` | `#6366f1` indigo | Premium SaaS |
| `violet` / `violet-dark` | `#8b5cf6` purple | Data viz / AI tools |
| `emerald` / `emerald-dark` | `#10b981` green | Fintech / finance |
| `sky` / `sky-dark` | `#0ea5e9` light blue | Productivity / airy |
| `rose` / `rose-dark` | `#f43f5e` warm pink | Friendly / creator |
| `amber` / `amber-dark` | `#f59e0b` warm orange | Energy / wellness |
| `solar` / `solar-dark` | `#b58900` mustard | Solarized — warm cream + dark teal |
| `mono` / `mono-dark` | `#000` / `#fff` | Editorial — pure grayscale |

### Custom themes

Each theme redefines ~30 CSS custom property tokens at the grid root. Override them in your own CSS for a custom theme:

```css
.vpg-data-grid.my-brand {
  --vpg-accent: #ff6b35;
  --vpg-accent-hover: #e55426;
  --vpg-surface-bg: #fafaf7;
  --vpg-surface-panel: #f0eee7;
  /* …override any other token */
}
```

```vue
<!-- Vue -->
<DataGrid :data="data" theme="light" class="my-brand" />
```

```tsx
{/* React */}
<DataGrid data={data} theme="light" className="my-brand" />
```

**Token reference**:

- **Surfaces**: `--vpg-surface-bg`, `--vpg-surface-panel`, `--vpg-surface-elevated`, `--vpg-surface-hover`, `--vpg-surface-selected`, `--vpg-surface-striped`
- **Text**: `--vpg-text-primary`, `--vpg-text-secondary`, `--vpg-text-muted`, `--vpg-text-inverse`
- **Borders**: `--vpg-border-default`, `--vpg-border-strong`, `--vpg-border-subtle`
- **Accent**: `--vpg-accent`, `--vpg-accent-hover`, `--vpg-accent-soft-bg`, `--vpg-accent-soft-text`, `--vpg-focus-ring`
- **States**: `--vpg-state-error`, `--vpg-state-warning`, `--vpg-state-success`, `--vpg-state-info`
- **Pivot dimensions**: `--vpg-dim-row-*`, `--vpg-dim-col-*`, `--vpg-dim-value-*`, `--vpg-dim-calc-*` (each with `-bg`, `-text`, `-border`)
- **Highlights**: `--vpg-highlight-bg`, `--vpg-highlight-text`, `--vpg-highlight-border`
- **Scrollbar**: `--vpg-scrollbar-thumb`, `--vpg-scrollbar-track`

Custom theme classes layer on top of any preset, so you can start from `theme="dark"` and tweak just the accent.

## TypeScript

Full TypeScript support included. Import types as needed:

```typescript
// React
import type {
  AggregationFunction,
  DataGridProps,
  FieldRole,
  FieldRoleOverrides,
  PivotConfig,
} from '@smallwebco/tinypivot-react'

// Vue
import type {
  AggregationFunction,
  CellClickEvent,
  DataGridProps,
  FieldRole,
  FieldRoleOverrides,
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

- **Free Tier**: MIT License for core grid and pivot features
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
