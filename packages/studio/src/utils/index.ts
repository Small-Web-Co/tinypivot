/**
 * TinyPivot Studio - Utility Functions
 * Re-exports all utility functions from the utils directory
 */

// Field link utilities
export {
  detectLinkableFields,
  findMatchingFields,
  getLinkedWidgetIds,
} from './field-links'
export type { LinkableWidget } from './field-links'

// ID generation utilities
export { generateId, generateUUID } from './id'

// OAuth popup utilities
export {
  generateOAuthState,
  openOAuthPopup,
} from './oauth-popup'
export type { OAuthPopupOptions, OAuthSuccessData } from './oauth-popup'

// SQL parsing utilities
export {
  extractTablesFromSQL,
  injectWhereClause,
} from './sql-parser'
export type { ExtractedTable, SQLValue } from './sql-parser'
