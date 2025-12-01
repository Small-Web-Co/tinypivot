# TinyPivot

A powerful Excel-like data grid and pivot table component for Vue 3.

**[Live Demo](https://tiny-pivot.com)** · **[Buy License](https://tiny-pivot.com/pricing)**

## Features

### Free Tier
- 📊 Excel-like data grid with auto-sizing columns
- 🔍 Column filtering with multi-select dropdowns
- ↕️ Column sorting (click headers)
- ⌨️ Keyboard navigation
- 📋 Cell selection & copy to clipboard
- 🎨 Row striping and hover states
- 📱 Responsive design

### Pro License
- 🔄 **Pivot Table** - Drag-and-drop configuration
- 📈 **Aggregations** - Sum, Count, Average, Min, Max, Count Distinct
- ➕ **Totals** - Row and column totals
- 📊 **Percentage Mode** - View as % of row, column, or grand total
- 💾 **Persistence** - Auto-save pivot configuration
- ✨ **No Watermark** - Remove "Powered by TinyPivot" branding

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
  <DataGrid :data="data" />
</template>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `Record<string, unknown>[]` | **required** | Array of data objects to display |
| `loading` | `boolean` | `false` | Show loading state |
| `rowHeight` | `number` | `36` | Height of each row in pixels |
| `headerHeight` | `number` | `40` | Height of header row in pixels |
| `fontSize` | `'xs' \| 'sm' \| 'base'` | `'xs'` | Font size preset |
| `showPivot` | `boolean` | `true` | Show pivot table toggle button (Pro) |

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

```vue
<script setup lang="ts">
import { DataGrid } from 'tinypivot'

function handleCellClick(payload: {
  row: number
  col: number
  value: unknown
  rowData: Record<string, unknown>
}) {
  console.log('Clicked:', payload)
}

function handleSelectionChange(payload: {
  cells: Array<{ row: number; col: number }>
  values: unknown[]
}) {
  console.log('Selected:', payload.values)
}
</script>

<template>
  <DataGrid
    :data="data"
    @cell-click="handleCellClick"
    @selection-change="handleSelectionChange"
  />
</template>
```

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

**[Purchase at tiny-pivot.com/pricing](https://tiny-pivot.com/pricing)**

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

