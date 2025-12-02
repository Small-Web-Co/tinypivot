<script setup lang="ts">
import { ref, computed } from 'vue'
import { DataGrid, enableDemoMode } from 'tinypivot'

// Enable demo mode for the live demo
enableDemoMode()

// Framework toggle
const selectedFramework = ref<'vue' | 'react'>('vue')

// Generate large sample dataset (10,000 rows)
function generateSampleData(count: number) {
  const regions = ['North', 'South', 'East', 'West', 'Central', 'Northeast', 'Southeast', 'Northwest', 'Southwest']
  const products = ['Widget A', 'Widget B', 'Widget C', 'Gadget X', 'Gadget Y', 'Device Pro', 'Device Lite', 'Tool Plus']
  const categories = ['Electronics', 'Hardware', 'Software', 'Services', 'Accessories']
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4']
  const years = [2022, 2023, 2024]
  const salesReps = ['Alice', 'Bob', 'Carol', 'David', 'Eve', 'Frank', 'Grace', 'Henry', 'Ivy', 'Jack']
  const statuses = ['Completed', 'Pending', 'Processing', 'Shipped', 'Delivered']

  const data = []
  for (let i = 1; i <= count; i++) {
    const basePrice = Math.floor(Math.random() * 500) + 50
    const units = Math.floor(Math.random() * 200) + 10
    data.push({
      id: i,
      region: regions[Math.floor(Math.random() * regions.length)],
      product: products[Math.floor(Math.random() * products.length)],
      category: categories[Math.floor(Math.random() * categories.length)],
      sales: basePrice * units,
      units,
      price: basePrice,
      quarter: quarters[Math.floor(Math.random() * quarters.length)],
      year: years[Math.floor(Math.random() * years.length)],
      rep: salesReps[Math.floor(Math.random() * salesReps.length)],
      status: statuses[Math.floor(Math.random() * statuses.length)],
      margin: Math.round((Math.random() * 30 + 10) * 100) / 100,
    })
  }
  return data
}

const sampleData = ref(generateSampleData(10000))

// Theme toggle
const demoTheme = ref<'light' | 'dark'>('dark')
function toggleDemoTheme() {
  demoTheme.value = demoTheme.value === 'dark' ? 'light' : 'dark'
}

// Package name based on framework
const packageName = computed(() => selectedFramework.value === 'vue' ? '@tinypivot/vue' : '@tinypivot/react')

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

// Features comparison - compact version
const freeFeatures = [
  'Data Grid', 'Sorting', 'Filtering', 'Search', 'Export CSV',
  'Pagination', 'Column Resize', 'Clipboard', 'Dark Mode', 'Keyboard Nav'
]
const proFeatures = [
  'Pivot Table', 'Aggregations', 'Row/Col Totals', 'No Watermark'
]

// Active section for navigation
const activeSection = ref('hero')

