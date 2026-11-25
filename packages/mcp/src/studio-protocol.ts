import type { ChartConfig, DataGridViewMode, PivotConfig } from '@smallwebco/tinypivot-core'
import type { HistoryEntry } from './history.js'
import type { RowFilter } from './store.js'

/**
 * What the local server and the browser Studio exchange. Kept free of Node imports so the
 * browser bundle can share it.
 */

/** The header every Studio write must carry. Browsers will not send it cross-site without a preflight the server never grants. */
export const STUDIO_HEADER = 'x-tinypivot'

export type StepActor = 'agent' | 'user'

export interface TraceStep {
  id: string
  at: string
  actor: StepActor
  /** The tool or Studio action, e.g. `query`, `configure_chart`, `history`. */
  tool: string
  /** Why the step was taken, in the agent's (or user's) words. */
  why?: string
  datasetId?: string
  datasetName?: string
  rows?: number
  sql?: string
  file?: string
  where?: RowFilter[]
  /** What is shown, e.g. "line chart: sum(mrr) by month, split by year". */
  view?: string
  /** The view as it was after this step, so opening the step shows exactly that. */
  viewMode?: DataGridViewMode
  chartConfig?: Partial<ChartConfig>
  pivotConfig?: Partial<PivotConfig>
  historyId?: string
}

export interface StudioNote {
  id: string
  at: string
  text: string
  stepId?: string
}

/** What the browser Studio shows: the trace, notes not yet delivered, and saved pulls. */
export interface StudioSnapshot {
  /** Each step, with the SQL that reproduces it when there is one (file loads included). */
  steps: Array<TraceStep & { editableSql?: string }>
  notes: StudioNote[]
  history: HistoryEntry[]
  historyEnabled: boolean
  /** Ids of the datasets loaded right now, so a step can open its dataset directly. */
  loadedIds: string[]
}
