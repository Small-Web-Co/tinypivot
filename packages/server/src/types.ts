/**
 * TinyPivot Server - Type Definitions
 */

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

/**
 * Generic request handler type
 * Compatible with Express, Fastify, Next.js API routes, etc.
 */
export type RequestHandler = (req: Request) => Promise<Response>

/**
 * Provider-specific API request types
 */
export interface AnthropicRequest {
  model: string
  max_tokens: number
  messages: Array<{ role: 'user' | 'assistant', content: string }>
}

export interface OpenAIRequest {
  model: string
  max_tokens: number
  messages: Array<{ role: 'user' | 'assistant' | 'system', content: string }>
}

export interface OpenRouterRequest {
  model: string
  max_tokens: number
  messages: Array<{ role: 'user' | 'assistant' | 'system', content: string }>
}
