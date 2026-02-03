/**
 * IndexedDB Storage Adapter Implementation
 * Provides browser-based persistent storage for TinyPivot Studio
 */

import type {
  ListPublicSharesOptions,
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
  PublicShareListItem,
  StorageAdapter,
  WidgetConfig,
  WidgetCreateInput,
  WidgetUpdateInput,
} from '@smallwebco/tinypivot-studio'
import type { IDBPDatabase } from 'idb'
import type { StoredShare, StoredWidget, TinyPivotDBSchema } from './schema'
import {
  createDefaultShareSettings,
  generateShareToken,
  generateUUID,
  MAX_VERSIONS_PER_PAGE,
} from '@smallwebco/tinypivot-studio'
import { openDB } from 'idb'
import {
  DB_NAME,
  DB_VERSION,
  fromStoredPage,
  fromStoredShare,
  fromStoredVersion,
  fromStoredWidget,
  toStoredPage,
  toStoredShare,
  toStoredVersion,
  toStoredWidget,
} from './schema'

/**
 * Options for creating an IndexedDB storage adapter
 */
export interface IndexedDBStorageOptions {
  /** Custom database name (default: 'tinypivot-studio') */
  dbName?: string
  /** Custom database version (default: 1) */
  dbVersion?: number
  /** Maximum versions to keep per page (default: 20) */
  maxVersionsPerPage?: number
}

/**
 * Hash a password using SHA-256
 */
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Generate a URL-friendly slug from a title
 */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Create an IndexedDB storage adapter
 */
