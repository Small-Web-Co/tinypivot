<script setup lang="ts">
import type { Plan } from '../../site/pricing'
import { computed, ref } from 'vue'
import SegmentedControl from './SegmentedControl.vue'

const props = defineProps<{
  plan: Plan
  pendingPlan: string | null
}>()

const emit = defineEmits<{ checkout: [optionId: string] }>()

const optionId = ref(props.plan.defaultOptionId)
const option = computed(() => props.plan.options.find(o => o.id === optionId.value) ?? props.plan.options[0])
const billingChoices = computed(() => props.plan.options.map(o => ({ value: o.id, label: o.label })))
const isPending = computed(() => props.pendingPlan === option.value.id)
</script>

<template>
  <article class="plan" :class="{ featured: plan.featured }">
    <header class="plan-head">
      <h3 class="plan-name">
        {{ plan.name }}
      </h3>
      <span v-if="plan.featured" class="plan-flag">Most picked</span>
    </header>

    <SegmentedControl
      v-if="plan.options.length > 1"
      v-model="optionId"
      :options="billingChoices"
      :label="`${plan.name} billing`"
    />

    <p class="plan-price">
      <span class="plan-amount">{{ option.price }}</span>
      <span class="plan-period">{{ option.period }}</span>
    </p>
    <p class="plan-note">
      {{ option.note }}
    </p>

    <ul class="plan-features">
      <li v-if="plan.lead" class="plan-lead">
        {{ plan.lead }}
      </li>
      <li v-for="feature in plan.features" :key="feature">
        {{ feature }}
      </li>
    </ul>

    <router-link
      v-if="plan.action.kind === 'link'"
      :to="plan.action.to"
      class="btn btn-ghost plan-cta"
    >
      {{ plan.action.label }}
    </router-link>
    <button
      v-else
      type="button"
      class="btn plan-cta"
      :class="plan.featured ? 'btn-solid' : 'btn-ghost'"
      :disabled="pendingPlan !== null"
      @click="emit('checkout', option.id)"
    >
      {{ isPending ? 'Opening checkout…' : `Get ${plan.name} · ${option.price}` }}
    </button>
  </article>
</template>

<style scoped>
.plan {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  padding: 24px 20px;
  border: var(--line);
  background: var(--paper);
}

.featured {
  border-color: var(--ink);
  box-shadow: 6px 6px 0 var(--ink);
}

.plan-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.plan-name {
  font-family: var(--font-display);
  font-size: 2.6rem;
  font-weight: 400;
  line-height: 0.9;
}

.plan-flag {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--accent);
}

.plan-price {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.plan-amount {
  font-family: var(--font-mono);
  font-size: 2.4rem;
  font-weight: 500;
  letter-spacing: -0.03em;
}

.plan-period,
.plan-note {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--ink-muted);
}

.plan-note {
  margin-top: -8px;
}

.plan-features {
  flex: 1;
  display: grid;
  align-content: start;
  gap: 0;
  padding-top: 14px;
  border-top: var(--line);
  list-style: none;
  font-size: 1rem;
}

.plan-features li:not(.plan-lead) {
  padding: 5px 8px 5px 30px;
  text-indent: -22px;
}

.plan-features li:not(.plan-lead):nth-child(odd) {
  background: var(--ledger);
}

.plan-features li:not(.plan-lead)::before {
  content: '+';
  display: inline-block;
  width: 22px;
  text-indent: 0;
  font-family: var(--font-mono);
  color: var(--accent);
}

.plan-lead {
  padding-bottom: 8px;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.plan-cta {
  width: 100%;
}

.plan-cta:disabled {
  opacity: 0.6;
  cursor: progress;
}
</style>
