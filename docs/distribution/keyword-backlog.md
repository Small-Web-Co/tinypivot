# Keyword Backlog for Phase 2 Content Engine

## Workflow

A scheduled agent (cron routine, Phase 2) picks the top `queued` row from this backlog, then:

1. Writes a new marketing guide page following the `demo/pages/MarketingGuide.vue` pattern
2. Adds the route to `demo/router/routes.ts` (in the `marketingGuides` array)
3. Updates `demo/sitemap.xml` with the new URL
4. Commits and opens a PR
5. Updates this table: sets status to `drafted`

Once merged, the guide will be live at `https://tiny-pivot.com/<slug>` with proper SEO metadata, social preview, and JSON-LD.

---

## Keyword Backlog Table

Exclusions (already covered by existing routes in `demo/router/routes.ts`):
- `best-react-pivot-table-libraries`
- `best-vue-pivot-table-components`
- `ag-grid-alternatives`
- `react-data-grid-with-pivot-table`
- `vue-data-grid-with-pivot-table`
- `embedded-ai-data-analyst-component`
- `vs-tanstack-table`
- `vs-ag-grid` (standalone comparison page)

All keywords below are `queued` and ready for content generation.

| Keyword | Intent | Suggested Slug | Status |
|---------|--------|----------------|--------|
| React pivot table without watermark | feature | react-pivot-table-no-watermark | drafted |
| Vue 3 pivot table component free | feature | vue-pivot-table-free | drafted |
| Data grid React CSV export | feature | react-datagrid-csv-export | drafted |
| Vue data grid filter sort search | feature | vue-datagrid-filter-sort-search | drafted |
| React data grid calculated fields | feature | react-datagrid-calculated-fields | drafted |
| Vue 3 data grid column resize | feature | vue-datagrid-column-resize | queued |
| Next.js data grid pivot table | feature | nextjs-datagrid-pivot-table | queued |
| Nuxt 3 data grid pivot table | feature | nuxt-datagrid-pivot-table | queued |
| React pivot table with charts | feature | react-pivot-table-charts | queued |
| Vue pivot table with charts | feature | vue-pivot-table-charts | queued |
| React data grid AI analyst | feature | react-datagrid-ai-analyst | queued |
| Vue data grid AI analyst | feature | vue-datagrid-ai-analyst | queued |
| React data grid themes customization | feature | react-datagrid-themes | queued |
| Vue data grid dark mode themes | feature | vue-datagrid-dark-mode | queued |
| React embedded analytics component | feature | react-embedded-analytics | queued |
| Vue embedded analytics component | feature | vue-embedded-analytics | queued |
| Compare TinyPivot Handsontable | comparison | tinypivot-vs-handsontable | queued |
| Compare TinyPivot PivotTable.js | comparison | tinypivot-vs-pivottable-js | queued |
| Compare TinyPivot react-pivottable | comparison | tinypivot-vs-react-pivottable | queued |
| Compare TinyPivot Syncfusion grid | comparison | tinypivot-vs-syncfusion-grid | queued |
| Compare TinyPivot MUI X DataGrid | comparison | tinypivot-vs-mui-x-datagrid | queued |
| React data grid vs AG Grid lightweight | comparison | react-datagrid-vs-ag-grid-lightweight | queued |
| Vue data grid vs AG Grid lightweight | comparison | vue-datagrid-vs-ag-grid-lightweight | queued |
| React pivot table library comparison | comparison | react-pivot-table-libraries-comparison | queued |
| Vue pivot table libraries comparison | comparison | vue-pivot-table-libraries-comparison | queued |
| React data grid aggregations | tutorial | react-datagrid-aggregations | queued |
| Vue data grid aggregations tutorial | tutorial | vue-datagrid-aggregations-tutorial | queued |
| How to add pivot table React | tutorial | how-to-add-pivot-table-react | queued |
| How to add pivot table Vue | tutorial | how-to-add-pivot-table-vue | queued |
| React data grid with aggregations | tutorial | react-datagrid-with-aggregations | queued |
| Vue data grid sorting filtering | tutorial | vue-datagrid-sorting-filtering | queued |
| Build React analytics dashboard | tutorial | build-react-analytics-dashboard | queued |
| Build Vue analytics dashboard | tutorial | build-vue-analytics-dashboard | queued |
| React AI data analyst integration | tutorial | react-ai-data-analyst-integration | queued |
| Vue AI data analyst integration | tutorial | vue-ai-data-analyst-integration | queued |
| Next.js data grid component | feature | nextjs-data-grid-component | queued |
| Nuxt data grid component | feature | nuxt-data-grid-component | queued |
| Next.js pivot table analytics | feature | nextjs-pivot-table-analytics | queued |
| Nuxt pivot table analytics | feature | nuxt-pivot-table-analytics | queued |
| React spreadsheet-like grid | feature | react-spreadsheet-like-grid | queued |
| Vue spreadsheet-like grid | feature | vue-spreadsheet-like-grid | queued |
| React data grid pagination | feature | react-datagrid-pagination | queued |
| Vue data grid pagination | feature | vue-datagrid-pagination | queued |
| React data grid column hiding | feature | react-datagrid-column-hiding | queued |
| Vue data grid column hiding | feature | vue-datagrid-column-hiding | queued |
| React pivot table percentage mode | feature | react-pivot-table-percentage-mode | queued |
| Vue pivot table percentage mode | feature | vue-pivot-table-percentage-mode | queued |
| React data grid session persistence | feature | react-datagrid-session-persistence | queued |
| Vue data grid session persistence | feature | vue-datagrid-session-persistence | queued |
| Next.js embedded analytics | feature | nextjs-embedded-analytics | queued |
| Nuxt embedded analytics | feature | nuxt-embedded-analytics | queued |
| React lightweight datagrid alternative to AG Grid | comparison | react-lightweight-datagrid-ag-grid-alternative | queued |
| Vue lightweight datagrid alternative to AG Grid | comparison | vue-lightweight-datagrid-ag-grid-alternative | queued |
| Headless table library vs TinyPivot | comparison | headless-table-library-vs-tinypivot | queued |
| React datagrid with built-in charts | tutorial | react-datagrid-built-in-charts | queued |
| Vue datagrid with built-in charts | tutorial | vue-datagrid-built-in-charts | queued |