// Copy to clipboard
function copyInstallCommand() {
  navigator.clipboard.writeText(`pnpm add ${packageName.value}`)
}
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
        </div>
        <div class="nav-actions">
          <div class="nav-framework-toggle">
            <button 
              :class="['nav-framework-btn', { active: selectedFramework === 'vue' }]"
              @click="selectedFramework = 'vue'"
              title="Vue 3"
            >
              <svg viewBox="0 0 128 128" width="16" height="16">
                <path fill="#42b883" d="M78.8,10L64,35.4L49.2,10H0l64,110l64-110C128,10,78.8,10,78.8,10z"/>
                <path fill="#35495e" d="M78.8,10L64,35.4L49.2,10H25.6L64,76l38.4-66H78.8z"/>
              </svg>
            </button>
            <button 
              :class="['nav-framework-btn', { active: selectedFramework === 'react' }]"
              @click="selectedFramework = 'react'"
              title="React"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="#61dafb">
                <circle cx="12" cy="12" r="2.5"/>
                <ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="#61dafb" stroke-width="1"/>
                <ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="#61dafb" stroke-width="1" transform="rotate(60 12 12)"/>
                <ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="#61dafb" stroke-width="1" transform="rotate(120 12 12)"/>
              </svg>
            </button>
          </div>
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
        <!-- Framework Toggle -->
        <div class="framework-toggle-wrapper">
          <div class="framework-toggle">
            <button 
              :class="['framework-btn', { active: selectedFramework === 'vue' }]"
              @click="selectedFramework = 'vue'"
            >
              <svg viewBox="0 0 128 128" width="20" height="20">
                <path fill="#42b883" d="M78.8,10L64,35.4L49.2,10H0l64,110l64-110C128,10,78.8,10,78.8,10z"/>
                <path fill="#35495e" d="M78.8,10L64,35.4L49.2,10H25.6L64,76l38.4-66H78.8z"/>
              </svg>
              Vue 3
            </button>
            <button 
              :class="['framework-btn', { active: selectedFramework === 'react' }]"
              @click="selectedFramework = 'react'"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="#61dafb">
                <circle cx="12" cy="12" r="2.5"/>
                <ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="#61dafb" stroke-width="1"/>
                <ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="#61dafb" stroke-width="1" transform="rotate(60 12 12)"/>
                <ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="#61dafb" stroke-width="1" transform="rotate(120 12 12)"/>
              </svg>
              React
            </button>
          </div>
          <div class="badge">{{ selectedFramework === 'vue' ? 'Vue 3' : 'React 18' }} Component Library</div>
        </div>
        <h1>Excel-like Data Grid & <span class="gradient-text">Pivot Table</span></h1>
        <p class="hero-subtitle">
          A powerful, performant data grid with built-in filtering, sorting, and pivot table functionality.
          Available for <strong>Vue 3</strong> and <strong>React</strong>. Freemium model - start free, upgrade when you need more.
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
          <code>pnpm add {{ packageName }}</code>
          <button class="copy-btn" title="Copy to clipboard" @click="copyInstallCommand">
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
        <p>Everything you need for data-heavy {{ selectedFramework === 'vue' ? 'Vue' : 'React' }} applications</p>
      </div>
      
      <div class="features-grid">
        <div class="feature-card">
          <div class="feature-icon feature-icon-blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h3>Excel-like Grid</h3>
          <p>Column filtering, sorting, and smart number formatting</p>
          <span class="feature-badge free">Free</span>
        </div>

        <div class="feature-card">
          <div class="feature-icon feature-icon-violet">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h3>Global Search</h3>
          <p>Search across all columns with Ctrl+F shortcut</p>
          <span class="feature-badge free">Free</span>
        </div>

        <div class="feature-card">
          <div class="feature-icon feature-icon-emerald">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </div>
          <h3>CSV Export</h3>
          <p>One-click export to CSV with custom filename</p>
          <span class="feature-badge free">Free</span>
        </div>

        <div class="feature-card">
          <div class="feature-icon feature-icon-amber">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h3>Pagination</h3>
          <p>Page through large datasets with configurable size</p>
          <span class="feature-badge free">Free</span>
        </div>

        <div class="feature-card">
          <div class="feature-icon feature-icon-pink">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h3>Clipboard</h3>
          <p>Copy selected cells with Ctrl+C keyboard shortcut</p>
          <span class="feature-badge free">Free</span>
        </div>

        <div class="feature-card">
          <div class="feature-icon feature-icon-cyan">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          </div>
          <h3>Dark Mode</h3>
          <p>Light, dark, or auto theme based on system</p>
          <span class="feature-badge free">Free</span>
        </div>

        <div class="feature-card">
          <div class="feature-icon feature-icon-indigo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
            </svg>
          </div>
          <h3>Pivot Table</h3>
          <p>Drag-and-drop pivot with aggregations</p>
          <span class="feature-badge pro">Pro</span>
        </div>

        <div class="feature-card">
          <div class="feature-icon feature-icon-rose">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h3>Aggregations</h3>
          <p>Sum, Count, Avg, Min, Max, Count Distinct</p>
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
            <p>One package, zero peer deps (except {{ selectedFramework === 'vue' ? 'Vue' : 'React' }})</p>
            <div class="code-block">
              <code>pnpm add {{ packageName }}</code>
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
              <pre v-if="selectedFramework === 'vue'"><code><span class="code-keyword">import</span> { DataGrid } <span class="code-keyword">from</span> <span class="code-string">'@tinypivot/vue'</span>
