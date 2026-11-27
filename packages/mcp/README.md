# @smallwebco/tinypivot-mcp

**TinyPivot Studio: a data analysis workspace your AI agent works in, and you can check.** Your agent loads files, runs SQL and builds charts and pivot tables through TinyPivot. Each step shows up live in the Studio, a local page in your browser, with the reason the agent gave and the exact SQL behind it. Edit that SQL and rerun it, reopen any earlier result, and send the agent notes it picks up on its next step. In the chat, TinyPivot keeps to a compact chart or table card so you can follow progress.

Works with Antigravity, Claude Code, Claude Desktop, Cursor, OpenCode, Codex CLI, pi and any MCP Apps host. Reads CSV, TSV, JSON, JSONL, Parquet and Excel (`.xlsx`) files, rows from other MCP tools, and SQL results from any database.

## TinyPivot Studio (or Headless `--no-studio`)

In a terminal agent, the first TinyPivot step opens the Studio at `http://127.0.0.1:47317` (a Studio tab left open from an earlier session reconnects instead of opening a new one). For headless servers, CI, or automated benchmarks:

- **Keep Studio off completely (zero ports, zero browser popups):** pass `--no-studio` (or set `TINYPIVOT_NO_STUDIO=1` / `TINYPIVOT_NO_COMPANION=1`).
- **Keep Studio running without auto-opening a browser tab:** pass `--no-open` (or set `TINYPIVOT_OPEN_STUDIO=0` / `TINYPIVOT_NO_OPEN=1`).

When enabled, TinyPivot Studio has three parts:

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
- `--connect` (or `--connect=bigquery,snowflake,databricks,clickhouse,mysql`) — let your agent query warehouses you are already signed in to with their own CLIs (Pro). `init` always lists the sign-ins it finds; only this flag connects them, and only a project, connection or profile name is written, never a secret
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

## Works With Any Data Source

TinyPivot works with any data your agent can reach. Use whichever workflow matches your stack:

- **Direct Snowflake, BigQuery, Databricks, ClickHouse, MySQL and PostgreSQL (Pro):** TinyPivot runs read-only SQL in the warehouse itself, so totals are computed where the data lives and only the result comes back. Every step's SQL shows in the Studio and can be re-checked there. See [Direct connections](#direct-connections-pro) below.

- **BigQuery, Snowflake, MySQL, DuckDB, Databricks, SQLite, ClickHouse, or Postgres (CLI / file handoff — 0 raw rows in LLM context):** Export query output to `.csv`, `.tsv`, `.json`, or `.jsonl` via `bq`, `snowsql`, `mysql`, `duckdb`, `databricks`, or `psql` and pass the path to `load_file` (or pipe stdout straight into `npx @smallwebco/tinypivot-mcp@latest --open`).
- **Any MCP Server or API (Stripe, GitHub, BigQuery MCP, Snowflake MCP, REST APIs):** Pipe structured JSON rows (up to `~50` rows already in memory) directly into `load_data` with `chartConfig` / `pivotConfig` in a single call — no temp CSV required (for larger sets, write a file and use `load_file`).

### Direct connections (Pro)

Each tool appears only when its settings are present.

**No new sign-in if you already use your warehouse's CLI.** TinyPivot reuses the sign-in your tools already keep: gcloud's application default credentials and project, the Snowflake CLI's `connections.toml`, the Databricks CLI's `~/.databrickscfg`, `clickhouse client`'s config and your MySQL `~/.my.cnf`. Run `npx @smallwebco/tinypivot-mcp@latest init`: it lists the sign-ins it finds and the `--connect` command that switches them on. Someone with no sign-in yet gets a browser sign-in on their first query (Google, Snowflake SSO, Databricks OAuth).

**BigQuery** (`query_bigquery`): set `TINYPIVOT_BIGQUERY_PROJECT`. Credentials come from Google's usual sources: `gcloud auth application-default login`, or `GOOGLE_APPLICATION_CREDENTIALS` pointing at a service-account key. Google's client library downloads once into `~/.cache/tinypivot` on the first query.

