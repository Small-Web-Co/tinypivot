<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { testimonials } from '../../site/ui'

const HOLD_MS = 6500

const active = ref(0)
const paused = ref(false)
const current = computed(() => testimonials[active.value])

let timer: ReturnType<typeof setInterval> | undefined

function go(index: number) {
  active.value = (index + testimonials.length) % testimonials.length
}

function next() {
  go(active.value + 1)
}

function prev() {
  go(active.value - 1)
}

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    return
  timer = setInterval(() => {
    if (!paused.value && document.visibilityState === 'visible')
      next()
  }, HOLD_MS)
})

onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <section
    class="testimonials-band"
    role="region"
    aria-roledescription="carousel"
    aria-label="Customer testimonials"
    @mouseenter="paused = true"
    @mouseleave="paused = false"
    @focusin="paused = true"
    @focusout="paused = false"
    @keydown.left.prevent="prev"
    @keydown.right.prevent="next"
  >
    <div class="wrap">
      <div class="tc-frame">
        <div class="tc-bar">
          <div class="tc-bar-left">
            <span class="tc-kicker">Trusted in production</span>
            <span class="tc-stat">53,000+ npm downloads</span>
          </div>
          <div class="tc-controls">
            <span class="tc-count" aria-live="off">
              {{ String(active + 1).padStart(2, '0') }} / {{ String(testimonials.length).padStart(2, '0') }}
            </span>
            <button
              type="button"
              class="tc-btn"
              aria-label="Previous testimonial"
              @click="prev"
            >
              ←
            </button>
            <button
              type="button"
              class="tc-btn"
              aria-label="Next testimonial"
              @click="next"
            >
              →
            </button>
          </div>
        </div>

        <div class="tc-stage" aria-live="polite">
          <Transition name="tc-fade" mode="out-in">
            <figure :key="current.author" class="tc-slide">
              <blockquote class="tc-quote">
                {{ current.quote }}
              </blockquote>
              <figcaption class="tc-caption">
                <strong class="tc-author">{{ current.author }}</strong>
                <span class="tc-sep" aria-hidden="true">·</span>
                <span class="tc-role">{{ current.role }}</span>
                <span class="tc-sep" aria-hidden="true">·</span>
                <a :href="current.href" target="_blank" rel="noopener" class="tc-site">
                  {{ current.site }} ↗
                </a>
              </figcaption>
            </figure>
          </Transition>
        </div>

        <div class="tc-tabs" role="tablist" aria-label="Choose a testimonial">
          <button
            v-for="(item, index) in testimonials"
            :key="item.author"
            type="button"
            role="tab"
            class="tc-tab"
            :aria-selected="index === active"
            @click="go(index)"
          >
            <span class="tc-tab-idx">{{ String(index + 1).padStart(2, '0') }}</span>
            <span class="tc-tab-name">{{ item.author }}</span>
            <span class="tc-tab-site">{{ item.site }}</span>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.testimonials-band {
  padding: 36px 0;
  border-bottom: var(--line);
  background: var(--paper);
}

.tc-frame {
  border: var(--line);
  background: var(--paper-raised);
  box-shadow: var(--shadow-sm);
}

.tc-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 16px;
  padding: 10px 16px;
  border-bottom: var(--line);
  background: var(--ink);
  color: var(--paper);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.tc-bar-left {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
}

.tc-kicker {
  color: var(--win-accent);
  font-weight: 700;
}

.tc-stat {
  color: var(--paper);
  opacity: 0.85;
}

.tc-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tc-count {
  margin-right: 6px;
  color: var(--win-muted);
}

.tc-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 28px;
  border: 1.5px solid var(--paper);
  background: transparent;
  color: var(--paper);
  font-family: var(--font-mono);
  font-size: 0.85rem;
  line-height: 1;
  cursor: pointer;
  transition: background-color 0.12s, color 0.12s, border-color 0.12s;
}

.tc-btn:hover {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--paper);
}

.tc-stage {
  min-height: 190px;
  padding: 24px 20px;
  display: grid;
  align-items: center;
}

.tc-slide {
  margin: 0;
  display: grid;
  gap: 16px;
}

.tc-quote {
  margin: 0;
  padding-left: 18px;
  border-left: 4px solid var(--accent);
  font-family: var(--font-body);
  font-size: 1.08rem;
  line-height: 1.55;
  color: var(--ink);
}

.tc-caption {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  padding-left: 22px;
  font-family: var(--font-mono);
  font-size: 0.76rem;
  color: var(--ink-muted);
}

.tc-author {
  color: var(--ink);
  font-weight: 700;
}

.tc-site {
  color: var(--accent);
  text-underline-offset: 4px;
}

.tc-tabs {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  border-top: var(--line);
  background: var(--paper);
}

.tc-tab {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 16px;
  border: 0;
  border-bottom: 1px solid var(--rule);
  background: transparent;
  color: var(--ink-muted);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.12s, color 0.12s;
}

.tc-tab:last-child {
  border-bottom: 0;
}

.tc-tab:hover {
  background: var(--ledger);
  color: var(--ink);
}

.tc-tab[aria-selected='true'] {
  background: var(--ledger);
  color: var(--ink);
  font-weight: 700;
}

.tc-tab-idx {
  color: var(--accent);
}

.tc-tab-site {
  margin-left: auto;
  color: var(--ink-faint);
  font-weight: 400;
}

.tc-fade-enter-active,
.tc-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.tc-fade-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

.tc-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (min-width: 768px) {
  .testimonials-band {
    padding: 44px 0;
  }

  .tc-stage {
    min-height: 168px;
    padding: 28px 32px;
  }

  .tc-quote {
    font-size: 1.18rem;
  }

  .tc-tabs {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .tc-tab {
    border-bottom: 0;
    border-right: var(--line);
  }

  .tc-tab:last-child {
    border-right: 0;
  }
}
</style>
