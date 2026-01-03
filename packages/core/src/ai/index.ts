/**
 * TinyPivot Core - AI Data Analyst
 * Exports for AI-related functionality
 */

// Demo mode
export {
  DEMO_DATA_SOURCES,
  DEMO_SCENARIOS,
  DEMO_SCHEMAS,
  findDemoResponse,
  getDefaultDemoResponse,
  getDemoSchema,
  getInitialDemoData,
} from './demo'

export type { DemoScenario, DemoTrigger } from './demo'

// Prompt engineering
export {
  buildResultsSummary,
  buildSystemPrompt,
  buildUserMessage,
  extractSQLFromResponse,
  stripSQLFromContent,
  validateSQLSafety,
} from './prompts'
// Session management
export {
  addMessageToConversation,
  createAssistantMessage,
  createConversation,
  createSystemMessage,
  createUserMessage,
  deserializeConversation,
  generateMessageId,
  generateSessionId,
  getConversationStats,
  getMessagesForAPI,
  serializeConversation,
  setConversationDataSource,
  trimConversation,
} from './session'
