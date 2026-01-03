<script setup lang="ts">
import { DataGrid, setLicenseKey } from '@smallwebco/tinypivot-vue'
import '@smallwebco/tinypivot-vue/style.css'

// Set your Pro license key for AI Analyst features
// Get one at: https://tiny-pivot.com/#pricing
const LICENSE_KEY = import.meta.env.VITE_TINYPIVOT_LICENSE_KEY || ''
if (LICENSE_KEY) {
  setLicenseKey(LICENSE_KEY)
}

// AI Analyst configuration - connects to PostgreSQL via tinypivot-server
// Tables are auto-discovered from the database
const aiAnalystConfig = {
  enabled: true,
  endpoint: '/api/tinypivot',
  persistToLocalStorage: true,
  sessionId: 'demo-session',
}
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <h1>TinyPivot AI Data Analyst</h1>
      <p>Explore your database with natural language queries. Select a table and ask questions like:</p>
      <ul class="example-queries">
        <li>"Show me all records"</li>
        <li>"What are the unique values in each column?"</li>
        <li>"Group by status and count"</li>
      </ul>
    </header>

    <main class="grid-container">
      <DataGrid
        :data="[]"
        :ai-analyst="aiAnalystConfig"
        :enable-export="true"
        :enable-search="true"
        :enable-pagination="true"
        :page-size="50"
        :enable-column-resize="true"
        :enable-clipboard="true"
        :show-pivot="true"
        theme="light"
        export-filename="data-export.csv"
      />
    </main>
  </div>
</template>

<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  background-color: #f5f5f5;
}

.app-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
}

.app-header {
  margin-bottom: 24px;
  padding: 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.app-header h1 {
  font-size: 24px;
  color: #1a1a1a;
  margin-bottom: 8px;
}

.app-header p {
  color: #666;
  margin-bottom: 12px;
}

.example-queries {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  list-style: none;
}

.example-queries li {
  background: #e8f4fd;
  color: #0066cc;
  padding: 6px 12px;
  border-radius: 16px;
  font-size: 13px;
}

.grid-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  height: calc(100vh - 200px);
  min-height: 500px;
}
</style>
