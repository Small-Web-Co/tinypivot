# @smallwebco/tinypivot-mcp

Interactive **TinyPivot MCP Server, MCP App (`ui://tinypivot/app.html`) & Native Claude Plugin** — turn CSV, TSV, JSON, JSONL, API/MCP tool outputs, and SQL results from **any database** (BigQuery, Snowflake, MySQL, DuckDB, Databricks, PostgreSQL, SQLite) into interactive charts, deterministic pivot tables, data grids, screenshot-ready terminal cards, a live Ghostty TUI, drill-through modals, and Excel exports directly inside your AI harness (Antigravity, Claude Code, Claude Desktop, Cursor, OpenCode, Codex CLI, pi, and any SEP-1865 MCP Apps host).

## Quick Setup

### Option 1: 1-Command Multi-Harness Setup (Recommended)

Auto-detect and wire all installed AI harnesses on your machine (Claude Code, Claude Desktop, Cursor, the Antigravity IDE and CLI, OpenCode, Codex CLI, and pi):

```bash
npx @smallwebco/tinypivot-mcp@latest init
```

Options:

- `--targets=claude,claude-desktop,cursor,opencode,antigravity,antigravity-cli,pi,codex` — configure specific harnesses
- `--license=TP-...` — include your `TINYPIVOT_LICENSE_KEY` in the generated MCP config
- `--local` — wire a local build (`node .../dist/cli.js`) for local development
- `--no-rules` — skip adding the auto-use TinyPivot rule to `~/.claude/CLAUDE.md`
- `--dry-run` — preview changes without modifying files

### Option 2: Install as a Native Claude Code / Claude Desktop Plugin

This package ships as a self-contained Claude plugin bundle containing:

- `.claude-plugin/plugin.json` — plugin manifest
- `.mcp.json` — registers `mcpServers.tinypivot` (`npx -y @smallwebco/tinypivot-mcp@latest`)
- `skills/tinypivot/SKILL.md` — teaches Claude when to invoke TinyPivot automatically, how to render in 1 tool call, when to use `load_data` vs `load_file`, and to echo TinyPivot terminal cards verbatim

**Claude Code / Claude Desktop (directly from GitHub marketplace):**

```text
/plugin marketplace add Small-Web-Co/tinypivot
/plugin install tinypivot@tinypivot
```

**Claude Code (from a local clone or unpacked package):**

```bash
# Try for a single session without installing permanently
claude --plugin-dir ./packages/mcp

# Install permanently into your Claude Code plugin config
claude plugin install ./packages/mcp
```

**Claude Desktop & Claude Code (via 1-command installer):**

```bash
npx @smallwebco/tinypivot-mcp@latest init --targets=claude,claude-desktop
```

Or copy the bundled `.mcp.json` server block directly into Claude Desktop's `claude_desktop_config.json`.

> **Make TinyPivot your default chart renderer:** The TinyPivot MCP server advertises authoritative `instructions`, and both `npx @smallwebco/tinypivot-mcp@latest init` (via `~/.claude/CLAUDE.md`) and the native Claude Plugin (`skills/tinypivot/SKILL.md`) automatically route chart, YoY/MoM comparison, and pivot requests to TinyPivot in **Claude Code** and **Claude Code Desktop**. For **Claude Desktop** chat (which may otherwise default to its built-in visualization widget), add this one-line preference under **Settings → General → Personal Preferences**:
>
> `Always use the tinypivot MCP server (load_data or load_file with chartConfig/pivotConfig in one call) instead of built-in visualization widgets, HTML/SVG/React chart artifacts, or large Markdown tables whenever I ask for charts, YoY/MoM comparisons, pivot tables, or tabular data analysis.`

## Terminal Cards, Stdin Piping & Live Ghostty TUI

In terminal-first harnesses (**Claude Code, Ghostty, OpenCode, pi, Codex CLI**), TinyPivot delivers three complementary ways to inspect your data without leaving your terminal:

1. **Framed Unicode Terminal Cards:** Every chart and pivot call prints a crisp rounded-border card (`╭─ ... ─╮`) with sub-block bars, stacked multi-series legends, 2x4 Braille line charts, and box-drawn pivot tables with inline sparklines (`▁▂▃▄▅▆▇█`) right in your terminal scrollback.
2. **Live Split-Pane TUI (`Ghostty` / tmux / any terminal):** Open a side pane and attach directly to your running agent's TinyPivot session via live SSE:

   ```bash
   npx @smallwebco/tinypivot-mcp@latest tui
   # or pass an explicit Companion URL:
   npx @smallwebco/tinypivot-mcp@latest tui http://127.0.0.1:<port>
   ```

   Keyboard controls inside the live TUI: `[1] Chart` · `[2] Pivot` · `[3] Data` · `[t] Theme` · `[q] Quit`. Every agent query updates the split pane automatically.
3. **Direct Stdin Piping & Live Browser Companion:** Pipe CSV or JSON straight from any CLI or SQL tool into TinyPivot without creating temporary files:

   ```bash
   # Pipe any SQL CLI or data command straight into TinyPivot
   duckdb -csv -c "SELECT region, month, SUM(revenue) AS revenue FROM 'sales.parquet' GROUP BY 1, 2" | npx @smallwebco/tinypivot-mcp@latest --open
   psql "$DATABASE_URL" --csv -c "SELECT * FROM monthly_revenue" | npx @smallwebco/tinypivot-mcp@latest --open
   cat metrics.csv | npx @smallwebco/tinypivot-mcp@latest --open
   ```

   TinyPivot also runs a live SSE-synced localhost Companion Data IDE (`http://127.0.0.1:<port>`) for interactive filtering, drill-through, and exports.

## Works With Any Database (Not Postgres-Only)

