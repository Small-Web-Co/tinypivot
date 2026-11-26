import { useCallback, useState } from 'react'

/**
 * Persistent 2D layout state for TinyPivot Studio:
 * - Three workspace panes (`sql`, `visual`, `data`) arranged in 1–3 rows, each holding 1–3 panes side-by-side.
 * - Independent persisted height weights (across rows), width weights (across side-by-side panes),
 *   collapse states, SQL tables sidebar width, and Agent pane dock side (`left` | `right`).
 */

export type WorkspacePaneId = 'sql' | 'visual' | 'data'
export type DropEdge = 'top' | 'bottom' | 'left' | 'right'
export type AgentSide = 'left' | 'right'
export type StudioViewMode = 'ide' | 'notebook'

export interface WorkspaceLayout {
  rows: WorkspacePaneId[][]
  collapsed: Record<WorkspacePaneId, boolean>
  heightWeights: Record<WorkspacePaneId, number>
  widthWeights: Record<WorkspacePaneId, number>
  agentSide: AgentSide
  tablesWidth: number
  studioView: StudioViewMode
}

export const WORKSPACE_STORAGE_KEY = 'tinypivot-studio-workspace-v2'
export const MIN_PANE_HEIGHT_PX = 110
export const MIN_PANE_WIDTH_PX = 240
export const MIN_TABLES_WIDTH_PX = 140
export const MAX_TABLES_WIDTH_PX = 420

export const DEFAULT_WORKSPACE_LAYOUT: WorkspaceLayout = {
  rows: [['sql'], ['visual'], ['data']],
  collapsed: { sql: true, visual: false, data: false },
  heightWeights: { sql: 28, visual: 65, data: 35 },
  widthWeights: { sql: 40, visual: 58, data: 42 },
  agentSide: 'left',
  tablesWidth: 220,
  studioView: 'ide',
}

const VALID_PANES: readonly WorkspacePaneId[] = ['sql', 'visual', 'data']
const VALID_PANE_SET = new Set<string>(VALID_PANES)

function sanitizeWeight(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 8 && value <= 200 ? value : fallback
}

export function clampTablesWidth(width: number): number {
  return Math.round(Math.max(MIN_TABLES_WIDTH_PX, Math.min(MAX_TABLES_WIDTH_PX, width)))
}

function sanitizeRows(value: unknown): WorkspacePaneId[][] {
  if (!Array.isArray(value))
    return DEFAULT_WORKSPACE_LAYOUT.rows.map(r => [...r])
  const seen = new Set<WorkspacePaneId>()
  const clean: WorkspacePaneId[][] = []
  for (const row of value) {
    if (!Array.isArray(row))
      continue
    const cleanRow: WorkspacePaneId[] = []
    for (const id of row) {
      if (typeof id === 'string' && VALID_PANE_SET.has(id) && !seen.has(id as WorkspacePaneId)) {
        seen.add(id as WorkspacePaneId)
        cleanRow.push(id as WorkspacePaneId)
      }
    }
    if (cleanRow.length > 0)
      clean.push(cleanRow)
  }
  for (const id of VALID_PANES) {
    if (!seen.has(id))
      clean.push([id])
  }
  return clean
}

/** Ensures at least one pane stays open so the workspace never collapses to empty bars. */
function ensureOneOpen(collapsed: Record<WorkspacePaneId, boolean>): Record<WorkspacePaneId, boolean> {
  if (VALID_PANES.every(id => collapsed[id]))
    return { ...collapsed, visual: false }
  return collapsed
}

export function cloneDefaultLayout(): WorkspaceLayout {
  return {
    rows: DEFAULT_WORKSPACE_LAYOUT.rows.map(r => [...r]),
    collapsed: { ...DEFAULT_WORKSPACE_LAYOUT.collapsed },
    heightWeights: { ...DEFAULT_WORKSPACE_LAYOUT.heightWeights },
    widthWeights: { ...DEFAULT_WORKSPACE_LAYOUT.widthWeights },
    agentSide: DEFAULT_WORKSPACE_LAYOUT.agentSide,
    tablesWidth: DEFAULT_WORKSPACE_LAYOUT.tablesWidth,
    studioView: DEFAULT_WORKSPACE_LAYOUT.studioView,
  }
}

