<script setup lang="ts">
import { ref, computed } from 'vue'
import { DataGrid, setLicenseKey } from 'tinypivot'

// Sample data
const sampleData = ref([
  { id: 1, region: 'North', product: 'Widget A', sales: 12500, units: 150, quarter: 'Q1', year: 2024 },
  { id: 2, region: 'North', product: 'Widget B', sales: 8300, units: 95, quarter: 'Q1', year: 2024 },
  { id: 3, region: 'South', product: 'Widget A', sales: 15200, units: 180, quarter: 'Q1', year: 2024 },
  { id: 4, region: 'South', product: 'Widget B', sales: 9800, units: 110, quarter: 'Q1', year: 2024 },
  { id: 5, region: 'East', product: 'Widget A', sales: 11000, units: 130, quarter: 'Q1', year: 2024 },
  { id: 6, region: 'East', product: 'Widget B', sales: 7500, units: 85, quarter: 'Q1', year: 2024 },
  { id: 7, region: 'West', product: 'Widget A', sales: 13800, units: 165, quarter: 'Q1', year: 2024 },
  { id: 8, region: 'West', product: 'Widget B', sales: 8900, units: 100, quarter: 'Q1', year: 2024 },
  { id: 9, region: 'North', product: 'Widget A', sales: 14200, units: 170, quarter: 'Q2', year: 2024 },
  { id: 10, region: 'North', product: 'Widget B', sales: 9100, units: 105, quarter: 'Q2', year: 2024 },
  { id: 11, region: 'South', product: 'Widget A', sales: 16500, units: 195, quarter: 'Q2', year: 2024 },
  { id: 12, region: 'South', product: 'Widget B', sales: 10500, units: 120, quarter: 'Q2', year: 2024 },
  { id: 13, region: 'East', product: 'Widget A', sales: 12300, units: 145, quarter: 'Q2', year: 2024 },
  { id: 14, region: 'East', product: 'Widget B', sales: 8200, units: 92, quarter: 'Q2', year: 2024 },
  { id: 15, region: 'West', product: 'Widget A', sales: 15100, units: 180, quarter: 'Q2', year: 2024 },
  { id: 16, region: 'West', product: 'Widget B', sales: 9600, units: 108, quarter: 'Q2', year: 2024 },
])

// Pricing
const selectedPlan = ref<'single' | 'unlimited' | 'team'>('single')
const plans = [
  { id: 'single', name: 'Single Project', price: 49, description: 'Lifetime license for 1 developer, 1 project. Includes updates.' },
  { id: 'unlimited', name: 'Unlimited Projects', price: 149, description: 'Lifetime license for 1 developer, unlimited projects. Includes updates.' },
  { id: 'team', name: 'Team License', price: 399, description: 'Lifetime license for up to 10 developers, unlimited projects. Includes updates.' },
] as const

const isCheckingOut = ref(false)

async function buyNow() {
  if (isCheckingOut.value) return
  
  isCheckingOut.value = true
  try {
    console.log('Starting checkout for plan:', selectedPlan.value)
    
    const response = await fetch('/api/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: selectedPlan.value }),
    })
    
    console.log('Response status:', response.status)
    
    // Check if response is ok
    if (!response.ok) {
      const text = await response.text()
      console.error('API error response:', text)
      alert(`API Error (${response.status}): ${text || 'Unknown error'}`)
      return
    }
    
    const data = await response.json()
    console.log('API response:', data)
    
    if (data.url) {
      window.location.href = data.url
    } else if (data.error) {
      alert(`Error: ${data.error}`)
    } else {
      alert('Failed to create checkout session. Please try again.')
    }
  } catch (error) {
    console.error('Checkout error:', error)
    alert(`Checkout error: ${error instanceof Error ? error.message : 'Unknown error'}`)
  } finally {
    isCheckingOut.value = false
  }
}

