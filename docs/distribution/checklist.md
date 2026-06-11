# Distribution Checklist - Ready-to-Submit Copy

This file contains ready-to-paste copy for submitting TinyPivot to distribution channels. Each section includes the exact copy, suggested destination, and any required account setup.

---

## 1. awesome-vue PR

**Category:** Components & Libraries → Table

**PR Title:**
```
Add TinyPivot — lightweight Vue 3 data grid with free pivot tables
```

**PR Description:**
```
Add TinyPivot to the Table section under Components & Libraries.

TinyPivot is a lightweight Vue 3 data grid (~50 KB gzipped) with free pivot tables (Sum aggregation), sorting, filtering, CSV export, and calculated fields. Upgrade to Pro for advanced aggregations, chart builder, AI Data Analyst (BYOK), and no watermark.

Entry:
- [TinyPivot](https://tiny-pivot.com) - Lightweight Vue 3 data grid with free pivot tables, advanced aggregations in Pro, chart builder, AI Data Analyst (BYOK), CSV export, 22 themes, and calculated fields.
```

**Entry copy (paste into awesome-vue README.md, Table section):**
```
- [TinyPivot](https://tiny-pivot.com) - Lightweight Vue 3 data grid with free pivot tables, advanced aggregations in Pro, chart builder, AI Data Analyst (BYOK), CSV export, 22 themes, and calculated fields.
```

**Destination:** https://github.com/vuejs/awesome-vue/blob/master/README.md → Find `#### Table` section → add entry to the list

---

## 2. awesome-react-components PR

**Category:** UI Components → Table

**PR Title:**
```
Add TinyPivot to Table section
```

**PR Description:**
```
Add TinyPivot to the Table section of awesome-react-components.

TinyPivot is a lightweight, batteries-included React data grid with free pivot tables, sorting, filtering, CSV export, and calculated fields. Ideal for users who want a focused analytics component with good defaults rather than a headless table library. Pro tier adds advanced aggregations, charts, AI Data Analyst (BYOK), and watermark removal.

Entry:
- [TinyPivot](https://tiny-pivot.com) - [demo](https://stackblitz.com/github/Small-Web-Co/tinypivot/tree/master/examples/stackblitz-react) - Lightweight React data grid with free pivot tables (Sum), sorting, filtering, CSV export, 22 themes, and calculated fields. Pro adds advanced aggregations, charts, AI Data Analyst (BYOK), and watermark removal.
```

**Entry copy (paste into awesome-react-components README.md, Table section):**
```
- [TinyPivot](https://tiny-pivot.com) - [demo](https://stackblitz.com/github/Small-Web-Co/tinypivot/tree/master/examples/stackblitz-react) - Lightweight React data grid with free pivot tables (Sum), sorting, filtering, CSV export, 22 themes, and calculated fields. Pro adds advanced aggregations, charts, AI Data Analyst (BYOK), and watermark removal.
```

**Destination:** https://github.com/brillout/awesome-react-components/blob/master/README.md → Find `### Table` section → add entry to the list

---

## 3. GitHub Repository Polish

**Topics to add (required for discoverability):**
```bash
gh repo edit Small-Web-Co/tinypivot \
  --add-topic pivot-table \
  --add-topic data-grid \
  --add-topic datagrid \
  --add-topic react \
  --add-topic vue3 \
  --add-topic vuejs \
  --add-topic charts \
  --add-topic ai \
  --add-topic analytics \
  --add-topic excel \
  --add-topic spreadsheet \
  --add-topic typescript
```

**Also check:**
- [ ] GitHub Settings → General → Social preview image is set (should be a clean TinyPivot branding image, dimensions 1200×630)
- [ ] GitHub Settings → General → Description is current: "Lightweight Vue & React data grid with free pivot tables, CSV export, and Pro analytics features."

---

## 4. Directory Listing Services

### AlternativeTo

**URL:** https://alternativeto.net/software/ag-grid/

**Listing Details:**

**Title:**
```
TinyPivot
```

