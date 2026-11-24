<script setup lang="ts">
import McpHighlightReel from '../components/McpHighlightReel.vue'
import InstallBox from '../components/site/InstallBox.vue'
import TokenReceipt from '../components/site/TokenReceipt.vue'

const facts = ['free', 'runs locally', 'no signup', 'no API key']

const capabilities = [
  {
    n: '01',
    title: 'Any database',
    body: 'Pipe CSV or JSON from BigQuery, Snowflake, DuckDB, MySQL or Databricks, or the output of any other MCP tool. Pro adds a read-only Postgres connector.',
  },
  {
    n: '02',
    title: 'Exact numbers',
    body: 'Sums, medians and percent-of-total are computed by the TinyPivot engine, not estimated by the model. No arithmetic hallucinations.',
  },
  {
    n: '03',
    title: 'Drill-through & Excel',
    body: 'Double-click any cell to see the rows behind it, then export a formatted .xlsx. Both in Pro; charts and sum pivots are free up to 2,500 rows.',
  },
] as const
</script>

<template>
  <main>
    <section class="hero">
      <div class="wrap hero-grid">
        <div class="hero-copy">
          <p class="label">
            MCP server for AI coding agents
          </p>
          <h1 class="display">
            Your agent reads the <em>summary.</em> You read the data.
          </h1>
          <p class="lede">
            TinyPivot renders charts and pivot tables inside Claude, Cursor, Antigravity, OpenCode and pi.
            The model sees a ~200-token schema. The rows never touch its context.
          </p>
        </div>
        <div id="install" class="hero-install">
          <InstallBox source="hero" />
          <ul class="facts" aria-label="Free tier">
            <li v-for="fact in facts" :key="fact">
              {{ fact }}
            </li>
          </ul>
        </div>
      </div>
    </section>

    <section class="block reel" aria-labelledby="reel-title">
      <div class="wrap">
        <header class="section-head">
          <p class="label">
            In the harness
          </p>
          <h2 id="reel-title" class="heading">
            Charts, pivots and drill-through <em>where the conversation already is.</em>
          </h2>
        </header>
        <McpHighlightReel />
      </div>
    </section>

    <section class="block savings" aria-labelledby="savings-title">
      <div class="wrap savings-grid">
        <div>
          <p class="label">
            The receipt
          </p>
          <h2 id="savings-title" class="heading">
            The model needs the shape of your data, <em>not every row.</em>
          </h2>
          <p class="lede">
            Pasting a query result into chat bills you for every cell, then again on each follow-up.
            With TinyPivot the rows stream straight to the UI, and re-slicing them is a local click.
          </p>
          <router-link to="/docs#savings" class="text-link">
            Run the numbers for your own workload →
          </router-link>
        </div>
        <TokenReceipt />
      </div>
    </section>

    <section class="block" aria-labelledby="caps-title">
      <div class="wrap">
        <header class="section-head">
          <p class="label">
            What it does
          </p>
          <h2 id="caps-title" class="heading">
            Small tool, <em>serious analysis.</em>
          </h2>
        </header>
        <ol class="caps">
          <li v-for="cap in capabilities" :key="cap.n" class="cap">
            <span class="cap-n mono">{{ cap.n }}</span>
            <h3 class="cap-title">
              {{ cap.title }}
            </h3>
            <p class="cap-body">
              {{ cap.body }}
            </p>
          </li>
        </ol>
      </div>
    </section>

    <section class="block closing" aria-labelledby="closing-title">
      <div class="wrap closing-grid">
        <h2 id="closing-title" class="heading">
          Install once. <em>Every harness gets it.</em>
        </h2>
        <InstallBox source="closing" />
        <router-link to="/ui" class="app-link">
          <span class="label">Building an app?</span>
          <span class="app-link-title">TinyPivot UI: the same grid, pivots and charts for React &amp; Vue 3 →</span>
        </router-link>
      </div>
    </section>
  </main>
</template>

<style scoped>
.hero {
  padding: 32px 0 48px;
}

.hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
}

.hero-copy {
  display: grid;
  gap: 16px;
}

.hero .lede {
  font-size: 1.08rem;
}

.facts {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin-top: 14px;
  list-style: none;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--ink-muted);
}

.facts li::before {
  content: '✓ ';
  color: var(--accent);
}

.section-head {
  display: grid;
  gap: 12px;
  max-width: 40rem;
  margin-bottom: 32px;
}

.reel {
  border-top: 1px solid var(--rule);
}

.savings {
  border-top: 1px solid var(--rule);
  background: var(--paper-raised);
}

.savings-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 32px;
}

.savings-grid > div {
  display: grid;
  gap: 16px;
  align-content: start;
}

.text-link {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--accent);
  text-underline-offset: 4px;
}

.caps {
  display: grid;
  list-style: none;
  border-top: 1px solid var(--ink);
}

.cap {
  display: grid;
  grid-template-columns: 2.5rem 1fr;
  gap: 4px 12px;
  padding: 22px 0;
  border-bottom: 1px solid var(--rule-strong);
}

.cap-n {
  grid-row: span 2;
  padding-top: 6px;
  font-size: 0.78rem;
  color: var(--accent);
}

.cap-title {
  font-family: var(--font-display);
  font-size: 1.7rem;
  font-weight: 400;
  line-height: 1.1;
}

.cap-body {
  color: var(--ink-muted);
}

.closing {
  border-top: 1px solid var(--rule);
}

.closing-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 28px;
  max-width: 760px;
}

.app-link {
  display: grid;
  gap: 6px;
  padding: 20px;
  border: 1px dashed var(--rule-strong);
  border-radius: var(--radius);
  text-decoration: none;
  transition: border-color 0.15s, background-color 0.15s;
}

.app-link:hover {
  border-color: var(--ink);
  background: var(--paper-raised);
}

.app-link-title {
  font-size: 1.1rem;
}

@media (min-width: 768px) {
  .hero {
    padding: 72px 0 96px;
  }

  .hero .lede {
    font-size: 1.2rem;
  }

  .caps {
    grid-template-columns: repeat(3, 1fr);
    gap: 0 32px;
    border-top: 0;
  }

  .cap {
    grid-template-columns: 1fr;
    align-content: start;
    gap: 10px;
    padding: 24px 0 0;
    border-top: 1px solid var(--ink);
    border-bottom: 0;
  }

  .cap-n {
    grid-row: auto;
    padding-top: 0;
  }
}

@media (min-width: 1024px) {
  .hero-grid {
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
    align-items: end;
    gap: 56px;
  }

  .savings-grid {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
    align-items: center;
    gap: 64px;
  }
}
</style>