// Features comparison
const features = [
  { name: 'Data Grid Display', free: true, pro: true },
  { name: 'Column Sorting', free: true, pro: true },
  { name: 'Column Filtering', free: true, pro: true },
  { name: 'Keyboard Navigation', free: true, pro: true },
  { name: 'Cell Selection & Copy', free: true, pro: true },
  { name: 'Auto Column Widths', free: true, pro: true },
  { name: 'Pivot Table', free: false, pro: true },
  { name: 'Advanced Aggregations', free: false, pro: true },
  { name: 'Row/Column Totals', free: false, pro: true },
  { name: 'Percentage Mode', free: false, pro: true },
  { name: 'Config Persistence', free: false, pro: true },
  { name: 'No Watermark', free: false, pro: true },
]

// Active section for navigation
const activeSection = ref('hero')
</script>

<template>
  <div class="landing-page">
    <!-- Navigation -->
    <nav class="nav">
      <div class="nav-content">
        <div class="logo">
          <svg class="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span>TinyPivot</span>
        </div>
        <div class="nav-links">
          <a href="#features">Features</a>
          <a href="#quickstart">Quick Start</a>
          <a href="#demo">Demo</a>
          <a href="#pricing">Pricing</a>
          <a href="https://github.com/Small-Web-Co/tinypivot" target="_blank" class="nav-github">
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
          </a>
        </div>
      </div>
    </nav>

    <!-- Hero Section -->
    <section id="hero" class="hero">
      <div class="hero-bg"></div>
      <div class="hero-content">
        <div class="badge">Vue 3 Component Library</div>
        <h1>Excel-like Data Grid & <span class="gradient-text">Pivot Table</span></h1>
        <p class="hero-subtitle">
          A powerful, performant data grid with built-in filtering, sorting, and pivot table functionality.
          Freemium model - start free, upgrade when you need more.
        </p>
        <div class="hero-actions">
          <a href="#demo" class="btn btn-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Try Demo
          </a>
          <a href="https://www.tiny-pivot.com/#pricing" class="btn btn-secondary">
            Get Pro License
          </a>
        </div>
        <div class="hero-install">
          <code>pnpm add tinypivot</code>
          <button class="copy-btn" title="Copy to clipboard">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
      </div>
    </section>

    <!-- Features Section -->
    <section id="features" class="features">
      <div class="section-header">
        <h2>Features</h2>
        <p>Everything you need for data-heavy Vue applications</p>
      </div>
      
      <div class="features-grid">
        <div class="feature-card">
          <div class="feature-icon feature-icon-blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h3>Excel-like Grid</h3>
          <p>Familiar spreadsheet experience with column filtering, sorting, and smart number formatting.</p>
          <span class="feature-badge free">Free</span>
        </div>

        <div class="feature-card">
          <div class="feature-icon feature-icon-violet">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
          </div>
          <h3>Smart Filtering</h3>
          <p>Multi-select column filters with search, just like Excel's AutoFilter feature.</p>
          <span class="feature-badge free">Free</span>
        </div>

        <div class="feature-card">
          <div class="feature-icon feature-icon-emerald">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
            </svg>
          </div>
          <h3>Pivot Table</h3>
          <p>Drag-and-drop pivot table with multiple aggregation functions and totals.</p>
          <span class="feature-badge pro">Pro</span>
        </div>

        <div class="feature-card">
          <div class="feature-icon feature-icon-amber">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h3>Aggregations</h3>
          <p>Sum, Count, Average, Min, Max, and Count Distinct aggregation functions.</p>
          <span class="feature-badge pro">Pro</span>
        </div>

        <div class="feature-card">
          <div class="feature-icon feature-icon-pink">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
            </svg>
          </div>
          <h3>Selection Stats</h3>
          <p>Select multiple cells and see sum, average, and count in the status bar.</p>
          <span class="feature-badge free">Free</span>
        </div>

        <div class="feature-card">
          <div class="feature-icon feature-icon-cyan">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3>License System</h3>
          <p>Simple license key validation - no network calls, just add your key and go.</p>
          <span class="feature-badge pro">Pro</span>
        </div>
      </div>
    </section>

    <!-- Quick Start Section -->
    <section id="quickstart" class="quickstart">
      <div class="section-header">
        <div class="badge badge-glow">Dead Simple Integration</div>
        <h2>Up and Running in <span class="gradient-text">30 Seconds</span></h2>
        <p>No complex configuration. No boilerplate. Just install, import, and go.</p>
      </div>

      <div class="steps-container">
        <div class="step">
          <div class="step-number">1</div>
          <div class="step-content">
            <h3>Install</h3>
            <p>One package, zero dependencies</p>
            <div class="code-block">
              <code>pnpm add tinypivot</code>
            </div>
          </div>
        </div>

        <div class="step-connector">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </div>

        <div class="step">
          <div class="step-number">2</div>
          <div class="step-content">
            <h3>Import</h3>
            <p>Just two lines of setup</p>
            <div class="code-block code-block-multi">
              <pre><code><span class="code-keyword">import</span> { DataGrid } <span class="code-keyword">from</span> <span class="code-string">'tinypivot'</span>
