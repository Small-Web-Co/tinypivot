# TinyPivot

A powerful Excel-like data grid and pivot table component for Vue 3.

**[Live Demo](https://tiny-pivot.com)** · **[Buy License](https://tiny-pivot.com/#pricing)**

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
| Pivot table | ❌ | ✅ |
| Aggregations (Sum, Avg, etc.) | ❌ | ✅ |
| Row/column totals | ❌ | ✅ |
| No watermark | ❌ | ✅ |

## Installation

```bash
pnpm add tinypivot
```

## Quick Start

```vue
<script setup lang="ts">
import { DataGrid } from 'tinypivot'
import 'tinypivot/style.css'

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

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+C` / `Cmd+C` | Copy selected cells |
| `Ctrl+F` / `Cmd+F` | Focus search input |
| `Arrow keys` | Navigate cells |
| `Shift+Arrow` | Extend selection |
| `Escape` | Clear selection/search |

## Pro License

Unlock pivot table functionality and remove the watermark with a Pro license.

### Activate License

```typescript
import { setLicenseKey, configureLicenseSecret } from 'tinypivot'

// Configure the license secret (must match your LICENSE_SECRET env var)
// Do this once at app startup, before setLicenseKey
configureLicenseSecret(import.meta.env.VITE_LICENSE_SECRET)

// Then set the license key
setLicenseKey('TP-PRO1-XXXXXXXX-20251215')
```

> **Note**: The license secret is used to verify license signatures. Set it via environment variable and inject at build time for security.

### Demo Mode

For evaluation, enable demo mode to unlock all Pro features (shows "DEMO" watermark):

```typescript
import { enableDemoMode } from 'tinypivot'

enableDemoMode()
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
import 'tinypivot/style.css'
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
import type {
  DataGridProps,
  PivotConfig,
  AggregationFunction,
  FilterEvent,
  SortEvent,
  CellClickEvent,
  SelectionChangeEvent,
} from 'tinypivot'
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

Built with ❤️ by [Small Web, LLC](https://thesmallweb.co)

