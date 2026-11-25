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
    id: 'postgres',
    label: 'Direct Postgres (Pro)',
    summary: 'Read-only connector with SQL validation and a table allowlist. Every other database works by piping CSV or JSON.',
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
  { name: 'load_file', role: 'Local files', desc: 'Loads a CSV, TSV or JSON file, including exports from BigQuery, Snowflake, MySQL, DuckDB or Databricks. Rows stay out of context.' },
  { name: 'load_data', role: 'Rows from other tools', desc: 'Takes JSON rows from Stripe, GitHub, an API or another SQL MCP server and renders a chart and pivot.' },
  { name: 'configure_pivot', role: 'Exact pivots', desc: 'Sums, averages, medians and totals computed by TinyPivot, not by the model.' },
  { name: 'configure_chart', role: 'Chart types', desc: 'Bar, stacked bar, line, area, pie, donut, scatter, heatmap or radar.' },
  { name: 'query', role: 'SQL over files', desc: 'Read-only DuckDB SQL over CSV, Parquet and JSON files and earlier pulls. Joins and filters run locally; only the chart comes back.' },
  { name: 'profile', role: 'Know the columns', desc: 'Empty share, ranges and commonest values per column, so the agent can plan without reading rows.' },
  { name: 'history', role: 'Every pull, kept', desc: 'Lists earlier pulls and reopens any of them without re-querying. Saved locally for 30 days.' },
  { name: 'query_postgres', role: 'Pro · Postgres', desc: 'Read-only, validated SQL against an allowlisted Postgres database.' },
] as const

export const prompts = [
  'Open TinyPivot and show me a chart of sample SaaS revenue by quarter and region.',
  'Load ./exports/q3_orders.csv into TinyPivot and chart net revenue by category and channel.',
  'Pull our last 100 Stripe charges into TinyPivot so I can pivot revenue by month and country.',
  'Export monthly active accounts by plan from BigQuery and chart it in TinyPivot.',
] as const

export const telemetryEnvVars = ['TINYPIVOT_TELEMETRY=0', 'DO_NOT_TRACK=1'] as const