<span class="code-keyword">import</span> <span class="code-string">'tinypivot/style.css'</span></code></pre>
            </div>
          </div>
        </div>

        <div class="step-connector">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </div>

        <div class="step">
          <div class="step-number">3</div>
          <div class="step-content">
            <h3>Use</h3>
            <p>Pass your data, done.</p>
            <div class="code-block code-block-multi">
              <pre><code><span class="code-tag">&lt;DataGrid</span> <span class="code-attr">:data</span>=<span class="code-string">"yourData"</span> <span class="code-tag">/&gt;</span></code></pre>
            </div>
          </div>
        </div>
      </div>

      <div class="example-showcase">
        <div class="example-header">
          <span class="example-dot"></span>
          <span class="example-dot"></span>
          <span class="example-dot"></span>
          <span class="example-title">App.vue</span>
        </div>
        <div class="example-code">
          <pre><code><span class="code-tag">&lt;script setup lang="ts"&gt;</span>
<span class="code-keyword">import</span> { DataGrid } <span class="code-keyword">from</span> <span class="code-string">'tinypivot'</span>
<span class="code-keyword">import</span> <span class="code-string">'tinypivot/style.css'</span>

<span class="code-keyword">const</span> data = [
  { id: <span class="code-number">1</span>, region: <span class="code-string">'North'</span>, product: <span class="code-string">'Widget A'</span>, sales: <span class="code-number">12500</span> },
  { id: <span class="code-number">2</span>, region: <span class="code-string">'South'</span>, product: <span class="code-string">'Widget B'</span>, sales: <span class="code-number">8300</span> },
  { id: <span class="code-number">3</span>, region: <span class="code-string">'East'</span>, product: <span class="code-string">'Widget A'</span>, sales: <span class="code-number">15200</span> },
]
<span class="code-tag">&lt;/script&gt;</span>

<span class="code-tag">&lt;template&gt;</span>
  <span class="code-tag">&lt;DataGrid</span> <span class="code-attr">:data</span>=<span class="code-string">"data"</span> <span class="code-tag">/&gt;</span>
