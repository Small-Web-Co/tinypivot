/**
 * Single source of truth for plans shown on /pricing.
 * Option ids are the `plan` values accepted by /api/create-checkout.
 */

export interface BillingOption {
  id: string
  label: string
  price: string
  period: string
  note: string
}

export type PlanAction
  = | { kind: 'checkout' }
    | { kind: 'link', to: string, label: string }

export interface Plan {
  id: string
  name: string
  featured?: boolean
  options: BillingOption[]
  defaultOptionId: string
  /** One line on who the plan is for, shown under its name. */
  tagline?: string
  lead?: string
  features: string[]
  /** A measured result that backs the plan, linked to its evidence. */
  proof?: { text: string, to: string }
  action: PlanAction
}

export type Product = 'mcp' | 'ui'

const freeOption = (note: string): BillingOption => ({ id: 'free', label: 'Free', price: '$0', period: 'forever', note })

export const plans: Record<Product, Plan[]> = {
  mcp: [
    {
      id: 'mcp-free',
      name: 'TinyPivot Free',
      tagline: 'For trying it on your real data, with no limits on size.',
      options: [freeOption('No signup, no API key, no trial clock.')],
      defaultOptionId: 'free',
      features: [
        'Unlimited rows from CSV, Excel, Parquet and JSON files',
        'Direct read-only connections to BigQuery, Snowflake, Databricks, ClickHouse, MySQL and Postgres (with 0-scan schema search)',
        'Charts, pivots and the Studio, with the SQL behind every number',
        'Basic checks and dialect fix hints on every query',
        'Two one-step analyses: explain a change, and A/B test',
        'Offline HTML report export',
      ],
      action: { kind: 'link', to: '/#install', label: 'Install TinyPivot Free' },
    },
    {
      id: 'mcp-pro',
      name: 'TinyPivot Pro',
      featured: true,
      tagline: 'For when the answer goes in front of someone who will act on it.',
      options: [
        { id: 'mcp_pro_yearly', label: 'Yearly', price: '$149', period: '/year', note: '$12.42/mo, billed yearly. Key works offline.' },
        { id: 'mcp_pro_lifetime', label: 'Lifetime', price: '$399', period: 'once', note: 'Pay once. Every v1.x update included.' },
      ],
      defaultOptionId: 'mcp_pro_yearly',
      lead: 'Everything in Free, plus',
      features: [
        'Deep checks that catch double-counting joins, half-finished periods, dropped missing values and outliers',
        'The full statistics shelf in one step each: trustworthy A/B tests, regressions that control for other factors, cohort retention, seasonal anomalies',
        'Memory that learns your data between sessions, cutting repeat schema tokens by 47%',
        'Drill into the rows behind any cell, plus 9+ aggregations (median, std dev, % of total…)',
        'Formatted Excel and white-label HTML exports, all 10 themes',
        '1-call deep warehouse trap profiling (join fan-out, NULLs, mixed currencies, partial periods)',
      ],
      proof: { text: 'In our tests, every model reached 100% correct with Pro', to: '/whitepaper#internal' },
      action: { kind: 'checkout' },
    },
    {
      id: 'mcp-team',
      name: 'TinyPivot Team',
      tagline: 'For a small data team sharing one setup.',
      options: [
        { id: 'mcp_team_yearly', label: 'Yearly', price: '$699', period: '/year', note: 'Up to 5 people: $11.65 each per month, billed yearly.' },
      ],
      defaultOptionId: 'mcp_team_yearly',
      lead: 'Everything in Pro, plus',
      features: [
        'One shared key for up to 5 people',
        'Works offline, with no SSO or account wall',
        'Priority email support and proper tax invoices',
      ],
      action: { kind: 'checkout' },
    },
  ],
  ui: [
    {
      id: 'ui-free',
      name: 'TinyPivot Free',
      tagline: 'A real data grid and pivot table for your app, free to ship.',
      options: [freeOption('For React and Vue 3 apps. No signup.')],
      defaultOptionId: 'free',
      features: [
        'Data grid: sort, filter, search, resize, paginate',
        'Pivot table (sum) with row and column totals',
        'Calculated fields and formula builder',
        'CSV export, clipboard, keyboard navigation',
      ],
      action: { kind: 'link', to: '/ui#quickstart', label: 'Install TinyPivot Free' },
    },
    {
      id: 'ui-pro',
      name: 'TinyPivot Pro',
      featured: true,
      tagline: 'Give your users the analysis they keep asking for.',
      options: [
        { id: 'single', label: '1 app', price: '$49', period: 'once', note: '1 developer, 1 React or Vue app.' },
        { id: 'unlimited', label: 'Unlimited apps', price: '$149', period: 'once', note: '1 developer, unlimited apps.' },
        { id: 'team', label: '10 devs', price: '$399', period: 'once', note: 'Up to 10 developers, unlimited apps.' },
      ],
      defaultOptionId: 'single',
      lead: 'Everything in Free, plus',
      features: [
        '9+ aggregations and drill-through to the rows behind any cell',
        'Chart builder (6 chart types)',
        'AI Data Analyst: your users ask in plain English, using your own model key',
        'Formatted Excel (.xlsx) export, no watermark',
      ],
      action: { kind: 'checkout' },
    },
  ],
}

export const licenseNote = 'Already have a React/Vue library key (TP-PRO…)? It keeps working in your apps. The agent sidecar uses its own keys (TP-MCP…).'

/** Objections a buyer has before paying for the agent sidecar. Every answer is backed by the docs or the product. */
export const mcpFaq = [
  {
    q: 'Does my data leave my computer?',
    a: 'No. Your files are read on your machine with DuckDB, and the agent sees query results, not your raw files. The only thing sent anywhere is a small anonymous usage ping, which you can switch off.',
    link: { label: 'Privacy details', to: '/docs#privacy' },
  },
  {
    q: 'Which agents does it work with?',
    a: 'Claude Code, Claude Desktop, Cursor, Codex, Antigravity, OpenCode and pi. One command sets up every one of them on your machine.',
    link: { label: 'Setup guide', to: '/docs#setup' },
  },
  {
    q: 'Does it help smaller or local models?',
    a: 'Most of all. In our tests a small model on a Mac went from 78% to 100% correct, and open-weight DeepSeek V4.1 reached 100% with 30% fewer turns. Claude Haiku matched Opus for under 4% of what Opus cost on its own, which makes a cheap model or subagent a real option for data work.',
    link: { label: 'See the results', to: '/whitepaper#internal' },
  },
  {
    q: 'Is Free a cut-down trial?',
    a: 'No. Free has no row limit and no time limit, so you can judge it on your real data. Pro adds the deep checks and statistics that matter when the answer has to be right.',
  },
  {
    q: 'Do I need an account?',
    a: 'Not for Free. Pro is a license key you add to your setup, and it is checked offline, so there is no login and nothing to break on a plane or behind a firewall.',
  },
  {
    q: 'Yearly or lifetime?',
    a: 'Lifetime costs $399 once and includes every v1.x update, so it pays for itself in under three years compared with $149 a year.',
  },
  {
    q: 'How do I know the checks actually help?',
    a: 'We published the method and every result: 18 tasks across 5 models, plus two independent benchmarks from MIT and Adyen, including where TinyPivot made no difference.',
    link: { label: 'Read the white paper', to: '/whitepaper' },
  },
] as const
