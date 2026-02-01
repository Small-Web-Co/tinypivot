/**
 * TinyPivot IndexedDB Storage
 * Browser-based storage adapter for TinyPivot Studio using IndexedDB
 *
 * @packageDocumentation
 */

import type {
  Dashboard,
  SavedView,
  StorageAdapter,
} from '@smallwebco/tinypivot-studio'

// Re-export types for convenience
export type { Dashboard, SavedView, StorageAdapter }

// Database configuration
export const DB_NAME = 'tinypivot-studio'
export const DB_VERSION = 1

export const STORES = {
  views: 'views',
  dashboards: 'dashboards',
} as const

// Placeholder - full implementation in Task 2.1
export class IndexedDBStorageAdapter implements StorageAdapter {
  // Will be initialized in init() method - implementation in Task 2.1
  db: IDBDatabase | null = null

  async init(): Promise<void> {
    // TODO: Initialize IndexedDB connection
    void this.db
    throw new Error('Not implemented - see Task 2.1')
  }

  async getViews(): Promise<SavedView[]> {
    throw new Error('Not implemented - see Task 2.1')
  }

  async getView(id: string): Promise<SavedView | null> {
    void id
    throw new Error('Not implemented - see Task 2.1')
  }

  async saveView(view: SavedView): Promise<SavedView> {
    void view
    throw new Error('Not implemented - see Task 2.1')
  }

  async deleteView(id: string): Promise<void> {
    void id
    throw new Error('Not implemented - see Task 2.1')
  }

  async getDashboards(): Promise<Dashboard[]> {
    throw new Error('Not implemented - see Task 2.1')
  }

  async getDashboard(id: string): Promise<Dashboard | null> {
    void id
    throw new Error('Not implemented - see Task 2.1')
  }

  async saveDashboard(dashboard: Dashboard): Promise<Dashboard> {
    void dashboard
    throw new Error('Not implemented - see Task 2.1')
  }

  async deleteDashboard(id: string): Promise<void> {
    void id
    throw new Error('Not implemented - see Task 2.1')
  }
}

export function createIndexedDBStorage(): IndexedDBStorageAdapter {
  return new IndexedDBStorageAdapter()
}
