/**
 * TinyPivot Core - AI Demo Mode
 * Canned responses for public demo without requiring API keys
 */
import type { AIDataSource, AITableSchema } from '../types'

/**
 * Demo trigger matching a user query to a canned response
 */
export interface DemoTrigger {
  /** Keywords that trigger this response (case-insensitive, any match) */
  keywords: string[]
  /** AI response text */
  response: string
  /** SQL query to "execute" */
  query?: string
  /** Mock data to return */
  mockData?: Record<string, unknown>[]
}

/**
 * Demo scenario for a specific data source
 */
export interface DemoScenario {
  /** Data source ID this scenario applies to */
  dataSourceId: string
  /** Triggers for this scenario */
  triggers: DemoTrigger[]
  /** Default response when no trigger matches */
  defaultResponse: string
  /** Initial sample data shown when dataset is first selected */
  initialData?: Record<string, unknown>[]
}

/**
 * Demo data sources for the public demo
 */
export const DEMO_DATA_SOURCES: AIDataSource[] = [
  {
    id: 'sales',
    table: 'sales_transactions',
    name: 'Sales Transactions',
    description: 'E-commerce sales data from 2022-2024 including orders, revenue, and customer information',
  },
  {
    id: 'customers',
    table: 'customers',
    name: 'Customer Data',
    description: 'Customer profiles including demographics, segments, and lifetime value',
  },
  {
    id: 'products',
    table: 'products',
    name: 'Product Catalog',
    description: 'Product information including categories, pricing, and inventory',
  },
]

/**
 * Demo schemas for the data sources
 */
export const DEMO_SCHEMAS: Map<string, AITableSchema> = new Map([
  ['sales', {
    table: 'sales_transactions',
    columns: [
      { name: 'id', type: 'number', nullable: false, description: 'Transaction ID' },
      { name: 'date', type: 'date', nullable: false, description: 'Transaction date' },
      { name: 'customer_id', type: 'number', nullable: false, description: 'Customer reference' },
      { name: 'product_id', type: 'number', nullable: false, description: 'Product reference' },
      { name: 'quantity', type: 'number', nullable: false, description: 'Units sold' },
      { name: 'revenue', type: 'number', nullable: false, description: 'Total sale amount in USD' },
      { name: 'region', type: 'string', nullable: false, description: 'Sales region (North, South, East, West)' },
      { name: 'channel', type: 'string', nullable: false, description: 'Sales channel (Online, Retail, Wholesale)' },
    ],
  }],
  ['customers', {
    table: 'customers',
    columns: [
      { name: 'id', type: 'number', nullable: false, description: 'Customer ID' },
      { name: 'name', type: 'string', nullable: false, description: 'Customer name' },
      { name: 'email', type: 'string', nullable: false, description: 'Email address' },
      { name: 'segment', type: 'string', nullable: false, description: 'Customer segment (Enterprise, SMB, Consumer)' },
      { name: 'country', type: 'string', nullable: false, description: 'Country' },
      { name: 'created_at', type: 'date', nullable: false, description: 'Account creation date' },
      { name: 'lifetime_value', type: 'number', nullable: true, description: 'Total lifetime spend in USD' },
    ],
  }],
  ['products', {
    table: 'products',
    columns: [
      { name: 'id', type: 'number', nullable: false, description: 'Product ID' },
      { name: 'name', type: 'string', nullable: false, description: 'Product name' },
      { name: 'category', type: 'string', nullable: false, description: 'Product category' },
      { name: 'price', type: 'number', nullable: false, description: 'Unit price in USD' },
      { name: 'cost', type: 'number', nullable: false, description: 'Unit cost in USD' },
      { name: 'stock', type: 'number', nullable: false, description: 'Current inventory' },
    ],
  }],
])

/**
 * Demo scenarios with canned responses
 */