<span class="code-tag">&lt;/template&gt;</span></code></pre>
        </div>
      </div>

      <div class="api-preview">
        <h3>That's it. Seriously.</h3>
        <p>But when you need more control, we've got you covered:</p>
        <div class="props-grid">
          <div class="prop-item">
            <code>:data</code>
            <span>Your array of objects</span>
          </div>
          <div class="prop-item">
            <code>:loading</code>
            <span>Show loading state</span>
          </div>
          <div class="prop-item">
            <code>:row-height</code>
            <span>Customize row height</span>
          </div>
          <div class="prop-item">
            <code>:font-size</code>
            <span>'xs' | 'sm' | 'base'</span>
          </div>
          <div class="prop-item">
            <code>:show-pivot</code>
            <span>Toggle pivot button</span>
          </div>
          <div class="prop-item">
            <code>@cell-click</code>
            <span>Cell click event</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Demo Section -->
    <section id="demo" class="demo">
      <div class="section-header">
        <h2>Live Demo</h2>
        <p>Try the grid and pivot table with sample data</p>
      </div>
      
      <div class="demo-container">
        <DataGrid
          :data="sampleData"
          :show-pivot="true"
          font-size="sm"
        />
      </div>

      <div class="demo-note demo-note-success">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
          <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span><strong>Try it now!</strong> All Pro features are unlocked in this demo. Click "Pivot" to explore the pivot table functionality.</span>
      </div>
    </section>

    <!-- Pricing Section -->
    <section id="pricing" class="pricing">
      <div class="section-header">
        <h2>Simple Pricing</h2>
        <p>One-time payment, lifetime license with free updates</p>
      </div>

      <div class="pricing-cards">
        <div class="pricing-card pricing-free">
          <div class="pricing-header">
            <h3>Free</h3>
            <div class="pricing-price">
              <span class="price">$0</span>
              <span class="period">forever</span>
            </div>
          </div>
          <ul class="pricing-features">
            <li v-for="f in features.filter(x => x.free)" :key="f.name">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M5 13l4 4L19 7" />
              </svg>
              {{ f.name }}
            </li>
          </ul>
          <a href="https://github.com/Small-Web-Co/tinypivot" class="btn btn-outline">
            Get Started
          </a>
        </div>

        <div class="pricing-card pricing-pro">
          <div class="pricing-popular">Most Popular</div>
          <div class="pricing-header">
            <h3>Pro</h3>
            <div class="pricing-price">
              <span class="price">${{ plans.find(p => p.id === selectedPlan)?.price }}</span>
              <span class="period">one-time</span>
            </div>
          </div>
          
          <div class="plan-selector">
            <button
              v-for="plan in plans"
              :key="plan.id"
              class="plan-btn"
              :class="{ active: selectedPlan === plan.id }"
              @click="selectedPlan = plan.id"
            >
              {{ plan.name }}
            </button>
          </div>
          <p class="plan-description">{{ plans.find(p => p.id === selectedPlan)?.description }}</p>
          
          <ul class="pricing-features">
            <li v-for="f in features" :key="f.name">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M5 13l4 4L19 7" />
              </svg>
              {{ f.name }}
            </li>
          </ul>
          <button 
            class="btn btn-primary" 
            :class="{ 'btn-loading': isCheckingOut }"
            :disabled="isCheckingOut"
            @click="buyNow"
          >
            <span v-if="isCheckingOut">Processing...</span>
            <span v-else>Buy Now - ${{ plans.find(p => p.id === selectedPlan)?.price }}</span>
          </button>
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section class="cta">
      <h2>Ready to supercharge your Vue app?</h2>
      <p>Join hundreds of developers using TinyPivot</p>
      <div class="cta-actions">
        <code>pnpm add tinypivot</code>
      </div>
    </section>

    <!-- Footer -->
    <footer class="footer">
      <div class="footer-content">
        <div class="footer-brand">
          <div class="logo">
            <svg class="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span>TinyPivot</span>
          </div>
          <p>Excel-like data grid & pivot table for Vue 3</p>
        </div>
        <div class="footer-links">
          <div class="footer-col">
            <h4>Product</h4>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#demo">Demo</a>
          </div>
          <div class="footer-col">
            <h4>Resources</h4>
            <a href="https://github.com/Small-Web-Co/tinypivot#readme" target="_blank">Documentation</a>
            <a href="https://github.com/Small-Web-Co/tinypivot/releases" target="_blank">Changelog</a>
            <a href="https://github.com/Small-Web-Co/tinypivot/blob/main/LICENSE" target="_blank">License</a>
          </div>
          <div class="footer-col">
            <h4>Connect</h4>
            <a href="https://github.com/Small-Web-Co/tinypivot" target="_blank">GitHub</a>
          </div>
        </div>
      </div>
      <div class="footer-bottom">
        <p>&copy; 2024 TinyPivot. All rights reserved.</p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* Landing Page Styles */
.landing-page {
  min-height: 100vh;
}

/* Navigation */
.nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background: rgba(10, 10, 15, 0.8);
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
  font-size: 1.125rem;
}