<span class="code-keyword">import</span> <span class="code-string">'@tinypivot/vue/style.css'</span></code></pre>
              <pre v-else><code><span class="code-keyword">import</span> { DataGrid } <span class="code-keyword">from</span> <span class="code-string">'@tinypivot/react'</span>
<span class="code-keyword">import</span> <span class="code-string">'@tinypivot/react/style.css'</span></code></pre>
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
              <pre v-if="selectedFramework === 'vue'"><code><span class="code-tag">&lt;DataGrid</span> <span class="code-attr">:data</span>=<span class="code-string">"yourData"</span> <span class="code-tag">/&gt;</span></code></pre>
              <pre v-else><code><span class="code-tag">&lt;DataGrid</span> <span class="code-attr">data</span>=<span class="code-string">{yourData}</span> <span class="code-tag">/&gt;</span></code></pre>
            </div>
          </div>
        </div>
      </div>

      <div class="example-showcase">
        <div class="example-header">
          <span class="example-dot"></span>
          <span class="example-dot"></span>
          <span class="example-dot"></span>
          <span class="example-title">{{ selectedFramework === 'vue' ? 'App.vue' : 'App.tsx' }}</span>
        </div>
        <div class="example-code">
          <!-- Vue Example -->
          <pre v-if="selectedFramework === 'vue'"><code><span class="code-tag">&lt;script setup lang="ts"&gt;</span>
<span class="code-keyword">import</span> { DataGrid } <span class="code-keyword">from</span> <span class="code-string">'@tinypivot/vue'</span>
<span class="code-keyword">import</span> <span class="code-string">'@tinypivot/vue/style.css'</span>

<span class="code-keyword">const</span> data = [...]  <span class="code-comment">// Your data array</span>
<span class="code-tag">&lt;/script&gt;</span>

<span class="code-tag">&lt;template&gt;</span>
  <span class="code-tag">&lt;DataGrid</span>
    <span class="code-attr">:data</span>=<span class="code-string">"data"</span>
    <span class="code-attr">:enable-search</span>=<span class="code-string">"true"</span>
    <span class="code-attr">:enable-export</span>=<span class="code-string">"true"</span>
    <span class="code-attr">:enable-pagination</span>=<span class="code-string">"true"</span>
    <span class="code-attr">:page-size</span>=<span class="code-string">"100"</span>
    <span class="code-attr">theme</span>=<span class="code-string">"light"</span>
  <span class="code-tag">/&gt;</span>
<span class="code-tag">&lt;/template&gt;</span></code></pre>
          <!-- React Example -->
          <pre v-else><code><span class="code-keyword">import</span> { DataGrid } <span class="code-keyword">from</span> <span class="code-string">'@tinypivot/react'</span>
<span class="code-keyword">import</span> <span class="code-string">'@tinypivot/react/style.css'</span>

<span class="code-keyword">function</span> <span class="code-function">App</span>() {
  <span class="code-keyword">const</span> data = [...]  <span class="code-comment">// Your data array</span>

  <span class="code-keyword">return</span> (
    <span class="code-tag">&lt;DataGrid</span>
      <span class="code-attr">data</span>=<span class="code-string">{data}</span>
      <span class="code-attr">enableSearch</span>=<span class="code-string">{true}</span>
      <span class="code-attr">enableExport</span>=<span class="code-string">{true}</span>
      <span class="code-attr">enablePagination</span>=<span class="code-string">{true}</span>
      <span class="code-attr">pageSize</span>=<span class="code-string">{100}</span>
      <span class="code-attr">theme</span>=<span class="code-string">"light"</span>
    <span class="code-tag">/&gt;</span>
  )
}