export function sanitizeWorkspaceLayout(raw: unknown): WorkspaceLayout {
  if (!raw || typeof raw !== 'object')
    return cloneDefaultLayout()
  const obj = raw as Partial<WorkspaceLayout>
  const rows = sanitizeRows(obj.rows)
  const rawCollapsed = (obj.collapsed && typeof obj.collapsed === 'object') ? obj.collapsed as Partial<Record<WorkspacePaneId, unknown>> : {}
  const collapsed = ensureOneOpen({
    sql: typeof rawCollapsed.sql === 'boolean' ? rawCollapsed.sql : DEFAULT_WORKSPACE_LAYOUT.collapsed.sql,
    visual: typeof rawCollapsed.visual === 'boolean' ? rawCollapsed.visual : DEFAULT_WORKSPACE_LAYOUT.collapsed.visual,
    data: typeof rawCollapsed.data === 'boolean' ? rawCollapsed.data : DEFAULT_WORKSPACE_LAYOUT.collapsed.data,
  })
  const rawH = (obj.heightWeights && typeof obj.heightWeights === 'object') ? obj.heightWeights as Partial<Record<WorkspacePaneId, unknown>> : {}
  const rawW = (obj.widthWeights && typeof obj.widthWeights === 'object') ? obj.widthWeights as Partial<Record<WorkspacePaneId, unknown>> : {}
  const heightWeights: Record<WorkspacePaneId, number> = {
    sql: sanitizeWeight(rawH.sql, DEFAULT_WORKSPACE_LAYOUT.heightWeights.sql),
    visual: sanitizeWeight(rawH.visual, DEFAULT_WORKSPACE_LAYOUT.heightWeights.visual),
    data: sanitizeWeight(rawH.data, DEFAULT_WORKSPACE_LAYOUT.heightWeights.data),
  }
  const widthWeights: Record<WorkspacePaneId, number> = {
    sql: sanitizeWeight(rawW.sql, DEFAULT_WORKSPACE_LAYOUT.widthWeights.sql),
    visual: sanitizeWeight(rawW.visual, DEFAULT_WORKSPACE_LAYOUT.widthWeights.visual),
    data: sanitizeWeight(rawW.data, DEFAULT_WORKSPACE_LAYOUT.widthWeights.data),
  }
  const agentSide: AgentSide = obj.agentSide === 'right' ? 'right' : 'left'
  const tablesWidth = typeof obj.tablesWidth === 'number' && Number.isFinite(obj.tablesWidth)
    ? clampTablesWidth(obj.tablesWidth)
    : DEFAULT_WORKSPACE_LAYOUT.tablesWidth
  const studioView: StudioViewMode = obj.studioView === 'notebook' ? 'notebook' : 'ide'

  return { rows, collapsed, heightWeights, widthWeights, agentSide, tablesWidth, studioView }
}

export function isDefaultWorkspaceLayout(layout: WorkspaceLayout): boolean {
  const sameRows = layout.rows.length === DEFAULT_WORKSPACE_LAYOUT.rows.length
    && layout.rows.every((row, r) =>
      row.length === DEFAULT_WORKSPACE_LAYOUT.rows[r].length
      && row.every((id, c) => id === DEFAULT_WORKSPACE_LAYOUT.rows[r][c]),
    )
  if (!sameRows)
    return false
  if (layout.agentSide !== DEFAULT_WORKSPACE_LAYOUT.agentSide)
    return false
  if (layout.studioView !== DEFAULT_WORKSPACE_LAYOUT.studioView)
    return false
  if (Math.abs(layout.tablesWidth - DEFAULT_WORKSPACE_LAYOUT.tablesWidth) >= 1)
    return false
  return VALID_PANES.every(id =>
    layout.collapsed[id] === DEFAULT_WORKSPACE_LAYOUT.collapsed[id]
    && Math.abs(layout.heightWeights[id] - DEFAULT_WORKSPACE_LAYOUT.heightWeights[id]) < 0.5
    && Math.abs(layout.widthWeights[id] - DEFAULT_WORKSPACE_LAYOUT.widthWeights[id]) < 0.5,
  )
}

