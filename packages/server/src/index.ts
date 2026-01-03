/**
 * TinyPivot Server
 * Backend handlers for TinyPivot AI Data Analyst
 *
 * @packageDocumentation
 *
 * ## Quick Start
 *
 * ```typescript
 * // app/api/tinypivot/route.ts (Next.js App Router)
 * import { createTinyPivotHandler } from '@smallwebco/tinypivot-server'
 *
 * export const POST = createTinyPivotHandler()
 * ```
 *
 * Set these environment variables:
 * - `DATABASE_URL` - PostgreSQL connection string
 * - `AI_API_KEY` - OpenAI, Anthropic, or OpenRouter API key
 */

// Types
export type { RequestHandler } from './types'

/**
 * Unified handler - single endpoint for everything
 * Handles: table discovery, schema, queries, and AI chat
 */
export { createTinyPivotHandler } from './unified-handler'

export type {
  ListTablesResponse,
  TableFilterOptions,
  TinyPivotHandlerOptions,
  TinyPivotRequest,
} from './unified-handler'

// SQL Validation (still useful for custom implementations)
export {
  ensureLimit,
  extractTableNames,
  sanitizeTableName,
  validateSQL,
} from './validation'

export type { ValidationResult } from './validation'

// Re-export core types for convenience
export type {
  AIColumnSchema,
  AIProxyRequest,
  AIProxyResponse,
  AITableSchema,
  QueryRequest,
  QueryResponse,
  SchemaRequest,
  SchemaResponse,
} from '@smallwebco/tinypivot-core'
