import { INIT_COMMAND, MCP_SPEC } from './install'

export interface HarnessSetup {
  id: string
  label: string
  summary: string
  filename: string
  code: string
}

function npxServer(env?: Record<string, string>) {
  return JSON.stringify({
    mcpServers: {
      tinypivot: {
        command: 'npx',
        args: ['-y', MCP_SPEC],
        ...(env ? { env } : {}),
      },
    },
  }, null, 2)
}

export const harnesses: HarnessSetup[] = [
  {
    id: 'terminal',
    label: 'Claude Code, OpenCode, pi, Codex',
    summary: 'Chart and pivot cards in the terminal. The first data step opens TinyPivot Studio in your browser.',
    filename: 'shell',
    code: `# Wire every harness it finds:\n${INIT_COMMAND}\n\n# Or add it to Claude Code by hand:\nclaude mcp add tinypivot -- npx -y ${MCP_SPEC}`,
  },
  {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    summary: 'Inline interactive charts and pivots in the chat. Restart Claude Desktop after saving.',
    filename: 'claude_desktop_config.json',
    code: npxServer(),
  },
  {
    id: 'cursor',
    label: 'Cursor',
    summary: 'Agents can open CSVs, JSON logs or SQL exports as charts and pivots.',
    filename: '~/.cursor/mcp.json',
    code: npxServer(),
  },
  {
    id: 'antigravity',
    label: 'Antigravity',
    summary: 'Side pane, sidebar view and inline widgets in chat.',
    filename: '~/.gemini/antigravity/mcp_config.json',
    code: npxServer({ TINYPIVOT_LICENSE_KEY: 'optional-pro-key' }),
  },
  {
    id: 'antigravity-cli',
    label: 'Antigravity CLI',
    summary: 'Terminal chart and pivot cards in agy. It keeps its own server list, separate from the IDE.',
    filename: 'shell',
    code: `${INIT_COMMAND} --targets=antigravity-cli\n\n# Or add it by hand:\nagy mcp add tinypivot -- npx -y ${MCP_SPEC}`,
  },
  {
    id: 'warehouses',
    label: 'Direct warehouses (Pro)',
    summary: 'Read-only SQL that runs in Snowflake, BigQuery, Databricks, ClickHouse, MySQL or Postgres, so totals cover every row. init --connect reuses the sign-ins your warehouse tools already keep (gcloud, the Snowflake and Databricks CLIs, ~/.my.cnf, clickhouse client) and saves only a pointer to them, never a password.',
    filename: 'shell',
    code: `# Find warehouse sign-ins on this machine and switch them on:\n${INIT_COMMAND} --connect\n\n# Or choose which ones:\n${INIT_COMMAND} --connect=bigquery,snowflake`,
  },
  {
    id: 'postgres',
    label: 'Direct Postgres (Pro)',
    summary: 'Read-only connector with SQL validation and a table allowlist. Any other source works by handing TinyPivot an export or rows from its own MCP server.',
    filename: 'mcp config',
    code: npxServer({
      DATABASE_URL: 'postgresql://readonly:pass@localhost:5432/analytics',
      TINYPIVOT_ALLOWED_TABLES: 'orders,customers,products',
      TINYPIVOT_LICENSE_KEY: 'TP-MCP…',
    }),
  },
]

