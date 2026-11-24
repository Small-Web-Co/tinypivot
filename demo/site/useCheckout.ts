import { track } from '@vercel/analytics'
import { ref } from 'vue'

/** Starts a Stripe Checkout session via /api/create-checkout and redirects to it. */
export function useCheckout() {
  const pendingPlan = ref<string | null>(null)
  const error = ref<string | null>(null)

  async function startCheckout(plan: string): Promise<void> {
    if (pendingPlan.value)
      return
    pendingPlan.value = plan
    error.value = null
    track('checkout_started', { plan })
    try {
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json().catch(() => ({})) as { url?: string, error?: string }
      if (!res.ok || !data.url)
        throw new Error(data.error || `Checkout failed (${res.status})`)
      track('checkout_redirected', { plan })
      window.location.href = data.url
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Checkout is unavailable right now.'
      pendingPlan.value = null
    }
  }

  return { pendingPlan, error, startCheckout }
}
