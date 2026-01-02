<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterLink } from 'vue-router'

onMounted(() => {
  // Update meta tags for SEO
  document.title = 'TinyPivot vs AG Grid - Lightweight Pivot Table Comparison'

  const metaDescription = document.querySelector('meta[name="description"]')
  if (metaDescription) {
    metaDescription.setAttribute('content', 'Compare TinyPivot and AG Grid for React and Vue. TinyPivot is 10x smaller (37KB vs 500KB+), 10x cheaper ($49 vs $999+), with pivot tables and data grid features included.')
  }
})
</script>

<template>
  <div class="comparison-page">
    <!-- Navigation -->
    <nav class="nav">
      <div class="nav-content">
        <RouterLink to="/" class="logo">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
          <span>TinyPivot</span>
        </RouterLink>
        <div class="nav-links">
          <RouterLink to="/#features">
            Features
          </RouterLink>
          <RouterLink to="/#demo">
            Demo
          </RouterLink>
          <RouterLink to="/#pricing">
            Pricing
          </RouterLink>
        </div>
      </div>
    </nav>

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
            10x
          </div>
          <div class="stat-label">
            Smaller Bundle
          </div>
          <div class="stat-detail">
            37KB vs 500KB+
          </div>
        </div>
        <div class="stat-card highlight">
          <div class="stat-value">
            20x
          </div>
          <div class="stat-label">
            Lower Cost
          </div>
          <div class="stat-detail">
            $49 vs $999+
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-value">
            0
          </div>
          <div class="stat-label">
            Dependencies
          </div>
          <div class="stat-detail">
            Just React or Vue
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
              <td>Bundle Size (gzipped)</td>
              <td class="highlight-col">
                <span class="check">37KB</span>
              </td>
              <td>500KB+</td>
            </tr>
            <tr>
              <td>Zero Dependencies</td>
              <td class="highlight-col">
                <span class="check">Yes</span>
              </td>
              <td>No</td>
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
              <td>$999+/year</td>
            </tr>
            <tr>
              <td>Team License</td>
              <td class="highlight-col">
                <span class="check">$399 one-time</span>
              </td>
              <td>$2,999+/year</td>
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
            <li>You need advanced features like Excel export, charts</li>
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
          <pre><code>import { TinyPivot } from '@smallwebco/tinypivot-react'
import '@smallwebco/tinypivot-react/style.css'

function App() {
  const data = [/* your data */]
  const columns = [
    { key: 'region', header: 'Region' },
    { key: 'product', header: 'Product' },
    { key: 'sales', header: 'Sales', type: 'number' },
  ]

  return &lt;TinyPivot data={data} columns={columns} showPivot /&gt;
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
const columns = [
  { key: 'region', header: 'Region' },
  { key: 'product', header: 'Product' },
  { key: 'sales', header: 'Sales', type: 'number' },
]
&lt;/script&gt;

&lt;template&gt;
  &lt;DataGrid :data="data" :columns="columns" show-pivot /&gt;
&lt;/template&gt;</code></pre>
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section class="cta-section">
      <div class="cta-content">
        <h2>Ready to try TinyPivot?</h2>
        <p>Start with the free tier or get full pivot table features for just $49</p>
        <div class="cta-buttons">
          <RouterLink to="/#demo" class="btn btn-primary">
            Try Live Demo
          </RouterLink>
          <RouterLink to="/#pricing" class="btn btn-secondary">
            View Pricing
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="footer">
      <div class="footer-content">
        <div class="footer-logo">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
          <span>TinyPivot</span>
        </div>
        <p>A lightweight pivot table component for React and Vue 3</p>
        <div class="footer-links">
          <a href="https://github.com/Small-Web-Co/tinypivot" target="_blank" rel="noopener">GitHub</a>
          <RouterLink to="/">
            Home
          </RouterLink>
          <RouterLink to="/#pricing">
            Pricing
          </RouterLink>
        </div>
        <p class="copyright">
          &copy; 2024 Small Web, LLC. All rights reserved.
        </p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.comparison-page {
  min-height: 100vh;
  background: #0a0a0f;
  color: #e2e8f0;
  font-family: 'Space Grotesk', system-ui, sans-serif;
}

/* Navigation */
.nav {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(10, 10, 15, 0.9);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.nav-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1rem 2rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 1.25rem;
  color: #e2e8f0;
  text-decoration: none;
}

.logo svg {
  color: #10b981;
}

.nav-links {
  display: flex;
  gap: 2rem;
}

.nav-links a {
  color: #94a3b8;
  text-decoration: none;
  transition: color 0.2s;
}

.nav-links a:hover {
  color: #10b981;
}

/* Hero */
.hero {
  padding: 6rem 2rem 4rem;
  text-align: center;
  background: linear-gradient(180deg, rgba(16, 185, 129, 0.1) 0%, transparent 50%);
}

.hero-content {
  max-width: 800px;
  margin: 0 auto;
}

.badge {
  display: inline-block;
  padding: 0.5rem 1rem;
  background: rgba(16, 185, 129, 0.2);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 9999px;
  color: #10b981;
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 1.5rem;
}

.hero h1 {
  font-size: 3.5rem;
  font-weight: 700;
  margin-bottom: 1.5rem;
  background: linear-gradient(135deg, #fff 0%, #10b981 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  font-size: 1.25rem;
  color: #94a3b8;
  line-height: 1.8;
}

/* Stats Section */
.stats-section {
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1.5rem;
}

.stat-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 1rem;
  padding: 2rem;
  text-align: center;
}

.stat-card.highlight {
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.3);
}

