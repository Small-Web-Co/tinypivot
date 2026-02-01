/**
 * Type Definitions for TinyPivot Postgres Storage
 * Configuration options and types for the Postgres storage adapter
 */

/**
 * Options for creating a Postgres storage adapter (client-side via REST API)
 */
export interface PostgresStorageOptions {
  /**
   * Base URL of the REST API endpoint
   * This should point to your server's API route that handles TinyPivot storage operations
   * @example 'https://myapp.com/api/tinypivot' or '/api/tinypivot' for same-origin
   */
  baseUrl: string

  /**
   * Optional custom fetch function
   * Useful for adding authentication headers or custom error handling
   * @default globalThis.fetch
   */
  fetch?: typeof globalThis.fetch

  /**
   * Optional headers to include with every request
   * Useful for authentication tokens
   */
  headers?: Record<string, string>

  /**
   * Optional request timeout in milliseconds
   * @default 30000 (30 seconds)
   */
  timeout?: number

  /**
   * Maximum versions to keep per page
   * Used by pruneVersions
   * @default 20
   */
  maxVersionsPerPage?: number
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  /** Whether the request was successful */
  success: boolean
  /** Response data (if successful) */
  data?: T
  /** Error message (if not successful) */
  error?: string
  /** Error code (if not successful) */
  code?: string
}

/**
 * API error thrown by the adapter
 */
export class PostgresStorageError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'PostgresStorageError'
  }
}

/**
 * HTTP methods used by the adapter
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/**
 * Server-side adapter options for direct database access
 * Used when implementing the server-side API handlers
 */
export interface PostgresServerOptions {
  /**
   * Drizzle database instance
   * Must be initialized with the TinyPivot schema
   */
  db: unknown // Use 'unknown' to avoid requiring drizzle as a direct dependency

  /**
   * Maximum versions to keep per page
   * @default 20
   */
  maxVersionsPerPage?: number
}
