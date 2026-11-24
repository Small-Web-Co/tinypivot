<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <main class="article comparison-page">
    <!-- Hero Section -->
    <section class="hero">
      <div class="hero-content">
        <div class="badge">
          Comparison
        </div>
        <h1>TinyPivot vs AG Grid</h1>
        <p class="subtitle">
          Looking for a lighter, more affordable alternative to AG Grid? <br>
          TinyPivot delivers pivot tables and data grids at a fraction of the size and cost.
        </p>
      </div>
    </section>

    <!-- Quick Stats -->
    <section class="stats-section">
      <div class="stats-grid">
        <div class="stat-card highlight">
          <div class="stat-value">
            Focused
          </div>
          <div class="stat-label">
            Product Scope
          </div>
          <div class="stat-detail">
            Grid, pivot tables, and charts
          </div>
        </div>
        <div class="stat-card highlight">
          <div class="stat-value">
            $49
          </div>
          <div class="stat-label">
            Starting Pro Price
          </div>
          <div class="stat-detail">
            One-time TinyPivot license
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-value">
            2
          </div>
          <div class="stat-label">
            Framework Packages
          </div>
          <div class="stat-detail">
            Dedicated React and Vue builds
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-value">
            100K+
          </div>
          <div class="stat-label">
            Row Performance
          </div>
          <div class="stat-detail">
            Handles large datasets
          </div>
        </div>
      </div>
    </section>

    <!-- Comparison Table -->
    <section class="comparison-section">
      <h2>Feature Comparison</h2>
      <div class="table-wrapper">
        <table class="comparison-table">
          <thead>
            <tr>
              <th>Feature</th>
              <th class="highlight-col">
                TinyPivot
              </th>
              <th>AG Grid</th>
            </tr>
          </thead>
          <tbody>
            <tr class="category-row">
              <td colspan="3">
                Bundle Size & Performance
              </td>
            </tr>
            <tr>
              <td>Product Scope</td>
              <td class="highlight-col">
                <span class="check">Focused analytics grid</span>
              </td>
              <td>Broad enterprise grid suite</td>
            </tr>
            <tr>
              <td>Framework Packages</td>
              <td class="highlight-col">
                <span class="check">React and Vue 3</span>
              </td>
              <td>Multiple frameworks</td>
            </tr>
            <tr>
              <td>Large Dataset Support</td>
              <td class="highlight-col">
                <span class="check">100K+ rows</span>
              </td>
              <td><span class="check">100K+ rows</span></td>
            </tr>

            <tr class="category-row">
              <td colspan="3">
                Core Features
              </td>
            </tr>
            <tr>
              <td>Sorting & Filtering</td>
              <td class="highlight-col">
                <span class="check">Yes</span>
              </td>
              <td><span class="check">Yes</span></td>
            </tr>
            <tr>
              <td>Column Resizing</td>
              <td class="highlight-col">
                <span class="check">Yes</span>
              </td>
              <td><span class="check">Yes</span></td>
            </tr>
            <tr>
              <td>Keyboard Navigation</td>
              <td class="highlight-col">
                <span class="check">Yes</span>
              </td>
              <td><span class="check">Yes</span></td>
            </tr>
            <tr>
              <td>CSV Export</td>
              <td class="highlight-col">
                <span class="check">Yes</span>
              </td>
              <td><span class="check">Yes</span></td>
            </tr>
            <tr>
              <td>Dark Mode</td>
              <td class="highlight-col">
                <span class="check">Built-in</span>
              </td>
              <td>Theme required</td>
            </tr>

            <tr class="category-row">
              <td colspan="3">
                Pivot Table Features
              </td>
            </tr>
            <tr>
              <td>Pivot Tables</td>
              <td class="highlight-col">
                <span class="check">Included</span>
              </td>
              <td>Enterprise only ($)</td>
            </tr>
            <tr>
              <td>Drag & Drop Pivot Config</td>
              <td class="highlight-col">
                <span class="check">Yes</span>
              </td>
              <td><span class="check">Yes</span></td>
            </tr>
            <tr>
              <td>Aggregations (Sum, Avg, Count...)</td>
              <td class="highlight-col">
                <span class="check">9 built-in</span>
              </td>
              <td><span class="check">Yes</span></td>
            </tr>
            <tr>
              <td>Custom Aggregation Functions</td>
              <td class="highlight-col">
                <span class="check">Yes</span>
              </td>
              <td><span class="check">Yes</span></td>
            </tr>
            <tr>
              <td>Row/Column Totals</td>
              <td class="highlight-col">
                <span class="check">Yes</span>
              </td>
              <td><span class="check">Yes</span></td>
            </tr>

            <tr class="category-row">
              <td colspan="3">
                Framework Support
              </td>
            </tr>
            <tr>
              <td>React</td>
              <td class="highlight-col">
                <span class="check">Yes</span>
              </td>
              <td><span class="check">Yes</span></td>
            </tr>
            <tr>
              <td>Vue 3</td>
              <td class="highlight-col">
                <span class="check">Yes</span>
              </td>
              <td><span class="check">Yes</span></td>
            </tr>
            <tr>
              <td>TypeScript</td>
              <td class="highlight-col">
                <span class="check">Full types</span>
              </td>
              <td><span class="check">Yes</span></td>
            </tr>

            <tr class="category-row">
              <td colspan="3">
                Pricing
              </td>
            </tr>
            <tr>
              <td>Free Tier</td>
              <td class="highlight-col">
                <span class="check">Data grid + Pivot (Sum)</span>
              </td>
              <td>Data grid only</td>
            </tr>
            <tr>
              <td>Pivot Table License</td>
              <td class="highlight-col">
                <span class="check">$49 one-time</span>
              </td>
              <td>Commercial license available</td>
            </tr>
            <tr>
              <td>Team License</td>
              <td class="highlight-col">
                <span class="check">$399 one-time</span>
              </td>
              <td>Commercial license available</td>
            </tr>
            <tr>
              <td>License Type</td>
              <td class="highlight-col">
                <span class="check">Perpetual</span>
              </td>
              <td>Annual subscription</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- When to Choose Section -->
    <section class="choice-section">
      <h2>When to Choose Each</h2>
      <div class="choice-grid">
        <div class="choice-card tinypivot">
          <h3>Choose TinyPivot when...</h3>
          <ul>
            <li>Bundle size matters to your application</li>
            <li>You need pivot tables without enterprise pricing</li>
            <li>You want a simple, focused API</li>
            <li>You prefer one-time licensing over subscriptions</li>
            <li>You're building dashboards or analytics views</li>
            <li>You need React or Vue 3 support</li>
          </ul>
        </div>
        <div class="choice-card aggrid">
          <h3>Choose AG Grid when...</h3>
          <ul>
            <li>You need advanced enterprise workflows such as Excel export</li>
            <li>You require row grouping with server-side processing</li>
            <li>You need Angular or vanilla JS support</li>
            <li>Your organization already has AG Grid licenses</li>
            <li>You need master-detail views</li>
            <li>Budget isn't a primary concern</li>
          </ul>
        </div>
      </div>
    </section>

    <!-- Code Comparison -->
    <section class="code-section">
      <h2>Simple Integration</h2>
      <p class="section-subtitle">
        Get started with TinyPivot in minutes, not hours
      </p>

      <div class="code-examples">
        <div class="code-block">
          <div class="code-header">
            <span>React</span>
          </div>
          <pre><code>import { DataGrid } from '@smallwebco/tinypivot-react'
