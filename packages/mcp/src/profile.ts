import type { ColumnSummary, StoredDataset } from './store.js'

/**
 * A compact description of each column, so the model can plan filters and queries without
 * reading rows: how much is missing, the range of numbers and dates, and the commonest values.
 */

const TOP_VALUES = 3

interface ColumnProfile {
  column: ColumnSummary
  present: number
  values: unknown[]
}

function compactNumber(value: number): string {
  return Number.isInteger(value)
    ? value.toLocaleString('en-US')
    : value.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function percent(part: number, whole: number): string {
  if (whole === 0)
    return '0%'
  const share = (part / whole) * 100
  return share > 0 && share < 1 ? '<1%' : `${Math.round(share)}%`
}

function numberRange(values: unknown[]): string {
  const numbers = values.map(Number).filter(Number.isFinite)
  if (numbers.length === 0)
    return ''
  let min = numbers[0]
  let max = numbers[0]
  let sum = 0
  for (const value of numbers) {
    min = Math.min(min, value)
    max = Math.max(max, value)
    sum += value
  }
  return `${compactNumber(min)} to ${compactNumber(max)}, mean ${compactNumber(sum / numbers.length)}`
}

function dateRange(values: unknown[]): string {
  const texts = values.map(String).sort()
  return texts.length ? `${texts[0]} to ${texts[texts.length - 1]}` : ''
}

function topValues(values: unknown[], total: number): string {
  const counts = new Map<string, number>()
  for (const value of values)
    counts.set(String(value), (counts.get(String(value)) ?? 0) + 1)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_VALUES)
  const listed = top.map(([value, count]) => `${value} ${percent(count, total)}`).join(', ')
  return counts.size > TOP_VALUES ? `${counts.size.toLocaleString('en-US')} values, top: ${listed}` : listed
}

function describe({ column, present, values }: ColumnProfile, total: number): string {
  const missing = total - present
  const parts = [`\`${column.name}\` ${column.type}`]
  if (missing > 0)
    parts.push(`${percent(missing, total)} empty`)
  if (column.type === 'number')
    parts.push(numberRange(values))
  else if (column.type === 'date')
    parts.push(dateRange(values))
  else
    parts.push(topValues(values, present))
  return parts.filter(Boolean).join(' · ')
}

export function formatProfile(dataset: StoredDataset): string {
  const total = dataset.rows.length
  const profiles = dataset.columns.map((column) => {
    const values = dataset.rows
      .map(row => row[column.name])
      .filter(value => value !== null && value !== undefined && value !== '')
    return { column, present: values.length, values }
  })
  return [
    `Profile of **${dataset.name}** (\`${dataset.id}\`): ${total.toLocaleString('en-US')} rows.`,
    ...profiles.map(profile => describe(profile, total)),
  ].join('\n')
}
