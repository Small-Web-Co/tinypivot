import type { WarehouseTableSchema } from './warehouse.js'

/**
 * Lightweight in-memory Okapi BM25 search over warehouse table & column metadata.
 * Lets agents find the right 5–8 tables in a 500+ table warehouse in 1 call via
 * `profile(warehouse="...", query="...")` without flooding context or scanning data.
 */

export interface RankedWarehouseSchema {
  schema: WarehouseTableSchema
  score: number
  matchedTerms: string[]
  matchedColumns: string[]
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'by',
  'for',
  'from',
  'in',
  'is',
  'of',
  'on',
  'or',
  'per',
  'show',
  'table',
  'tables',
  'the',
  'to',
  'vs',
  'with',
])

const K1 = 1.5
const B = 0.75
const TABLE_NAME_BOOST = 2.4

/** Splits identifiers (snake_case, camelCase, dotted paths, hyphens) into lowercase search terms. */
export function tokenizeIdentifier(text: string): string[] {
  const expanded = text.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  return expanded
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(tok => tok.length >= 2 && !STOP_WORDS.has(tok))
}

interface IndexedDoc {
  schema: WarehouseTableSchema
  nameTokens: string[]
  colEntries: Array<{ name: string, tokens: string[] }>
  tf: Map<string, number>
  len: number
}

function buildDoc(schema: WarehouseTableSchema): IndexedDoc {
  const nameTokens = tokenizeIdentifier(schema.name)
  const colEntries = schema.columns.map(c => ({
    name: c.name,
    tokens: tokenizeIdentifier(c.name),
  }))
  const tf = new Map<string, number>()
  for (const tok of nameTokens)
    tf.set(tok, (tf.get(tok) ?? 0) + TABLE_NAME_BOOST)
  let colTokenCount = 0
  for (const entry of colEntries) {
    for (const tok of entry.tokens) {
      tf.set(tok, (tf.get(tok) ?? 0) + 1)
      colTokenCount++
    }
  }
  return {
    schema,
    nameTokens,
    colEntries,
    tf,
    len: nameTokens.length * TABLE_NAME_BOOST + colTokenCount,
  }
}

function tokenMatchWeight(doc: IndexedDoc, term: string): number {
  const exact = doc.tf.get(term) ?? 0
  if (exact > 0)
    return exact
  // Prefix / stem fallback (e.g. "cust" -> "customer", "orders" -> "order")
  let partial = 0
  const stem = term.length > 4 && term.endsWith('s') ? term.slice(0, -1) : term
  for (const [docTok, weight] of doc.tf.entries()) {
    if (docTok.startsWith(stem) || (docTok.length >= 4 && stem.startsWith(docTok)))
      partial += weight * 0.7
  }
  return partial
}

/** Ranks warehouse table schemas against a natural-language or keyword query using Okapi BM25. */
export function rankWarehouseSchemas(
  schemas: WarehouseTableSchema[],
  query: string,
  limit = 8,
): RankedWarehouseSchema[] {
  const queryTerms = [...new Set(tokenizeIdentifier(query))]
  if (schemas.length === 0 || queryTerms.length === 0)
    return []

  const docs = schemas.map(buildDoc)
  const n = docs.length
  const avgLen = Math.max(1, docs.reduce((sum, d) => sum + d.len, 0) / n)

  // Document frequency per query term (including prefix/stem matches)
  const df = new Map<string, number>()
  for (const term of queryTerms) {
    let count = 0
    for (const doc of docs) {
      if (tokenMatchWeight(doc, term) > 0)
        count++
    }
    df.set(term, count)
  }

  const scored: RankedWarehouseSchema[] = []
  for (const doc of docs) {
    let score = 0
    const matchedTerms: string[] = []
    for (const term of queryTerms) {
      const f = tokenMatchWeight(doc, term)
      if (f <= 0)
        continue
      matchedTerms.push(term)
      const docFreq = df.get(term) ?? 0
      const idf = Math.log(1 + (n - docFreq + 0.5) / (docFreq + 0.5))
      const tfNorm = (f * (K1 + 1)) / (f + K1 * (1 - B + B * (doc.len / avgLen)))
      score += idf * tfNorm
    }
    if (score <= 0)
      continue
    const matchedColumns = doc.colEntries
      .filter(entry => queryTerms.some((term) => {
        const stem = term.length > 4 && term.endsWith('s') ? term.slice(0, -1) : term
        return entry.tokens.some(t => t === term || t.startsWith(stem) || (t.length >= 4 && stem.startsWith(t)))
      }))
      .map(entry => entry.name)
      .slice(0, 5)
    scored.push({ schema: doc.schema, score, matchedTerms, matchedColumns })
  }

  return scored
    .sort((a, b) => b.score - a.score || (b.schema.rowCount ?? 0) - (a.schema.rowCount ?? 0) || a.schema.name.localeCompare(b.schema.name))
    .slice(0, limit)
}
