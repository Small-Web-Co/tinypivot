/**
 * Postgres Storage Adapter (Client-Side)
 *
 * This adapter communicates with a REST API endpoint that handles
 * the actual database operations using Drizzle ORM on the server side.
 *
 * The consumer is responsible for implementing the server-side API handlers
 * that use the Drizzle schema provided by this package.
 */

import type {
  Page,
  PageCreateInput,
  PageListFilter,
  PageListItem,
  PageShare,
  PageShareSettings,
  PageSnapshot,
  PageUpdateInput,
  PageVersion,
  PaginatedResult,
  StorageAdapter,
  WidgetConfig,
  WidgetCreateInput,
  WidgetUpdateInput,
} from '@smallwebco/tinypivot-studio'
import type { ApiResponse, HttpMethod, PostgresStorageOptions } from './types'
import { MAX_VERSIONS_PER_PAGE } from '@smallwebco/tinypivot-studio'
import { PostgresStorageError } from './types'

/**
 * Default timeout for API requests (30 seconds)
 */
const DEFAULT_TIMEOUT = 30000

/**
 * Create a Postgres storage adapter that communicates with a REST API
 *
 * This is a client-side adapter that makes HTTP requests to your server's
 * TinyPivot API endpoint. You must implement the server-side handlers
 * using the Drizzle schema provided by this package.
 *
 * @example
 * ```ts
 * import { createPostgresStorage } from '@smallwebco/tinypivot-storage-postgres'
 *
 * const storage = createPostgresStorage({
 *   baseUrl: '/api/tinypivot',
 *   headers: {
 *     Authorization: `Bearer ${token}`,
 *   },
 * })
 *
 * await storage.initialize()
 * const pages = await storage.listPages()
 * ```
 */