- Every query is dry-run first. BigQuery itself reports what the SQL does, so anything other than one `SELECT` is refused before it runs, whatever the syntax.
- `TINYPIVOT_BIGQUERY_MAX_GB` caps how much one query may scan (default 50 GB). The cap is checked on the dry run and also set as `maximumBytesBilled` on the job, so BigQuery will not bill past it.
- `TINYPIVOT_BIGQUERY_ALLOWED` limits queries to listed `dataset`, `dataset.table` or `project.dataset.table` entries (comma-separated). Without it, the credentials' own BigQuery permissions are the limit.
- `TINYPIVOT_BIGQUERY_LOCATION` sets the dataset location (e.g. `EU`) when BigQuery cannot infer it.
- Results return up to 5,000 rows. When a result is cut, TinyPivot tells the agent to aggregate in BigQuery instead, so totals cover the whole table.
- Jobs are labelled `client: tinypivot`, so they are easy to find in BigQuery's job history and billing.

**Snowflake** (`query_snowflake`): the easiest setup is `TINYPIVOT_SNOWFLAKE_CONNECTION=<name>`, which reuses a connection from the `connections.toml` shared by the Snowflake CLI, the Python connector and Snowflake's MCP server (`default` follows that file's own default). Otherwise set `TINYPIVOT_SNOWFLAKE_ACCOUNT` and `TINYPIVOT_SNOWFLAKE_USER`; `TINYPIVOT_SNOWFLAKE_*` settings override a named connection's values. Sign-in uses the connection's `authenticator` when it names one, else, in this order:

- Key pair (recommended): `TINYPIVOT_SNOWFLAKE_PRIVATE_KEY` (the PEM text; `\n` escapes are fine) or `TINYPIVOT_SNOWFLAKE_PRIVATE_KEY_PATH`, and `TINYPIVOT_SNOWFLAKE_PRIVATE_KEY_PASSPHRASE` if the key is encrypted.
- A programmatic access token in `TINYPIVOT_SNOWFLAKE_TOKEN`.
- `TINYPIVOT_SNOWFLAKE_PASSWORD`.
- None of these: browser sign-in (SSO) on first query, for local use.

`TINYPIVOT_SNOWFLAKE_ROLE`, `_WAREHOUSE`, `_DATABASE` and `_SCHEMA` set the session. Snowflake's official Node driver downloads once into `~/.cache/tinypivot` on the first query and logs only to a file there, never to the console.

- **Use a role with read-only grants.** That is the strongest guard. TinyPivot adds three more:
  1. A text check that allows one `SELECT` and refuses write words and `SYSTEM$` functions.
  2. `EXPLAIN`, which compiles the query without running it or using the warehouse: its plan must contain only read steps, on allowed tables, within the scan limit.
  3. Running it as a single statement (`MULTI_STATEMENT_COUNT=1`) with a 60-second timeout.
