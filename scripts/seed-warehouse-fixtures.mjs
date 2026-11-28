import { execFileSync } from 'node:child_process'

/**
 * Seeds deterministic Acme fixture tables into Postgres, MySQL, and/or ClickHouse for
 * real-engine integration tests (`tests/live/warehouses.live.test.ts` and CI containers).
 *
 * Controlled via env vars (each engine is skipped when unset):
 *   TINYPIVOT_LIVE_PG_URL    (e.g. postgres://postgres:tp_test@127.0.0.1:5432/acme)
 *   TINYPIVOT_LIVE_MYSQL_URL (e.g. mysql://root:tp_test@127.0.0.1:3306/acme)
 *   TINYPIVOT_LIVE_CH_URL    (e.g. http://default:tp_test@127.0.0.1:8123/acme)
 */

function genOrders() {
  const rows = []
  const months = [
    { ym: '2026-01', days: 31 },
    { ym: '2026-02', days: 28 },
    { ym: '2026-03', days: 31 },
    { ym: '2026-04', days: 10 },
  ]
  let id = 1
  for (let mi = 0; mi < months.length; mi++) {
    const { ym, days } = months[mi]
    const n = mi === 3 ? 60 : 180
    for (let i = 0; i < n; i++) {
      const day = String((i % days) + 1).padStart(2, '0')
      const custNum = mi === 0 ? (i % 120) + 1 : (i < 90 ? (i % 90) + 1 : 120 + mi * 50 + (i % 50))
      rows.push({
        order_id: `ORD-${String(id++).padStart(5, '0')}`,
        customer_id: `CUST-${String(custNum).padStart(4, '0')}`,
        order_date: `${ym}-${day}`,
        status: i % 10 === 0 ? 'refunded' : 'completed',
        promo_code: i % 5 < 2 ? null : (i % 2 === 0 ? 'SAVE10' : 'VIP20'),
        currency: i % 4 === 0 ? 'EUR' : 'USD',
        amount: Number((50 + (i % 15) * 12.5).toFixed(2)),
      })
    }
  }
  return rows
}

function genShipments(orders) {
  const rows = []
  let sid = 1
  for (let i = 0; i < orders.length; i++) {
    const o = orders[i]
    const copies = i % 2 === 0 ? 2 : 1
    for (let c = 0; c < copies; c++) {
      rows.push({
        shipment_id: `SHP-${String(sid++).padStart(5, '0')}`,
        order_id: o.order_id,
        carrier: c === 0 ? 'UPS' : 'FedEx',
        shipped_date: o.order_date,
      })
    }
  }
  return rows
}

function genCampaignDaily() {
  const rows = []
  const start = Date.UTC(2026, 0, 1)
  for (let i = 0; i < 60; i++) {
    const d = new Date(start + i * 86_400_000)
    const iso = d.toISOString().slice(0, 10)
    const dow = d.getUTCDay()
    const isFeb = iso.startsWith('2026-02')
    const spike = iso === '2026-02-15' ? 0.35 : 1.0
    const noise = 1 + (((i % 5) - 2) * 0.02)
    const wMult = (dow === 0 || dow === 6 ? 0.75 : 1.0) * noise
    const orgSess = Math.round((isFeb ? 400 : 1200) * wMult)
    const orgConv = Math.round(orgSess * 0.105 * spike)
    const paidSess = Math.round((isFeb ? 1800 : 400) * wMult)
    const paidConv = Math.round(paidSess * 0.028 * spike)
    rows.push({
      date: iso,
      channel: 'Organic',
      sessions: orgSess,
      conversions: orgConv,
      spend: Number((orgSess * 0.15).toFixed(2)),
      conversion_rate_pct: Number(((orgConv / orgSess) * 100).toFixed(2)),
    })
    rows.push({
      date: iso,
      channel: 'Paid',
      sessions: paidSess,
      conversions: paidConv,
      spend: Number((paidSess * 0.85).toFixed(2)),
      conversion_rate_pct: Number(((paidConv / paidSess) * 100).toFixed(2)),
    })
  }
  return rows
}