import '@smallwebco/tinypivot-react/style.css'

function App() {
  const data = [/* your data */]
  return &lt;DataGrid data={data} showPivot /&gt;
}</code></pre>
        </div>

        <div class="code-block">
          <div class="code-header">
            <span>Vue 3</span>
          </div>
          <pre><code>&lt;script setup&gt;
import { DataGrid } from '@smallwebco/tinypivot-vue'
import '@smallwebco/tinypivot-vue/style.css'

const data = [/* your data */]
&lt;/script&gt;

&lt;template&gt;
  &lt;DataGrid :data="data" show-pivot /&gt;
&lt;/template&gt;</code></pre>
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section class="cta-section">
      <div class="cta-content">
        <h2>Ready to try TinyPivot?</h2>
        <p>Start with free pivot tables or unlock advanced analytics with a lifetime Pro license</p>
        <div class="cta-buttons">
          <RouterLink to="/ui#demo" class="btn btn-solid">
            Try Live Demo
          </RouterLink>
          <RouterLink to="/pricing?product=ui" class="btn btn-ghost">
            View Pricing
          </RouterLink>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.hero-content {
  display: grid;
  gap: 16px;
  max-width: 44rem;
}

.badge {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.subtitle {
  font-size: 1.15rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-top: var(--line);
}

.stat-card {
  display: grid;
  gap: 2px;
  padding: 18px 12px 18px 0;
  border-bottom: var(--line);
}

.stat-value {
  font-family: var(--font-display);
  font-size: 2.8rem;
  line-height: 0.95;
}

.stat-card.highlight .stat-value {
  color: var(--accent);
}

.stat-label {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.stat-detail {
  font-size: 0.95rem;
  color: var(--ink-muted);
}

.table-wrapper {
  overflow-x: auto;
  border: var(--line);
  background: var(--paper);
}

.comparison-table {
  table-layout: fixed;
  font-size: 0.88rem;
}

.comparison-table th,
.comparison-table td {
  padding: 10px 8px;
  overflow-wrap: anywhere;
}

.comparison-table th:first-child {
  width: 38%;
}

.comparison-table td:first-child {
  color: var(--ink);
}

.category-row td {
  padding-top: 22px;
  background: var(--paper-raised);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink);
}

.highlight-col {
  background: var(--ledger);
}

th.highlight-col {
  color: var(--accent);
}

.check::before {
  content: '✓ ';
  color: var(--accent);
}

.choice-grid,
.code-examples {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 20px;
}

.choice-card {
  padding: 22px;
  border: var(--line);
  background: var(--paper);
}

.choice-card.tinypivot {
  border-color: var(--ink);
  box-shadow: 6px 6px 0 var(--ink);
}

.section-subtitle {
  margin-bottom: 20px;
}

.code-block {
  min-width: 0;
  overflow: hidden;
  border: var(--line);
}

.code-header {
  padding: 10px 16px;
  border-bottom: 1px solid var(--win-rule);
  background: var(--win);
  color: var(--win-muted);
  font-family: var(--font-mono);
  font-size: 0.72rem;
}

.cta-content {
  display: grid;
  gap: 14px;
  justify-items: start;
  padding: 28px;
  border: 2px dashed var(--ink);
}

.cta-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

@media (min-width: 768px) {
  .comparison-table {
    font-size: 0.95rem;
  }

  .comparison-table th,
  .comparison-table td {
    padding: 12px 14px;
  }

  .stats-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .choice-grid,
  .code-examples {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