.logo-icon {
  width: 1.5rem;
  height: 1.5rem;
  color: #10b981;
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 2rem;
}

.nav-links a {
  color: #94a3b8;
  text-decoration: none;
  font-size: 0.875rem;
  font-weight: 500;
  transition: color 0.2s;
}

.nav-links a:hover {
  color: white;
}

.nav-github {
  display: flex;
  align-items: center;
}

/* Hero */
.hero {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8rem 2rem 4rem;
  overflow: hidden;
}

.hero-bg {
  position: absolute;
  inset: 0;
  background: 
    radial-gradient(ellipse 80% 50% at 50% -20%, rgba(16, 185, 129, 0.15), transparent),
    radial-gradient(ellipse 60% 40% at 80% 60%, rgba(79, 70, 229, 0.1), transparent);
}

.hero-content {
  position: relative;
  max-width: 800px;
  text-align: center;
}

.badge {
  display: inline-block;
  padding: 0.375rem 0.875rem;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
  color: #10b981;
  margin-bottom: 1.5rem;
}

.hero h1 {
  font-size: 3.5rem;
  font-weight: 700;
  line-height: 1.1;
  margin-bottom: 1.5rem;
  letter-spacing: -0.02em;
}

.gradient-text {
  background: linear-gradient(135deg, #10b981, #3b82f6, #8b5cf6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-subtitle {
  font-size: 1.25rem;
  color: #94a3b8;
  margin-bottom: 2.5rem;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}

.hero-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  margin-bottom: 3rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  font-weight: 500;
  font-size: 0.9375rem;
  text-decoration: none;
  transition: all 0.2s;
  cursor: pointer;
  border: none;
}

.btn-primary {
  background: linear-gradient(135deg, #10b981, #059669);
  color: white;
  box-shadow: 0 4px 14px 0 rgba(16, 185, 129, 0.3);
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px 0 rgba(16, 185, 129, 0.4);
}

.btn-primary:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
}

.btn-loading {
  position: relative;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
}

.btn-outline {
  background: transparent;
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.btn-outline:hover {
  background: rgba(255, 255, 255, 0.1);
}

.hero-install {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
}

.hero-install code {
  font-size: 0.875rem;
  color: #10b981;
}

.copy-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.375rem;
  background: transparent;
  border: none;
  color: #64748b;
  cursor: pointer;
  border-radius: 0.25rem;
  transition: all 0.2s;
}

.copy-btn:hover {
  color: white;
  background: rgba(255, 255, 255, 0.1);
}

/* Sections */
.section-header {
  text-align: center;
  margin-bottom: 4rem;
}

.section-header h2 {
  font-size: 2.5rem;
  font-weight: 700;
  margin-bottom: 1rem;
  letter-spacing: -0.02em;
}

.section-header p {
  font-size: 1.125rem;
  color: #94a3b8;
}

/* Features */
.features {
  padding: 6rem 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
}

.feature-card {
  position: relative;
  padding: 2rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 1rem;
  transition: all 0.3s;
}

.feature-card:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.15);
  transform: translateY(-4px);
}

.feature-icon {
  width: 3rem;
  height: 3rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.75rem;
  margin-bottom: 1.25rem;
}

.feature-icon svg {
  width: 1.5rem;
  height: 1.5rem;
}

