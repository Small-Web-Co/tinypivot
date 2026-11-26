import { beforeEach, describe, expect, it } from 'vitest'
import { clampStudioWidth, MIN_STUDIO_WIDTH } from '../../packages/mcp/app/StudioResizer'
import {
  clampTablesWidth,
  cloneDefaultLayout,
  DEFAULT_WORKSPACE_LAYOUT,
  dockPane,
  isDefaultWorkspaceLayout,
  loadWorkspaceLayout,
  MAX_TABLES_WIDTH_PX,
  MIN_TABLES_WIDTH_PX,
  resizeAdjacentColumns,
  resizeAdjacentRows,
  sanitizeWorkspaceLayout,
  saveWorkspaceLayout,
  setPaneOpen,
  stepPaneRow,
  togglePaneCollapsed,
  togglePaneSplit,
} from '../../packages/mcp/app/workspaceLayout'

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value) },
    removeItem: (key: string) => { map.delete(key) },
  }
}

describe('resizing the Studio', () => {
  it('keeps both the Studio and the grid usable', () => {
    expect(clampStudioWidth(520.4, 1440)).toBe(520)
    expect(clampStudioWidth(40, 1440)).toBe(MIN_STUDIO_WIDTH)
    // Dragged almost to the right edge, the grid keeps its minimum.
    expect(clampStudioWidth(1400, 1440)).toBe(1080)
  })
})