export function createPostgresStorage(options: PostgresStorageOptions): StorageAdapter {
  const {
    baseUrl,
    fetch: customFetch = globalThis.fetch,
    headers: defaultHeaders = {},
    timeout = DEFAULT_TIMEOUT,
    maxVersionsPerPage = MAX_VERSIONS_PER_PAGE,
  } = options

  // Remove trailing slash from baseUrl
  const apiBase = baseUrl.replace(/\/$/, '')

  /**
   * Make an HTTP request to the API
   */
  async function request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${apiBase}${path}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await customFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...defaultHeaders,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const json = await response.json() as ApiResponse<T>

      if (!response.ok || !json.success) {
        throw new PostgresStorageError(
          json.error ?? `Request failed with status ${response.status}`,
          json.code,
          response.status,
        )
      }

      return json.data as T
    }
    catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof PostgresStorageError) {
        throw error
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new PostgresStorageError('Request timeout', 'TIMEOUT')
      }

      throw new PostgresStorageError(
        error instanceof Error ? error.message : 'Unknown error',
        'NETWORK_ERROR',
      )
    }
  }

  /**
   * Convert API response dates from strings to Date objects
   */
  function parseDates<T>(obj: T): T {
    if (typeof obj !== 'object' || obj === null) {
      return obj
    }

    const dateFields = ['createdAt', 'updatedAt', 'publishedAt', 'lastAccessedAt', 'expiresAt']
    const result = { ...obj } as Record<string, unknown>

    for (const field of dateFields) {
      if (field in result && typeof result[field] === 'string') {
        result[field] = new Date(result[field] as string)
      }
    }

    // Handle nested settings.expiresAt for shares
    if ('settings' in result && typeof result.settings === 'object' && result.settings !== null) {
      const settings = { ...(result.settings as Record<string, unknown>) }
      if ('expiresAt' in settings && typeof settings.expiresAt === 'string') {
        settings.expiresAt = new Date(settings.expiresAt)
      }
      result.settings = settings
    }

    return result as T
  }

  /**
   * Convert an array of objects with dates
   */
  function parseDateArray<T>(arr: T[]): T[] {
    return arr.map(parseDates)
  }

  // ============================================================================
  // Page Operations
  // ============================================================================

  async function listPages(filter: PageListFilter = {}): Promise<PaginatedResult<PageListItem>> {
    const params = new URLSearchParams()

    if (filter.published !== undefined)
      params.set('published', String(filter.published))
    if (filter.archived !== undefined)
      params.set('archived', String(filter.archived))
    if (filter.createdBy !== undefined)
      params.set('createdBy', filter.createdBy)
    if (filter.tags && filter.tags.length > 0)
      params.set('tags', filter.tags.join(','))
    if (filter.search !== undefined)
      params.set('search', filter.search)
    if (filter.sortBy !== undefined)
      params.set('sortBy', filter.sortBy)
    if (filter.sortDirection !== undefined)
      params.set('sortDirection', filter.sortDirection)
    if (filter.offset !== undefined)
      params.set('offset', String(filter.offset))
    if (filter.limit !== undefined)
      params.set('limit', String(filter.limit))

    const queryString = params.toString()
    const path = `/pages${queryString ? `?${queryString}` : ''}`

    const result = await request<PaginatedResult<PageListItem>>('GET', path)

    return {
      ...result,
      items: parseDateArray(result.items),
    }
  }

  async function getPage(id: string): Promise<Page | null> {
    try {
      const page = await request<Page>('GET', `/pages/${id}`)
      return parseDates(page)
    }
    catch (error) {
      if (error instanceof PostgresStorageError && error.status === 404) {
        return null
      }
      throw error
    }
  }

  async function getPageBySlug(slug: string): Promise<Page | null> {
    try {
      const page = await request<Page>('GET', `/pages/by-slug/${encodeURIComponent(slug)}`)
      return parseDates(page)
    }
    catch (error) {
      if (error instanceof PostgresStorageError && error.status === 404) {
        return null
      }
      throw error
    }
  }

  async function createPage(input: PageCreateInput): Promise<Page> {
    const page = await request<Page>('POST', '/pages', input)
    return parseDates(page)
  }

  async function updatePage(id: string, input: PageUpdateInput): Promise<Page> {
    const page = await request<Page>('PATCH', `/pages/${id}`, input)
    return parseDates(page)
  }

  async function deletePage(id: string): Promise<void> {
    await request<void>('DELETE', `/pages/${id}`)
  }

  async function duplicatePage(id: string, newTitle?: string): Promise<Page> {
    const page = await request<Page>('POST', `/pages/${id}/duplicate`, { newTitle })
    return parseDates(page)
  }

  // ============================================================================
  // Widget Operations
  // ============================================================================

  async function listWidgets(pageId?: string): Promise<WidgetConfig[]> {
    const path = pageId ? `/widgets?pageId=${pageId}` : '/widgets'
    const widgetList = await request<WidgetConfig[]>('GET', path)
    return parseDateArray(widgetList)
  }

  async function getWidget(id: string): Promise<WidgetConfig | null> {
    try {
      const widget = await request<WidgetConfig>('GET', `/widgets/${id}`)
      return parseDates(widget)
    }
    catch (error) {
      if (error instanceof PostgresStorageError && error.status === 404) {
        return null
      }
      throw error
    }
  }

  async function createWidget(input: WidgetCreateInput): Promise<WidgetConfig> {
    const widget = await request<WidgetConfig>('POST', '/widgets', input)
    return parseDates(widget)
  }

  async function updateWidget(id: string, input: WidgetUpdateInput): Promise<WidgetConfig> {
    const widget = await request<WidgetConfig>('PATCH', `/widgets/${id}`, input)
    return parseDates(widget)
  }

  async function deleteWidget(id: string): Promise<void> {
    await request<void>('DELETE', `/widgets/${id}`)
  }

  async function duplicateWidget(id: string, newName?: string): Promise<WidgetConfig> {
    const widget = await request<WidgetConfig>('POST', `/widgets/${id}/duplicate`, { newName })
    return parseDates(widget)
  }

  // ============================================================================
  // Version Operations
  // ============================================================================

  async function listVersions(pageId: string): Promise<PageVersion[]> {
    const versionList = await request<PageVersion[]>('GET', `/pages/${pageId}/versions`)
    return parseDateArray(versionList)
  }

  async function getVersion(versionId: string): Promise<PageVersion | null> {
    try {
      const version = await request<PageVersion>('GET', `/versions/${versionId}`)
      return parseDates(version)
    }
    catch (error) {
      if (error instanceof PostgresStorageError && error.status === 404) {
        return null
      }
      throw error
    }
  }

  async function createVersion(pageId: string, description?: string): Promise<PageVersion> {
    const version = await request<PageVersion>('POST', `/pages/${pageId}/versions`, {
      description,
      maxVersionsPerPage,
    })
    return parseDates(version)
  }

  async function restoreVersion(pageId: string, versionId: string): Promise<Page> {
    const page = await request<Page>('POST', `/pages/${pageId}/versions/${versionId}/restore`)
    return parseDates(page)
  }

  async function deleteVersion(versionId: string): Promise<void> {
    await request<void>('DELETE', `/versions/${versionId}`)
  }

  async function pruneVersions(pageId: string): Promise<void> {
    await request<void>('POST', `/pages/${pageId}/versions/prune`, { maxVersionsPerPage })
  }

  // ============================================================================
  // Share Operations
  // ============================================================================

  async function getShareSettings(pageId: string): Promise<PageShareSettings | null> {
    try {
      const settings = await request<PageShareSettings>('GET', `/pages/${pageId}/share/settings`)
      return parseDates(settings)
    }
    catch (error) {
      if (error instanceof PostgresStorageError && error.status === 404) {
        return null
      }
      throw error
    }
  }

  async function updateShareSettings(
    pageId: string,
    settings: Partial<PageShareSettings>,
  ): Promise<PageShareSettings> {
    const result = await request<PageShareSettings>(
      'PATCH',
      `/pages/${pageId}/share/settings`,
      settings,
    )
    return parseDates(result)
  }

  async function getShareByToken(token: string): Promise<PageShare | null> {
    try {
      const share = await request<PageShare>('GET', `/shares/${token}`)
      return parseDates(share)
    }
    catch (error) {
      if (error instanceof PostgresStorageError && error.status === 404) {
        return null
      }
      throw error
    }
  }

  async function createShare(
    pageId: string,
    settings?: Partial<PageShareSettings>,
  ): Promise<PageShare> {
    const share = await request<PageShare>('POST', `/pages/${pageId}/share`, settings)
    return parseDates(share)
  }

  async function revokeShare(token: string): Promise<void> {
    await request<void>('DELETE', `/shares/${token}`)
  }

  async function revokeAllShares(pageId: string): Promise<void> {
    await request<void>('DELETE', `/pages/${pageId}/shares`)
  }

  async function recordShareView(token: string): Promise<void> {
    await request<void>('POST', `/shares/${token}/view`)
  }

  // ============================================================================
  // Snapshot Operations
  // ============================================================================

  async function getSnapshot(versionId: string): Promise<PageSnapshot | null> {
    try {
      const snapshot = await request<PageSnapshot>('GET', `/versions/${versionId}/snapshot`)
      return parseDates(snapshot)
    }
    catch (error) {
      if (error instanceof PostgresStorageError && error.status === 404) {
        return null
      }
      throw error
    }
  }

  // ============================================================================
  // Utility Operations
  // ============================================================================

  async function isSlugAvailable(slug: string, excludePageId?: string): Promise<boolean> {
    const params = new URLSearchParams({ slug })
    if (excludePageId) {
      params.set('excludePageId', excludePageId)
    }
    const result = await request<{ available: boolean }>('GET', `/pages/slug-available?${params}`)
    return result.available
  }

  async function generateSlug(title: string): Promise<string> {
    const result = await request<{ slug: string }>('POST', '/pages/generate-slug', { title })
    return result.slug
  }

  async function initialize(): Promise<void> {
    // Verify connection by making a simple request
    await request<{ ok: boolean }>('GET', '/health')
  }

  async function close(): Promise<void> {
    // No persistent connection to close for HTTP adapter
  }

  async function clear(): Promise<void> {
    await request<void>('POST', '/clear')
  }

  // Return the storage adapter
  return {
    // Page operations
    listPages,
    getPage,
    getPageBySlug,
    createPage,
    updatePage,
    deletePage,
    duplicatePage,

    // Widget operations
    listWidgets,
    getWidget,
    createWidget,
    updateWidget,
    deleteWidget,
    duplicateWidget,

    // Version operations
    listVersions,
    getVersion,
    createVersion,
    restoreVersion,
    deleteVersion,
    pruneVersions,

    // Share operations
    getShareSettings,
    updateShareSettings,
    getShareByToken,
    createShare,
    revokeShare,
    revokeAllShares,
    recordShareView,

    // Snapshot operations
    getSnapshot,

    // Utility operations
    isSlugAvailable,
    generateSlug,
    initialize,
    close,
    clear,
  }
}