function genAbUsers() {
  return Array.from({ length: 400 }, (_, i) => {
    const variant = i < 140 ? 'control' : 'treatment'
    const segment = i % 2 === 0 ? 'SMB' : 'Enterprise'
    const base = segment === 'Enterprise' ? 120 : 50
    const lift = variant === 'treatment' ? 8 : 0
    return {
      user_id: `U-${i + 1}`,
      variant,
      segment,
      revenue: Number((base + lift + ((i % 9) - 4) * 2.5).toFixed(2)),
    }
  })
}

function genAccounts() {
  return Array.from({ length: 200 }, (_, i) => {
    const ent = (i % 20) + 1
    const disc = Number((ent * 1.2 + ((i % 5) - 2) * 0.4).toFixed(3))
    const val = Number((10 - 2 * disc + 5 * ent + ((i % 7) - 3) * 0.1).toFixed(3))
    return { account_id: `ACC-${i + 1}`, discount_pct: disc, enterprise_score: ent, renewed_val: val }
  })
}

function sqlLit(v) {
  if (v === null || v === undefined)
    return 'NULL'
  if (typeof v === 'number')
    return String(v)
  return `'${String(v).replace(/'/g, '\'\'')}'`
}

function buildInserts(table, rows, batchSize = 200) {
  const cols = Object.keys(rows[0])
  const out = []
  for (let i = 0; i < rows.length; i += batchSize) {
    const slice = rows.slice(i, i + batchSize)
    const vals = slice.map(r => `(${cols.map(c => sqlLit(r[c])).join(',')})`).join(',\n')
    out.push(`INSERT INTO ${table} (${cols.join(',')}) VALUES\n${vals};`)
  }
  return out.join('\n')
}

const orders = genOrders()
const shipments = genShipments(orders)
const campaign = genCampaignDaily()
const abUsers = genAbUsers()
const accounts = genAccounts()

function seedPostgres(url) {
  const ddl = `
    DROP TABLE IF EXISTS orders, shipments, campaign_daily, ab_users, accounts;
    CREATE TABLE orders (order_id TEXT PRIMARY KEY, customer_id TEXT, order_date DATE, status TEXT, promo_code TEXT, currency TEXT, amount NUMERIC(12,2));
    CREATE TABLE shipments (shipment_id TEXT PRIMARY KEY, order_id TEXT, carrier TEXT, shipped_date DATE);
    CREATE TABLE campaign_daily (date DATE, channel TEXT, sessions INT, conversions INT, spend NUMERIC(12,2), conversion_rate_pct DOUBLE PRECISION);
    CREATE TABLE ab_users (user_id TEXT PRIMARY KEY, variant TEXT, segment TEXT, revenue DOUBLE PRECISION);
    CREATE TABLE accounts (account_id TEXT PRIMARY KEY, discount_pct DOUBLE PRECISION, enterprise_score DOUBLE PRECISION, renewed_val DOUBLE PRECISION);
    ${buildInserts('orders', orders)}
    ${buildInserts('shipments', shipments)}
    ${buildInserts('campaign_daily', campaign)}
    ${buildInserts('ab_users', abUsers)}
    ${buildInserts('accounts', accounts)}
    ANALYZE;
  `
  execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1'], { input: ddl, stdio: ['pipe', 'pipe', 'inherit'] })
  console.log('Seeded PostgreSQL fixture')
}

