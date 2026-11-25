import type { ChatTurn } from './agent-bridge.js'
import type { StoredDataset } from './store.js'
import type { Studio } from './studio.js'

/**
 * The endpoint TinyPivot's AI Analyst panel talks to (the same protocol as
 * `@smallwebco/tinypivot-server`), answered locally: the tables are the datasets loaded in this
 * session, SQL runs read-only in DuckDB, and chat goes to the user's own agent.
 */

const ANALYST_ROW_LIMIT = 10_000

export interface AnalystResponse {
  status: number
  body: unknown
}

function schemaFor(dataset: StoredDataset) {
  return {
    table: dataset.id,
    columns: dataset.columns.map(column => ({
      name: column.name,
      type: column.type === 'null' ? 'unknown' : column.type,
      nullable: true,
    })),
  }
}

/** Datasets SQL can read, by id. */
function queryableDatasets(studio: Studio): StoredDataset[] {
  return studio.queryViews().flatMap(view => studio.store.get(view.name) ?? [])
}

function chatTurns(messages: unknown): ChatTurn[] {
  if (!Array.isArray(messages))
    return []
  return messages.flatMap((message) => {
    const { role, content } = (message ?? {}) as { role?: unknown, content?: unknown }
    return (role === 'user' || role === 'assistant') && typeof content === 'string' ? [{ role, content }] : []
  })
}

async function runQuery(studio: Studio, sql: unknown): Promise<AnalystResponse> {
  if (typeof sql !== 'string' || !sql.trim())
    return { status: 400, body: { success: false, error: 'Send one SELECT statement.' } }
  try {
    const result = await studio.duck.run(sql, studio.queryViews(), ANALYST_ROW_LIMIT)
    return { status: 200, body: { success: true, data: result.rows, rowCount: result.rows.length, truncated: result.truncated } }
  }
  catch (error) {
    return { status: 200, body: { success: false, error: error instanceof Error ? error.message : String(error) } }
  }
}

async function chat(studio: Studio, messages: unknown): Promise<AnalystResponse> {
  const turns = chatTurns(messages)
  const question = turns.filter(turn => turn.role === 'user').at(-1)?.content.trim()
  if (!question)
    return { status: 400, body: { error: 'Ask a question.' } }
  return { status: 200, body: { content: await studio.ask(question, { turns }) } }
}

export async function handleAnalystAction(studio: Studio, body: Record<string, unknown>): Promise<AnalystResponse> {
  switch (body.action) {
    case 'list-tables':
      return { status: 200, body: { tables: queryableDatasets(studio).map(ds => ({ name: ds.id, description: `${ds.name}: ${ds.rows.length.toLocaleString('en-US')} rows` })) } }
    case 'get-schema': {
      const wanted = new Set(Array.isArray(body.tables) ? body.tables.map(String) : [])
      return { status: 200, body: { schemas: queryableDatasets(studio).filter(ds => wanted.has(ds.id)).map(schemaFor) } }
    }
    case 'get-all-schemas':
      return { status: 200, body: { schemas: queryableDatasets(studio).map(schemaFor) } }
    case 'query':
      return runQuery(studio, body.sql)
    case 'chat':
      return chat(studio, body.messages)
    default:
      return { status: 400, body: { error: `Unknown action: ${String(body.action)}` } }
  }
}