export const tools = [
  { name: 'open_tinypivot', role: 'Open the Studio', desc: 'Opens the Chart / Pivot / Data view. With no arguments it loads sample data.' },
  { name: 'load_file', role: 'Local files & Excel', desc: 'Loads a CSV, TSV, JSON, JSONL or Excel (.xlsx, optional sheet) file, including exports from BigQuery, Snowflake, MySQL, DuckDB or Databricks. Rows stay out of context and loaded .xlsx sheets can be queried immediately with DuckDB SQL.' },
  { name: 'load_data', role: 'Rows from other tools', desc: 'Takes JSON rows from Stripe, GitHub, an API or another SQL MCP server and renders a chart and pivot.' },
  { name: 'configure_pivot', role: 'Exact pivots', desc: 'Sums, averages, medians and totals computed by TinyPivot, not by the model.' },
  { name: 'configure_chart', role: 'Chart types', desc: 'Bar, stacked bar, line, area, pie, donut, scatter, bubble, heatmap and radar, plus maps of countries, US states or sales regions, bullet (actual against target), slope, treemap, sunburst and radial charts. Ask for a dashboard and it adds filter controls above every view.' },
  { name: 'query', role: 'SQL over files', desc: 'Read-only DuckDB SQL (single sql or queries[] batching up to 6 SELECTs) over CSV, Parquet and JSON files and loaded datasets. Named queries persist as DuckDB views across turns while keeping raw rows out of context.' },
  { name: 'profile', role: 'Dataset or folder scan', desc: 'Profiles a loaded dataset (null share, ranges, top values, Pro relational grain), or pass dirPath to scan a local folder of CSV/JSON/Parquet/XLSX schemas, docs, and Pro cross-file join keys in 1 call.' },
  { name: 'analyze', role: '1-call Data Science', desc: 'Deterministic statistical shelf on datasetId or filePath: explain_change and ab_test on Free; SRM + Holm-Bonferroni, controlled regression, right-censored cohorts, and seasonal anomalies on Pro.' },
  { name: 'history', role: 'Every pull, kept', desc: 'Lists earlier pulls and reopens any of them without re-querying. Saved locally for 30 days.' },
  { name: 'query_bigquery', role: 'Pro · BigQuery', desc: 'Read-only GoogleSQL run in BigQuery: dry-run checked, capped by bytes scanned, optionally limited to listed datasets.' },
  { name: 'query_snowflake', role: 'Pro · Snowflake', desc: 'Read-only SQL run in Snowflake after its query plan is checked for writes, capped by bytes scanned and a 60-second timeout. Preview.' },
  { name: 'query_databricks', role: 'Pro · Databricks', desc: 'Read-only Databricks SQL, refused if its EXPLAIN plan holds any write step, with a 60-second timeout. Preview.' },
  { name: 'query_clickhouse', role: 'Pro · ClickHouse', desc: 'Read-only SQL with ClickHouse enforcing readonly mode, a read cap and a time limit on every query.' },
  { name: 'query_mysql', role: 'Pro · MySQL & MariaDB', desc: 'One SELECT inside a server-enforced read-only transaction with a statement time limit.' },
  { name: 'query_postgres', role: 'Pro · Postgres', desc: 'Read-only, validated SQL against an allowlisted Postgres database.' },
] as const

/** What TinyPivot does that a chat artifact or a pasted table cannot, each backed by the product or a measurement. */
export const edges = [
  { title: 'Works where you work', body: 'Terminal agents (Claude Code, pi, OpenCode, Codex CLI), editors (Cursor, Antigravity) and chat apps that show MCP views. Chat artifacts do not exist in a terminal.' },
  { title: 'Raw rows stay on your machine', body: 'load_file and query read local files with DuckDB. The model gets the schema, a profile and the result: in our Claude Code recording, about 540 tokens for a 44,714-row file.' },
  { title: 'Exact numbers', body: 'Sums, averages, medians and shares come from the TinyPivot engine, not from the model doing arithmetic.' },
  { title: 'Exploring costs no tokens', body: 'Dragging pivot fields, filtering, switching charts and running your own SQL happen in the Studio on your machine, not in another prompt. Pro adds drill-through to the rows behind a cell and formatted .xlsx export.' },
  { title: 'Every step reproducible', body: 'Each step keeps its reason and its exact SQL. Rerun it, edit it, or reopen any pull from the last 30 days without querying again.' },
  { title: 'Answers checked against the data', body: 'Each number in the agent\'s answer is looked up in the data the question used, and Check this answer reruns every step. See Checking answers below.' },
  { title: 'Charts that follow good practice', body: 'TinyPivot tells the agent when a chart has too many colours, slices too close to compare, missing months or too many bars, so it can fix the chart before you see it.' },
] as const

export const prompts = [
  'Open TinyPivot and show me a chart of sample SaaS revenue by quarter and region.',
  'Load ./exports/q3_orders.csv into TinyPivot and chart net revenue by category and channel.',
  'Scan the files in ./data and tell me what is in each one before you answer anything.',
  'Did the new checkout flow win? Run an A/B test on ./experiments/checkout.csv.',
  'Why did revenue drop last month? Use ./exports/orders.csv and explain the change.',
  'Pull our last 100 Stripe charges into TinyPivot so I can pivot revenue by month and country.',
  'Export monthly active accounts by plan from BigQuery and chart it in TinyPivot.',
] as const

export const telemetryEnvVars = ['TINYPIVOT_TELEMETRY=0', 'DO_NOT_TRACK=1'] as const