describe('flexible 2D workspace layout (height & width persistence)', () => {
  let storage: ReturnType<typeof memoryStorage>

  beforeEach(() => {
    storage = memoryStorage()
  })

  it('defaults to SQL collapsed on top, Chart/Pivot middle, Data Frame bottom, Agent on left', () => {
    const layout = loadWorkspaceLayout(storage)
    expect(layout.rows).toEqual([['sql'], ['visual'], ['data']])
    expect(layout.collapsed).toEqual({ sql: true, visual: false, data: false })
    expect(layout.agentSide).toBe('left')
    expect(layout.tablesWidth).toBe(220)
    expect(isDefaultWorkspaceLayout(layout)).toBe(true)
  })

  it('docks panes on all 4 edges (top, bottom, left, right) and persists to localStorage', () => {
    let layout = cloneDefaultLayout()
    // Put Data Frame side-by-side to the right of Visual
    layout = dockPane(layout, 'data', 'visual', 'right')
    expect(layout.rows).toEqual([['sql'], ['visual', 'data']])
    expect(isDefaultWorkspaceLayout(layout)).toBe(false)

    // Dock SQL to the left of Visual (all 3 side-by-side)
    layout = dockPane(layout, 'sql', 'visual', 'left')
    expect(layout.rows).toEqual([['sql', 'visual', 'data']])

    // Dock Data Frame into its own row at the top
    layout = dockPane(layout, 'data', 'sql', 'top')
    expect(layout.rows).toEqual([['data'], ['sql', 'visual']])

    // Dock Data Frame below the sql+visual row
    layout = dockPane(layout, 'data', 'visual', 'bottom')
    expect(layout.rows).toEqual([['sql', 'visual'], ['data']])

    saveWorkspaceLayout(layout, storage)
    expect(loadWorkspaceLayout(storage)).toEqual(layout)
  })

  it('toggles side-by-side split and steps rows cleanly', () => {
    let layout = cloneDefaultLayout()
    // Splitting visual pairs it side-by-side with the row below (data)
    layout = togglePaneSplit(layout, 'visual')
    expect(layout.rows).toEqual([['sql'], ['visual', 'data']])

    // Stepping data up extracts it into its own row above visual
    layout = stepPaneRow(layout, 'data', -1)
    expect(layout.rows).toEqual([['sql'], ['data'], ['visual']])

    // Stepping data up again moves it above sql
    layout = stepPaneRow(layout, 'data', -1)
    expect(layout.rows).toEqual([['data'], ['sql'], ['visual']])

    // Un-splitting after pairing restores separate rows
    layout = togglePaneSplit(layout, 'sql')
    expect(layout.rows).toEqual([['data'], ['sql', 'visual']])
    layout = togglePaneSplit(layout, 'sql')
    expect(layout.rows).toEqual([['data'], ['visual'], ['sql']])
  })

  it('collapses and expands panes while keeping at least one pane open', () => {
    let layout = cloneDefaultLayout()
    layout = togglePaneCollapsed(layout, 'sql')
    expect(layout.collapsed.sql).toBe(false)

    layout = setPaneOpen(layout, 'sql', false)
    layout = setPaneOpen(layout, 'data', false)
    expect(layout.collapsed).toEqual({ sql: true, visual: false, data: true })

    // Trying to collapse the last remaining open pane is ignored.
    const unchanged = togglePaneCollapsed(layout, 'visual')
    expect(unchanged.collapsed.visual).toBe(false)
  })

  it('redistributes vertical height weights between adjacent open rows while respecting min height', () => {
    const layout = cloneDefaultLayout()
    const resized = resizeAdjacentRows(layout, 1, 2, -100, 500, 110)
    expect(resized.heightWeights.visual).toBeLessThan(layout.heightWeights.visual)
    expect(resized.heightWeights.data).toBeGreaterThan(layout.heightWeights.data)
    expect(resized.heightWeights.visual + resized.heightWeights.data).toBeCloseTo(
      layout.heightWeights.visual + layout.heightWeights.data,
      1,
    )

    // Extreme drag clamps both rows so neither collapses below min height.
    const extreme = resizeAdjacentRows(layout, 1, 2, -5000, 500, 110)
    expect(extreme.heightWeights.visual).toBeGreaterThan(0)
  })

  it('redistributes horizontal width weights between side-by-side panes while respecting min width', () => {
    const split = dockPane(cloneDefaultLayout(), 'data', 'visual', 'right')
    const resized = resizeAdjacentColumns(split, 'visual', 'data', 120, 1000, 240)
    expect(resized.widthWeights.visual).toBeGreaterThan(split.widthWeights.visual)
    expect(resized.widthWeights.data).toBeLessThan(split.widthWeights.data)
    expect(resized.widthWeights.visual + resized.widthWeights.data).toBeCloseTo(
      split.widthWeights.visual + split.widthWeights.data,
      1,
    )

    const extreme = resizeAdjacentColumns(split, 'visual', 'data', 5000, 1000, 240)
    expect(extreme.widthWeights.data).toBeGreaterThan(0)
  })

  it('clamps SQL tables sidebar width and persists agentSide + weights together', () => {
    expect(clampTablesWidth(40)).toBe(MIN_TABLES_WIDTH_PX)
    expect(clampTablesWidth(900)).toBe(MAX_TABLES_WIDTH_PX)
    expect(clampTablesWidth(265.6)).toBe(266)

    const custom = {
      ...dockPane(cloneDefaultLayout(), 'data', 'visual', 'right'),
      agentSide: 'right' as const,
      tablesWidth: 300,
    }
    saveWorkspaceLayout(custom, storage)
    const loaded = loadWorkspaceLayout(storage)
    expect(loaded).toEqual(custom)
    expect(isDefaultWorkspaceLayout(loaded)).toBe(false)
  })

  it('recovers gracefully from corrupt or invalid stored layouts', () => {
    expect(sanitizeWorkspaceLayout(null)).toEqual(DEFAULT_WORKSPACE_LAYOUT)
    expect(sanitizeWorkspaceLayout({
      rows: [['sql', 'sql'], ['bogus']],
      collapsed: { sql: true, visual: true, data: true },
      agentSide: 'invalid',
      tablesWidth: 9999,
    })).toEqual({
      ...DEFAULT_WORKSPACE_LAYOUT,
      collapsed: { sql: true, visual: false, data: true },
      tablesWidth: MAX_TABLES_WIDTH_PX,
    })
  })
})
