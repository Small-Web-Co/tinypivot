# @smallwebco/tinypivot-mcp

**TinyPivot Studio: a data analysis workspace your AI agent works in, and you can check.** Your agent loads files, runs SQL and builds charts and pivot tables through TinyPivot. Each step shows up live in the Studio, a local page in your browser, with the reason the agent gave and the exact SQL behind it. Edit that SQL and rerun it, reopen any earlier result, and send the agent notes it picks up on its next step. In the chat, TinyPivot keeps to a compact chart or table card so you can follow progress.

Works with Antigravity, Claude Code, Claude Desktop, Cursor, OpenCode, Codex CLI, pi and any MCP Apps host. Reads CSV, TSV, JSON, JSONL and Parquet files, rows from other MCP tools, and SQL results from any database.

## TinyPivot Studio

In a terminal agent, the first TinyPivot step opens the Studio at `http://127.0.0.1:47317` (set `TINYPIVOT_OPEN_STUDIO=0` to open it yourself; a Studio tab left open from an earlier session reconnects instead of opening a new one). It has three parts:

- **Trace:** every step, newest last, marked as the agent's or yours, with its reason (the `why` the agent passes), what it shows (for example `line chart: sum(mrr) by month`), the row count, and the SQL or file filter behind it. File loads are shown as the SQL that reproduces them.
- **SQL editor:** edit a step's SQL, or write new SQL over local files and loaded tables, and run it with DuckDB, read-only. The result replaces the view, keeps the step's chart when its fields still exist, and joins the trace as your step.
- **Messages to the agent, with data:** write what to check or change, optionally about one step, and attach data: click a row, drill into a pivot cell, or attach the current view. It goes to the agent with the dataset id, so the agent can query the rest itself.

How a message reaches your agent depends on the harness. The Studio shows which one applies:

| Agent | How Studio messages arrive |
|---|---|
| pi | Live: TinyPivot's pi extension starts a turn, and the answer comes back to the Studio's trace. `init` installs the extension, and TinyPivot keeps it up to date (restart pi after an update). Its cards are drawn in full colour, each series in its own. |
| OpenCode | Live: TinyPivot's OpenCode plugin (`~/.config/opencode/plugins/tinypivot.js`) sends the message as a prompt to the session that last used TinyPivot, and the answer comes back to the Studio's trace. `init` installs the plugin, and TinyPivot keeps it up to date (restart OpenCode after an update). Tested with OpenCode 1.19; OpenCode 2's new plugin API is not supported yet. |
| Claude Code | Live when started with `claude --dangerously-load-development-channels server:tinypivot`, or `plugin:tinypivot@tinypivot` when installed as a plugin (Claude Code channels, a research preview). The agent answers with `studio_reply`. Otherwise, with its next TinyPivot reply. Once TinyPivot is on Anthropic's channel allowlist, `claude --channels plugin:tinypivot@<marketplace>` will work without the development flag. |
| Others | With the agent's next TinyPivot reply. **Copy as prompt** puts the message, the step, its SQL and the data on your clipboard to paste now. |

In desktop and IDE hosts that show TinyPivot inline (Claude Desktop, VS Code, Cursor), click a row or drill into a pivot cell, then **Send to chat** to post it to the conversation with your comment.

History holds every table the agent pulled (30 days, on your machine), and the Studio can reopen any of them without re-running the query. The Studio only answers this machine, on its own address, and accepts changes only from its own page.

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

- `.claude-plugin/plugin.json` — plugin manifest, which also declares the TinyPivot Studio channel
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

### Option 3: Plugins for Other Agents

The same folder is also a plugin for other agents' plugin systems. Each one starts the same `npx -y @smallwebco/tinypivot-mcp@latest` server:

| Agent | Install | Files |
|---|---|---|
| Gemini CLI | `gemini extensions install https://github.com/Small-Web-Co/tinypivot` | `gemini-extension.json` (repo root) |
| Antigravity | `agy plugin install ./packages/mcp` from a clone of this repository | `plugin.json`, `mcp_config.json` |
| Cursor | Cursor marketplace (once listed), or a team marketplace that imports this repository | `.cursor-plugin/plugin.json`, `mcp.json`, `.cursor-plugin/marketplace.json` (repo root) |
| Codex | `codex plugin marketplace add Small-Web-Co/tinypivot` | `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json` (repo root) |
| OpenCode | `npx @smallwebco/tinypivot-mcp@latest init --targets=opencode` | registers the server and installs the Studio plugin |

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

   `--open` shows the rows in TinyPivot Studio (`http://127.0.0.1:47317`) for filtering, drill-through and exports.