**Short Description (160 characters max):**
```
Lightweight Vue and React data grid with free pivot tables, Sum aggregation, CSV export, calculated fields, and 22 themes.
```

**Long Description (~100 words):**
```
TinyPivot is a lightweight analytics component for Vue 3 and React with a free tier (MIT-licensed usage) and a commercial Pro tier. The free tier includes a data grid with sorting, filtering, search, pagination, column resizing, and pivot tables with Sum aggregation. Calculated fields allow on-the-fly data transformations. CSV export and 22 themes are built-in. The Pro tier (one-time $49–$399) adds advanced aggregations (count, average, min, max, count distinct, median, standard deviation, % of total), interactive chart builder, AI Data Analyst (bring your own OpenAI/Anthropic/OpenRouter key), session persistence, percentage mode, and watermark removal. Bundle size ~40–50 KB gzipped. TypeScript support included. Positioned as a lightweight alternative to enterprise grids like AG Grid when you need focused analytics without complexity.
```

**Suggested Tags:**
```
data-grid, pivot-table, analytics, excel-like, charts, ai-powered, csv-export, react, vue, lightweight
```

---

### LibHunt

**URL:** https://www.libhunt.com/r/tinypivot

**Listing Details:**

**Title:**
```
TinyPivot
```

**Short Description (160 characters max):**
```
Lightweight Vue and React data grid with free pivot tables, Sum aggregation, CSV export, calculated fields, and 22 themes.
```

**Long Description (~100 words):**
```
TinyPivot is a lightweight analytics component for Vue 3 and React featuring a high-performance data grid with sorting, filtering, search, pagination, and column resizing. The free tier includes pivot tables with Sum aggregation, calculated fields, CSV export, and 22 color themes. Pro licensing ($49–$399 one-time) adds advanced aggregations (count, average, min, max, count distinct, median, standard deviation, % of total), interactive chart builder, AI Data Analyst (BYOK: OpenAI/Anthropic/OpenRouter), session persistence, percentage mode, and watermark removal. At ~40–50 KB gzipped, TinyPivot is ideal for teams wanting focused analytics features without the overhead of enterprise grids. Fully typed in TypeScript.
```

**Suggested Tags:**
```
data-grid, pivot-table, analytics, react, vue, charts, ai, csv, spreadsheet, typescript
```

---

## 5. StackBlitz Links

**StackBlitz Template URLs** (valid only after `feat/distribution-tier1` merges to `master` — the examples don't exist on `master` yet):

- React: `https://stackblitz.com/github/Small-Web-Co/tinypivot/tree/master/examples/stackblitz-react`
- Vue: `https://stackblitz.com/github/Small-Web-Co/tinypivot/tree/master/examples/stackblitz-vue`

**Already linked in (verified):**
- [ ] Root README.md (section with framework toggle badges)
- [ ] packages/react/README.md (Quick Start section)
- [ ] packages/vue/README.md (Quick Start section)
- [ ] demo/pages/Home.vue (Quick Start section, both toggles)

**Still to link in (optional, for Phase 2):**
- [ ] Blog/announcement posts (when applicable)
- [ ] Product Hunt launch post (if applicable)
- [ ] Twitter/social media posts

---

## 6. Context7 Submission

**Submission details:**

After the demo site deploys and `demo/public/llms-full.txt` is live, submit TinyPivot to Context7:

1. Navigate to: https://context7.com
2. Submit the URL: `https://tiny-pivot.com/llms-full.txt`
3. This allows AI assistants (Claude, ChatGPT, etc.) to reference the full developer documentation when helping users with TinyPivot integration.

**Status:** ⏳ Pending (do this after Task 2 deploys)

---

## Submission Checklist

- [ ] awesome-vue PR submitted
- [ ] awesome-react-components PR submitted
- [ ] GitHub repo topics added via `gh` CLI
- [ ] GitHub social preview image verified
- [ ] AlternativeTo listing created or updated
- [ ] LibHunt listing created or updated
- [ ] StackBlitz links verified on README files
- [ ] Context7 submission (post-deploy)
