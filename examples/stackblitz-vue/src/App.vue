<script setup>
import { DataGrid } from '@smallwebco/tinypivot-vue'
import { salesData } from './data.js'
import '@smallwebco/tinypivot-vue/style.css'
</script>

<template>
  <div class="wrapper">
    <div class="header">
      <h1>TinyPivot — Vue Starter</h1>
      <p>
        50 rows of sample sales data with pivot table enabled.
        <a href="https://tiny-pivot.com" target="_blank" rel="noopener noreferrer">
          Learn more at tiny-pivot.com
        </a>
      </p>
    </div>
    <div class="grid-container">
      <DataGrid
        :data="salesData"
        :enable-export="true"
        :enable-search="true"
        :enable-pagination="true"
        :page-size="25"
        :enable-column-resize="true"
        :enable-clipboard="true"
        :show-pivot="true"
        theme="light"
        export-filename="sales-data.csv"
      />
    </div>
  </div>
</template>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }

.wrapper {
  padding: 24px;
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.header h1 {
  font-size: 1.25rem;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 4px;
}

.header p {
  font-size: 0.875rem;
  color: #64748b;
}

.header a {
  color: #6366f1;
  text-decoration: none;
}

.header a:hover {
  text-decoration: underline;
}

.grid-container {
  flex: 1;
  min-height: 0;
}
</style>