---
| React pivot table export to Excel | tutorial | react-pivot-table-excel-export | queued |
| Vue pivot table export to Excel | tutorial | vue-pivot-table-excel-export | queued |
| React data grid XLSX export | feature | react-datagrid-xlsx-export | queued |
| Vue data grid XLSX export | feature | vue-datagrid-xlsx-export | queued |
| Export a pivot table to Excel in JavaScript | tutorial | export-pivot-table-excel-javascript | queued |
| React pivot table drill down | feature | react-pivot-table-drilldown | queued |
| Vue pivot table drill down | feature | vue-pivot-table-drilldown | queued |
| React data grid expand collapse row groups | feature | react-datagrid-expand-collapse-rows | queued |
| Vue pivot table grouped row layout | feature | vue-pivot-table-grouped-rows | queued |
| Pivot table drill through to underlying data | feature | pivot-table-drill-through-data | queued |
| TinyPivot vs Tabulator | comparison | tinypivot-vs-tabulator | queued |
| TinyPivot vs react-data-grid | comparison | tinypivot-vs-react-data-grid | queued |
| TinyPivot vs Glide Data Grid | comparison | tinypivot-vs-glide-data-grid | queued |
| TinyPivot vs RevoGrid | comparison | tinypivot-vs-revogrid | queued |
| TinyPivot vs DevExtreme DataGrid | comparison | tinypivot-vs-devextreme-datagrid | queued |
| TinyPivot vs Material React Table | comparison | tinypivot-vs-material-react-table | queued |
| TinyPivot vs PrimeVue DataTable | comparison | tinypivot-vs-primevue-datatable | queued |
| TinyPivot vs PrimeReact DataTable | comparison | tinypivot-vs-primereact-datatable | queued |
| TinyPivot vs Vuetify data table | comparison | tinypivot-vs-vuetify-data-table | queued |
| TinyPivot vs Quasar QTable | comparison | tinypivot-vs-quasar-qtable | queued |
| Lightweight AG Grid alternative that is free | comparison | lightweight-ag-grid-alternative-free | queued |
| AG Grid pricing alternative | comparison | ag-grid-pricing-alternative | queued |
| Next.js pivot table Excel export | tutorial | nextjs-pivot-table-excel-export | queued |
| Nuxt pivot table Excel export | tutorial | nuxt-pivot-table-excel-export | queued |
| Next.js App Router data grid | tutorial | nextjs-app-router-data-grid | queued |
| Nuxt 3 data grid with SSR | tutorial | nuxt3-data-grid-ssr | queued |
| How to build a pivot table in React | tutorial | how-to-build-pivot-table-react | queued |
| How to build a pivot table in Vue 3 | tutorial | how-to-build-pivot-table-vue3 | queued |
| React pivot table from JSON data | tutorial | react-pivot-table-from-json | queued |
| Vue pivot table from API data | tutorial | vue-pivot-table-from-api | queued |
| React data grid CSV and Excel export tutorial | tutorial | react-datagrid-csv-excel-export | queued |
| Embed an analytics dashboard in a React SaaS | tutorial | embed-analytics-dashboard-react-saas | queued |
| Embed an analytics dashboard in a Vue SaaS | tutorial | embed-analytics-dashboard-vue-saas | queued |
| React pivot table example with sample data | tutorial | react-pivot-table-example | queued |
| Natural language query data grid in React | feature | natural-language-query-datagrid-react | queued |
| Text to SQL data grid component | feature | text-to-sql-datagrid-component | queued |
| BYOK AI data analyst for React and Vue | feature | byok-ai-data-analyst | queued |
| React data grid clipboard copy and paste | feature | react-datagrid-clipboard-copy | queued |
| Vue data grid keyboard navigation | feature | vue-datagrid-keyboard-navigation | queued |
| React pivot table median and standard deviation | feature | react-pivot-table-median-stddev | queued |
| Vue pivot table count distinct aggregation | feature | vue-pivot-table-count-distinct | queued |
| React data grid dark mode themes | feature | react-datagrid-dark-mode-themes | queued |
| React pivot table row and column totals | feature | react-pivot-table-row-column-totals | queued |
| Vue pivot table grand totals | feature | vue-pivot-table-grand-totals | queued |
| React lightweight data grid bundle size | feature | react-datagrid-lightweight-bundle | queued |
| Vue data grid with no subscription license | feature | vue-datagrid-no-subscription | queued |
| React pivot table perpetual license | feature | react-pivot-table-perpetual-license | queued |
| React embedded BI component | feature | react-embedded-bi-component | queued |
| Vue embedded BI component | feature | vue-embedded-bi-component | queued |
| React data grid for analytics dashboards | feature | react-datagrid-analytics-dashboards | queued |

## Metrics

- **Total queued keywords:** 106
- **Existing routes excluded:** 8 (7 marketing guides + vs-ag-grid)
- **Combination breakdown:** ~7 frameworks × 8 features × 5 competitors + additional tutorials and direct comparisons
