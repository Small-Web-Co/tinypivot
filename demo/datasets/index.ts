/**
 * Demo Datasets for AI Analyst
 * Generated on-demand when user selects a data source
 */
import type { AITableSchema } from '@smallwebco/tinypivot-core'

export interface DatasetInfo {
  id: string
  name: string
  description: string
  tableName: string
  schema: AITableSchema
  generate: () => Record<string, unknown>[]
}

// E-commerce orders dataset
function generateEcommerceData(): Record<string, unknown>[] {
  const regions = ['North', 'South', 'East', 'West', 'Central']
  const categories = ['Electronics', 'Clothing', 'Home & Garden', 'Sports', 'Books']
  const products = ['Widget Pro', 'Gadget X', 'Smart Device', 'Premium Tool', 'Basic Item']
  const customerTypes = ['VIP', 'Regular', 'New']

  const data: Record<string, unknown>[] = []
  const startDate = new Date('2023-01-01')
  const endDate = new Date('2024-12-31')

  for (let i = 0; i < 5000; i++) {
    const date = new Date(startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime()))
    const quantity = Math.floor(Math.random() * 10) + 1
    const unitPrice = Math.floor(Math.random() * 200) + 20
    const isReturned = Math.random() < 0.08 // 8% return rate

    data.push({
      order_id: `ORD-${String(i + 1).padStart(6, '0')}`,
      order_date: date.toISOString().split('T')[0],
      customer_id: `CUST-${String(Math.floor(Math.random() * 1000) + 1).padStart(4, '0')}`,
      customer_type: customerTypes[Math.floor(Math.random() * customerTypes.length)],
      region: regions[Math.floor(Math.random() * regions.length)],
      category: categories[Math.floor(Math.random() * categories.length)],
      product: products[Math.floor(Math.random() * products.length)],
      quantity,
      unit_price: unitPrice,
      order_total: quantity * unitPrice,
      is_returned: isReturned,
    })
  }

  return data
}

// SaaS metrics dataset
function generateSaaSData(): Record<string, unknown>[] {
  const plans = ['Free', 'Starter', 'Pro', 'Enterprise']
  const industries = ['Tech', 'Finance', 'Healthcare', 'Retail', 'Education']

  const data: Record<string, unknown>[] = []
  const startDate = new Date('2022-01-01')
  const endDate = new Date('2024-12-31')

  for (let i = 0; i < 3000; i++) {
    const signupDate = new Date(startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime()))
    const plan = plans[Math.floor(Math.random() * plans.length)]
    const mrr = plan === 'Free' ? 0 : plan === 'Starter' ? 29 : plan === 'Pro' ? 99 : 299
    const isChurned = Math.random() < (plan === 'Free' ? 0.4 : plan === 'Starter' ? 0.15 : 0.05)

    data.push({
      user_id: `USER-${String(i + 1).padStart(5, '0')}`,
      signup_date: signupDate.toISOString().split('T')[0],
      plan,
      industry: industries[Math.floor(Math.random() * industries.length)],
      mrr,
      feature_usage: Math.floor(Math.random() * 100),
      is_churned: isChurned,
      lifetime_value: Math.floor(mrr * (Math.random() * 24 + 1)),
    })
  }

  return data
}

// HR analytics dataset
function generateHRData(): Record<string, unknown>[] {
  const departments = ['Engineering', 'Sales', 'Marketing', 'HR', 'Finance', 'Operations']
  const levels = ['Junior', 'Mid', 'Senior', 'Lead', 'Manager', 'Director']

  const data: Record<string, unknown>[] = []

  for (let i = 0; i < 2000; i++) {
    const dept = departments[Math.floor(Math.random() * departments.length)]
    const level = levels[Math.floor(Math.random() * levels.length)]
    const baseSalary = level === 'Junior' ? 50000 : level === 'Mid' ? 70000 : level === 'Senior' ? 90000 : level === 'Lead' ? 110000 : level === 'Manager' ? 130000 : 160000
    const salary = baseSalary + Math.floor(Math.random() * 20000) - 10000
    const tenure = Math.random() * 10
    const isTerminated = Math.random() < (tenure < 1 ? 0.2 : tenure < 3 ? 0.1 : 0.05)

    data.push({
      employee_id: `EMP-${String(i + 1).padStart(5, '0')}`,
      department: dept,
      job_level: level,
      salary,
      tenure_years: Math.round(tenure * 10) / 10,
      performance_rating: Math.round((Math.random() * 2 + 3) * 10) / 10, // 3.0 - 5.0
      is_terminated: isTerminated,
    })
  }

  return data
}

// Marketing campaigns dataset
function generateMarketingData(): Record<string, unknown>[] {
  const channels = ['Google Ads', 'Facebook', 'LinkedIn', 'Email', 'Organic', 'Referral']
  const campaigns = ['Brand Awareness', 'Lead Gen', 'Product Launch', 'Seasonal Sale', 'Retargeting']

  const data: Record<string, unknown>[] = []
  const startDate = new Date('2024-01-01')
  const endDate = new Date('2024-12-31')

  for (let i = 0; i < 2000; i++) {
    const date = new Date(startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime()))
    const channel = channels[Math.floor(Math.random() * channels.length)]
    const spend = channel === 'Organic' ? 0 : Math.floor(Math.random() * 5000) + 100
    const impressions = Math.floor(spend * (Math.random() * 50 + 10))
    const clicks = Math.floor(impressions * (Math.random() * 0.05 + 0.01))
    const conversions = Math.floor(clicks * (Math.random() * 0.1 + 0.02))
    const revenue = conversions * (Math.random() * 100 + 50)

    data.push({
      campaign_id: `CAMP-${String(i + 1).padStart(5, '0')}`,
      date: date.toISOString().split('T')[0],
      channel,
      campaign_type: campaigns[Math.floor(Math.random() * campaigns.length)],
      spend,
      impressions,
      clicks,
      conversions,
      revenue: Math.round(revenue * 100) / 100,
    })
  }

  return data
}