.feature-icon-blue { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
.feature-icon-violet { background: rgba(139, 92, 246, 0.15); color: #8b5cf6; }
.feature-icon-emerald { background: rgba(16, 185, 129, 0.15); color: #10b981; }
.feature-icon-amber { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
.feature-icon-pink { background: rgba(236, 72, 153, 0.15); color: #ec4899; }
.feature-icon-cyan { background: rgba(6, 182, 212, 0.15); color: #06b6d4; }

.feature-card h3 {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
}

.feature-card p {
  color: #94a3b8;
  font-size: 0.9375rem;
  line-height: 1.6;
}

.feature-badge {
  position: absolute;
  top: 1.25rem;
  right: 1.25rem;
  padding: 0.25rem 0.625rem;
  border-radius: 9999px;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.feature-badge.free {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.feature-badge.pro {
  background: rgba(139, 92, 246, 0.15);
  color: #a78bfa;
}

/* Quick Start */
.quickstart {
  padding: 6rem 2rem;
  max-width: 1200px;
  margin: 0 auto;
  position: relative;
}

.quickstart::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  height: 100%;
  background: radial-gradient(ellipse 60% 40% at 50% 20%, rgba(16, 185, 129, 0.08), transparent);
  pointer-events: none;
}

.badge-glow {
  animation: badge-pulse 2s ease-in-out infinite;
}

@keyframes badge-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
  50% { box-shadow: 0 0 20px 4px rgba(16, 185, 129, 0.2); }
}

.steps-container {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 1rem;
  margin-bottom: 4rem;
  flex-wrap: wrap;
}

.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  max-width: 240px;
}

.step-number {
  width: 3.5rem;
  height: 3.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #10b981, #059669);
  border-radius: 50%;
  font-size: 1.5rem;
  font-weight: 700;
  color: white;
  box-shadow: 0 8px 24px rgba(16, 185, 129, 0.3);
}

.step-content {
  text-align: center;
}

.step-content h3 {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.step-content p {
  font-size: 0.875rem;
  color: #64748b;
  margin-bottom: 0.75rem;
}

.step-connector {
  display: flex;
  align-items: center;
  padding-top: 1rem;
  color: #334155;
}

.step-connector svg {
  width: 1.5rem;
  height: 1.5rem;
}

.code-block {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  font-size: 0.8125rem;
}

.code-block code {
  color: #10b981;
}

.code-block-multi {
  text-align: left;
}

.code-block-multi pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.example-showcase {
  max-width: 700px;
  margin: 0 auto 4rem;
  border-radius: 1rem;
  overflow: hidden;
  background: #0d1117;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

.example-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.example-dot {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 50%;
  background: #374151;
}

.example-dot:nth-child(1) { background: #ef4444; }
.example-dot:nth-child(2) { background: #f59e0b; }
.example-dot:nth-child(3) { background: #22c55e; }

.example-title {
  margin-left: auto;
  font-size: 0.75rem;
  color: #64748b;
}

.example-code {
  padding: 1.5rem;
  font-size: 0.8125rem;
  line-height: 1.7;
  overflow-x: auto;
}

.example-code pre {
  margin: 0;
}

.example-code code {
  color: #e2e8f0;
}

.code-keyword { color: #c678dd; }
.code-string { color: #98c379; }
.code-number { color: #d19a66; }
.code-tag { color: #61afef; }
.code-attr { color: #d19a66; }

.api-preview {
  text-align: center;
}

.api-preview h3 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.api-preview > p {
  color: #64748b;
  margin-bottom: 2rem;
}

.props-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
  max-width: 800px;
  margin: 0 auto;
}

.prop-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.5rem;
  transition: all 0.2s;
}

.prop-item:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(16, 185, 129, 0.3);
}

.prop-item code {
  font-size: 0.875rem;
  font-weight: 500;
  color: #10b981;
}

.prop-item span {
  font-size: 0.75rem;
  color: #64748b;
}

/* Demo */
.demo {
  padding: 6rem 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.demo-container {
  background: white;
  border-radius: 1rem;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

.demo-note {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 1.5rem;
  padding: 1rem;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.2);
  border-radius: 0.5rem;
  font-size: 0.875rem;
  color: #fbbf24;
}

.demo-note-success {
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.3);
  color: #34d399;
}

.demo-note-success strong {
  color: #10b981;
}

/* Pricing */
.pricing {
  padding: 4rem 2rem;
  max-width: 900px;
  margin: 0 auto;
}

.pricing .section-header {
  margin-bottom: 2rem;
}

.pricing-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.5rem;
}

.pricing-card {
  position: relative;
  padding: 1.5rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 1rem;
}

.pricing-card.pricing-pro {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(16, 185, 129, 0.1));
  border-color: rgba(139, 92, 246, 0.3);
}

.pricing-popular {
  position: absolute;
  top: -0.625rem;
  left: 50%;
  transform: translateX(-50%);
  padding: 0.25rem 0.75rem;
  background: linear-gradient(135deg, #8b5cf6, #10b981);
  border-radius: 9999px;
  font-size: 0.6875rem;
  font-weight: 600;
  color: white;
  white-space: nowrap;
}

.pricing-header {
  text-align: center;
  margin-bottom: 1rem;
}

.pricing-header h3 {
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.pricing-price {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.375rem;
}

.pricing-price .price {
  font-size: 2rem;
  font-weight: 700;
}

.pricing-price .period {
  color: #64748b;
  font-size: 0.75rem;
}

.plan-selector {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1rem;
  padding: 0.1875rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 0.375rem;
}

.plan-btn {
  flex: 1;
  padding: 0.375rem 0.25rem;
  background: transparent;
  border: none;
  border-radius: 0.25rem;
  color: #94a3b8;
  font-size: 0.6875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.plan-btn:hover {
  color: white;
}

.plan-btn.active {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.plan-description {
  text-align: center;
  font-size: 0.75rem;
  color: #a78bfa;
  margin-bottom: 1rem;
  min-height: 2rem;
}

.pricing-features {
  list-style: none;
  margin-bottom: 1rem;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.25rem 0.5rem;
}

.pricing-features li {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0;
  font-size: 0.75rem;
  color: #cbd5e1;
}

.pricing-features svg {
  color: #10b981;
  flex-shrink: 0;
  width: 12px;
  height: 12px;
}

.pricing-card .btn {
  width: 100%;
  justify-content: center;
  padding: 0.625rem 1rem;
  font-size: 0.8125rem;
}

/* CTA */
.cta {
  padding: 6rem 2rem;
  text-align: center;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(79, 70, 229, 0.1));
}

.cta h2 {
  font-size: 2.5rem;
  font-weight: 700;
  margin-bottom: 1rem;
}

.cta p {
  font-size: 1.125rem;
  color: #94a3b8;
  margin-bottom: 2rem;
}

.cta-actions code {
  display: inline-block;
  padding: 1rem 1.5rem;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  font-size: 1rem;
  color: #10b981;
}

/* Footer */
.footer {
  padding: 4rem 2rem 2rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.footer-content {
  max-width: 1200px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 2fr 3fr;
  gap: 4rem;
  margin-bottom: 3rem;
}

.footer-brand p {
  color: #64748b;
  font-size: 0.875rem;
  margin-top: 1rem;
}

.footer-links {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
}

.footer-col h4 {
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 1rem;
  color: #e2e8f0;
}

.footer-col a {
  display: block;
  color: #64748b;
  text-decoration: none;
  font-size: 0.875rem;
  padding: 0.375rem 0;
  transition: color 0.2s;
}

.footer-col a:hover {
  color: white;
}

.footer-bottom {
  max-width: 1200px;
  margin: 0 auto;
  padding-top: 2rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  text-align: center;
}

.footer-bottom p {
  color: #475569;
  font-size: 0.875rem;
}

/* Responsive */
@media (max-width: 768px) {
  .hero h1 {
    font-size: 2.5rem;
  }
  
  .hero-actions {
    flex-direction: column;
  }
  
  .steps-container {
    flex-direction: column;
    align-items: center;
  }
  
  .step {
    max-width: 100%;
    width: 100%;
  }
  
  .step-connector {
    transform: rotate(90deg);
    padding: 0.5rem 0;
  }
  
  .example-code {
    font-size: 0.75rem;
    padding: 1rem;
  }
  
  .props-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .pricing-cards {
    grid-template-columns: 1fr;
  }
  
  .pricing-features {
    grid-template-columns: 1fr;
  }
  
  .footer-content {
    grid-template-columns: 1fr;
    gap: 2rem;
  }
  
  .footer-links {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .props-grid {
    grid-template-columns: 1fr;
  }
  
  .nav-links a:not(.nav-github) {
    display: none;
  }
}
</style>