.stat-value {
  font-size: 3rem;
  font-weight: 700;
  color: #10b981;
  margin-bottom: 0.5rem;
}

.stat-label {
  font-size: 1.125rem;
  font-weight: 600;
  color: #e2e8f0;
  margin-bottom: 0.25rem;
}

.stat-detail {
  font-size: 0.875rem;
  color: #64748b;
}

/* Comparison Section */
.comparison-section {
  padding: 4rem 2rem;
  max-width: 1000px;
  margin: 0 auto;
}

.comparison-section h2 {
  text-align: center;
  font-size: 2rem;
  margin-bottom: 2rem;
}

.table-wrapper {
  overflow-x: auto;
}

.comparison-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.95rem;
}

.comparison-table th,
.comparison-table td {
  padding: 1rem;
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.comparison-table th {
  font-weight: 600;
  background: rgba(255, 255, 255, 0.05);
}

.comparison-table th.highlight-col {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.comparison-table td.highlight-col {
  background: rgba(16, 185, 129, 0.05);
}

.category-row td {
  font-weight: 600;
  color: #10b981;
  background: rgba(16, 185, 129, 0.1) !important;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.check {
  color: #10b981;
  font-weight: 500;
}

/* Choice Section */
.choice-section {
  padding: 4rem 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

.choice-section h2 {
  text-align: center;
  font-size: 2rem;
  margin-bottom: 2rem;
}

.choice-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 2rem;
}

.choice-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 1rem;
  padding: 2rem;
}

.choice-card.tinypivot {
  border-color: rgba(16, 185, 129, 0.3);
  background: rgba(16, 185, 129, 0.05);
}

.choice-card h3 {
  font-size: 1.25rem;
  margin-bottom: 1.5rem;
  color: #e2e8f0;
}

.choice-card.tinypivot h3 {
  color: #10b981;
}

.choice-card ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.choice-card li {
  padding: 0.5rem 0;
  padding-left: 1.5rem;
  position: relative;
  color: #94a3b8;
}

.choice-card li::before {
  content: '•';
  position: absolute;
  left: 0;
  color: #64748b;
}

.choice-card.tinypivot li::before {
  content: '✓';
  color: #10b981;
}

/* Code Section */
.code-section {
  padding: 4rem 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

.code-section h2 {
  text-align: center;
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.section-subtitle {
  text-align: center;
  color: #64748b;
  margin-bottom: 2rem;
}

.code-examples {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 2rem;
}

.code-block {
  background: #1a1a2e;
  border-radius: 0.75rem;
  overflow: hidden;
}

.code-header {
  background: rgba(255, 255, 255, 0.05);
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  color: #94a3b8;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.code-block pre {
  padding: 1.5rem;
  margin: 0;
  overflow-x: auto;
}

.code-block code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85rem;
  line-height: 1.6;
  color: #e2e8f0;
}

/* CTA Section */
.cta-section {
  padding: 6rem 2rem;
  background: linear-gradient(180deg, transparent 0%, rgba(16, 185, 129, 0.1) 100%);
}

.cta-content {
  max-width: 600px;
  margin: 0 auto;
  text-align: center;
}

.cta-content h2 {
  font-size: 2rem;
  margin-bottom: 1rem;
}

.cta-content p {
  color: #94a3b8;
  margin-bottom: 2rem;
}

.cta-buttons {
  display: flex;
  gap: 1rem;
  justify-content: center;
}

.btn {
  padding: 0.875rem 2rem;
  border-radius: 0.5rem;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.2s;
}

.btn-primary {
  background: #10b981;
  color: #fff;
}

.btn-primary:hover {
  background: #059669;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.15);
}

/* Footer */
.footer {
  padding: 3rem 2rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.footer-content {
  max-width: 1200px;
  margin: 0 auto;
  text-align: center;
}

.footer-logo {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 1.125rem;
  color: #e2e8f0;
  margin-bottom: 0.5rem;
}

.footer-logo svg {
  color: #10b981;
}

.footer-content > p {
  color: #64748b;
  font-size: 0.875rem;
  margin-bottom: 1rem;
}

.footer-links {
  display: flex;
  gap: 2rem;
  justify-content: center;
  margin-bottom: 2rem;
}

.footer-links a {
  color: #94a3b8;
  text-decoration: none;
  font-size: 0.875rem;
}

.footer-links a:hover {
  color: #10b981;
}

.copyright {
  color: #475569;
  font-size: 0.8rem;
}

/* Responsive */
@media (max-width: 900px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .choice-grid,
  .code-examples {
    grid-template-columns: 1fr;
  }

  .hero h1 {
    font-size: 2.5rem;
  }
}

@media (max-width: 600px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .nav-links {
    display: none;
  }

  .cta-buttons {
    flex-direction: column;
  }
}
</style>
