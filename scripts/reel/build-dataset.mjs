#!/usr/bin/env node
/**
 * Writes the fictional "Acme Cloud" orders file that the homepage highlight reel is recorded against.
 *
 *   node scripts/reel/build-dataset.mjs <output.csv>
 *
 * Everything is invented and seeded, so the same file comes out every time. The numbers carry a
 * few deliberate stories for the recordings to find:
 *  - 2026 runs well ahead of 2025, with a soft patch every August,
 *  - APAC is the fastest-growing region,
 *  - Enterprise deals come through Sales, Starter through Self-serve,
 *  - Partner orders collapse in March 2026 (one bad month worth drilling into).
 */
import { writeFileSync } from 'node:fs'

const output = process.argv[2]
if (!output) {
  console.error('Usage: node scripts/reel/build-dataset.mjs <output.csv>')
  process.exit(1)
}

/** mulberry32: small seeded generator, good enough for sample data. */
function createRandom(seed) {
  let state = seed
  return () => {
    state = (state + 0x6D2B79F5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const random = createRandom(20261124)

function pickWeighted(options) {
  const total = options.reduce((sum, option) => sum + option.weight, 0)
  let roll = random() * total
  for (const option of options) {
    roll -= option.weight
    if (roll <= 0)
      return option
  }
  return options.at(-1)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const FIRST_YEAR = 2025
const MONTH_COUNT = 22 // Jan 2025 through Oct 2026

/** `growth` is the extra monthly growth a region compounds on top of the company-wide trend. */
const REGIONS = [
  { name: 'North America', weight: 40, growth: 0, countries: ['United States', 'Canada'] },
  { name: 'EMEA', weight: 30, growth: 0.006, countries: ['United Kingdom', 'Germany', 'France', 'Netherlands'] },
  { name: 'APAC', weight: 18, growth: 0.022, countries: ['Japan', 'Australia', 'Singapore', 'India'] },
  { name: 'LATAM', weight: 12, growth: 0.009, countries: ['Brazil', 'Mexico', 'Chile'] },
]

const PLANS = [
  { name: 'Starter', weight: 46, seatPrice: 12, seats: [1, 8] },
  { name: 'Team', weight: 30, seatPrice: 24, seats: [5, 40] },
  { name: 'Business', weight: 17, seatPrice: 42, seats: [20, 150] },
  { name: 'Enterprise', weight: 7, seatPrice: 68, seats: [100, 900] },
]

/** Which channel an order arrives through depends on the plan being bought. */
const CHANNEL_WEIGHTS = {
  Starter: { 'Self-serve': 78, 'Sales': 2, 'Partner': 8, 'Marketplace': 12 },
  Team: { 'Self-serve': 52, 'Sales': 18, 'Partner': 16, 'Marketplace': 14 },
  Business: { 'Self-serve': 14, 'Sales': 54, 'Partner': 24, 'Marketplace': 8 },
  Enterprise: { 'Self-serve': 1, 'Sales': 76, 'Partner': 21, 'Marketplace': 2 },
}

const CUSTOMER_TYPES = [
  { name: 'New', weight: 44 },
  { name: 'Expansion', weight: 23 },
  { name: 'Renewal', weight: 33 },
]

const BASE_ORDERS_PER_MONTH = 1650
const MONTHLY_GROWTH = 0.021
const AUGUST_DIP = 0.84
const PARTNER_OUTAGE = { monthIndex: 14, keep: 0.25 } // March 2026

function ordersInMonth(monthIndex) {
  const seasonal = monthIndex % 12 === 7 ? AUGUST_DIP : 1
  const noise = 0.97 + random() * 0.06
  return Math.round(BASE_ORDERS_PER_MONTH * (1 + MONTHLY_GROWTH) ** monthIndex * seasonal * noise)
}

function pickRegion(monthIndex) {
  return pickWeighted(REGIONS.map(region => ({ ...region, weight: region.weight * (1 + region.growth) ** monthIndex })))
}

function pickChannel(plan, monthIndex) {
  const weights = Object.entries(CHANNEL_WEIGHTS[plan.name]).map(([name, weight]) => ({ name, weight }))
  const channel = pickWeighted(weights).name
  const partnerLost = channel === 'Partner' && monthIndex === PARTNER_OUTAGE.monthIndex && random() > PARTNER_OUTAGE.keep
  return partnerLost ? null : channel
}

function buildOrder(id, monthIndex) {
  const plan = pickWeighted(PLANS)
  const channel = pickChannel(plan, monthIndex)
  if (!channel)
    return null

  const region = pickRegion(monthIndex)
  const year = FIRST_YEAR + Math.floor(monthIndex / 12)
  const month = monthIndex % 12
  const day = 1 + Math.floor(random() * 28)
  const period = `${year}-${String(month + 1).padStart(2, '0')}`
  const [minSeats, maxSeats] = plan.seats
  const seats = Math.round(minSeats + random() ** 2 * (maxSeats - minSeats))
  const discount = channel === 'Sales' || channel === 'Partner' ? Math.floor(random() * 5) * 5 : 0

  return [
    `ORD-${String(id).padStart(6, '0')}`,
    `${period}-${String(day).padStart(2, '0')}`,
    period,
    year,
    MONTHS[month],
    region.name,
    region.countries[Math.floor(random() * region.countries.length)],
    plan.name,
    channel,
    pickWeighted(CUSTOMER_TYPES).name,
    seats,
    discount,
    Math.round(seats * plan.seatPrice * (1 - discount / 100)),
  ]
}

const header = ['order_id', 'order_date', 'period', 'year', 'month', 'region', 'country', 'plan', 'channel', 'customer_type', 'seats', 'discount_pct', 'mrr']
const lines = [header.join(',')]
let nextId = 1

for (let monthIndex = 0; monthIndex < MONTH_COUNT; monthIndex++) {
  const count = ordersInMonth(monthIndex)
  for (let i = 0; i < count; i++) {
    const order = buildOrder(nextId, monthIndex)
    if (!order)
      continue
    lines.push(order.join(','))
    nextId++
  }
}

writeFileSync(output, `${lines.join('\n')}\n`)
console.log(`wrote ${output}: ${lines.length - 1} rows, ${header.length} columns`)
