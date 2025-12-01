<script setup lang="ts">
import { ref, computed } from 'vue'
import { DataGrid, setLicenseKey } from 'vue-pivot-grid'

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
  { id: 'single', name: 'Single Project', price: 49, description: 'Perfect for a single application' },
  { id: 'unlimited', name: 'Unlimited Projects', price: 149, description: 'Use in all your projects' },
  { id: 'team', name: 'Team License', price: 399, description: 'For teams up to 10 developers' },
] as const

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
          <span>Vue Pivot Grid</span>
        </div>
        <div class="nav-links">
          <a href="#features">Features</a>
          <a href="#demo">Demo</a>
          <a href="#pricing">Pricing</a>
          <a href="https://github.com/yourusername/vue-pivot-grid" target="_blank" class="nav-github">
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
          <a href="#pricing" class="btn btn-secondary">
            Get Pro License
          </a>
        </div>
        <div class="hero-install">
          <code>pnpm add vue-pivot-grid</code>
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
        <p>One-time payment, lifetime license with 1 year of updates</p>
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
          <a href="https://github.com/yourusername/vue-pivot-grid" class="btn btn-outline">
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
          
          <ul class="pricing-features">
            <li v-for="f in features" :key="f.name">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M5 13l4 4L19 7" />
              </svg>
              {{ f.name }}
            </li>
          </ul>
          <a href="#" class="btn btn-primary">
            Buy Now
          </a>
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section class="cta">
      <h2>Ready to supercharge your Vue app?</h2>
      <p>Join hundreds of developers using Vue Pivot Grid</p>
      <div class="cta-actions">
        <code>pnpm add vue-pivot-grid</code>
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
            <span>Vue Pivot Grid</span>
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
            <a href="#">Documentation</a>
            <a href="#">Changelog</a>
            <a href="#">License</a>
          </div>
          <div class="footer-col">
            <h4>Connect</h4>
            <a href="https://github.com/yourusername/vue-pivot-grid">GitHub</a>
            <a href="#">Twitter</a>
            <a href="#">Discord</a>
          </div>
        </div>
      </div>
      <div class="footer-bottom">
        <p>&copy; 2024 Vue Pivot Grid. All rights reserved.</p>
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
  padding: 6rem 2rem;
  max-width: 1000px;
  margin: 0 auto;
}

.pricing-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
}

.pricing-card {
  position: relative;
  padding: 2.5rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 1.5rem;
}

.pricing-card.pricing-pro {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(16, 185, 129, 0.1));
  border-color: rgba(139, 92, 246, 0.3);
}

.pricing-popular {
  position: absolute;
  top: -0.75rem;
  left: 50%;
  transform: translateX(-50%);
  padding: 0.375rem 1rem;
  background: linear-gradient(135deg, #8b5cf6, #10b981);
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  color: white;
  white-space: nowrap;
}

.pricing-header {
  text-align: center;
  margin-bottom: 2rem;
}

.pricing-header h3 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

.pricing-price {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.5rem;
}

.pricing-price .price {
  font-size: 3rem;
  font-weight: 700;
}

.pricing-price .period {
  color: #64748b;
  font-size: 0.875rem;
}

.plan-selector {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 2rem;
  padding: 0.25rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 0.5rem;
}

.plan-btn {
  flex: 1;
  padding: 0.5rem;
  background: transparent;
  border: none;
  border-radius: 0.375rem;
  color: #94a3b8;
  font-size: 0.75rem;
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

.pricing-features {
  list-style: none;
  margin-bottom: 2rem;
}

.pricing-features li {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0;
  font-size: 0.9375rem;
  color: #cbd5e1;
}

.pricing-features svg {
  color: #10b981;
  flex-shrink: 0;
}

.pricing-card .btn {
  width: 100%;
  justify-content: center;
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
  
  .pricing-cards {
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
</style>