export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    dataSourceId: 'sales',
    initialData: [
      { id: 1, date: '2024-12-01', customer_id: 1001, product_id: 101, quantity: 2, revenue: 599.98, region: 'West', channel: 'Online' },
      { id: 2, date: '2024-12-01', customer_id: 1042, product_id: 203, quantity: 1, revenue: 849.99, region: 'North', channel: 'Retail' },
      { id: 3, date: '2024-12-02', customer_id: 1015, product_id: 105, quantity: 5, revenue: 149.95, region: 'East', channel: 'Online' },
      { id: 4, date: '2024-12-02', customer_id: 1088, product_id: 302, quantity: 1, revenue: 1299.00, region: 'West', channel: 'Wholesale' },
      { id: 5, date: '2024-12-03', customer_id: 1023, product_id: 118, quantity: 3, revenue: 89.97, region: 'South', channel: 'Online' },
      { id: 6, date: '2024-12-03', customer_id: 1056, product_id: 209, quantity: 2, revenue: 459.98, region: 'North', channel: 'Retail' },
      { id: 7, date: '2024-12-04', customer_id: 1077, product_id: 115, quantity: 1, revenue: 199.99, region: 'East', channel: 'Online' },
      { id: 8, date: '2024-12-04', customer_id: 1034, product_id: 301, quantity: 4, revenue: 2199.96, region: 'West', channel: 'Wholesale' },
      { id: 9, date: '2024-12-05', customer_id: 1091, product_id: 122, quantity: 2, revenue: 339.98, region: 'South', channel: 'Retail' },
      { id: 10, date: '2024-12-05', customer_id: 1012, product_id: 207, quantity: 1, revenue: 749.99, region: 'North', channel: 'Online' },
    ],
    defaultResponse: `I can help you explore the sales transactions data. Here are some things you can ask me:

- "Show me total revenue by region"
- "What are the top selling products?"
- "Show me sales trends over time"
- "Which sales channel performs best?"
- "Show me sales with customer names" (JOIN example)

What would you like to know?`,
    triggers: [
      {
        keywords: ['revenue', 'region'],
        response: `I'll query the sales table to show total revenue broken down by region.

Here's my approach:
1. **regional_summary**: Group all transactions by region and calculate totals

\`\`\`sql
-- Calculate revenue and transaction counts for each region
WITH regional_summary AS (
  SELECT 
    region,
    SUM(revenue) as total_revenue,
    COUNT(*) as transaction_count
  FROM sales_transactions
  GROUP BY region
)
-- Return regions sorted by revenue (highest first)
SELECT * FROM regional_summary
ORDER BY total_revenue DESC
\`\`\`

The results show revenue performance across all four regions. The data is now loaded in the grid - you can use the Pivot or Chart views to visualize it further.`,
        query: 'WITH regional_summary AS (SELECT region, SUM(revenue) as total_revenue, COUNT(*) as transaction_count FROM sales_transactions GROUP BY region) SELECT * FROM regional_summary ORDER BY total_revenue DESC',
        mockData: [
          { region: 'West', total_revenue: 1250000, transaction_count: 3420 },
          { region: 'North', total_revenue: 980000, transaction_count: 2890 },
          { region: 'East', total_revenue: 875000, transaction_count: 2650 },
          { region: 'South', total_revenue: 720000, transaction_count: 2140 },
        ],
      },
      {
        keywords: ['top', 'product', 'best', 'selling'],
        response: `I'll find the top selling products by revenue.

Here's my approach:
1. **product_totals**: Sum up revenue and units for each product
2. **ranked_products**: Take only the top 10 performers

\`\`\`sql
-- Aggregate sales by product
WITH product_totals AS (
  SELECT 
    product_id,
    SUM(revenue) as total_revenue,
    SUM(quantity) as units_sold
  FROM sales_transactions
  GROUP BY product_id
),
-- Rank and limit to top performers
ranked_products AS (
  SELECT * FROM product_totals
  ORDER BY total_revenue DESC
  LIMIT 10
)
SELECT * FROM ranked_products
\`\`\`

Here are the top 10 products by revenue. You might want to join this with the Products table to see product names.`,
        query: 'WITH product_totals AS (SELECT product_id, SUM(revenue) as total_revenue, SUM(quantity) as units_sold FROM sales_transactions GROUP BY product_id), ranked_products AS (SELECT * FROM product_totals ORDER BY total_revenue DESC LIMIT 10) SELECT * FROM ranked_products',
        mockData: [
          { product_id: 101, total_revenue: 425000, units_sold: 1250 },
          { product_id: 203, total_revenue: 380000, units_sold: 890 },
          { product_id: 105, total_revenue: 315000, units_sold: 2100 },
          { product_id: 302, total_revenue: 290000, units_sold: 560 },
          { product_id: 118, total_revenue: 245000, units_sold: 1800 },
          { product_id: 209, total_revenue: 220000, units_sold: 750 },
          { product_id: 115, total_revenue: 195000, units_sold: 1400 },
          { product_id: 301, total_revenue: 180000, units_sold: 320 },
          { product_id: 122, total_revenue: 165000, units_sold: 980 },
          { product_id: 207, total_revenue: 155000, units_sold: 620 },
        ],
      },
      {
        keywords: ['trend', 'time', 'month', 'over time'],
        response: `I'll show you the sales trends over time, grouped by month.

Here's my approach:
1. **monthly_metrics**: Truncate dates to month and aggregate revenue/transactions

\`\`\`sql
-- Group transactions by month and calculate totals
WITH monthly_metrics AS (
  SELECT 
    DATE_TRUNC('month', date) as month,
    SUM(revenue) as monthly_revenue,
    COUNT(*) as transactions
  FROM sales_transactions
  GROUP BY DATE_TRUNC('month', date)
)
-- Return in chronological order
SELECT * FROM monthly_metrics
ORDER BY month
\`\`\`

The data shows monthly revenue trends. Try using the Chart view with a Line chart to visualize this trend!`,
        query: 'WITH monthly_metrics AS (SELECT DATE_TRUNC(\'month\', date) as month, SUM(revenue) as monthly_revenue, COUNT(*) as transactions FROM sales_transactions GROUP BY DATE_TRUNC(\'month\', date)) SELECT * FROM monthly_metrics ORDER BY month',
        mockData: [
          { month: '2024-01-01', monthly_revenue: 285000, transactions: 820 },
          { month: '2024-02-01', monthly_revenue: 310000, transactions: 890 },
          { month: '2024-03-01', monthly_revenue: 345000, transactions: 950 },
          { month: '2024-04-01', monthly_revenue: 320000, transactions: 910 },
          { month: '2024-05-01', monthly_revenue: 380000, transactions: 1050 },
          { month: '2024-06-01', monthly_revenue: 410000, transactions: 1120 },
          { month: '2024-07-01', monthly_revenue: 395000, transactions: 1080 },
          { month: '2024-08-01', monthly_revenue: 425000, transactions: 1150 },
          { month: '2024-09-01', monthly_revenue: 390000, transactions: 1060 },
          { month: '2024-10-01', monthly_revenue: 445000, transactions: 1200 },
          { month: '2024-11-01', monthly_revenue: 520000, transactions: 1380 },
          { month: '2024-12-01', monthly_revenue: 480000, transactions: 1290 },
        ],
      },
      {
        keywords: ['channel', 'online', 'retail', 'wholesale'],
        response: `I'll compare performance across sales channels.

Here's my approach:
1. **channel_metrics**: Calculate total revenue, transaction count, and average order value per channel

\`\`\`sql
-- Aggregate key metrics by sales channel
WITH channel_metrics AS (
  SELECT 
    channel,
    SUM(revenue) as total_revenue,
    COUNT(*) as transactions,
    AVG(revenue) as avg_order_value
  FROM sales_transactions
  GROUP BY channel
)
-- Return sorted by total revenue
SELECT * FROM channel_metrics
ORDER BY total_revenue DESC
\`\`\`

This shows revenue and average order value by channel. Online has the highest volume while Wholesale has the highest average order value.`,
        query: 'WITH channel_metrics AS (SELECT channel, SUM(revenue) as total_revenue, COUNT(*) as transactions, AVG(revenue) as avg_order_value FROM sales_transactions GROUP BY channel) SELECT * FROM channel_metrics ORDER BY total_revenue DESC',
        mockData: [
          { channel: 'Online', total_revenue: 1850000, transactions: 6500, avg_order_value: 284.62 },
          { channel: 'Retail', total_revenue: 1200000, transactions: 3800, avg_order_value: 315.79 },
          { channel: 'Wholesale', total_revenue: 775000, transactions: 800, avg_order_value: 968.75 },
        ],
      },
      {
        keywords: ['customer name', 'with customer', 'join customer', 'customer info'],
        response: `I'll join the sales data with customers to show you sales with customer names.

Here's my approach:
1. **JOIN**: Link sales_transactions with customers table on customer_id

\`\`\`sql
-- Join sales with customer information
SELECT 
  s.id,
  s.date,
  c.name as customer_name,
  c.segment,
  s.revenue,
  s.quantity,
  s.region,
  s.channel
FROM sales_transactions s
JOIN customers c ON s.customer_id = c.id
ORDER BY s.date DESC
\`\`\`

Here are the sales records enriched with customer names and segments. You can now filter or pivot by customer segment!`,
        query: 'SELECT s.id, s.date, c.name as customer_name, c.segment, s.revenue, s.quantity, s.region, s.channel FROM sales_transactions s JOIN customers c ON s.customer_id = c.id ORDER BY s.date DESC',
        mockData: [
          { id: 1, date: '2024-12-05', customer_name: 'Acme Corporation', segment: 'Enterprise', revenue: 2499.99, quantity: 5, region: 'West', channel: 'Wholesale' },
          { id: 2, date: '2024-12-05', customer_name: 'Jane Smith', segment: 'Consumer', revenue: 149.99, quantity: 2, region: 'North', channel: 'Online' },
          { id: 3, date: '2024-12-04', customer_name: 'TechStart Inc', segment: 'SMB', revenue: 899.97, quantity: 3, region: 'East', channel: 'Retail' },
          { id: 4, date: '2024-12-04', customer_name: 'Global Industries', segment: 'Enterprise', revenue: 4599.99, quantity: 10, region: 'West', channel: 'Wholesale' },
          { id: 5, date: '2024-12-03', customer_name: 'John Doe', segment: 'Consumer', revenue: 79.99, quantity: 1, region: 'South', channel: 'Online' },
          { id: 6, date: '2024-12-03', customer_name: 'Nordic Solutions', segment: 'Enterprise', revenue: 1899.99, quantity: 4, region: 'North', channel: 'Retail' },
          { id: 7, date: '2024-12-02', customer_name: 'Boutique Shop', segment: 'SMB', revenue: 449.97, quantity: 3, region: 'East', channel: 'Online' },
          { id: 8, date: '2024-12-02', customer_name: 'Maria Garcia', segment: 'Consumer', revenue: 129.99, quantity: 1, region: 'South', channel: 'Online' },
          { id: 9, date: '2024-12-01', customer_name: 'Local Crafts Co', segment: 'SMB', revenue: 679.98, quantity: 2, region: 'West', channel: 'Retail' },
          { id: 10, date: '2024-12-01', customer_name: 'Alex Johnson', segment: 'Consumer', revenue: 59.99, quantity: 1, region: 'North', channel: 'Online' },
        ],
      },
      {
        keywords: ['product name', 'with product', 'join product', 'product info', 'product detail'],
        response: `I'll join the sales data with products to show you sales with product details.

Here's my approach:
1. **JOIN**: Link sales_transactions with products table on product_id

\`\`\`sql
-- Join sales with product information
SELECT 
  s.id,
  s.date,
  p.name as product_name,
  p.category,
  s.quantity,
  s.revenue,
  s.region,
  s.channel
FROM sales_transactions s
JOIN products p ON s.product_id = p.id
ORDER BY s.revenue DESC
\`\`\`

Here are the sales records enriched with product names and categories. Try pivoting by category to see which product types sell best!`,
        query: 'SELECT s.id, s.date, p.name as product_name, p.category, s.quantity, s.revenue, s.region, s.channel FROM sales_transactions s JOIN products p ON s.product_id = p.id ORDER BY s.revenue DESC',
        mockData: [
          { id: 1, date: '2024-12-04', product_name: 'Standing Desk Frame', category: 'Home & Garden', quantity: 3, revenue: 1049.97, region: 'West', channel: 'Wholesale' },
          { id: 2, date: '2024-12-05', product_name: 'Bluetooth Headphones', category: 'Electronics', quantity: 4, revenue: 599.96, region: 'North', channel: 'Retail' },
          { id: 3, date: '2024-12-03', product_name: 'Running Shoes Elite', category: 'Sports', quantity: 3, revenue: 389.97, region: 'East', channel: 'Online' },
          { id: 4, date: '2024-12-02', product_name: 'Wireless Mouse Pro', category: 'Electronics', quantity: 4, revenue: 319.96, region: 'South', channel: 'Online' },
          { id: 5, date: '2024-12-05', product_name: 'Denim Jeans Classic', category: 'Clothing', quantity: 3, revenue: 209.97, region: 'West', channel: 'Retail' },
          { id: 6, date: '2024-12-01', product_name: 'Garden Tool Set', category: 'Home & Garden', quantity: 2, revenue: 179.98, region: 'North', channel: 'Online' },
          { id: 7, date: '2024-12-04', product_name: 'Yoga Mat Premium', category: 'Sports', quantity: 3, revenue: 137.97, region: 'East', channel: 'Online' },
          { id: 8, date: '2024-12-03', product_name: 'Cotton T-Shirt Basic', category: 'Clothing', quantity: 5, revenue: 124.95, region: 'South', channel: 'Online' },
          { id: 9, date: '2024-12-02', product_name: 'Clean Code', category: 'Books', quantity: 2, revenue: 69.98, region: 'West', channel: 'Online' },
          { id: 10, date: '2024-12-01', product_name: 'JavaScript: The Good Parts', category: 'Books', quantity: 2, revenue: 59.98, region: 'North', channel: 'Online' },
        ],
      },
    ],
  },
  {
    dataSourceId: 'customers',
    initialData: [
      { id: 1001, name: 'Acme Corporation', email: 'contact@acme.com', segment: 'Enterprise', country: 'United States', created_at: '2022-03-15', lifetime_value: 45000 },
      { id: 1002, name: 'Jane Smith', email: 'jane.smith@email.com', segment: 'Consumer', country: 'United Kingdom', created_at: '2023-06-22', lifetime_value: 850 },
      { id: 1003, name: 'TechStart Inc', email: 'info@techstart.io', segment: 'SMB', country: 'Germany', created_at: '2023-01-10', lifetime_value: 3200 },
      { id: 1004, name: 'Global Industries', email: 'sales@globalind.com', segment: 'Enterprise', country: 'United States', created_at: '2021-11-08', lifetime_value: 78500 },
      { id: 1005, name: 'John Doe', email: 'johndoe@gmail.com', segment: 'Consumer', country: 'Canada', created_at: '2024-02-14', lifetime_value: 320 },
      { id: 1006, name: 'Boutique Shop', email: 'hello@boutique.fr', segment: 'SMB', country: 'France', created_at: '2023-08-30', lifetime_value: 1800 },
      { id: 1007, name: 'Maria Garcia', email: 'maria.g@outlook.com', segment: 'Consumer', country: 'Spain', created_at: '2024-05-19', lifetime_value: 450 },
      { id: 1008, name: 'Nordic Solutions', email: 'contact@nordic.se', segment: 'Enterprise', country: 'Sweden', created_at: '2022-07-03', lifetime_value: 32000 },
      { id: 1009, name: 'Local Crafts Co', email: 'orders@localcrafts.au', segment: 'SMB', country: 'Australia', created_at: '2023-11-25', lifetime_value: 2100 },
      { id: 1010, name: 'Alex Johnson', email: 'alex.j@proton.me', segment: 'Consumer', country: 'United States', created_at: '2024-09-02', lifetime_value: 180 },
    ],
    defaultResponse: `I can help you explore the customer data. Here are some things you can ask me:

- "Show me customers by segment"
- "What's the average lifetime value?"
- "Which countries have the most customers?"
- "Show me recent signups"

What would you like to know?`,
    triggers: [
      {
        keywords: ['segment', 'breakdown'],
        response: `I'll show you the customer breakdown by segment.

\`\`\`sql
SELECT segment, COUNT(*) as customer_count, AVG(lifetime_value) as avg_ltv
FROM customers
GROUP BY segment
ORDER BY customer_count DESC
\`\`\`

Here's the distribution across segments. Enterprise customers have the highest average lifetime value.`,
        query: 'SELECT segment, COUNT(*) as customer_count, AVG(lifetime_value) as avg_ltv FROM customers GROUP BY segment ORDER BY customer_count DESC',
        mockData: [
          { segment: 'Consumer', customer_count: 8500, avg_ltv: 450 },
          { segment: 'SMB', customer_count: 2800, avg_ltv: 2200 },
          { segment: 'Enterprise', customer_count: 450, avg_ltv: 18500 },
        ],
      },
      {
        keywords: ['lifetime', 'value', 'ltv'],
        response: `I'll calculate lifetime value statistics across the customer base.

\`\`\`sql
SELECT 
  COUNT(*) as total_customers,
  AVG(lifetime_value) as avg_ltv,
  MAX(lifetime_value) as max_ltv,
  MIN(lifetime_value) as min_ltv,
  SUM(lifetime_value) as total_ltv
FROM customers
\`\`\`

The average customer lifetime value is $1,250 with significant variation between segments.`,
        query: 'SELECT COUNT(*) as total_customers, AVG(lifetime_value) as avg_ltv, MAX(lifetime_value) as max_ltv, MIN(lifetime_value) as min_ltv, SUM(lifetime_value) as total_ltv FROM customers',
        mockData: [
          { total_customers: 11750, avg_ltv: 1250, max_ltv: 85000, min_ltv: 25, total_ltv: 14687500 },
        ],
      },
      {
        keywords: ['country', 'countries', 'location'],
        response: `I'll show you the customer distribution by country.

\`\`\`sql
SELECT country, COUNT(*) as customer_count, SUM(lifetime_value) as total_ltv
FROM customers
GROUP BY country
ORDER BY customer_count DESC
LIMIT 10
\`\`\`

Here are the top 10 countries by customer count.`,
        query: 'SELECT country, COUNT(*) as customer_count, SUM(lifetime_value) as total_ltv FROM customers GROUP BY country ORDER BY customer_count DESC LIMIT 10',
        mockData: [
          { country: 'United States', customer_count: 4200, total_ltv: 5800000 },
          { country: 'United Kingdom', customer_count: 1850, total_ltv: 2100000 },
          { country: 'Germany', customer_count: 1200, total_ltv: 1450000 },
          { country: 'Canada', customer_count: 980, total_ltv: 1100000 },
          { country: 'France', customer_count: 750, total_ltv: 890000 },
          { country: 'Australia', customer_count: 620, total_ltv: 720000 },
          { country: 'Japan', customer_count: 480, total_ltv: 650000 },
          { country: 'Netherlands', customer_count: 350, total_ltv: 420000 },
          { country: 'Spain', customer_count: 290, total_ltv: 340000 },
          { country: 'Italy', customer_count: 250, total_ltv: 280000 },
        ],
      },
    ],
  },
  {
    dataSourceId: 'products',
    initialData: [
      { id: 101, name: 'Wireless Mouse Pro', category: 'Electronics', price: 79.99, cost: 35.00, stock: 450 },
      { id: 102, name: 'Cotton T-Shirt Basic', category: 'Clothing', price: 24.99, cost: 8.50, stock: 1200 },
      { id: 103, name: 'Standing Desk Frame', category: 'Home & Garden', price: 349.99, cost: 180.00, stock: 85 },
      { id: 104, name: 'Running Shoes Elite', category: 'Sports', price: 129.99, cost: 55.00, stock: 320 },
      { id: 105, name: 'JavaScript: The Good Parts', category: 'Books', price: 29.99, cost: 10.00, stock: 580 },
      { id: 106, name: 'Bluetooth Headphones', category: 'Electronics', price: 149.99, cost: 65.00, stock: 280 },
      { id: 107, name: 'Denim Jeans Classic', category: 'Clothing', price: 69.99, cost: 28.00, stock: 890 },
      { id: 108, name: 'Garden Tool Set', category: 'Home & Garden', price: 89.99, cost: 38.00, stock: 150 },
      { id: 109, name: 'Yoga Mat Premium', category: 'Sports', price: 45.99, cost: 18.00, stock: 420 },
      { id: 110, name: 'Clean Code', category: 'Books', price: 34.99, cost: 12.00, stock: 340 },
    ],
    defaultResponse: `I can help you explore the product catalog. Here are some things you can ask me:

- "Show me products by category"
- "What are the profit margins?"
- "Which products are low on stock?"
- "Show me the price distribution"

What would you like to know?`,
    triggers: [
      {
        keywords: ['category', 'categories'],
        response: `I'll show you the product breakdown by category.

\`\`\`sql
SELECT category, COUNT(*) as product_count, AVG(price) as avg_price, SUM(stock) as total_stock
FROM products
GROUP BY category
ORDER BY product_count DESC
\`\`\`

Here's the distribution of products across categories.`,
        query: 'SELECT category, COUNT(*) as product_count, AVG(price) as avg_price, SUM(stock) as total_stock FROM products GROUP BY category ORDER BY product_count DESC',
        mockData: [
          { category: 'Electronics', product_count: 450, avg_price: 299.99, total_stock: 12500 },
          { category: 'Clothing', product_count: 380, avg_price: 59.99, total_stock: 28000 },
          { category: 'Home & Garden', product_count: 290, avg_price: 89.99, total_stock: 15000 },
          { category: 'Sports', product_count: 220, avg_price: 79.99, total_stock: 9500 },
          { category: 'Books', product_count: 180, avg_price: 24.99, total_stock: 22000 },
        ],
      },
      {
        keywords: ['margin', 'profit', 'cost'],
        response: `I'll calculate the profit margins by category.

\`\`\`sql
SELECT category, AVG(price) as avg_price, AVG(cost) as avg_cost, AVG(price - cost) as avg_margin, AVG((price - cost) / price * 100) as margin_percent
FROM products
GROUP BY category
ORDER BY margin_percent DESC
\`\`\`

Here are the profit margins. Electronics has the highest absolute margin while Books has the best percentage margin.`,
        query: 'SELECT category, AVG(price) as avg_price, AVG(cost) as avg_cost, AVG(price - cost) as avg_margin, AVG((price - cost) / price * 100) as margin_percent FROM products GROUP BY category ORDER BY margin_percent DESC',
        mockData: [
          { category: 'Books', avg_price: 24.99, avg_cost: 8.50, avg_margin: 16.49, margin_percent: 65.99 },
          { category: 'Clothing', avg_price: 59.99, avg_cost: 22.00, avg_margin: 37.99, margin_percent: 63.33 },
          { category: 'Home & Garden', avg_price: 89.99, avg_cost: 38.00, avg_margin: 51.99, margin_percent: 57.77 },
          { category: 'Sports', avg_price: 79.99, avg_cost: 35.00, avg_margin: 44.99, margin_percent: 56.24 },
          { category: 'Electronics', avg_price: 299.99, avg_cost: 180.00, avg_margin: 119.99, margin_percent: 40.00 },
        ],
      },
      {
        keywords: ['stock', 'inventory', 'low'],
        response: `I'll find products with low stock levels.

\`\`\`sql
SELECT name, category, stock, price
FROM products
WHERE stock < 50
ORDER BY stock ASC
LIMIT 20
\`\`\`

These products are running low on inventory and may need restocking soon.`,
        query: 'SELECT name, category, stock, price FROM products WHERE stock < 50 ORDER BY stock ASC LIMIT 20',
        mockData: [
          { name: 'Premium Headphones Pro', category: 'Electronics', stock: 5, price: 349.99 },
          { name: 'Vintage Leather Jacket', category: 'Clothing', stock: 8, price: 299.99 },
          { name: 'Smart Home Hub', category: 'Electronics', stock: 12, price: 199.99 },
          { name: 'Designer Sunglasses', category: 'Clothing', stock: 15, price: 189.99 },
          { name: 'Ergonomic Office Chair', category: 'Home & Garden', stock: 18, price: 449.99 },
          { name: 'Wireless Earbuds Elite', category: 'Electronics', stock: 22, price: 179.99 },
          { name: 'Cashmere Sweater', category: 'Clothing', stock: 25, price: 249.99 },
          { name: 'Smart Watch Series X', category: 'Electronics', stock: 28, price: 399.99 },
          { name: 'Premium Yoga Mat', category: 'Sports', stock: 32, price: 89.99 },
          { name: 'Espresso Machine Pro', category: 'Home & Garden', stock: 35, price: 599.99 },
        ],
      },
    ],
  },
]