## Works With Any Database (Not Postgres-Only)

TinyPivot is **database-agnostic**. Use whichever data workflow matches your stack:

- **BigQuery, Snowflake, MySQL, DuckDB, Databricks, SQLite, ClickHouse, or Postgres (CLI / file handoff — 0 raw rows in LLM context):** Export query output to `.csv`, `.tsv`, `.json`, or `.jsonl` via `bq`, `snowsql`, `mysql`, `duckdb`, `databricks`, or `psql` and pass the path to `load_file` (or pipe stdout straight into `npx @smallwebco/tinypivot-mcp@latest --open`).
- **Any MCP Server or API (Stripe, GitHub, BigQuery MCP, Snowflake MCP, REST APIs):** Pipe structured JSON rows (up to `~50` rows already in memory) directly into `load_data` with `chartConfig` / `pivotConfig` in a single call — no temp CSV required (for larger sets, write a file and use `load_file`).
- **Optional Direct PostgreSQL Connector (Pro):** If you use PostgreSQL and want zero-temp-file SQL execution inside the MCP server itself, set `DATABASE_URL` (and optionally `TINYPIVOT_ALLOWED_TABLES`) to enable the AST-validated, read-only `query_postgres` tool.

## Free vs. Pro

TinyPivot MCP ships with a generous **Free tier** out of the box — no account or API key required:

| Capability | Free | Pro / Team |
|---|---|---|
| Core Charts (`bar`, `stackedBar`, `line`, `area`, `pie`, `donut`) | Included | Included + all chart types |
| Pivot Table (`sum` aggregation) | Included | All aggregations & calculated fields |
| Data Grid (sort, filter, search, copy Markdown, CSV export) | Included | Included |
| Framed Terminal Cards & Live Ghostty TUI (`tinypivot-mcp tui`) | Included (subtle `tiny-pivot.com` signature) | Included (watermark-free) |
| TinyPivot Studio (IDE, Notebook, Lineage, isolated sessions, offline HTML export) | Included (subtle footer on HTML) | Included (white-label) |
| Universal DB support via `load_file`, stdin pipe & `load_data` | Included | Included |
| Dataset row limit | **Unlimited local rows** | **Unlimited** |
| SQL Guardrails & Repair Hints | Basic (`SUM`/`AVG` rate traps, zero-row hints, SQL repair) | **Deep** (join fan-out, chasm traps, partial periods, NULL drops, outlier distortion, Turn-1 guard) |
| 1-Call Data Science Shelf (`analyze`) | `explain_change`, basic `ab_test` | **Full Pro shelf** (`ab_test` SRM + Holm-Bonferroni, controlled `regression`, right-censored `cohort_retention`, seasonal `anomalies`) |
| Recursive Data Memory (`~/.local/share/tinypivot/memory.json`) | — | **Included** (learns schemas & Studio SQL edits locally) |
| Visual themes | `Code` theme (Dark & Light) | All 10 themes (`Code`, `Phosphor`, `Nord`, `Thermal`, `Mono`, `Paper`, `Greenbar`, `1-Bit`, `Amber CRT`, `Green CRT`) |
| Drill-Through modals | — | Included |
| Formatted `.xlsx` Excel export | — | Included |
| Optional direct `query_postgres` (`DATABASE_URL`) | — | Included |
| Watermark-free UI, HTML & terminal cards | — | Included |