export function isRowCollapsed(row: WorkspacePaneId[], collapsed: Record<WorkspacePaneId, boolean>): boolean {
  return row.every(id => collapsed[id])
}

/** A row's height weight is the average height weight of its open panes. */
export function rowHeightWeight(row: WorkspacePaneId[], layout: WorkspaceLayout): number {
  const open = row.filter(id => !layout.collapsed[id])
  if (open.length === 0)
    return 0
  return open.reduce((sum, id) => sum + layout.heightWeights[id], 0) / open.length
}

export function togglePaneCollapsed(layout: WorkspaceLayout, id: WorkspacePaneId): WorkspaceLayout {
  const nextCollapsed = { ...layout.collapsed, [id]: !layout.collapsed[id] }
  if (VALID_PANES.every(pane => nextCollapsed[pane]))
    return layout
  return { ...layout, collapsed: nextCollapsed }
}

export function setPaneOpen(layout: WorkspaceLayout, id: WorkspacePaneId, open: boolean): WorkspaceLayout {
  if (layout.collapsed[id] === !open)
    return layout
  const nextCollapsed = { ...layout.collapsed, [id]: !open }
  if (VALID_PANES.every(pane => nextCollapsed[pane]))
    return layout
  return { ...layout, collapsed: nextCollapsed }
}

/**
 * Docks `fromId` relative to `targetId`:
 * - `left` / `right`: places `fromId` side-by-side in `targetId`'s row
 * - `top` / `bottom`: places `fromId` in its own row directly above or below `targetId`'s row
 */
export function dockPane(
  layout: WorkspaceLayout,
  fromId: WorkspacePaneId,
  targetId: WorkspacePaneId,
  edge: DropEdge,
): WorkspaceLayout {
  if (fromId === targetId)
    return layout

  // Remove fromId from its current row
  const stripped = layout.rows
    .map(row => row.filter(id => id !== fromId))
    .filter(row => row.length > 0)

  const targetRowIdx = stripped.findIndex(row => row.includes(targetId))
  if (targetRowIdx < 0)
    return layout

  if (edge === 'left' || edge === 'right') {
    const nextRows = stripped.map((row, idx) => {
      if (idx !== targetRowIdx)
        return row
      const next = [...row]
      const colIdx = next.indexOf(targetId)
      next.splice(edge === 'left' ? colIdx : colIdx + 1, 0, fromId)
      return next
    })
    return { ...layout, rows: nextRows }
  }

  const nextRows = [...stripped]
  nextRows.splice(edge === 'top' ? targetRowIdx : targetRowIdx + 1, 0, [fromId])
  return { ...layout, rows: nextRows }
}

/** Moves `id` up (-1) or down (+1) one row (splitting it out if it currently shares a row). */
export function stepPaneRow(layout: WorkspaceLayout, id: WorkspacePaneId, delta: -1 | 1): WorkspaceLayout {
  const rowIdx = layout.rows.findIndex(row => row.includes(id))
  if (rowIdx < 0)
    return layout
  const row = layout.rows[rowIdx]
  // If sharing a row, extract into its own row above or below.
  if (row.length > 1) {
    const remaining = row.filter(pane => pane !== id)
    const nextRows = layout.rows.map((r, i) => (i === rowIdx ? remaining : [...r]))
    nextRows.splice(delta < 0 ? rowIdx : rowIdx + 1, 0, [id])
    return { ...layout, rows: nextRows }
  }
  const targetIdx = rowIdx + delta
  if (targetIdx < 0 || targetIdx >= layout.rows.length)
    return layout
  const nextRows = layout.rows.map(r => [...r])
  const [moved] = nextRows.splice(rowIdx, 1)
  nextRows.splice(targetIdx, 0, moved)
  return { ...layout, rows: nextRows }
}

/**
 * Toggles side-by-side docking for `id`:
 * - If sharing a row, un-splits it into its own row below.
 * - If alone in a row, pairs it side-by-side with an adjacent row (preferring the row below, else above).
 */
