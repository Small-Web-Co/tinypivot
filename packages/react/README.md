# @smallwebco/tinypivot-react

A lightweight data grid with free pivot tables, Pro charts, and optional AI-powered data exploration for React. **Under 40KB gzipped** — 10x smaller than AG Grid.

**[Live Demo](https://tiny-pivot.com)** · **[Buy License](https://tiny-pivot.com/#pricing)**

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/Small-Web-Co/tinypivot/tree/master/examples/stackblitz-react)

## Why TinyPivot?

- **Lightweight**: Under 40KB gzipped vs 500KB+ for AG Grid
- **Free Pivot Tables**: Sum aggregations, totals, and calculated fields included
- **Pro Upgrade**: Advanced aggregations, charts, AI Data Analyst, and no watermark
- **AI Data Analyst** (Pro): Natural language queries with BYOK — use your own OpenAI/Anthropic key
- **Lifetime License**: No subscriptions — buy once, use forever

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

## Theming

TinyPivot ships 22 themes — 2 neutral (`light`, `dark`) plus 10 brand themes each with a light and dark variant. Themes are applied via the `theme` prop on `DataGrid`.

### Quick start

```tsx
<DataGrid data={data} theme="slate-dark" />
```

`theme="auto"` resolves to `'light'` or `'dark'` based on the user's system preference (`prefers-color-scheme`).

### Available themes

| Theme | Accent | Vibe |
|---|---|---|
| `light` / `dark` / `auto` | indigo / violet | TinyPivot defaults — neutral cool grays |
| `slate` / `slate-dark` | `#4f46e5` indigo | Linear / Stripe — cool neutral |
| `zinc` / `zinc-dark` | near-mono | Vercel / Anthropic — minimalist |
| `indigo` / `indigo-dark` | `#6366f1` vivid indigo | Premium SaaS |
| `violet` / `violet-dark` | `#8b5cf6` purple | Data viz / AI tools |
| `emerald` / `emerald-dark` | `#10b981` green | Fintech / finance |
| `sky` / `sky-dark` | `#0ea5e9` light blue | Productivity / airy |
| `rose` / `rose-dark` | `#f43f5e` warm pink | Friendly / creator |
| `amber` / `amber-dark` | `#f59e0b` warm orange | Energy / wellness |
| `solar` / `solar-dark` | `#b58900` mustard | Solarized-inspired warm cream + dark teal |
| `mono` / `mono-dark` | `#000` / `#fff` | Editorial — pure grayscale, high contrast |

### Custom themes

Brand themes redefine ~25 CSS custom property tokens at the grid root. You can override these in your own CSS to create a custom theme:

```tsx
import './my-brand.css'

<DataGrid data={data} theme="light" className="my-brand" />
```

```css
/* my-brand.css */
.vpg-data-grid.my-brand {
  --vpg-accent: #ff6b35;
  --vpg-accent-hover: #e55426;
  --vpg-surface-bg: #fafaf7;
  --vpg-surface-panel: #f0eee7;
  /* …override any of the tokens below */
}
```

**Token reference** — these are the variables you can override:

- **Surfaces**: `--vpg-surface-bg`, `--vpg-surface-panel`, `--vpg-surface-elevated`, `--vpg-surface-hover`, `--vpg-surface-selected`, `--vpg-surface-striped`
- **Text**: `--vpg-text-primary`, `--vpg-text-secondary`, `--vpg-text-muted`, `--vpg-text-inverse`
- **Borders**: `--vpg-border-default`, `--vpg-border-strong`, `--vpg-border-subtle`
- **Accent**: `--vpg-accent`, `--vpg-accent-hover`, `--vpg-accent-soft-bg`, `--vpg-accent-soft-text`, `--vpg-focus-ring`
- **States**: `--vpg-state-error`, `--vpg-state-warning`, `--vpg-state-success`, `--vpg-state-info`
- **Scrollbar**: `--vpg-scrollbar-thumb`, `--vpg-scrollbar-track`

Custom theme classes layer on top of any preset, so you can start from `theme="dark"` and tweak just the accent, for example.

### Adding a theme switcher

Let users pick their own theme — bind a state value to a `<select>`:

