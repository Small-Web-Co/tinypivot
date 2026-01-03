# TinyPivot Agent Guide

Monorepo containing a framework-agnostic core library and wrappers for Vue 3 and React.

## MANDATORY: Build for Both Vue AND React

**STOP! Before implementing ANY feature, bug fix, or UI change:**

1. You MUST implement it in BOTH `packages/vue` AND `packages/react`
2. A task is NOT complete until both frameworks have the feature
3. Never submit work that only updates one framework

**Checklist for EVERY change:**
- [ ] Implemented in `packages/vue`
- [ ] Implemented in `packages/react`
- [ ] Both implementations have identical behavior
- [ ] Both implementations have identical appearance
- [ ] Shared logic moved to `packages/core`
- [ ] `pnpm type-check` passes
- [ ] `pnpm build` succeeds

## Project Structure

```
packages/
  core/     # Shared logic, types, utilities (framework-agnostic)
  vue/      # Vue 3 components (uses core)
  react/    # React components (uses core)
demo/       # Demo application (Vue-based)
```

## Build & Verification Commands

**No automated tests exist.** Verification relies on type-checking and manual demo testing.

| Command | Description |
|---------|-------------|
| `pnpm install` | Install dependencies |
| `pnpm build` | Build all packages (core → vue → react) |
| `pnpm dev` | Watch mode for all packages |
| `pnpm type-check` | **CRITICAL:** Run after any change |
| `pnpm demo` | Start demo app for manual verification |

Build individual packages:
```bash
pnpm --filter @smallwebco/tinypivot-core build
pnpm --filter @smallwebco/tinypivot-vue build
pnpm --filter @smallwebco/tinypivot-react build
```

## Code Style & Conventions

### TypeScript
- **Strict mode enabled** - No `any` unless absolutely necessary
- **Shared types** go in `packages/core/src/types/index.ts`
- **Export all public APIs** in each package's `index.ts`

### Import Order
```typescript
// 3. Core package imports (types first)
import type { ColumnStats } from '@smallwebco/tinypivot-core'
import { exportToCSV } from '@smallwebco/tinypivot-core'
// 1. Framework imports (React/Vue)
import React, { useCallback, useMemo, useState } from 'react'
// 2. Third-party libraries
import { createPortal } from 'react-dom'
// 4. Local imports (hooks/composables, then components)
import { useExcelGrid } from '../hooks/useExcelGrid'
import { ColumnFilter } from './ColumnFilter'
```

### Vue Components (`packages/vue`)
- Use `<script setup lang="ts">` with Composition API
- Use scoped CSS with `.vpg-` prefixed class names
- PascalCase for component files (e.g., `DataGrid.vue`)

```vue
<script setup lang="ts">
const props = withDefaults(defineProps<{
  data: Record<string, unknown>[]
  loading?: boolean
}>(), { loading: false })

const emit = defineEmits<{
  (e: 'cellClick', payload: { row: number, col: number }): void
}>()
</script>
```

### React Components (`packages/react`)
- Functional components with hooks only
- Use `useCallback` for event handlers, `useMemo` for expensive computations
- Match Vue's prop interface exactly

```tsx
interface DataGridProps {
  data: Record<string, unknown>[]
  loading?: boolean
  onCellClick?: (payload: { row: number, col: number }) => void
}

export function DataGrid({ data, loading = false, onCellClick }: DataGridProps) {
  // ...
}
```

### Core Package (`packages/core`)
- Keep functions pure and framework-agnostic
- No DOM manipulation or framework-specific APIs
- Export type guards alongside types (e.g., `isNumericRange`)

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `DataGrid`, `ColumnFilter` |
| Hooks/Composables | camelCase with `use` prefix | `useExcelGrid` |
| Types/Interfaces | PascalCase | `PivotConfig`, `ColumnStats` |
| CSS Classes | kebab-case with `vpg-` prefix | `vpg-data-grid` |
| Constants | SCREAMING_SNAKE_CASE | `MIN_COL_WIDTH` |

### Error Handling
- Use early returns for validation
- Provide sensible defaults over throwing errors
- Handle null/undefined gracefully in display functions

```typescript
function formatCellValue(value: unknown): string {
  if (value === null || value === undefined)
    return ''
  return String(value)
}
```

## Workflow for Agents

1. **Analyze**: Check `packages/core` first. Can the change be shared?
2. **Implement**:
   - Modify `packages/core` if needed
   - Implement in **Framework A** (e.g., Vue)
   - **IMMEDIATELY** port to **Framework B** (e.g., React)
3. **Verify**:
   - Run `pnpm type-check` to catch API mismatches
   - Run `pnpm build` to ensure successful compilation
   - (Optional) Check `pnpm demo` if UI changes were made
4. **Commit**: Message should reflect changes in both frameworks

**REMINDER: A feature is NOT done until it exists in both Vue and React.**

## Cursor/Copilot Rules

From `.cursor/rules/vuereact.mdc`:
> "When writing code, make sure to address the issue at hand for both Vue and React... goal is to have the same codebase... which should live in core."

## Key Files Reference

| Purpose | Vue | React |
|---------|-----|-------|
| Main Component | `packages/vue/src/components/DataGrid.vue` | `packages/react/src/components/DataGrid.tsx` |
| Grid Logic | `packages/vue/src/composables/useExcelGrid.ts` | `packages/react/src/hooks/useExcelGrid.ts` |
| Pivot Logic | `packages/vue/src/composables/usePivotTable.ts` | `packages/react/src/hooks/usePivotTable.ts` |
| Shared Types | `packages/core/src/types/index.ts` | (imports from core) |
| Styles | `packages/vue/src/style.css` | `packages/react/src/style.css` |

## Common Patterns

### Adding a New Prop
1. Add to `DataGridProps` in `packages/core/src/types/index.ts`
2. Add to Vue component's `defineProps` with default
3. Add to React component's interface with default in destructuring
4. Implement feature logic in both frameworks

### Adding a New Event
1. Add event type to `packages/core/src/types/index.ts`
2. Vue: Add to `defineEmits`, call with `emit('eventName', payload)`
3. React: Add callback prop (`onEventName`), call with `onEventName?.(payload)`

### Adding Shared Utility
1. Create function in `packages/core/src/utils/index.ts`
2. Export from `packages/core/src/index.ts`
3. Import in both packages from `@smallwebco/tinypivot-core`