export function togglePaneSplit(layout: WorkspaceLayout, id: WorkspacePaneId): WorkspaceLayout {
  const rowIdx = layout.rows.findIndex(row => row.includes(id))
  if (rowIdx < 0)
    return layout
  const row = layout.rows[rowIdx]
  if (row.length > 1) {
    const remaining = row.filter(pane => pane !== id)
    const nextRows = layout.rows.map((r, i) => (i === rowIdx ? remaining : [...r]))
    nextRows.splice(rowIdx + 1, 0, [id])
    return { ...layout, rows: nextRows }
  }
  const neighborIdx = rowIdx + 1 < layout.rows.length ? rowIdx + 1 : rowIdx - 1
  if (neighborIdx < 0)
    return layout
  const neighborTarget = layout.rows[neighborIdx][layout.rows[neighborIdx].length - 1]
  return dockPane(layout, id, neighborTarget, rowIdx < neighborIdx ? 'left' : 'right')
}

/** Redistributes vertical height weights between two open rows while keeping both >= `minPx`. */
export function resizeAdjacentRows(
  layout: WorkspaceLayout,
  upperRowIdx: number,
  lowerRowIdx: number,
  deltaPx: number,
  totalOpenPx: number,
  minPx: number = MIN_PANE_HEIGHT_PX,
): WorkspaceLayout {
  if (totalOpenPx <= 0 || !Number.isFinite(deltaPx) || deltaPx === 0)
    return layout
  const upperRow = layout.rows[upperRowIdx]
  const lowerRow = layout.rows[lowerRowIdx]
  if (!upperRow || !lowerRow)
    return layout
  const upperOpen = upperRow.filter(id => !layout.collapsed[id])
  const lowerOpen = lowerRow.filter(id => !layout.collapsed[id])
  if (upperOpen.length === 0 || lowerOpen.length === 0)
    return layout

  const totalWeight = layout.rows.reduce((sum, r) => sum + rowHeightWeight(r, layout), 0)
  if (totalWeight <= 0)
    return layout

  const upperWeight = rowHeightWeight(upperRow, layout)
  const lowerWeight = rowHeightWeight(lowerRow, layout)
  const pairWeight = upperWeight + lowerWeight
  const minWeight = Math.min((minPx / totalOpenPx) * totalWeight, pairWeight * 0.45)
  const deltaWeight = (deltaPx / totalOpenPx) * totalWeight
  const nextUpper = Math.round(Math.max(minWeight, Math.min(pairWeight - minWeight, upperWeight + deltaWeight)) * 100) / 100
  const nextLower = Math.round((pairWeight - nextUpper) * 100) / 100

  const nextHeightWeights = { ...layout.heightWeights }
  for (const id of upperOpen)
    nextHeightWeights[id] = nextUpper
  for (const id of lowerOpen)
    nextHeightWeights[id] = nextLower

  return { ...layout, heightWeights: nextHeightWeights }
}

/** Redistributes horizontal width weights between two adjacent open panes in the same row. */
export function resizeAdjacentColumns(
  layout: WorkspaceLayout,
  leftId: WorkspacePaneId,
  rightId: WorkspacePaneId,
  deltaPx: number,
  rowWidthPx: number,
  minPx: number = MIN_PANE_WIDTH_PX,
): WorkspaceLayout {
  if (rowWidthPx <= 0 || !Number.isFinite(deltaPx) || deltaPx === 0)
    return layout
  const row = layout.rows.find(r => r.includes(leftId) && r.includes(rightId))
  if (!row)
    return layout
  const openInRow = row.filter(id => !layout.collapsed[id])
  if (!openInRow.includes(leftId) || !openInRow.includes(rightId))
    return layout

  const totalWeight = openInRow.reduce((sum, id) => sum + layout.widthWeights[id], 0)
  if (totalWeight <= 0)
    return layout

  const pairWeight = layout.widthWeights[leftId] + layout.widthWeights[rightId]
  const minWeight = Math.min((minPx / rowWidthPx) * totalWeight, pairWeight * 0.45)
  const deltaWeight = (deltaPx / rowWidthPx) * totalWeight
  const nextLeft = Math.round(Math.max(minWeight, Math.min(pairWeight - minWeight, layout.widthWeights[leftId] + deltaWeight)) * 100) / 100
  const nextRight = Math.round((pairWeight - nextLeft) * 100) / 100

  return {
    ...layout,
    widthWeights: {
      ...layout.widthWeights,
      [leftId]: nextLeft,
      [rightId]: nextRight,
    },
  }
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function browserStorage(): StorageLike | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined
  }
  catch {
    return undefined
  }
}