// Dataset definitions with schemas
export const DATASETS: DatasetInfo[] = [
  {
    id: 'ecommerce',
    name: 'E-commerce Orders',
    description: 'Online retail orders with customers, products, returns, and regional data',
    tableName: 'orders',
    schema: {
      table: 'orders',
      columns: [
        { name: 'order_id', type: 'string', nullable: false, description: 'Unique order identifier' },
        { name: 'order_date', type: 'date', nullable: false, description: 'Date the order was placed' },
        { name: 'customer_id', type: 'string', nullable: false, description: 'Customer identifier' },
        { name: 'customer_type', type: 'string', nullable: false, description: 'Customer segment: VIP, Regular, or New' },
        { name: 'region', type: 'string', nullable: false, description: 'Geographic region: North, South, East, West, Central' },
        { name: 'category', type: 'string', nullable: false, description: 'Product category' },
        { name: 'product', type: 'string', nullable: false, description: 'Product name' },
        { name: 'quantity', type: 'number', nullable: false, description: 'Number of units ordered' },
        { name: 'unit_price', type: 'number', nullable: false, description: 'Price per unit in USD' },
        { name: 'order_total', type: 'number', nullable: false, description: 'Total order value in USD' },
        { name: 'is_returned', type: 'boolean', nullable: false, description: 'Whether the order was returned' },
      ],
    },
    generate: generateEcommerceData,
  },
  {
    id: 'saas',
    name: 'SaaS Metrics',
    description: 'Subscription data with plans, MRR, churn, and customer lifetime value',
    tableName: 'users',
    schema: {
      table: 'users',
      columns: [
        { name: 'user_id', type: 'string', nullable: false, description: 'Unique user identifier' },
        { name: 'signup_date', type: 'date', nullable: false, description: 'Date user signed up' },
        { name: 'plan', type: 'string', nullable: false, description: 'Subscription plan: Free, Starter, Pro, Enterprise' },
        { name: 'industry', type: 'string', nullable: false, description: 'Customer industry vertical' },
        { name: 'mrr', type: 'number', nullable: false, description: 'Monthly recurring revenue in USD' },
        { name: 'feature_usage', type: 'number', nullable: false, description: 'Feature usage score (0-100)' },
        { name: 'is_churned', type: 'boolean', nullable: false, description: 'Whether the user has churned' },
        { name: 'lifetime_value', type: 'number', nullable: false, description: 'Total customer lifetime value in USD' },
      ],
    },
    generate: generateSaaSData,
  },
  {
    id: 'hr',
    name: 'HR Analytics',
    description: 'Employee data with departments, salaries, performance, and attrition',
    tableName: 'employees',
    schema: {
      table: 'employees',
      columns: [
        { name: 'employee_id', type: 'string', nullable: false, description: 'Unique employee identifier' },
        { name: 'department', type: 'string', nullable: false, description: 'Department name' },
        { name: 'job_level', type: 'string', nullable: false, description: 'Job level: Junior, Mid, Senior, Lead, Manager, Director' },
        { name: 'salary', type: 'number', nullable: false, description: 'Annual salary in USD' },
        { name: 'tenure_years', type: 'number', nullable: false, description: 'Years employed at the company' },
        { name: 'performance_rating', type: 'number', nullable: false, description: 'Performance rating (1-5 scale)' },
        { name: 'is_terminated', type: 'boolean', nullable: false, description: 'Whether the employee has left the company' },
      ],
    },
    generate: generateHRData,
  },
  {
    id: 'marketing',
    name: 'Marketing Campaigns',
    description: 'Campaign performance data with spend, impressions, clicks, and conversions',
    tableName: 'campaigns',
    schema: {
      table: 'campaigns',
      columns: [
        { name: 'campaign_id', type: 'string', nullable: false, description: 'Unique campaign identifier' },
        { name: 'date', type: 'date', nullable: false, description: 'Campaign date' },
        { name: 'channel', type: 'string', nullable: false, description: 'Marketing channel: Google Ads, Facebook, LinkedIn, Email, Organic, Referral' },
        { name: 'campaign_type', type: 'string', nullable: false, description: 'Campaign type/goal' },
        { name: 'spend', type: 'number', nullable: false, description: 'Ad spend in USD' },
        { name: 'impressions', type: 'number', nullable: false, description: 'Number of impressions' },
        { name: 'clicks', type: 'number', nullable: false, description: 'Number of clicks' },
        { name: 'conversions', type: 'number', nullable: false, description: 'Number of conversions' },
        { name: 'revenue', type: 'number', nullable: false, description: 'Revenue generated in USD' },
      ],
    },
    generate: generateMarketingData,
  },
]

/**
 * Get a dataset by ID and generate its data
 */
export function getDataset(id: string): DatasetInfo | undefined {
  return DATASETS.find(d => d.id === id)
}
