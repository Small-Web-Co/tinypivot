# TinyPivot License

Copyright (c) 2024–2026 Small Web, LLC

TinyPivot is **dual-licensed (source-available)**: the Free Tier features are licensed under the **MIT License**, while Pro and Team features require a **Commercial License** from Small Web, LLC.

---

## 1. Free Tier (MIT License)

Permission is hereby granted, free of charge, to any person obtaining a copy of the **Free Tier features** of this software and associated documentation files (the "Free Tier Software"), to deal in the Free Tier Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Free Tier Software, and to permit persons to whom the Free Tier Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Free Tier Software.

### Free Tier Features Include:
- **TinyPivot UI (`@smallwebco/tinypivot-core`, `-vue`, `-react`):**
  - Data grid display with sorting, column filtering, keyboard navigation, cell selection, copy/paste, column resizing, and formatting
  - Free pivot tables (`sum` aggregation, totals, and calculated fields) with TinyPivot attribution visible
- **TinyPivot Studio / MCP (`@smallwebco/tinypivot-mcp`):**
  - Datasets up to **2,500 rows** (explicitly flagged if a source file exceeds 2,500 rows)
  - Core charts (`bar`, `stackedBar`, `line`, `area`, `pie`, `donut`), basic `sum` pivot tables, data grid, local read-only DuckDB SQL over files, Studio trace & local pull history, terminal cards, and the `Code` theme, with TinyPivot attribution visible

THE FREE TIER SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---

## 2. Pro & Team Features (Commercial License)

The source code for Pro and Team features is included in this repository for transparency, security inspection, and local auditing, **not** under the MIT License. Using any Pro or Team feature in development, production, or commercial workflows requires a valid paid license key issued by Small Web, LLC.

### Commercial Features Include:
- **TinyPivot Studio / MCP Pro & Team (`TP-MCPP-*` / `TP-MCPT-*`):**
  - Unlimited dataset rows (beyond the 2,500-row Free Tier limit)
  - All visual themes beyond `Code`
  - Double-click Drill-Through
  - Advanced aggregations (`countDistinct`, `median`, `stdDev`, `percentOfTotal`, etc.)
  - Styled `.xlsx` Excel export
  - AST-validated read-only PostgreSQL connector (`query_postgres`)
  - Watermark / branding removal and multi-seat Team licensing
- **TinyPivot UI Pro / Unlimited / Team (`TP-PRO*`):**
  - Pro charts, advanced aggregations, double-click Drill-Through, `.xlsx` export, AI Data Analyst, and watermark removal

### Purchasing & Verification
- Current plans and pricing are listed at https://tiny-pivot.com/pricing.
- License keys are cryptographically signed (ECDSA P-256) by Small Web, LLC and verified locally with no network call required.

---

## 3. Commercial Terms & Restrictions

1. **No License Bypass:** You may not modify, patch, circumvent, disable, or remove license key verification, row-limit enforcement, or feature gating to access Pro or Team features without a valid commercial license.
2. **No Removal of Attribution on Free Tier:** Free Tier users must keep TinyPivot attribution/branding intact. A valid Pro or Team license removes this requirement.
3. **No Redistribution of Pro Features:** You may not redistribute, repackage, or offer TinyPivot's Pro or Team features as part of another component library, SDK, MCP server, or hosted service without prior written consent from Small Web, LLC.
4. **No Sub-licensing or Unauthorized Sharing:** Commercial license keys are non-transferable and may not be shared beyond the licensed number of applications or seats.

---

For licensing inquiries or enterprise terms, contact: **license@tiny-pivot.com**