/**
 * Find a matching demo response for a user message
 */
export function findDemoResponse(
  dataSourceId: string,
  userMessage: string,
): DemoTrigger | null {
  const scenario = DEMO_SCENARIOS.find(s => s.dataSourceId === dataSourceId)
  if (!scenario) {
    return null
  }

  const lowerMessage = userMessage.toLowerCase()

  for (const trigger of scenario.triggers) {
    const hasMatch = trigger.keywords.some(keyword =>
      lowerMessage.includes(keyword.toLowerCase()),
    )
    if (hasMatch) {
      return trigger
    }
  }

  return null
}

/**
 * Get the default response for a data source when no trigger matches
 */
export function getDefaultDemoResponse(dataSourceId: string): string {
  const scenario = DEMO_SCENARIOS.find(s => s.dataSourceId === dataSourceId)
  return scenario?.defaultResponse || 'Please select a data source to get started.'
}

/**
 * Get demo schema for a data source
 */
export function getDemoSchema(dataSourceId: string): AITableSchema | undefined {
  return DEMO_SCHEMAS.get(dataSourceId)
}

/**
 * Get initial sample data for a data source (shown when first selected)
 */
export function getInitialDemoData(dataSourceId: string): Record<string, unknown>[] | undefined {
  const scenario = DEMO_SCENARIOS.find(s => s.dataSourceId === dataSourceId)
  return scenario?.initialData
}