```tsx
import { DataGrid } from '@smallwebco/tinypivot-react'
import '@smallwebco/tinypivot-react/style.css'
import { useState } from 'react'

type Theme = 'light' | 'dark' | 'slate' | 'slate-dark' | 'emerald' | 'emerald-dark'

export function MyGrid({ data }) {
  const [theme, setTheme] = useState<Theme>('dark')

  return (
    <>
      <select value={theme} onChange={e => setTheme(e.target.value as Theme)}>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="slate-dark">Slate (dark)</option>
        <option value="emerald-dark">Emerald (dark)</option>
        {/* …add more themes */}
      </select>

      <DataGrid data={data} theme={theme} />
    </>
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
| Pivot table with Sum aggregation | ✅ | ✅ |
| Row/column totals | ✅ | ✅ |
| Calculated fields with formulas | ✅ | ✅ |
| Pivot row group expand/collapse | ✅ | ✅ |
| **Pivot drill-through** (double-click to inspect source rows) | ❌ | ✅ |
| **Excel (XLSX) Export** (styled, multi-level pivot headers, lazy-loaded) | ❌ | ✅ |
| **AI Data Analyst** (natural language, BYOK) | ❌ | ✅ |
| **Chart Builder** (6 chart types) | ❌ | ✅ |
| Advanced aggregations (Count, Avg, Min, Max, Unique, Median, Std Dev, %) | ❌ | ✅ |
| No watermark | ❌ | ✅ |

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `Record<string, unknown>[]` | **required** | Array of data objects |
| `loading` | `boolean` | `false` | Show loading spinner |
| `fontSize` | `'xs' \| 'sm' \| 'base'` | `'xs'` | Font size preset |
| `showPivot` | `boolean` | `true` | Show pivot toggle |
| `enableExport` | `boolean` | `true` | Show the Export dropdown menu (CSV free / Excel .xlsx Pro) |
| `enableSearch` | `boolean` | `true` | Show global search |
| `enablePagination` | `boolean` | `false` | Enable pagination |
| `pageSize` | `number` | `50` | Rows per page |
| `enableColumnResize` | `boolean` | `true` | Drag to resize columns |
| `enableClipboard` | `boolean` | `true` | Ctrl+C to copy cells |
| `theme` | `string` | `'light'` | Color theme — see [Theming](#theming) for the full list (22 presets) |
| `numberFormat` | `'us' \| 'eu' \| 'plain'` | `'us'` | Number display format: US (1,234.56), EU (1.234,56), plain (1234.56) |
| `dateFormat` | `'us' \| 'eu' \| 'iso'` | `'iso'` | Date display format: US (MM/DD/YYYY), EU (DD/MM/YYYY), ISO (YYYY-MM-DD) |
| `fieldRoleOverrides` | `Record<string, FieldRole>` | `undefined` | Override auto-detected chart field roles per column (`'dimension'` \| `'measure'` \| `'temporal'`) |
| `enableDrillDown` | `boolean` | `true` | Enable pivot row group expand/collapse chevrons |
| `enableDrillThrough` | `boolean` | `true` | Enable double-click drill-through on pivot cells (Pro feature) |
| `pivotLayout` | `'grouped' \| 'tabular'` | `'grouped'` | Row layout for multi-field pivots: `'grouped'` merges repeated parent values into a spanning cell; `'tabular'` repeats every value on each row. |

## Callbacks

| Prop | Type | Description |
|------|------|-------------|
| `onCellClick` | `(payload) => void` | Cell clicked |
| `onSelectionChange` | `(payload) => void` | Selection changed |
| `onExport` | `(payload) => void` | CSV exported |
| `onCopy` | `(payload) => void` | Cells copied |
| `onCollapseChange` | `(collapsedPaths: string[]) => void` | Pivot row groups collapsed/expanded |
| `onDrillThrough` | `(result: DrillThroughResult) => void` | Pivot cell double-clicked and drill-through modal opened (Pro) |

## Export

When `enableExport` is `true` (the default), the toolbar shows a single **Export** dropdown button. Clicking it opens a menu with two items:

- **CSV** — always available (free). Downloads a `.csv` file of the current view.
- **Excel (.xlsx)** — Pro only. Free users see this item disabled with a **Pro** badge. Pro users get a styled `.xlsx` download. `exceljs` (~250 KB) loads lazily via dynamic import — never part of your main bundle.

### CSV Export (Free)

```typescript
import { exportToCSV, exportPivotToCSV } from '@smallwebco/tinypivot-react'

exportToCSV(data, columns, { filename: 'my-data.csv' })
```

### Excel (XLSX) Export (Pro)

```typescript
import { exportToXLSX, exportPivotToXLSX } from '@smallwebco/tinypivot-react'

// Flat grid
await exportToXLSX(data, columns, {
  filename: 'report.xlsx',
  sheetName: 'Sales',
  numberFormats: { revenue: '#,##0.00' },
})

// Pivot table
await exportPivotToXLSX(pivotData, rowFields, columnFields, valueFields, {
  filename: 'pivot.xlsx',
})
```

#### Pivot XLSX: two-sheet workbook

Pivot XLSX export produces a **two-sheet workbook**:

1. **Pivot** — the styled pivot summary (merged column headers, bold totals row, frozen header).
2. **Source Data** — the underlying source rows as an **interactive Excel Table** (filter/sort dropdowns, `TableStyleMedium2`). Open it in Excel and choose **Insert → PivotTable** to build a native PivotTable in two clicks.

> Note: TinyPivot does not generate a native Excel PivotTable object (exceljs does not support writing pivot table XML). The Source Data sheet is the practical alternative.
```

## Pivot Drill-Down

### Row Group Expand/Collapse (Free)

When a pivot has two or more row fields, each group row displays a `▸`/`▾` chevron. Click to collapse or expand that group. Alt-click collapses/expands every group at the same depth. Collapsed groups still show correct aggregated values over all rows in the group.

By default (`pivotLayout="grouped"`), the parent row value is rendered once as a vertically spanning cell across its children, making the hierarchy immediately readable. Set `pivotLayout="tabular"` to repeat the parent value on every row instead.

```tsx
<DataGrid
  data={data}
  onCollapseChange={(collapsedPaths) => console.log('Collapsed:', collapsedPaths)}
/>
```

### Drill-Through to Source Rows (Pro)

Double-click any pivot value cell (including totals) to open a modal with the underlying source rows. Includes a slice description header, paginated table (50/page), and CSV export. Requires a Pro license.

```tsx
<DataGrid
  data={data}
  onDrillThrough={({ rows, descriptor }) =>
    console.log(`${descriptor.rowCount} rows for ${descriptor.rowPath.join(' > ')}`)
  }
/>
```

Disable either behaviour individually:

```tsx
<DataGrid data={data} enableDrillDown={false} enableDrillThrough={false} />
```

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

- **Free Tier**: MIT License for core grid and pivot features
- **Pro Features**: Commercial license required

**[Purchase at tiny-pivot.com/#pricing](https://tiny-pivot.com/#pricing)**

---

Built with ❤️ by [Small Web, LLC](https://thesmallweb.co)