function seedMysql(urlStr) {
  const u = new URL(urlStr)
  const db = u.pathname.replace(/^\//, '') || 'acme'
  const ddl = `
    CREATE DATABASE IF NOT EXISTS \`${db}\`;
    USE \`${db}\`;
    DROP TABLE IF EXISTS orders, shipments, campaign_daily, ab_users, accounts;
    CREATE TABLE orders (order_id VARCHAR(32) PRIMARY KEY, customer_id VARCHAR(32), order_date DATE, status VARCHAR(32), promo_code VARCHAR(32) NULL, currency VARCHAR(8), amount DECIMAL(12,2));
    CREATE TABLE shipments (shipment_id VARCHAR(32) PRIMARY KEY, order_id VARCHAR(32), carrier VARCHAR(32), shipped_date DATE);
    CREATE TABLE campaign_daily (date DATE, channel VARCHAR(32), sessions INT, conversions INT, spend DECIMAL(12,2), conversion_rate_pct DOUBLE);
    CREATE TABLE ab_users (user_id VARCHAR(32) PRIMARY KEY, variant VARCHAR(32), segment VARCHAR(32), revenue DOUBLE);
    CREATE TABLE accounts (account_id VARCHAR(32) PRIMARY KEY, discount_pct DOUBLE, enterprise_score DOUBLE, renewed_val DOUBLE);
    ${buildInserts('orders', orders)}
    ${buildInserts('shipments', shipments)}
    ${buildInserts('campaign_daily', campaign)}
    ${buildInserts('ab_users', abUsers)}
    ${buildInserts('accounts', accounts)}
    ANALYZE TABLE orders, shipments, campaign_daily, ab_users, accounts;
  `
  const args = [
    '-h',
    u.hostname,
    '-P',
    u.port || '3306',
    '-u',
    decodeURIComponent(u.username || 'root'),
    '--protocol=TCP',
  ]
  const env = { ...process.env }
  if (u.password)
    env.MYSQL_PWD = decodeURIComponent(u.password)
  execFileSync('mysql', args, { input: ddl, env, stdio: ['pipe', 'pipe', 'inherit'] })
  console.log('Seeded MySQL fixture')
}

async function seedClickHouse(urlStr) {
  const u = new URL(urlStr)
  const db = u.pathname.replace(/^\//, '') || 'acme'
  const base = `${u.protocol}//${u.host}`
  const headers = {}
  if (u.username)
    headers['X-ClickHouse-User'] = decodeURIComponent(u.username)
  if (u.password)
    headers['X-ClickHouse-Key'] = decodeURIComponent(u.password)

  const exec = async (sql, targetDb) => {
    const res = await fetch(`${base}/${targetDb ? `?database=${encodeURIComponent(targetDb)}` : ''}`, {
      method: 'POST',
      headers,
      body: sql,
    })
    if (!res.ok)
      throw new Error(`ClickHouse seed error ${res.status}: ${await res.text()}`)
  }

  await exec(`CREATE DATABASE IF NOT EXISTS ${db}`)
  const stmts = [
    `DROP TABLE IF EXISTS ${db}.orders`,
    `DROP TABLE IF EXISTS ${db}.shipments`,
    `DROP TABLE IF EXISTS ${db}.campaign_daily`,
    `DROP TABLE IF EXISTS ${db}.ab_users`,
    `DROP TABLE IF EXISTS ${db}.accounts`,
    `CREATE TABLE ${db}.orders (order_id String, customer_id String, order_date Date, status String, promo_code Nullable(String), currency String, amount Float64) ENGINE = MergeTree ORDER BY order_id`,
    `CREATE TABLE ${db}.shipments (shipment_id String, order_id String, carrier String, shipped_date Date) ENGINE = MergeTree ORDER BY shipment_id`,
    `CREATE TABLE ${db}.campaign_daily (date Date, channel String, sessions Int64, conversions Int64, spend Float64, conversion_rate_pct Float64) ENGINE = MergeTree ORDER BY (date, channel)`,
    `CREATE TABLE ${db}.ab_users (user_id String, variant String, segment String, revenue Float64) ENGINE = MergeTree ORDER BY user_id`,
    `CREATE TABLE ${db}.accounts (account_id String, discount_pct Float64, enterprise_score Float64, renewed_val Float64) ENGINE = MergeTree ORDER BY account_id`,
  ]
  for (const s of stmts)
    await exec(s, db)
  for (const [tbl, rows] of [[`${db}.orders`, orders], [`${db}.shipments`, shipments], [`${db}.campaign_daily`, campaign], [`${db}.ab_users`, abUsers], [`${db}.accounts`, accounts]]) {
    for (const stmt of buildInserts(tbl, rows, 500).split(';\n')) {
      if (stmt.trim())
        await exec(stmt.replace(/;$/, ''), db)
    }
  }
  console.log('Seeded ClickHouse fixture')
}

if (process.env.TINYPIVOT_LIVE_PG_URL)
  seedPostgres(process.env.TINYPIVOT_LIVE_PG_URL)
if (process.env.TINYPIVOT_LIVE_MYSQL_URL)
  seedMysql(process.env.TINYPIVOT_LIVE_MYSQL_URL)
if (process.env.TINYPIVOT_LIVE_CH_URL)
  await seedClickHouse(process.env.TINYPIVOT_LIVE_CH_URL)
