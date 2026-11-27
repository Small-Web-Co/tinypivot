<script setup lang="ts">
import type { Product } from '../site/pricing'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PlanCard from '../components/site/PlanCard.vue'
import SegmentedControl from '../components/site/SegmentedControl.vue'
import { licenseNote, plans } from '../site/pricing'
import { useCheckout } from '../site/useCheckout'

const route = useRoute()
const router = useRouter()

const products = [
  { value: 'mcp', label: 'MCP server' },
  { value: 'ui', label: 'React & Vue library' },
] as const

const product = ref<Product>(route.query.product === 'ui' ? 'ui' : 'mcp')
watch(product, (value) => {
  router.replace({ query: value === 'ui' ? { product: 'ui' } : {} })
})

const visiblePlans = computed(() => plans[product.value])
const { pendingPlan, error, startCheckout } = useCheckout()
</script>

<template>
  <main class="block">
    <div class="wrap">
      <header class="pricing-head">
        <p class="label">
          Pricing
        </p>
        <h1 class="display">
          TinyPivot Free to start. <em>Pro</em> when the numbers matter.
        </h1>
        <p v-if="product === 'mcp'" class="lede">
          Unlimited local rows in TinyPivot Free with no signup or trial clock. TinyPivot Pro adds deep SQL &amp; statistical guardrails, the full Data Science shelf, Recursive Data Memory, white-label exports, and PostgreSQL.
          <router-link to="/whitepaper" class="wp-inline-link">
            Read the 5-model + KramaBench + DABstep benchmarks →
          </router-link>
        </p>
        <p v-else class="lede">
          TinyPivot Free core grid and pivot table with no signup or trial clock. TinyPivot Pro adds drill-through, all aggregations, 10 themes, and Excel export with a perpetual license.
        </p>
        <SegmentedControl v-model="product" :options="products" label="Product" class="product-switch" />
      </header>

      <p v-if="error" class="checkout-error" role="alert">
        {{ error }}
      </p>

      <div class="plans" :class="`plans-${visiblePlans.length}`">
        <PlanCard
          v-for="plan in visiblePlans"
          :key="plan.id"
          :plan="plan"
          :pending-plan="pendingPlan"
          @checkout="startCheckout"
        />
      </div>

      <p class="license-note">
        {{ licenseNote }}
      </p>
    </div>
  </main>
</template>

<style scoped>
.pricing-head {
  display: grid;
  gap: 16px;
  max-width: 40rem;
  margin-bottom: 40px;
}

.product-switch {
  max-width: 420px;
  margin-top: 8px;
}

.wp-inline-link {
  display: inline-block;
  margin-left: 4px;
  color: var(--ink);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.plans {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
}

.checkout-error {
  margin-bottom: 20px;
  padding: 12px 16px;
  border: 1px solid var(--minus);
  color: var(--minus);
  font-family: var(--font-mono);
  font-size: 0.8rem;
}

.license-note {
  margin-top: 32px;
  font-family: var(--font-mono);
  font-size: 0.74rem;
  color: var(--ink-faint);
}

@media (min-width: 768px) {
  .plans-2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    max-width: 760px;
  }
}

@media (min-width: 1024px) {
  .plans-3 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
