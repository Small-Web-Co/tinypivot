<script setup lang="ts">
import type { Product } from '../site/pricing'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PlanCard from '../components/site/PlanCard.vue'
import SegmentedControl from '../components/site/SegmentedControl.vue'
import { licenseNote, mcpFaq, plans } from '../site/pricing'
import { useCheckout } from '../site/useCheckout'

const route = useRoute()
const router = useRouter()

const products = [
  { value: 'mcp', label: 'AI agent sidecar' },
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
          Free to start. <em>Pro when the numbers have to be right.</em>
        </h1>
        <p v-if="product === 'mcp'" class="lede">
          Free is the full sidecar on your files and warehouses: no row limit, no signup, no trial clock.
          Pro adds the deep trap checks and one-step statistics that took every model in our tests to 100% correct.
          <router-link to="/whitepaper" class="wp-inline-link">
            See the results →
          </router-link>
        </p>
        <p v-else class="lede">
          Ship a real data grid and pivot table for free. Pro adds drill-through, every aggregation, the AI analyst and Excel export,
          with a one-time license and no per-seat fees.
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

      <section v-if="product === 'mcp'" class="faq" aria-labelledby="faq-title">
        <h2 id="faq-title" class="heading">
          Questions before <em>you buy.</em>
        </h2>
        <dl class="faq-list">
          <div v-for="item in mcpFaq" :key="item.q" class="faq-item">
            <dt>{{ item.q }}</dt>
            <dd>
              {{ item.a }}
              <router-link v-if="'link' in item" :to="item.link.to" class="faq-link">
                {{ item.link.label }} →
              </router-link>
            </dd>
          </div>
        </dl>
      </section>

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
.faq {
  margin-top: 56px;
  padding-top: 32px;
  border-top: var(--line);
}

.faq-list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0 40px;
  margin: 24px 0 0;
}

.faq-item {
  padding: 16px 0;
  border-bottom: 1px solid var(--rule);
}

.faq-item dt {
  font-weight: 600;
}

.faq-item dd {
  margin: 6px 0 0;
  line-height: 1.55;
  color: var(--ink-muted);
}

.faq-link {
  font-family: var(--font-mono);
  font-size: 0.76rem;
  color: var(--accent);
  white-space: nowrap;
  text-underline-offset: 3px;
}

@media (min-width: 768px) {
  .faq-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
