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

// Snowflake OAuth Authentication
export {
  createSnowflakeCallbackHandler,
  createSnowflakeOAuth,
  generateOAuthState,
} from './auth/snowflake-oauth'

export type {
  CallbackHandlerOptions,
  SnowflakeOAuth,
  SnowflakeOAuthConfig,
  TokenResponse,
} from './auth/snowflake-oauth'

// Credential Encryption
export { createCredentialService } from './crypto/credential-service'

export type {
  CredentialService,
  CredentialServiceConfig,
  EncryptedPayload,
} from './crypto/credential-service'

// Datasource Management
export { createDatasourceManager } from './datasource'

export type {
  AuthMethod,
  ConnectionConfig,
  ConnectionStatus,
  ConnectionTestResult,
  CreateDatasourceInput,
  DatasourceCredentials,
  DatasourceInfo,
  DatasourceManager,
  DatasourceManagerConfig,
  DatasourceRecord,
  DatasourceTier,
  DatasourceType,
  DatasourceWithCredentials,
  OrgDatasourceEnvConfig,
  UpdateDatasourceInput,
} from './datasource'

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