> **Zero Truncation on Free:** TinyPivot never caps local Free datasets to a partial subset — every chart, pivot, and SQL query reflects 100% of your local file. Read the 4-model benchmark white paper at [tiny-pivot.com/whitepaper](https://tiny-pivot.com/whitepaper).

Unlock Pro or Team at [tiny-pivot.com/pricing](https://tiny-pivot.com/pricing).

## Tools

| Tool | Purpose |
|---|---|
| `open_tinypivot` | Opens TinyPivot (side pane, sidebar, or inline). Works with `{}` using the built-in sample dataset. |
| `load_file` | Loads a local `.csv`, `.tsv`, `.json`, or `.jsonl` file (including SQL CLI exports from any database) with 0 raw rows entering LLM context; pass `chartConfig` / `pivotConfig` to render in 1 call. Pass `where` (for example `[{"field":"year","equals":[2026]}]`) to load only the rows a question is about; filtering runs on disk. |
| `query` | Runs one read-only DuckDB `SELECT` over local CSV, Parquet or JSON files and over loaded datasets (tables named by dataset id), then charts or pivots the result. Rows never enter the model's context. DuckDB (about 20 MB) downloads once, on first use, into `~/.cache/tinypivot`. |
| `load_data` | Loads flat JSON rows already in memory (up to `~50` rows) from any other MCP tool, API, or small SQL query without writing a temp CSV; renders chart + pivot in 1 call. |
| `configure_pivot` | Computes a deterministic pivot table via `@smallwebco/tinypivot-core` (zero LLM math errors). |
| `configure_chart` | Configures and opens the interactive Chart Builder (`bar`, `stackedBar`, `line`, `area`, `pie`, `donut`, maps (`choropleth`), `bullet`, `radialBar`, `radialArea`, `slope`, `treemap`, `sunburst`, etc.; loose names like `map` work too). |
| `query_postgres` | *(Optional Pro)* Runs AST-validated read-only `SELECT` queries directly against `DATABASE_URL` and opens results in TinyPivot. |
| `list_datasets` | Lists all loaded datasets, row counts, and inferred schemas. |
| `profile` | Describes each column of a loaded dataset: empty share, number and date ranges, commonest values. |
| `history` | Lists every earlier pull, or reopens one by id without re-querying. Pulls are saved locally under `~/.local/share/tinypivot/history` for 30 days. |

Data tools take an optional `why`: one sentence the agent writes about each step, shown in the Studio trace.

## Environment Variables (Optional)

- `TINYPIVOT_LICENSE_KEY` — TinyPivot MCP Pro/Team license key (`TP-MCPP-...` or `TP-MCPT-...`; note that UI Library `TP-PRO*` keys apply to `@smallwebco/tinypivot-react`/`-vue` only)
- `DATABASE_URL` — Optional PostgreSQL connection string for direct read-only `query_postgres` (Pro). The tool is only offered to the model when this is set. Works with **any** database (BigQuery, Snowflake, MySQL, DuckDB, Databricks, SQLite, Postgres) today via CLI/file handoff (`load_file`), stdin pipe, or MCP piping (`load_data`)
- `TINYPIVOT_ALLOWED_TABLES` — Comma-separated table allowlist for `query_postgres`
- `TINYPIVOT_TELEMETRY=0` or `DO_NOT_TRACK=1` — Disable anonymous usage telemetry
- `TINYPIVOT_NO_COMPANION=1` — Disable the localhost Studio server
- `TINYPIVOT_PORT` — Localhost port for the Studio (default `47317`; when it is taken, the Studio uses a free port and the tool replies link to it)
- `TINYPIVOT_CLAUDE_CHANNEL` — `1` or `0` overrides whether TinyPivot offers Claude Code a channel. By default it does when Claude Code was started with this server in `--channels` or `--dangerously-load-development-channels`.
- `TINYPIVOT_OPEN_STUDIO` — Set to `0` so the first TinyPivot step in a terminal agent does not open the Studio in your browser
- `TINYPIVOT_REPRINT_CARDS` — Set to `0` so the model does not reprint each chart card in a terminal. Saves about 400 output tokens per question; the card stays visible in the Studio, the `tui` pane and pi.
- `TINYPIVOT_HISTORY` — Set to `0` to stop saving pulls to history. `TINYPIVOT_HISTORY_DAYS` sets how long they are kept (default 30).

## Privacy & Telemetry

Full policy: [tiny-pivot.com/privacy](https://tiny-pivot.com/privacy). Terms: [tiny-pivot.com/terms](https://tiny-pivot.com/terms).

TinyPivot MCP sends minimal, **zero-PII** anonymous usage pings (`event`, `tool`, `rowBucket`, `client`, `tier`, `truncated`, `version`, `os`, and a random local UUID) to help us improve harness compatibility and reliability.

- **Never collected:** row data, column names, SQL queries, file paths, hostnames, or user identities.
- **Opt out anytime:** set `TINYPIVOT_TELEMETRY=0` or `DO_NOT_TRACK=1` in your environment or MCP server `env` block.

## License

TinyPivot is **source-available (dual-licensed)**: Free Tier features are licensed under MIT, and Pro / Team features require a commercial license from Small Web, LLC. See [LICENSE.md](./LICENSE.md) for full terms.
