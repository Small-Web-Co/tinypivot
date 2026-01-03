# TinyPivot Project Rules

## Multi-Framework Sync

This project provides both Vue and React packages. When implementing a feature or fix:

- **Always implement in both frameworks**: Any feature, bug fix, or UI change made to the Vue package (`packages/vue`) must also be implemented in the React package (`packages/react`), and vice versa.
- **Keep implementations consistent**: The behavior, appearance, and API should match as closely as possible between frameworks.
- **Test both builds**: Run `pnpm build:vue` and `pnpm build:react` (or `pnpm build`) to verify both packages compile successfully.

## Package Structure

- `packages/core` - Shared logic, types, and utilities (framework-agnostic)
- `packages/vue` - Vue 3 components
- `packages/react` - React components

## Component Correspondence

| Vue Component | React Component |
|--------------|-----------------|
| `PivotSkeleton.vue` | `PivotSkeleton.tsx` |
| `DataGrid.vue` | `DataGrid.tsx` |
| `PivotConfig.vue` | `PivotConfig.tsx` |
| `ColumnFilter.vue` | `ColumnFilter.tsx` |
