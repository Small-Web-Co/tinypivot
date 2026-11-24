export interface ModelPricing {
  id: string
  name: string
  provider: string
  ratePerMillion: number
}

export const MODEL_CATALOG: ModelPricing[] = [
  { id: 'gemini-4-neon', name: 'Gemini 4 Neon', provider: 'Google', ratePerMillion: 3.0 },
  { id: 'gemini-4-pro', name: 'Gemini 4 Pro', provider: 'Google', ratePerMillion: 2.0 },
  { id: 'claude-sonnet-5.5', name: 'Claude Sonnet 5.5', provider: 'Anthropic', ratePerMillion: 2.0 },
  { id: 'claude-opus-5.5', name: 'Claude Opus 5.5', provider: 'Anthropic', ratePerMillion: 4.0 },
  { id: 'claude-frontier', name: 'Claude Frontier', provider: 'Anthropic', ratePerMillion: 8.0 },
  { id: 'gpt-5', name: 'GPT-5', provider: 'OpenAI', ratePerMillion: 1.75 },
  { id: 'gpt-6-sol', name: 'GPT-6 Sol', provider: 'OpenAI', ratePerMillion: 2.0 },
  { id: 'gpt-6-astra', name: 'GPT-6 Astra', provider: 'OpenAI', ratePerMillion: 8.0 },
]

export const DEFAULT_MODEL_PRICING: ModelPricing = MODEL_CATALOG[0]

/**
 * Resolve a model ID or human-readable model name (from an AI agent, host, or env var)
 * to its published input token rate. Unknown models preserve their name with a sensible fallback.
 */
export function resolveModelPricing(input?: string | null, customRatePerMillion?: number): ModelPricing {
  const raw = input?.trim()
  if (!raw) {
    return customRatePerMillion !== undefined && customRatePerMillion >= 0
      ? { ...DEFAULT_MODEL_PRICING, ratePerMillion: customRatePerMillion }
      : DEFAULT_MODEL_PRICING
  }

  const lower = raw.toLowerCase()
  const exact = MODEL_CATALOG.find(
    m => m.id === lower || m.name.toLowerCase() === lower,
  )
  if (exact) {
    return customRatePerMillion !== undefined && customRatePerMillion >= 0
      ? { ...exact, ratePerMillion: customRatePerMillion }
      : exact
  }

  // Fuzzy match common model strings passed by harnesses/agents
  if (lower.includes('neon'))
    return { ...MODEL_CATALOG[0], name: raw }
  if (lower.includes('gemini'))
    return { ...MODEL_CATALOG[1], name: raw }
  if (lower.includes('mythos') || lower.includes('fable'))
    return { ...MODEL_CATALOG[4], name: raw }
  if (lower.includes('opus'))
    return { ...MODEL_CATALOG[3], name: raw }
  if (lower.includes('sonnet') || lower.includes('claude'))
    return { ...MODEL_CATALOG[2], name: raw }
  if (lower.includes('astra'))
    return { ...MODEL_CATALOG[7], name: raw }
  if (lower.includes('gpt-6') || lower.includes('sol'))
    return { ...MODEL_CATALOG[6], name: raw }
  if (lower.includes('gpt') || lower.includes('openai'))
    return { ...MODEL_CATALOG[5], name: raw }

  return {
    id: lower.replace(/[^a-z0-9.-]+/g, '-'),
    name: raw,
    provider: 'Custom',
    ratePerMillion: customRatePerMillion !== undefined && customRatePerMillion >= 0
      ? customRatePerMillion
      : 3.0,
  }
}

export function tokensToUsd(tokens: number, ratePerMillion: number): number {
  return (Math.max(0, tokens) / 1_000_000) * ratePerMillion
}
