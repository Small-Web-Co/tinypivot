# @smallwebco/tinypivot-mcp

Interactive **TinyPivot MCP Server & MCP App** (`ui://tinypivot/app.html`) — turn CSV, TSV, JSON, JSONL, inline agent outputs, and read-only PostgreSQL queries into interactive charts, pivot tables, data grids, drill-through modals, and Excel exports directly inside your AI harness (Antigravity, Claude Code, Claude Desktop, Cursor, OpenCode, Codex CLI, pi, and any SEP-1865 MCP Apps host).

## 1-Command Setup

Auto-detect and wire all installed AI harnesses on your machine:

```bash
npx @smallwebco/tinypivot-mcp init
```

Options:

- `--targets=claude,claude-desktop,cursor,opencode,antigravity,pi,codex` — configure specific harnesses
- `--license=TP-...` — include your `TINYPIVOT_LICENSE_KEY` in the generated MCP config
- `--local` — wire a local build (`node .../dist/cli.js`) for local development
- `--no-rules` — skip adding the auto-use TinyPivot rule to `~/.claude/CLAUDE.md`
- `--dry-run` — preview changes without modifying files

## Free vs. Pro

TinyPivot MCP ships with a generous **Free tier** out of the box — no account or API key required:

| Capability | Free | Pro / Team |
|---|---|---|
| Core Charts (`bar`, `stackedBar`, `line`, `area`, `pie`, `donut`) | Included | Included + all chart types |
| Pivot Table (`sum` aggregation) | Included | All aggregations & calculated fields |
| Data Grid (sort, filter, search, copy Markdown, CSV export) | Included | Included |
| Terminal Companion Data IDE (`--open` / live SSE) | Included | Included |
| Dataset row limit | Up to 2,500 rows (explicitly bannered if truncated) | Unlimited |
| Visual themes | `Code` theme (Dark & Light) | All 5 themes (`Code`, `Phosphor`, `Nord`, `Thermal`, `Mono`) |
| Drill-Through modals | — | Included |
| Formatted `.xlsx` Excel export | — | Included |
| Read-only `query_postgres` (`DATABASE_URL`) | — | Included |
| Watermark-free UI | — | Included |

> **High-Trust Row Limit:** If a dataset exceeds 2,500 rows on the Free tier, TinyPivot never truncates silently — both the UI (amber top banner) and the tool summary sent to the LLM explicitly state `Showing first 2,500 of N rows — totals reflect this subset only`.

Unlock Pro or Team at [tiny-pivot.com/mcp](https://tiny-pivot.com/mcp).

## Tools

| Tool | Purpose |
|---|---|
| `open_tinypivot` | Opens TinyPivot (side pane, sidebar, or inline). Works with `{}` using the built-in sample dataset. |
| `load_file` | Loads a local `.csv`, `.tsv`, `.json`, or `.jsonl` file and renders a chart/pivot in a single call. |
| `load_data` | Loads flat JSON rows from any other MCP tool (e.g. Stripe, GitHub, API) directly into TinyPivot. |
| `configure_pivot` | Computes a deterministic pivot table via `@smallwebco/tinypivot-core` (zero LLM math errors). |
| `configure_chart` | Configures and opens the interactive Chart Builder (`bar`, `stackedBar`, `line`, `area`, `pie`, `donut`, etc.). |
| `query_postgres` | *(Pro)* Runs AST-validated read-only `SELECT` queries against `DATABASE_URL` and opens results in TinyPivot. |
| `list_datasets` | Lists all loaded datasets, row counts, and inferred schemas. |

## Environment Variables (Optional)

- `TINYPIVOT_LICENSE_KEY` — TinyPivot Pro/Team license key (`TP-...`)
- `DATABASE_URL` — PostgreSQL connection string for read-only `query_postgres` (Pro)
- `TINYPIVOT_ALLOWED_TABLES` — Comma-separated table allowlist for `query_postgres`
- `TINYPIVOT_TELEMETRY=0` or `DO_NOT_TRACK=1` — Disable anonymous usage telemetry
- `TINYPIVOT_NO_COMPANION=1` — Disable the localhost Companion Data IDE server
- `TINYPIVOT_PORT` — Fixed localhost port for the Companion Data IDE server

## Privacy & Telemetry

TinyPivot MCP sends minimal, **zero-PII** anonymous usage pings (`event`, `tool`, `rowBucket`, `client`, `tier`, `truncated`, `version`, `os`, and a random local UUID) to help us improve harness compatibility and reliability.

- **Never collected:** row data, column names, SQL queries, file paths, hostnames, or user identities.
- **Opt out anytime:** set `TINYPIVOT_TELEMETRY=0` or `DO_NOT_TRACK=1` in your environment or MCP server `env` block.