TinyPivot is **database-agnostic**. Use whichever data workflow matches your stack:

- **BigQuery, Snowflake, MySQL, DuckDB, Databricks, SQLite, ClickHouse, or Postgres (CLI / file handoff — 0 raw rows in LLM context):** Export query output to `.csv`, `.tsv`, `.json`, or `.jsonl` via `bq`, `snowsql`, `mysql`, `duckdb`, `databricks`, or `psql` and pass the path to `load_file` (or pipe stdout straight into `npx @smallwebco/tinypivot-mcp@latest --open`).
- **Any MCP Server or API (Stripe, GitHub, BigQuery MCP, Snowflake MCP, REST APIs):** Pipe structured JSON rows (<500 rows already in memory) directly into `load_data` with `chartConfig` / `pivotConfig` in a single call — no temp CSV required.
- **Optional Direct PostgreSQL Connector (Pro):** If you use PostgreSQL and want zero-temp-file SQL execution inside the MCP server itself, set `DATABASE_URL` (and optionally `TINYPIVOT_ALLOWED_TABLES`) to enable the AST-validated, read-only `query_postgres` tool.

## Free vs. Pro

TinyPivot MCP ships with a generous **Free tier** out of the box — no account or API key required:

| Capability | Free | Pro / Team |
|---|---|---|
| Core Charts (`bar`, `stackedBar`, `line`, `area`, `pie`, `donut`) | Included | Included + all chart types |
| Pivot Table (`sum` aggregation) | Included | All aggregations & calculated fields |
| Data Grid (sort, filter, search, copy Markdown, CSV export) | Included | Included |
| Framed Terminal Cards & Live Ghostty TUI (`tinypivot-mcp tui`) | Included (subtle `tiny-pivot.com` signature) | Included (watermark-free) |
| Terminal Companion Data IDE (`--open` / live SSE) | Included | Included |
| Universal DB support via `load_file`, stdin pipe & `load_data` | Included | Included |
| Dataset row limit | Up to 2,500 rows (explicitly bannered if truncated) | Unlimited |
| Visual themes | `Code` theme (Dark & Light) | All 10 themes (`Code`, `Phosphor`, `Nord`, `Thermal`, `Mono`, `Paper`, `Greenbar`, `1-Bit`, `Amber CRT`, `Green CRT`) |
| Drill-Through modals | — | Included |
| Formatted `.xlsx` Excel export | — | Included |
| Optional direct `query_postgres` (`DATABASE_URL`) | — | Included |
| Watermark-free UI & terminal cards | — | Included |

> **High-Trust Row Limit:** If a dataset exceeds 2,500 rows on the Free tier, TinyPivot never truncates silently — both the UI (amber top banner) and the tool summary sent to the LLM explicitly state `Showing first 2,500 of N rows — totals reflect this subset only`.

Unlock Pro or Team at [tiny-pivot.com/pricing](https://tiny-pivot.com/pricing).

## Tools

| Tool | Purpose |
|---|---|
| `open_tinypivot` | Opens TinyPivot (side pane, sidebar, or inline). Works with `{}` using the built-in sample dataset. |
| `load_file` | Loads a local `.csv`, `.tsv`, `.json`, or `.jsonl` file (including SQL CLI exports from any database) with 0 raw rows entering LLM context; pass `chartConfig` / `pivotConfig` to render in 1 call. Pass `where` (for example `[{"field":"year","equals":[2026]}]`) to load only the rows a question is about; filtering runs on disk. |
| `load_data` | Loads flat JSON rows already in memory (<500 rows) from any other MCP tool, API, or small SQL query without writing a temp CSV; renders chart + pivot in 1 call. |
| `configure_pivot` | Computes a deterministic pivot table via `@smallwebco/tinypivot-core` (zero LLM math errors). |
| `configure_chart` | Configures and opens the interactive Chart Builder (`bar`, `stackedBar`, `line`, `area`, `pie`, `donut`, etc.). |
| `query_postgres` | *(Optional Pro)* Runs AST-validated read-only `SELECT` queries directly against `DATABASE_URL` and opens results in TinyPivot. |
| `list_datasets` | Lists all loaded datasets, row counts, and inferred schemas. |

## Environment Variables (Optional)

- `TINYPIVOT_LICENSE_KEY` — TinyPivot MCP Pro/Team license key (`TP-MCPP-...` or `TP-MCPT-...`; note that UI Library `TP-PRO*` keys apply to `@smallwebco/tinypivot-react`/`-vue` only)
- `DATABASE_URL` — Optional PostgreSQL connection string for direct read-only `query_postgres` (Pro). Works with **any** database (BigQuery, Snowflake, MySQL, DuckDB, Databricks, SQLite, Postgres) today via CLI/file handoff (`load_file`), stdin pipe, or MCP piping (`load_data`)
- `TINYPIVOT_ALLOWED_TABLES` — Comma-separated table allowlist for `query_postgres`
- `TINYPIVOT_TELEMETRY=0` or `DO_NOT_TRACK=1` — Disable anonymous usage telemetry
- `TINYPIVOT_NO_COMPANION=1` — Disable the localhost Companion Data IDE server
- `TINYPIVOT_PORT` — Fixed localhost port for the Companion Data IDE server

## Privacy & Telemetry

TinyPivot MCP sends minimal, **zero-PII** anonymous usage pings (`event`, `tool`, `rowBucket`, `client`, `tier`, `truncated`, `version`, `os`, and a random local UUID) to help us improve harness compatibility and reliability.

- **Never collected:** row data, column names, SQL queries, file paths, hostnames, or user identities.
- **Opt out anytime:** set `TINYPIVOT_TELEMETRY=0` or `DO_NOT_TRACK=1` in your environment or MCP server `env` block.
