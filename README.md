# TinyPivot

A powerful Excel-like data grid and pivot table component for Vue 3 and React.

**[Live Demo](https://tiny-pivot.com)** · **[Buy License](https://tiny-pivot.com/#pricing)** · **[GitHub Sponsors](https://github.com/sponsors/Small-Web-Co)** · **[Open Collective](https://opencollective.com/tinypivot)**

⭐ **If you find TinyPivot useful, please consider giving it a star!** It helps others discover the project.

[![Star on GitHub](https://img.shields.io/github/stars/Small-Web-Co/tinypivot?style=social)](https://github.com/Small-Web-Co/tinypivot)

![TinyPivot Demo](https://tiny-pivot.com/images/tinypivot_demo.gif)

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

## Pro License

Unlock pivot table functionality and remove the watermark with a Pro license.

### Activate License

#### Vue

```typescript
import { setLicenseKey, configureLicenseSecret } from '@smallwebco/tinypivot-vue'

// Configure the license secret (must match your LICENSE_SECRET env var)
// Do this once at app startup, before setLicenseKey
configureLicenseSecret(import.meta.env.VITE_LICENSE_SECRET)

// Then set the license key
setLicenseKey('YOUR_LICENSE_KEY')
```

#### React

```typescript
import { setLicenseKey, configureLicenseSecret } from '@smallwebco/tinypivot-react'

configureLicenseSecret(import.meta.env.VITE_LICENSE_SECRET)
setLicenseKey('YOUR_LICENSE_KEY')
```

> **Note**: The license secret is used to verify license signatures. Set it via environment variable and inject at build time for security.

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
// Vue
import type {
  DataGridProps,
  PivotConfig,
  AggregationFunction,
  CellClickEvent,
  SelectionChangeEvent,
} from '@smallwebco/tinypivot-vue'

// React
import type {
  DataGridProps,
  PivotConfig,
  AggregationFunction,
} from '@smallwebco/tinypivot-react'
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
`vue`, `vue3`, `react`, `data-grid`, `pivot-table`, `excel`, `spreadsheet`, `datagrid`, `table-component`, `aggregation`, `csv-export`

---

Built with ❤️ by [Small Web, LLC](https://thesmallweb.co)

[![Sponsor](https://img.shields.io/badge/Sponsor-❤️-pink)](https://github.com/sponsors/Small-Web-Co) [![Open Collective](https://img.shields.io/badge/Open_Collective-3385FF?logo=opencollective&logoColor=white)](https://opencollective.com/tinypivot)
