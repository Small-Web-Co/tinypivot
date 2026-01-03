/**
 * Vercel Serverless Function: AI Proxy for TinyPivot Demo
 *
 * This handles the 'chat' action from the unified handler format,
 * proxying requests to LLM providers while keeping API keys secure.
 *
 * The demo uses DuckDB WASM for queries (client-side), so this endpoint
 * only handles AI chat - not database operations.
 *
 * Environment Variables:
 * - AI_API_KEY: API key (auto-detects provider from format)
 * - AI_MODEL: Override the default model
 * - AI_RATE_LIMIT_PER_MINUTE: Max requests per IP per minute (default: 10)
 * - AI_RATE_LIMIT_DAILY: Max requests per IP per day (default: 100)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

// Simple in-memory rate limiting (resets on cold start, but good enough for demo)
const rateLimitStore = new Map<string, { count: number, resetAt: number }>()
const dailyLimitStore = new Map<string, { count: number, resetAt: number }>()

const RATE_LIMIT_PER_MINUTE = Number(process.env.AI_RATE_LIMIT_PER_MINUTE) || 10
const RATE_LIMIT_DAILY = Number(process.env.AI_RATE_LIMIT_DAILY) || 100

function getClientIP(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim()
  }
  return req.socket?.remoteAddress || 'unknown'
}

function checkRateLimit(ip: string): { allowed: boolean, retryAfter?: number, reason?: string } {
  const now = Date.now()

  // Check per-minute limit
  const minuteKey = `${ip}-minute`
  const minuteData = rateLimitStore.get(minuteKey)

  if (minuteData) {
    if (now < minuteData.resetAt) {
      if (minuteData.count >= RATE_LIMIT_PER_MINUTE) {
        return {
          allowed: false,
          retryAfter: Math.ceil((minuteData.resetAt - now) / 1000),
          reason: `Rate limit exceeded. Max ${RATE_LIMIT_PER_MINUTE} requests per minute.`,
        }
      }
      minuteData.count++
    }
    else {
      rateLimitStore.set(minuteKey, { count: 1, resetAt: now + 60_000 })
    }
  }
  else {
    rateLimitStore.set(minuteKey, { count: 1, resetAt: now + 60_000 })
  }

  // Check daily limit
  const dailyKey = `${ip}-daily`
  const dailyData = dailyLimitStore.get(dailyKey)
  const endOfDay = new Date()
  endOfDay.setHours(23, 59, 59, 999)

  if (dailyData) {
    if (now < dailyData.resetAt) {
      if (dailyData.count >= RATE_LIMIT_DAILY) {
        return {
          allowed: false,
          retryAfter: Math.ceil((dailyData.resetAt - now) / 1000),
          reason: `Daily limit exceeded. Max ${RATE_LIMIT_DAILY} requests per day.`,
        }
      }
      dailyData.count++
    }
    else {
      dailyLimitStore.set(dailyKey, { count: 1, resetAt: endOfDay.getTime() })
    }
  }
  else {
    dailyLimitStore.set(dailyKey, { count: 1, resetAt: endOfDay.getTime() })
  }

  return { allowed: true }
}

// Detect AI provider from API key format
type AIProvider = 'anthropic' | 'openai' | 'openrouter'

function detectProvider(apiKey: string): AIProvider {
  if (apiKey.startsWith('sk-ant-'))
    return 'anthropic'
  if (apiKey.startsWith('sk-or-'))
    return 'openrouter'
  return 'openai'
}

// Get default model based on provider (cheap/fast models)
function getDefaultModel(provider: AIProvider): string {
  switch (provider) {
    case 'anthropic': return 'claude-3-haiku-20240307'
    case 'openrouter': return 'anthropic/claude-3-haiku'
    case 'openai': return 'gpt-4o-mini'
  }
}

async function callAnthropic(
  messages: Array<{ role: string, content: string }>,
  apiKey: string,
  model: string,
): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: messages.map(m => ({
        role: m.role === 'system' ? 'user' : m.role,
        content: m.content,
      })),
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('Anthropic API error:', error)
    throw new Error(`Anthropic API error: ${response.status}`)
  }

  const data = await response.json()
  return data.content[0]?.text || ''
}

async function callOpenAI(
  messages: Array<{ role: string, content: string }>,
  apiKey: string,
  model: string,
): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('OpenAI API error:', error)
    throw new Error(`OpenAI API error: ${response.status}`)
  }

  const data = await response.json()
  return data.choices[0]?.message?.content || ''
}

async function callOpenRouter(
  messages: Array<{ role: string, content: string }>,
  apiKey: string,
  model: string,
): Promise<string> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://tiny-pivot.com',
      'X-Title': 'TinyPivot AI Analyst',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('OpenRouter API error:', error)
    throw new Error(`OpenRouter API error: ${response.status}`)
  }

  const data = await response.json()
  return data.choices[0]?.message?.content || ''
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Check rate limit
  const clientIP = getClientIP(req)
  const rateCheck = checkRateLimit(clientIP)

  if (!rateCheck.allowed) {
    res.setHeader('Retry-After', String(rateCheck.retryAfter))
    return res.status(429).json({
      error: rateCheck.reason,
      retryAfter: rateCheck.retryAfter,
    })
  }

  // Get API key
  const apiKey = process.env.AI_API_KEY
  if (!apiKey) {
    console.error('No AI API key configured')
    return res.status(500).json({
      error: 'AI service not configured. Set AI_API_KEY environment variable.',
    })
  }

  // Parse request - supports unified handler format { action: 'chat', messages }
  const body = req.body

  // This endpoint only handles 'chat' action (or no action for backwards compatibility)
  // Other actions (list-tables, get-schema, query) need a database - use the demo's
  // client-side DuckDB via queryExecutor instead
  if (body.action && body.action !== 'chat') {
    return res.status(400).json({
      error: `Action '${body.action}' is not supported by this endpoint. This endpoint only handles AI chat.`,
    })
  }

  // Extract messages from either format
  const messages = body.messages
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' })
  }

  try {
    const provider = detectProvider(apiKey)
    const model = process.env.AI_MODEL || getDefaultModel(provider)

    console.log(`[AI Proxy] Using provider: ${provider}, model: ${model}`)

    let content: string

    switch (provider) {
      case 'anthropic':
        content = await callAnthropic(messages, apiKey, model)
        break
      case 'openrouter':
        content = await callOpenRouter(messages, apiKey, model)
        break
      case 'openai':
      default:
        content = await callOpenAI(messages, apiKey, model)
        break
    }

    // Return in unified handler format
    return res.status(200).json({ content })
  }
  catch (error) {
    console.error('[AI Proxy] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return res.status(500).json({ error: errorMessage })
  }
}
