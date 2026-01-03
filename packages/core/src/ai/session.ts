/**
 * TinyPivot Core - AI Session Management
 * Utilities for managing AI conversation sessions
 */
import type { AIConversation, AIMessage } from '../types'

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  return `tp-ai-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Create a new empty conversation
 */
export function createConversation(sessionId?: string): AIConversation {
  const now = Date.now()
  return {
    id: sessionId || generateSessionId(),
    messages: [],
    dataSourceId: undefined,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Create a user message
 */
export function createUserMessage(content: string): AIMessage {
  return {
    id: generateMessageId(),
    role: 'user',
    content,
    timestamp: Date.now(),
  }
}

/**
 * Create an assistant message
 */
export function createAssistantMessage(
  content: string,
  metadata?: AIMessage['metadata'],
): AIMessage {
  return {
    id: generateMessageId(),
    role: 'assistant',
    content,
    timestamp: Date.now(),
    metadata,
  }
}

/**
 * Create a system message
 */
export function createSystemMessage(content: string): AIMessage {
  return {
    id: generateMessageId(),
    role: 'system',
    content,
    timestamp: Date.now(),
  }
}

/**
 * Add a message to a conversation (immutably)
 */
export function addMessageToConversation(
  conversation: AIConversation,
  message: AIMessage,
): AIConversation {
  return {
    ...conversation,
    messages: [...conversation.messages, message],
    updatedAt: Date.now(),
  }
}

/**
 * Update the data source for a conversation
 */
export function setConversationDataSource(
  conversation: AIConversation,
  dataSourceId: string | undefined,
): AIConversation {
  return {
    ...conversation,
    dataSourceId,
    updatedAt: Date.now(),
  }
}

/**
 * Serialize a conversation to JSON string for storage
 */
export function serializeConversation(conversation: AIConversation): string {
  return JSON.stringify(conversation)
}

/**
 * Deserialize a conversation from JSON string
 */
export function deserializeConversation(json: string): AIConversation | null {
  try {
    const parsed = JSON.parse(json)

    // Basic validation
    if (
      typeof parsed !== 'object'
      || !parsed.id
      || !Array.isArray(parsed.messages)
    ) {
      return null
    }

    return parsed as AIConversation
  }
  catch {
    return null
  }
}

/**
 * Get the messages formatted for the AI API
 * Excludes system messages and metadata
 */
export function getMessagesForAPI(
  conversation: AIConversation,
): Array<{ role: 'user' | 'assistant', content: string }> {
  return conversation.messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))
}

/**
 * Trim conversation to last N messages to manage context window
 */
export function trimConversation(
  conversation: AIConversation,
  maxMessages: number,
): AIConversation {
  if (conversation.messages.length <= maxMessages) {
    return conversation
  }

  return {
    ...conversation,
    messages: conversation.messages.slice(-maxMessages),
    updatedAt: Date.now(),
  }
}

/**
 * Get conversation statistics
 */
export function getConversationStats(conversation: AIConversation): {
  messageCount: number
  userMessageCount: number
  assistantMessageCount: number
  queriesExecuted: number
  successfulQueries: number
  failedQueries: number
} {
  const messages = conversation.messages
  const queriesExecuted = messages.filter(m => m.metadata?.query).length
  const failedQueries = messages.filter(m => m.metadata?.error).length

  return {
    messageCount: messages.length,
    userMessageCount: messages.filter(m => m.role === 'user').length,
    assistantMessageCount: messages.filter(m => m.role === 'assistant').length,
    queriesExecuted,
    successfulQueries: queriesExecuted - failedQueries,
    failedQueries,
  }
}
