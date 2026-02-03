export interface WidgetViewState {
  activeTab: 'ai' | 'grid' | 'pivot' | 'chart'
  columns?: string[]
  sortOrder?: { column: string, direction: 'asc' | 'desc' }[]
  filters?: Record<string, unknown>
}

const STORAGE_PREFIX = 'tinypivot-widget-state-'
const LAST_PAGE_KEY = 'tinypivot-last-page'

export function saveWidgetState(widgetId: string, state: Partial<WidgetViewState>): void {
  try {
    const existing = getWidgetState(widgetId)
    const merged = { ...existing, ...state }
    localStorage.setItem(`${STORAGE_PREFIX}${widgetId}`, JSON.stringify(merged))
  }
  catch (err) {
    console.warn('Failed to save widget state:', err)
  }
}

export function getWidgetState(widgetId: string): WidgetViewState | null {
  try {
    const stored = localStorage.getItem(`${STORAGE_PREFIX}${widgetId}`)
    return stored ? JSON.parse(stored) : null
  }
  catch {
    return null
  }
}

export function clearWidgetState(widgetId: string): void {
  localStorage.removeItem(`${STORAGE_PREFIX}${widgetId}`)
}

export function saveLastPage(pageId: string): void {
  try {
    localStorage.setItem(LAST_PAGE_KEY, pageId)
  }
  catch (err) {
    console.warn('Failed to save last page:', err)
  }
}

export function getLastPage(): string | null {
  return localStorage.getItem(LAST_PAGE_KEY)
}

export function clearLastPage(): void {
  localStorage.removeItem(LAST_PAGE_KEY)
}