- `TINYPIVOT_SNOWFLAKE_MAX_GB` caps the bytes the plan may scan (default 50 GB; Snowflake's estimate is an upper bound).
- `TINYPIVOT_SNOWFLAKE_ALLOWED` limits queries to listed `database`, `database.schema` or `database.schema.table` entries (comma-separated).
- Queries carry the query tag `tinypivot` and the application name `TinyPivot`, so they are easy to find in query history and cost reports.
- Results return up to 5,000 rows; Snowflake counts the rows first and only that many are fetched.

**Databricks** (`query_databricks`): the easiest setup is `TINYPIVOT_DATABRICKS_PROFILE=<name>`, which reuses a profile from the `~/.databrickscfg` kept by the Databricks CLI and SDKs (`DATABRICKS_CONFIG_FILE` points elsewhere). Otherwise set `TINYPIVOT_DATABRICKS_HOST`; with no credentials TinyPivot also reuses the first profile for that host. `TINYPIVOT_DATABRICKS_*` settings override a profile's values. Sign-in follows the profile's `auth_type` when it has one, else, in this order:

- A personal access token in `TINYPIVOT_DATABRICKS_TOKEN` (or the profile's `token`).
- An OAuth service principal: `TINYPIVOT_DATABRICKS_CLIENT_ID` and `TINYPIVOT_DATABRICKS_CLIENT_SECRET` (or the profile's `client_id` / `client_secret`).
- None of these (or a profile made with `databricks auth login`): browser sign-in (OAuth) on first query, for local use.

`TINYPIVOT_DATABRICKS_WAREHOUSE` names the SQL warehouse (its id, or its HTTP path `/sql/1.0/warehouses/<id>`). With a token or a service principal it is optional: TinyPivot picks a running warehouse those credentials can use, else the first one. `TINYPIVOT_DATABRICKS_CATALOG` and `_SCHEMA` set where unqualified tables resolve. Databricks' official Node driver downloads once into `~/.cache/tinypivot` on the first query and never logs to the console.

- **Use Unity Catalog grants that only allow reading** (`USE CATALOG`, `USE SCHEMA`, `SELECT`). That is the strongest guard, and the only way to limit which tables can be read. TinyPivot adds three more:
  1. A text check that allows one `SELECT` and refuses write words.
  2. `EXPLAIN EXTENDED`, which plans the query without running it: a plan with any write or DDL step (insert, merge, update, delete, create, drop, write files…) is refused.
  3. Running it with a 60-second statement timeout (`STATEMENT_TIMEOUT`).
- Queries carry the user agent `TinyPivot` and the query tag `client:tinypivot`, so they are easy to find in query history.
- Results return up to 5,000 rows. When a result is cut, TinyPivot tells the agent to aggregate in Databricks instead, so totals cover the whole table.
- Databricks' Node driver returns `BIGINT` as a JavaScript number, so integers beyond 2^53 (about 9 quadrillion) arrive rounded. Cast very large ids to `STRING` in the query to keep them exact.

**ClickHouse** (`query_clickhouse`): set `TINYPIVOT_CLICKHOUSE_URL` to the HTTP(S) endpoint (e.g. `https://abc.eu-west-1.aws.clickhouse.cloud:8443`), plus `TINYPIVOT_CLICKHOUSE_USER`, `_PASSWORD` and `_DATABASE` (or put them in the URL as `https://user:pass@host:8443/database`; the `TINYPIVOT_CLICKHOUSE_*` settings win over the URL's). If you already use `clickhouse client`, `TINYPIVOT_CLICKHOUSE_USE_CLIENT_CONFIG=1` reuses the host, user, password, database and `secure` flag from `~/.clickhouse-client/config.xml` (or the file in `CLICKHOUSE_CLIENT_CONFIG`; over HTTPS on 8443 when secure, else HTTP on 8123; set the URL for other ports). ClickHouse's official Node client downloads once into `~/.cache/tinypivot` on the first query and never logs to the console.

- **Use a read-only user** (a settings profile with `readonly = 1` and only `SELECT` grants). That is the strongest guard. TinyPivot adds:
  1. A text check that allows one `SELECT` and refuses write words, `SETTINGS`, `FORMAT` and `INTO OUTFILE`.
  2. ClickHouse's own enforcement on every query: `readonly = 1` (no writes, no setting changes, no `url()`/`s3()`/`remote()` table functions), `max_bytes_to_read`, and `max_execution_time = 60`, with both limits set to fail rather than return partial results. For a user whose profile is already `readonly = 1`, ClickHouse refuses per-query settings, so that profile's own limits apply.
- `TINYPIVOT_CLICKHOUSE_MAX_GB` caps the uncompressed bytes one query may read (default 50 GB). ClickHouse stops the query once it reads past it.
- Queries carry `log_comment = 'tinypivot'`, a `tinypivot-…` query id and the application name `TinyPivot`, so they are easy to find in `system.query_log`.
- Results return up to 5,000 rows. The result is streamed and reading stops after that, so a large result is never downloaded whole.

**MySQL and MariaDB** (`query_mysql`): set `TINYPIVOT_MYSQL_URL` (`mysql://user:password@host:3306/database`), or set `TINYPIVOT_MYSQL_DATABASE` to reuse the sign-in in your MySQL option file (`~/.my.cnf`, or the file in `TINYPIVOT_MYSQL_OPTION_FILE`): TinyPivot reads its `[client]` and `[mysql]` groups (and MariaDB's client groups) on the first query, never copying the password. TLS follows the usual names, as URL parameters or in the option file: `ssl-mode` (`REQUIRED`, `VERIFY_CA`, `VERIFY_IDENTITY`), `ssl-ca`, `ssl-cert`, `ssl-key`, and MariaDB's `ssl` / `ssl-verify-server-cert`. The mysql2 driver downloads once into `~/.cache/tinypivot` on the first query.

- **Use a user with SELECT-only grants.** That is the strongest guard. TinyPivot adds three more:
  1. A text check, read the way MySQL reads SQL (`#` comments, executable `/*! */` comments, backslash escapes): one `SELECT`, no write words, no `INTO OUTFILE`, `LOAD_FILE()`, locking reads or optimizer hints.
  2. Running it alone (multiple statements off) inside `START TRANSACTION READ ONLY`, which the server enforces, then rolling back.
  3. A 60-second statement limit (`MAX_EXECUTION_TIME` on MySQL, `max_statement_time` on MariaDB).
- `TINYPIVOT_MYSQL_ALLOWED` limits queries to listed `database` or `database.table` entries (comma-separated). Every name in the SQL is checked against the tables the user can see, so a column or alias that shares a blocked table's name is refused too.
- Connections identify as `program_name=TinyPivot`, so they are easy to spot in the process list.
- Results return up to 5,000 rows; TinyPivot stops reading at the cap instead of downloading the rest.

**PostgreSQL** (`query_postgres`): set `DATABASE_URL`, and optionally `TINYPIVOT_ALLOWED_TABLES`. Queries are parsed and validated as a single read-only `SELECT`, then run in a read-only transaction with a 15-second timeout.

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
| Direct Snowflake, BigQuery, Databricks, ClickHouse, MySQL & PostgreSQL (`query_snowflake`, `query_bigquery`, `query_databricks`, `query_clickhouse`, `query_mysql`, `query_postgres`) | — | Included |
| Watermark-free UI, HTML & terminal cards | — | Included |

> **Zero Truncation on Free:** TinyPivot never caps local Free datasets to a partial subset — every chart, pivot, and SQL query reflects 100% of your local file. Read the full Internal + External (MIT KramaBench & Adyen DABstep) benchmark white paper at [tiny-pivot.com/whitepaper](https://tiny-pivot.com/whitepaper) or download the [Official PDF White Paper](https://tiny-pivot.com/TinyPivot-Trust-Layer-Whitepaper.pdf).

Unlock Pro or Team at [tiny-pivot.com/pricing](https://tiny-pivot.com/pricing).

## Tools

| Tool | Purpose |
|---|---|
| `open_tinypivot` | Opens TinyPivot (side pane, sidebar, or inline). Works with `{}` using the built-in sample dataset. |
| `load_file` | Loads a local `.csv`, `.tsv`, `.json`, `.jsonl`, or `.xlsx` workbook (auto-detects real header rows below title/notes preambles, surfaces workbook notes, and accepts `sheet` to pick a worksheet) with 0 raw rows entering LLM context; pass `chartConfig` / `pivotConfig` to render in 1 call, or `where` to filter on disk. Loaded `.xlsx` sheets are immediately queryable in DuckDB SQL by table name. |
| `query` | Runs read-only DuckDB `SELECT` (single `sql` or `queries[]` batching up to 6 queries) over local CSV, Parquet, JSON files and loaded datasets, then charts or pivots the result. Named queries (`name`) persist as DuckDB views across turns. DuckDB (~20 MB) downloads once into `~/.cache/tinypivot`. |
| `load_data` | Loads flat JSON rows already in memory (up to `~50` rows) from any other MCP tool, API, or small SQL query without writing a temp CSV; renders chart + pivot in 1 call. |
| `configure_pivot` | Computes a deterministic pivot table via `@smallwebco/tinypivot-core` (zero LLM math errors). |
| `configure_chart` | Configures and opens the interactive Chart Builder (`bar`, `stackedBar`, `line`, `area`, `pie`, `donut`, maps (`choropleth`), `bullet`, `radialBar`, `radialArea`, `slope`, `treemap`, `sunburst`, etc.; loose names like `map` work too). |
| `analyze` | Deterministic 1-call Data Science shelf on `datasetId` or `filePath`: `explain_change` and `ab_test` on Free; full Pro SRM + Holm-Bonferroni, controlled `regression`, right-censored `cohort_retention`, and seasonal `anomalies`. |
| `query_snowflake` | *(Optional Pro)* Runs one read-only Snowflake `SELECT` after a text check and an `EXPLAIN` plan check (read steps only, scan-capped) and opens the result in TinyPivot. Listed when `TINYPIVOT_SNOWFLAKE_ACCOUNT` and `TINYPIVOT_SNOWFLAKE_USER` are set. |
| `query_databricks` | *(Optional Pro)* Runs one read-only Databricks SQL `SELECT` after a text check and an `EXPLAIN` plan check (no write or DDL steps) and opens the result in TinyPivot. Listed when `TINYPIVOT_DATABRICKS_PROFILE` or `TINYPIVOT_DATABRICKS_HOST` is set. |
| `query_clickhouse` | *(Optional Pro)* Runs one read-only ClickHouse `SELECT` with server-enforced `readonly`, scan and time limits, and opens the result in TinyPivot. Listed when `TINYPIVOT_CLICKHOUSE_URL` is set (or `TINYPIVOT_CLICKHOUSE_USE_CLIENT_CONFIG=1`). |
| `query_bigquery` | *(Optional Pro)* Runs one read-only GoogleSQL `SELECT` in BigQuery (dry-run checked, scan-capped) and opens the result in TinyPivot. Listed when `TINYPIVOT_BIGQUERY_PROJECT` is set. |
| `query_mysql` | *(Optional Pro)* Runs one read-only MySQL/MariaDB `SELECT` inside a server-enforced read-only transaction with a statement time limit, and opens the result in TinyPivot. Listed when `TINYPIVOT_MYSQL_URL` or `TINYPIVOT_MYSQL_DATABASE` is set. |
| `query_postgres` | *(Optional Pro)* Runs AST-validated read-only `SELECT` queries directly against `DATABASE_URL` and opens results in TinyPivot. |
| `list_datasets` | Lists all loaded datasets, row counts, and inferred schemas. |
| `profile` | Describes each column of a loaded dataset (null share, ranges, top values, Pro relational grain), or pass `dirPath` to scan an entire local folder of CSV/JSON/Parquet/XLSX schemas (collapsing partitioned file series like `data-2021..2024.csv` with a DuckDB glob hint and surfacing multi-sheet `.xlsx` headers & preamble notes) + nearby docs (and Pro cross-file shared join keys) in 1 call. |
| `history` | Lists every earlier pull, or reopens one by id without re-querying. Pulls are saved locally under `~/.local/share/tinypivot/history` for 30 days. |

Data tools take an optional `why`: one sentence the agent writes about each step, shown in the Studio trace.

## CLI Flags & Environment Variables (Optional)

- `--no-studio` / `TINYPIVOT_NO_STUDIO=1` (alias: `--no-companion` / `TINYPIVOT_NO_COMPANION=1`) — Disable the localhost Studio HTTP server completely (zero ports bound, zero browser windows — ideal for CI, SSH, and automated benchmarks)
- `--no-open` / `TINYPIVOT_OPEN_STUDIO=0` (alias: `TINYPIVOT_NO_OPEN=1`) — Keep the localhost Studio server running so you can open its URL manually, without auto-popping a browser tab on the first tool call
- `TINYPIVOT_LICENSE_KEY` — TinyPivot MCP Pro/Team license key (`TP-MCPP-...` or `TP-MCPT-...`; note that UI Library `TP-PRO*` keys apply to `@smallwebco/tinypivot-react`/`-vue` only)
- `DATABASE_URL` — Optional PostgreSQL connection string for direct read-only `query_postgres` (Pro). The tool is only offered to the model when this is set
- `TINYPIVOT_ALLOWED_TABLES` — Comma-separated table allowlist for `query_postgres`
- `TINYPIVOT_SNOWFLAKE_ACCOUNT`, `TINYPIVOT_SNOWFLAKE_USER` — Optional Snowflake account for direct read-only `query_snowflake` (Pro); sign-in, session and limit settings are under [Direct connections](#direct-connections-pro)
- `TINYPIVOT_DATABRICKS_PROFILE` or `TINYPIVOT_DATABRICKS_HOST` — Optional Databricks workspace for direct read-only `query_databricks` (Pro); see [Direct connections](#direct-connections-pro)
- `TINYPIVOT_CLICKHOUSE_URL` — Optional ClickHouse endpoint for direct read-only `query_clickhouse` (Pro); see [Direct connections](#direct-connections-pro)
- `TINYPIVOT_MYSQL_URL` or `TINYPIVOT_MYSQL_DATABASE` — Optional MySQL/MariaDB for direct read-only `query_mysql` (Pro); sign-in, TLS and allowlist settings are under [Direct connections](#direct-connections-pro)
- `TINYPIVOT_BIGQUERY_PROJECT` — Optional Google Cloud project for direct read-only `query_bigquery` (Pro); `TINYPIVOT_BIGQUERY_MAX_GB`, `TINYPIVOT_BIGQUERY_ALLOWED` and `TINYPIVOT_BIGQUERY_LOCATION` tune it (see [Direct connections](#direct-connections-pro))
- `TINYPIVOT_TELEMETRY=0` or `DO_NOT_TRACK=1` — Disable anonymous usage telemetry
- `TINYPIVOT_PORT` — Localhost port for the Studio (default `47317`; when it is taken, the Studio uses a free port and the tool replies link to it)
- `TINYPIVOT_CLAUDE_CHANNEL` — `1` or `0` overrides whether TinyPivot offers Claude Code a channel. By default it does when Claude Code was started with this server in `--channels` or `--dangerously-load-development-channels`.
- `TINYPIVOT_REPRINT_CARDS` — Set to `0` so the model does not reprint each chart card in a terminal. Saves about 400 output tokens per question; the card stays visible in the Studio, the `tui` pane and pi.
- `TINYPIVOT_HISTORY` — Set to `0` to stop saving pulls to history. `TINYPIVOT_HISTORY_DAYS` sets how long they are kept (default 30).

## Privacy & Telemetry

Full policy: [tiny-pivot.com/privacy](https://tiny-pivot.com/privacy). Terms: [tiny-pivot.com/terms](https://tiny-pivot.com/terms).

TinyPivot MCP sends minimal, **zero-PII** anonymous usage pings (`event`, `tool`, `rowBucket`, `client`, `tier`, `truncated`, `version`, `os`, and a random local UUID) to help us improve harness compatibility and reliability.

- **Never collected:** row data, column names, SQL queries, file paths, hostnames, or user identities.
- **Opt out anytime:** set `TINYPIVOT_TELEMETRY=0` or `DO_NOT_TRACK=1` in your environment or MCP server `env` block.

## License

TinyPivot is **source-available (dual-licensed)**: Free Tier features are licensed under MIT, and Pro / Team features require a commercial license from Small Web, LLC. See [LICENSE.md](./LICENSE.md) for full terms.