<span class="code-keyword">export default</span> App</code></pre>
        </div>
      </div>

      <div class="api-preview">
        <h3>Full control when you need it</h3>
        <p>All features are toggled via simple props:</p>
        <div class="props-table">
          <div class="props-row props-header">
            <span>Prop</span>
            <span>Default</span>
            <span>Description</span>
          </div>
          <div class="props-row">
            <code>{{ selectedFramework === 'vue' ? ':enable-search' : 'enableSearch' }}</code>
            <span>true</span>
            <span>Global search across all columns</span>
          </div>
          <div class="props-row">
            <code>{{ selectedFramework === 'vue' ? ':enable-export' : 'enableExport' }}</code>
            <span>true</span>
            <span>CSV export button in toolbar</span>
          </div>
          <div class="props-row">
            <code>{{ selectedFramework === 'vue' ? ':enable-pagination' : 'enablePagination' }}</code>
            <span>false</span>
            <span>Paginate large datasets</span>
          </div>
          <div class="props-row">
            <code>{{ selectedFramework === 'vue' ? ':page-size' : 'pageSize' }}</code>
            <span>50</span>
            <span>Rows per page</span>
          </div>
          <div class="props-row">
            <code>{{ selectedFramework === 'vue' ? ':enable-column-resize' : 'enableColumnResize' }}</code>
            <span>true</span>
            <span>Drag column edges to resize</span>
          </div>
          <div class="props-row">
            <code>{{ selectedFramework === 'vue' ? ':enable-clipboard' : 'enableClipboard' }}</code>
            <span>true</span>
            <span>Ctrl+C copies selected cells</span>
          </div>
          <div class="props-row">
            <code>theme</code>
            <span>"light"</span>
            <span>"light" | "dark" | "auto"</span>
          </div>
          <div class="props-row">
            <code>{{ selectedFramework === 'vue' ? ':show-pivot' : 'showPivot' }}</code>
            <span>true</span>
            <span>Show pivot table toggle (Pro)</span>
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
      
      <div class="demo-controls">
        <button class="demo-theme-toggle" @click="toggleDemoTheme">
          <svg v-if="demoTheme === 'dark'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
          {{ demoTheme === 'dark' ? 'Light Mode' : 'Dark Mode' }}
        </button>
      </div>
      
      <div class="demo-container" :class="{ 'demo-light': demoTheme === 'light' }">
        <DataGrid
          :data="sampleData"
          :show-pivot="true"
          font-size="sm"
          :enable-export="true"
          :enable-search="true"
          :enable-pagination="true"
          :page-size="1000"
          :enable-column-resize="true"
          :enable-clipboard="true"
          :theme="demoTheme"
          :striped-rows="true"
          export-filename="tinypivot-demo.csv"
        />
      </div>

      <div class="demo-note demo-note-success">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
          <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span><strong>Try it now!</strong> All Pro features are unlocked in this demo. Click "Pivot" to explore the pivot table functionality. Same API for Vue and React!</span>
      </div>
    </section>

    <!-- Pricing Section -->
    <section id="pricing" class="pricing">
      <div class="section-header">
        <h2>Simple Pricing</h2>
        <p>One-time payment, lifetime license with free updates. Works for both Vue and React.</p>
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
            <li v-for="f in freeFeatures" :key="f">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M5 13l4 4L19 7" />
              </svg>
              {{ f }}
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
            <li v-for="f in [...freeFeatures, ...proFeatures]" :key="f">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M5 13l4 4L19 7" />
              </svg>
              {{ f }}
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
      <h2>Ready to supercharge your {{ selectedFramework === 'vue' ? 'Vue' : 'React' }} app?</h2>
      <p>Join hundreds of developers using TinyPivot</p>
      <div class="cta-actions">
        <code>pnpm add {{ packageName }}</code>
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
          <p>Excel-like data grid & pivot table for Vue 3 and React</p>
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

