/**
 * TinyPivot SQLite Storage
 * SQLite storage adapter for TinyPivot Studio with Drizzle ORM support
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

// Configuration type
export interface SQLiteStorageConfig {
  filename: string
  inMemory?: boolean
}

// Placeholder - full implementation in future task
export class SQLiteStorageAdapter implements StorageAdapter {
  constructor(private config: SQLiteStorageConfig) {
    void this.config
  }

  async connect(): Promise<void> {
    // TODO: Initialize Drizzle/better-sqlite3 connection
    throw new Error('Not implemented')
  }

  async disconnect(): Promise<void> {
    throw new Error('Not implemented')
  }

  async getViews(): Promise<SavedView[]> {
    throw new Error('Not implemented')
  }

  async getView(id: string): Promise<SavedView | null> {
    void id
    throw new Error('Not implemented')
  }

  async saveView(view: SavedView): Promise<SavedView> {
    void view
    throw new Error('Not implemented')
  }

  async deleteView(id: string): Promise<void> {
    void id
    throw new Error('Not implemented')
  }

  async getDashboards(): Promise<Dashboard[]> {
    throw new Error('Not implemented')
  }

  async getDashboard(id: string): Promise<Dashboard | null> {
    void id
    throw new Error('Not implemented')
  }

  async saveDashboard(dashboard: Dashboard): Promise<Dashboard> {
    void dashboard
    throw new Error('Not implemented')
  }

  async deleteDashboard(id: string): Promise<void> {
    void id
    throw new Error('Not implemented')
  }
}

export function createSQLiteStorage(config: SQLiteStorageConfig): SQLiteStorageAdapter {
  return new SQLiteStorageAdapter(config)
}
