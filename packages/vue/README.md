# @smallwebco/tinypivot-vue

A powerful Excel-like data grid and pivot table component for Vue 3.

**[Live Demo](https://tiny-pivot.com)** · **[Buy License](https://tiny-pivot.com/#pricing)**

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

## Events

| Event | Payload | Description |
|-------|---------|-------------|
| `@cell-click` | `{ row, col, value, rowData }` | Cell clicked |
| `@selection-change` | `{ cells, values }` | Selection changed |
| `@export` | `{ rowCount, filename }` | CSV exported |
| `@copy` | `{ text, cellCount }` | Cells copied |

## Documentation

See the [full documentation](https://github.com/Small-Web-Co/tinypivot) for complete API reference, styling, and Pro license activation.

## License

- **Free Tier**: MIT License for basic grid features
- **Pro Features**: Commercial license required

**[Purchase at tiny-pivot.com/#pricing](https://tiny-pivot.com/#pricing)**

---

Built with ❤️ by [Small Web, LLC](https://thesmallweb.co)
