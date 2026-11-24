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
  lead?: string
  features: string[]
  action: PlanAction
}

export type Product = 'mcp' | 'ui'

const freeOption = (note: string): BillingOption => ({ id: 'free', label: 'Free', price: '$0', period: 'forever', note })

export const plans: Record<Product, Plan[]> = {
  mcp: [
    {
      id: 'mcp-free',
      name: 'Free',
      options: [freeOption('No signup, no API key. Runs locally in your harness.')],
      defaultOptionId: 'free',
      features: [
        'Bar, stacked bar, line, area, pie and donut charts',
        'Pivot table (sum) and data grid',
        'Terminal cards + live companion Data IDE',
        'Up to 2,500 rows per dataset',
      ],
      action: { kind: 'link', to: '/#install', label: 'Install free' },
    },
    {
      id: 'mcp-pro',
      name: 'Pro',
      featured: true,
      options: [
        { id: 'mcp_pro_monthly', label: 'Monthly', price: '$19', period: '/month', note: 'Cancel anytime.' },
        { id: 'mcp_pro_yearly', label: 'Yearly', price: '$149', period: '/year', note: '$12.42/mo billed yearly. Save 35%.' },
        { id: 'mcp_pro_lifetime', label: 'Lifetime', price: '$399', period: 'once', note: 'Perpetual key, all v1.x updates.' },
      ],
      defaultOptionId: 'mcp_pro_yearly',
      lead: 'Everything in Free, plus',
      features: [
        'Unlimited rows',
        'Drill-through on any cell',
        '9+ aggregations (median, std dev, % of total…)',
        'Formatted .xlsx export, no watermark',
        'Read-only Postgres connector (query_postgres)',
        'All 5 themes',
      ],
      action: { kind: 'checkout' },
    },
    {
      id: 'mcp-team',
      name: 'Team',
      options: [
        { id: 'mcp_team_monthly', label: 'Monthly', price: '$79', period: '/month', note: 'Up to 5 seats ($15.80/seat).' },
        { id: 'mcp_team_yearly', label: 'Yearly', price: '$699', period: '/year', note: 'Up to 5 seats ($11.65/seat/mo). Save 26%.' },
      ],
      defaultOptionId: 'mcp_team_yearly',
      lead: 'Everything in Pro, plus',
      features: [
        'One shared team key for 5 people',
        'Offline license check, no SSO wall',
        'Priority email support and tax invoices',
      ],
      action: { kind: 'checkout' },
    },
  ],
  ui: [
    {
      id: 'ui-free',
      name: 'Free',
      options: [freeOption('Free tier for React and Vue 3 apps.')],
      defaultOptionId: 'free',
      features: [
        'Data grid: sort, filter, search, resize, paginate',
        'Pivot table (sum) with row and column totals',
        'Calculated fields and formula builder',
        'CSV export, clipboard, keyboard navigation',
      ],
      action: { kind: 'link', to: '/ui#quickstart', label: 'Get started' },
    },
    {
      id: 'ui-pro',
      name: 'Pro',
      featured: true,
      options: [
        { id: 'single', label: '1 app', price: '$49', period: 'once', note: '1 developer, 1 React or Vue app.' },
        { id: 'unlimited', label: 'Unlimited apps', price: '$149', period: 'once', note: '1 developer, unlimited apps.' },
        { id: 'team', label: '10 devs', price: '$399', period: 'once', note: 'Up to 10 developers, unlimited apps.' },
      ],
      defaultOptionId: 'single',
      lead: 'Everything in Free, plus',
      features: [
        '9+ aggregations and pivot drill-through',
        'Chart builder (6 chart types)',
        'BYOK AI Data Analyst with natural-language queries',
        'Excel (.xlsx) export, no watermark',
      ],
      action: { kind: 'checkout' },
    },
  ],
}

export const licenseNote = 'UI library keys (TP-PRO…) stay valid for React and Vue apps. MCP Pro and Team use separate TP-MCP… keys.'