export function createIndexedDBStorage(options: IndexedDBStorageOptions = {}): StorageAdapter {
  const dbName = options.dbName ?? DB_NAME
  const dbVersion = options.dbVersion ?? DB_VERSION
  const maxVersions = options.maxVersionsPerPage ?? MAX_VERSIONS_PER_PAGE

  // Lazy database connection
  let db: IDBPDatabase<TinyPivotDBSchema> | null = null

  /**
   * Get or create the database connection
   */
  async function getDB(): Promise<IDBPDatabase<TinyPivotDBSchema>> {
    if (db)
      return db

    db = await openDB<TinyPivotDBSchema>(dbName, dbVersion, {
      upgrade(database) {
        // Create pages store
        if (!database.objectStoreNames.contains('pages')) {
          const pagesStore = database.createObjectStore('pages', { keyPath: 'id' })
          pagesStore.createIndex('by-slug', 'slug', { unique: true })
          pagesStore.createIndex('by-updated', 'updatedAt')
          pagesStore.createIndex('by-created', 'createdAt')
        }

        // Create widgets store
        if (!database.objectStoreNames.contains('widgets')) {
          const widgetsStore = database.createObjectStore('widgets', { keyPath: 'id' })
          widgetsStore.createIndex('by-page', 'pageId')
          widgetsStore.createIndex('by-datasource', 'datasourceId')
        }

        // Create versions store
        if (!database.objectStoreNames.contains('versions')) {
          const versionsStore = database.createObjectStore('versions', { keyPath: 'id' })
          versionsStore.createIndex('by-page', 'pageId')
          versionsStore.createIndex('by-page-version', ['pageId', 'version'])
          versionsStore.createIndex('by-created', 'createdAt')
        }

        // Create shares store
        if (!database.objectStoreNames.contains('shares')) {
          const sharesStore = database.createObjectStore('shares', { keyPath: 'token' })
          sharesStore.createIndex('by-page', 'pageId')
          sharesStore.createIndex('by-token', 'token', { unique: true })
        }
      },
    })

    return db
  }

  // ============================================================================
  // Page Operations
  // ============================================================================

  async function listPages(filter: PageListFilter = {}): Promise<PaginatedResult<PageListItem>> {
    const database = await getDB()
    const tx = database.transaction('pages', 'readonly')
    const store = tx.objectStore('pages')

    // Get all pages (we'll filter in memory for complex queries)
    let pages = await store.getAll()

    // Apply filters
    if (filter.published !== undefined) {
      pages = pages.filter(p => p.published === filter.published)
    }
    if (filter.archived !== undefined) {
      pages = pages.filter(p => p.archived === filter.archived)
    }
    if (filter.createdBy !== undefined) {
      pages = pages.filter(p => p.createdBy === filter.createdBy)
    }
    if (filter.tags && filter.tags.length > 0) {
      pages = pages.filter(p => p.tags?.some(t => filter.tags!.includes(t)))
    }
    if (filter.search) {
      const searchLower = filter.search.toLowerCase()
      pages = pages.filter(p =>
        p.title.toLowerCase().includes(searchLower)
        || p.description?.toLowerCase().includes(searchLower),
      )
    }

    const total = pages.length

    // Sort
    const sortBy = filter.sortBy ?? 'updatedAt'
    const sortDir = filter.sortDirection ?? 'desc'
    pages.sort((a, b) => {
      let aVal: string | Date
      let bVal: string | Date
      switch (sortBy) {
        case 'title':
          aVal = a.title
          bVal = b.title
          break
        case 'createdAt':
          aVal = a.createdAt
          bVal = b.createdAt
          break
        default:
          aVal = a.updatedAt
          bVal = b.updatedAt
      }
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })

    // Paginate
    const offset = filter.offset ?? 0
    const limit = filter.limit ?? 50
    const paginatedPages = pages.slice(offset, offset + limit)

    // Convert to PageListItem
    const items: PageListItem[] = paginatedPages.map(p => ({
      id: p.id,
      title: p.title,
      description: p.description,
      slug: p.slug,
      template: p.template,
      published: p.published,
      archived: p.archived,
      createdAt: new Date(p.createdAt),
      updatedAt: new Date(p.updatedAt),
      createdBy: p.createdBy,
      tags: p.tags,
    }))

    return {
      items,
      total,
      offset,
      limit,
      hasMore: offset + limit < total,
    }
  }

  async function getPage(id: string): Promise<Page | null> {
    const database = await getDB()
    const stored = await database.get('pages', id)
    return stored ? fromStoredPage(stored) : null
  }

  async function getPageBySlug(slug: string): Promise<Page | null> {
    const database = await getDB()
    const stored = await database.getFromIndex('pages', 'by-slug', slug)
    return stored ? fromStoredPage(stored) : null
  }

  async function createPage(input: PageCreateInput): Promise<Page> {
    const database = await getDB()
    const now = new Date()
    const id = generateUUID()

    // Generate slug if not provided
    let slug = input.slug ?? slugify(input.title)

    // Ensure slug is unique
    let slugSuffix = 0
    const originalSlug = slug
    while (await database.getFromIndex('pages', 'by-slug', slug)) {
      slugSuffix++
      slug = `${originalSlug}-${slugSuffix}`
    }

    const page: Page = {
      id,
      title: input.title,
      description: input.description,
      slug,
      template: input.template,
      theme: input.theme,
      blocks: input.blocks ?? [],
      widgets: [],
      filters: [],
      fieldLinks: [],
      published: false,
      archived: false,
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy,
      tags: input.tags,
    }

    await database.put('pages', toStoredPage(page))
    return page
  }

  async function updatePage(id: string, input: PageUpdateInput): Promise<Page> {
    const database = await getDB()
    const existing = await database.get('pages', id)
    if (!existing) {
      throw new Error(`Page not found: ${id}`)
    }

    const page = fromStoredPage(existing)
    const now = new Date()

    // Check slug uniqueness if changing
    if (input.slug && input.slug !== page.slug) {
      const existingWithSlug = await database.getFromIndex('pages', 'by-slug', input.slug)
      if (existingWithSlug && existingWithSlug.id !== id) {
        throw new Error(`Slug already in use: ${input.slug}`)
      }
    }

    const updated: Page = {
      ...page,
      title: input.title ?? page.title,
      description: input.description !== undefined ? input.description : page.description,
      slug: input.slug ?? page.slug,
      theme: input.theme !== undefined ? input.theme : page.theme,
      blocks: input.blocks ?? page.blocks,
      widgets: input.widgets ?? page.widgets,
      filters: input.filters ?? page.filters,
      fieldLinks: input.fieldLinks ?? page.fieldLinks,
      published: input.published ?? page.published,
      archived: input.archived ?? page.archived,
      updatedAt: now,
      updatedBy: input.updatedBy,
      tags: input.tags ?? page.tags,
      metadata: input.metadata ?? page.metadata,
      publishedAt: input.published && !page.published ? now : page.publishedAt,
    }

    await database.put('pages', toStoredPage(updated))
    return updated
  }

  async function deletePage(id: string): Promise<void> {
    const database = await getDB()

    // Delete associated versions
    const versions = await database.getAllFromIndex('versions', 'by-page', id)
    const tx1 = database.transaction('versions', 'readwrite')
    for (const v of versions) {
      await tx1.store.delete(v.id)
    }
    await tx1.done

    // Delete associated shares
    const shares = await database.getAllFromIndex('shares', 'by-page', id)
    const tx2 = database.transaction('shares', 'readwrite')
    for (const s of shares) {
      await tx2.store.delete(s.token)
    }
    await tx2.done

    // Delete the page
    await database.delete('pages', id)
  }

  async function duplicatePage(id: string, newTitle?: string): Promise<Page> {
    const page = await getPage(id)
    if (!page) {
      throw new Error(`Page not found: ${id}`)
    }

    const title = newTitle ?? `${page.title} (Copy)`
    return createPage({
      title,
      description: page.description,
      template: page.template,
      theme: page.theme,
      blocks: page.blocks,
      createdBy: page.createdBy,
      tags: page.tags,
    })
  }

  // ============================================================================
  // Widget Operations
  // ============================================================================

  async function listWidgets(pageId?: string): Promise<WidgetConfig[]> {
    const database = await getDB()
    let widgets: StoredWidget[]

    if (pageId) {
      widgets = await database.getAllFromIndex('widgets', 'by-page', pageId)
    }
    else {
      widgets = await database.getAll('widgets')
    }

    return widgets.map(fromStoredWidget)
  }

  async function getWidget(id: string): Promise<WidgetConfig | null> {
    const database = await getDB()
    const stored = await database.get('widgets', id)
    return stored ? fromStoredWidget(stored) : null
  }

  async function createWidget(input: WidgetCreateInput): Promise<WidgetConfig> {
    const database = await getDB()
    const now = new Date()
    const id = generateUUID()

    const widget: WidgetConfig = {
      id,
      name: input.name,
      description: input.description,
      datasourceId: input.datasourceId,
      query: input.query,
      visualization: input.visualization,
      tableConfig: input.tableConfig,
      pivotConfig: input.pivotConfig,
      chartConfig: input.chartConfig,
      kpiConfig: input.kpiConfig,
      filters: [],
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy,
    }

    await database.put('widgets', toStoredWidget(widget))
    return widget
  }

  async function updateWidget(id: string, input: WidgetUpdateInput): Promise<WidgetConfig> {
    const database = await getDB()
    const existing = await database.get('widgets', id)
    if (!existing) {
      throw new Error(`Widget not found: ${id}`)
    }

    const widget = fromStoredWidget(existing)
    const now = new Date()

    const updated: WidgetConfig = {
      ...widget,
      name: input.name ?? widget.name,
      description: input.description !== undefined ? input.description : widget.description,
      query: input.query !== undefined ? input.query : widget.query,
      visualization: input.visualization ?? widget.visualization,
      tableConfig: input.tableConfig !== undefined ? input.tableConfig : widget.tableConfig,
      pivotConfig: input.pivotConfig !== undefined ? input.pivotConfig : widget.pivotConfig,
      chartConfig: input.chartConfig !== undefined ? input.chartConfig : widget.chartConfig,
      kpiConfig: input.kpiConfig !== undefined ? input.kpiConfig : widget.kpiConfig,
      filters: input.filters ?? widget.filters,
      updatedAt: now,
    }

    await database.put('widgets', toStoredWidget(updated, existing.pageId))
    return updated
  }

  async function deleteWidget(id: string): Promise<void> {
    const database = await getDB()
    await database.delete('widgets', id)
  }

  async function duplicateWidget(id: string, newName?: string): Promise<WidgetConfig> {
    const widget = await getWidget(id)
    if (!widget) {
      throw new Error(`Widget not found: ${id}`)
    }

    const name = newName ?? `${widget.name} (Copy)`
    return createWidget({
      name,
      description: widget.description,
      datasourceId: widget.datasourceId,
      query: widget.query,
      visualization: widget.visualization,
      tableConfig: widget.tableConfig,
      pivotConfig: widget.pivotConfig,
      chartConfig: widget.chartConfig,
      kpiConfig: widget.kpiConfig,
      createdBy: widget.createdBy,
    })
  }

  // ============================================================================
  // Version Operations
  // ============================================================================

  async function listVersions(pageId: string): Promise<PageVersion[]> {
    const database = await getDB()
    const versions = await database.getAllFromIndex('versions', 'by-page', pageId)
    // Sort by version number descending (newest first)
    versions.sort((a, b) => b.version - a.version)
    return versions.map(fromStoredVersion)
  }

  async function getVersion(versionId: string): Promise<PageVersion | null> {
    const database = await getDB()
    const stored = await database.get('versions', versionId)
    return stored ? fromStoredVersion(stored) : null
  }

  async function createVersion(pageId: string, description?: string): Promise<PageVersion> {
    const database = await getDB()
    const page = await getPage(pageId)
    if (!page) {
      throw new Error(`Page not found: ${pageId}`)
    }

    // Get existing versions to determine version number
    const existingVersions = await database.getAllFromIndex('versions', 'by-page', pageId)
    const maxVersion = existingVersions.reduce((max, v) => Math.max(max, v.version), 0)

    const version: PageVersion = {
      id: generateUUID(),
      pageId,
      version: maxVersion + 1,
      title: page.title,
      description: page.description,
      blocks: page.blocks,
      widgets: page.widgets,
      theme: page.theme,
      createdAt: new Date(),
      createdBy: page.updatedBy ?? page.createdBy,
      changeDescription: description,
    }

    await database.put('versions', toStoredVersion(version))

    // Prune old versions
    await pruneVersions(pageId)

    return version
  }

  async function restoreVersion(pageId: string, versionId: string): Promise<Page> {
    const version = await getVersion(versionId)
    if (!version) {
      throw new Error(`Version not found: ${versionId}`)
    }

    if (version.pageId !== pageId) {
      throw new Error(`Version ${versionId} does not belong to page ${pageId}`)
    }

    // Create a backup version before restoring
    await createVersion(pageId, `Backup before restore to version ${version.version}`)

    // Restore the page content
    return updatePage(pageId, {
      title: version.title,
      description: version.description,
      blocks: version.blocks,
      widgets: version.widgets,
      theme: version.theme,
    })
  }

  async function deleteVersion(versionId: string): Promise<void> {
    const database = await getDB()
    await database.delete('versions', versionId)
  }

  async function pruneVersions(pageId: string): Promise<void> {
    const database = await getDB()
    const versions = await database.getAllFromIndex('versions', 'by-page', pageId)

    if (versions.length <= maxVersions) {
      return
    }

    // Sort by version number descending
    versions.sort((a, b) => b.version - a.version)

    // Delete versions beyond the limit
    const toDelete = versions.slice(maxVersions)
    const tx = database.transaction('versions', 'readwrite')
    for (const v of toDelete) {
      await tx.store.delete(v.id)
    }
    await tx.done
  }

  // ============================================================================
  // Share Operations
  // ============================================================================

  async function getShareSettings(pageId: string): Promise<PageShareSettings | null> {
    const database = await getDB()
    const shares = await database.getAllFromIndex('shares', 'by-page', pageId)
    const activeShare = shares.find(s => s.active)

    if (!activeShare) {
      return null
    }

    return fromStoredShare(activeShare).settings
  }

  async function updateShareSettings(pageId: string, settings: Partial<PageShareSettings>): Promise<PageShareSettings> {
    const database = await getDB()
    const shares = await database.getAllFromIndex('shares', 'by-page', pageId)
    const activeShare = shares.find(s => s.active)

    if (!activeShare) {
      // Create a new share if none exists
      const newShare = await createShare(pageId, settings)
      return newShare.settings
    }

    // Hash password if provided
    let passwordHash = activeShare.settings.password
    if (settings.password !== undefined) {
      passwordHash = settings.password ? await hashPassword(settings.password) : undefined
    }

    const updatedSettings: PageShareSettings = {
      ...fromStoredShare(activeShare).settings,
      ...settings,
      password: passwordHash,
    }

    const updatedShare: StoredShare = {
      ...activeShare,
      settings: {
        ...updatedSettings,
        expiresAt: updatedSettings.expiresAt?.toISOString(),
      },
    }

    await database.put('shares', updatedShare)
    return updatedSettings
  }

  async function getShareByToken(token: string): Promise<PageShare | null> {
    const database = await getDB()
    const stored = await database.get('shares', token)
    return stored ? fromStoredShare(stored) : null
  }

  async function createShare(pageId: string, settings?: Partial<PageShareSettings>): Promise<PageShare> {
    const database = await getDB()
    const page = await getPage(pageId)
    if (!page) {
      throw new Error(`Page not found: ${pageId}`)
    }

    const token = generateShareToken()
    const defaultSettings = createDefaultShareSettings()

    // Hash password if provided
    let passwordHash: string | undefined
    if (settings?.password) {
      passwordHash = await hashPassword(settings.password)
    }

    const shareSettings: PageShareSettings = {
      ...defaultSettings,
      ...settings,
      password: passwordHash,
    }

    const share: PageShare = {
      token,
      pageId,
      settings: shareSettings,
      viewCount: 0,
      createdAt: new Date(),
      createdBy: page.createdBy,
      active: true,
    }

    await database.put('shares', toStoredShare(share))
    return share
  }

  async function revokeShare(token: string): Promise<void> {
    const database = await getDB()
    const share = await database.get('shares', token)
    if (!share) {
      throw new Error(`Share not found: ${token}`)
    }

    const updated: StoredShare = {
      ...share,
      active: false,
      deactivationReason: 'revoked',
    }

    await database.put('shares', updated)
  }

  async function revokeAllShares(pageId: string): Promise<void> {
    const database = await getDB()
    const shares = await database.getAllFromIndex('shares', 'by-page', pageId)

    const tx = database.transaction('shares', 'readwrite')
    for (const share of shares) {
      if (share.active) {
        await tx.store.put({
          ...share,
          active: false,
          deactivationReason: 'revoked',
        })
      }
    }
    await tx.done
  }

  async function recordShareView(token: string): Promise<void> {
    const database = await getDB()
    const share = await database.get('shares', token)
    if (!share) {
      throw new Error(`Share not found: ${token}`)
    }

    const updated: StoredShare = {
      ...share,
      viewCount: share.viewCount + 1,
      lastAccessedAt: new Date().toISOString(),
    }

    await database.put('shares', updated)
  }

  async function listPublicShares(options: ListPublicSharesOptions = {}): Promise<PaginatedResult<PublicShareListItem>> {
    const { sortBy = 'recent', search, limit = 20, offset = 0 } = options
    const database = await getDB()

    // Get all active, public shares
    const allShares = await database.getAll('shares')
    const publicShares = allShares.filter(s =>
      s.active && s.settings.visibility === 'public',
    )

    // Load page data for each share
    const items: PublicShareListItem[] = []
    for (const share of publicShares) {
      const page = await database.get('pages', share.pageId)
      if (!page)
        continue

      // Search filter
      if (search) {
        const searchLower = search.toLowerCase()
        if (!page.title.toLowerCase().includes(searchLower)
          && !page.description?.toLowerCase().includes(searchLower)) {
          continue
        }
      }

      items.push({
        token: share.token,
        pageTitle: page.title,
        pageDescription: page.description,
        authorName: share.settings.showAuthor ? page.createdBy : undefined,
        viewCount: share.viewCount,
        publishedAt: new Date(share.createdAt),
        tags: page.tags,
      })
    }

    // Sort
    items.sort((a, b) => {
      switch (sortBy) {
        case 'popular':
          return b.viewCount - a.viewCount
        case 'title':
          return a.pageTitle.localeCompare(b.pageTitle)
        case 'recent':
        default:
          return b.publishedAt.getTime() - a.publishedAt.getTime()
      }
    })

    // Paginate
    const paginated = items.slice(offset, offset + limit)

    return {
      items: paginated,
      total: items.length,
      offset,
      limit,
      hasMore: offset + limit < items.length,
    }
  }

  // ============================================================================
  // Snapshot Operations
  // ============================================================================

  async function getSnapshot(versionId: string): Promise<PageSnapshot | null> {
    const version = await getVersion(versionId)
    if (!version) {
      return null
    }

    return {
      id: version.id,
      pageId: version.pageId,
      version: version.version,
      title: version.title,
      blocks: version.blocks,
      widgets: version.widgets,
      createdAt: version.createdAt,
      createdBy: version.createdBy,
      changeDescription: version.changeDescription,
    }
  }

  // ============================================================================
  // Utility Operations
  // ============================================================================

  async function isSlugAvailable(slug: string, excludePageId?: string): Promise<boolean> {
    const database = await getDB()
    const existing = await database.getFromIndex('pages', 'by-slug', slug)
    if (!existing) {
      return true
    }
    return excludePageId !== undefined && existing.id === excludePageId
  }

  async function generateSlug(title: string): Promise<string> {
    const database = await getDB()
    let slug = slugify(title)
    let suffix = 0
    const originalSlug = slug

    while (await database.getFromIndex('pages', 'by-slug', slug)) {
      suffix++
      slug = `${originalSlug}-${suffix}`
    }

    return slug
  }

  async function initialize(): Promise<void> {
    // Lazy initialization - just ensure we can connect
    await getDB()
  }

  async function close(): Promise<void> {
    if (db) {
      db.close()
      db = null
    }
  }

  async function clear(): Promise<void> {
    const database = await getDB()

    const tx = database.transaction(['pages', 'widgets', 'versions', 'shares'], 'readwrite')

    await tx.objectStore('pages').clear()
    await tx.objectStore('widgets').clear()
    await tx.objectStore('versions').clear()
    await tx.objectStore('shares').clear()

    await tx.done
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
    listPublicShares,

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