export function loadWorkspaceLayout(storage: StorageLike | undefined = browserStorage()): WorkspaceLayout {
  try {
    const raw = storage?.getItem(WORKSPACE_STORAGE_KEY)
    if (!raw)
      return cloneDefaultLayout()
    return sanitizeWorkspaceLayout(JSON.parse(raw))
  }
  catch {
    return cloneDefaultLayout()
  }
}

export function saveWorkspaceLayout(layout: WorkspaceLayout, storage: StorageLike | undefined = browserStorage()): void {
  try {
    storage?.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(layout))
  }
  catch {}
}

export function useWorkspaceLayout() {
  const [layout, setLayout] = useState<WorkspaceLayout>(() => loadWorkspaceLayout())

  const update = useCallback((updater: (prev: WorkspaceLayout) => WorkspaceLayout) => {
    setLayout((prev) => {
      const next = updater(prev)
      if (next !== prev)
        saveWorkspaceLayout(next)
      return next
    })
  }, [])

  const reset = useCallback(() => {
    const fresh = cloneDefaultLayout()
    setLayout(fresh)
    try {
      browserStorage()?.removeItem(WORKSPACE_STORAGE_KEY)
    }
    catch {}
  }, [])

  return {
    layout,
    isDefault: isDefaultWorkspaceLayout(layout),
    toggleCollapse: useCallback((id: WorkspacePaneId) => update(prev => togglePaneCollapsed(prev, id)), [update]),
    setOpen: useCallback((id: WorkspacePaneId, open: boolean) => update(prev => setPaneOpen(prev, id, open)), [update]),
    dock: useCallback((fromId: WorkspacePaneId, targetId: WorkspacePaneId, edge: DropEdge) => update(prev => dockPane(prev, fromId, targetId, edge)), [update]),
    stepRow: useCallback((id: WorkspacePaneId, delta: -1 | 1) => update(prev => stepPaneRow(prev, id, delta)), [update]),
    toggleSplit: useCallback((id: WorkspacePaneId) => update(prev => togglePaneSplit(prev, id)), [update]),
    resizeRows: useCallback(
      (upperRowIdx: number, lowerRowIdx: number, deltaPx: number, totalOpenPx: number) =>
        update(prev => resizeAdjacentRows(prev, upperRowIdx, lowerRowIdx, deltaPx, totalOpenPx)),
      [update],
    ),
    resizeCols: useCallback(
      (leftId: WorkspacePaneId, rightId: WorkspacePaneId, deltaPx: number, rowWidthPx: number) =>
        update(prev => resizeAdjacentColumns(prev, leftId, rightId, deltaPx, rowWidthPx)),
      [update],
    ),
    toggleAgentSide: useCallback(
      () => update(prev => ({ ...prev, agentSide: prev.agentSide === 'left' ? 'right' : 'left' })),
      [update],
    ),
    setTablesWidth: useCallback(
      (width: number) => update(prev => ({ ...prev, tablesWidth: clampTablesWidth(width) })),
      [update],
    ),
    setStudioView: useCallback(
      (studioView: StudioViewMode) => update(prev => (prev.studioView === studioView ? prev : { ...prev, studioView })),
      [update],
    ),
    resetHeightWeights: useCallback(
      () => update(prev => ({ ...prev, heightWeights: { ...DEFAULT_WORKSPACE_LAYOUT.heightWeights } })),
      [update],
    ),
    resetWidthWeights: useCallback(
      () => update(prev => ({ ...prev, widthWeights: { ...DEFAULT_WORKSPACE_LAYOUT.widthWeights } })),
      [update],
    ),
    reset,
  }
}