/* Framework Toggle */
.framework-toggle-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.framework-toggle {
  display: inline-flex;
  gap: 0.5rem;
  padding: 0.25rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.framework-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: transparent;
  border: none;
  border-radius: 0.375rem;
  color: #94a3b8;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.framework-btn:hover {
  color: white;
  background: rgba(255, 255, 255, 0.05);
}

.framework-btn.active {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.code-function {
  color: #61afef;
}

.code-comment {
  color: #5c6370;
  font-style: italic;
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

.nav-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.nav-framework-toggle {
  display: flex;
  gap: 0.25rem;
  padding: 0.25rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.nav-framework-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.375rem 0.5rem;
  background: transparent;
  border: none;
  border-radius: 0.375rem;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.2s;
}

.nav-framework-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.nav-framework-btn.active {
  background: rgba(16, 185, 129, 0.15);
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

.hero-subtitle strong {
  color: #e2e8f0;
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
  padding: 4rem 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
}

.feature-card {
  position: relative;
  padding: 1.25rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.75rem;
  transition: all 0.3s;
}

.feature-card:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.15);
  transform: translateY(-2px);
}

.feature-icon {
  width: 2.25rem;
  height: 2.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  margin-bottom: 0.75rem;
}

.feature-icon svg {
  width: 1.125rem;
  height: 1.125rem;
}

.feature-icon-blue { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
.feature-icon-violet { background: rgba(139, 92, 246, 0.15); color: #8b5cf6; }
.feature-icon-emerald { background: rgba(16, 185, 129, 0.15); color: #10b981; }
.feature-icon-amber { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
.feature-icon-pink { background: rgba(236, 72, 153, 0.15); color: #ec4899; }
.feature-icon-cyan { background: rgba(6, 182, 212, 0.15); color: #06b6d4; }
.feature-icon-indigo { background: rgba(99, 102, 241, 0.15); color: #6366f1; }
.feature-icon-rose { background: rgba(244, 63, 94, 0.15); color: #f43f5e; }

.feature-card h3 {
  font-size: 0.9375rem;
  font-weight: 600;
  margin-bottom: 0.375rem;
}

.feature-card p {
  color: #94a3b8;
  font-size: 0.75rem;
  line-height: 1.5;
}

.feature-badge {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.5625rem;
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
  margin-bottom: 1.5rem;
}

.props-table {
  max-width: 700px;
  margin: 0 auto;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.75rem;
  overflow: hidden;
}

.props-row {
  display: grid;
  grid-template-columns: 200px 80px 1fr;
  gap: 1rem;
  padding: 0.625rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 0.8125rem;
  align-items: center;
}

.props-row:last-child {
  border-bottom: none;
}

.props-row.props-header {
  background: rgba(255, 255, 255, 0.05);
  font-weight: 600;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
}

.props-row code {
  color: #10b981;
  font-size: 0.75rem;
}

.props-row span:nth-child(2) {
  color: #64748b;
  font-family: ui-monospace, monospace;
  font-size: 0.75rem;
}

.props-row span:nth-child(3) {
  color: #cbd5e1;
}

/* Demo */
.demo {
  padding: 6rem 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.demo-controls {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 1rem;
}

.demo-theme-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: #e2e8f0;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
}

.demo-theme-toggle:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
}

.demo-container {
  background: #1e293b;
  border-radius: 1rem;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

.demo-container.demo-light {
  background: white;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05);
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

@media (max-width: 1024px) {
  .features-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .features-grid {
    grid-template-columns: 1fr;
  }
  
  .props-row {
    grid-template-columns: 1fr;
    gap: 0.25rem;
  }
  
  .props-row.props-header {
    display: none;
  }
}

@media (max-width: 480px) {
  .props-table {
    font-size: 0.75rem;
  }
  
  .nav-links {
    display: none;
  }
}
</style>
