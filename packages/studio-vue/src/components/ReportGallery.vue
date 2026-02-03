<script setup lang="ts">
/**
 * ReportGallery Component
 * Displays public reports in a card grid with search and sort controls
 */
import type { PublicShareListItem, StorageAdapter } from '@smallwebco/tinypivot-studio'
import { onMounted, ref, watch } from 'vue'

/**
 * Props for ReportGallery component
 */
export interface ReportGalleryProps {
  /** Storage adapter for fetching public shares */
  storage: StorageAdapter
  /** Compact mode for sidebar display */
  compact?: boolean
}

const props = defineProps<ReportGalleryProps>()

const reports = ref<PublicShareListItem[]>([])
const isLoading = ref(true)
const sortBy = ref<'recent' | 'popular' | 'title'>('recent')
const search = ref('')

async function loadReports() {
  isLoading.value = true
  try {
    const result = await props.storage.listPublicShares({
      sortBy: sortBy.value,
      search: search.value || undefined,
      limit: props.compact ? 10 : 50,
    })
    reports.value = result.items
  }
  catch (err) {
    console.error('Failed to load reports:', err)
    reports.value = []
  }
  finally {
    isLoading.value = false
  }
}

function handleSearch() {
  loadReports()
}

function handleSortChange() {
  loadReports()
}

// Format date for display
function formatDate(date: Date): string {
  const d = new Date(date)
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// Watch for compact prop changes to reload with appropriate limit
watch(() => props.compact, () => {
  loadReports()
})

onMounted(loadReports)
</script>

<template>
  <div class="tps-gallery" :class="{ 'tps-gallery-compact': compact }">
    <header class="tps-gallery-header">
      <h1 v-if="!compact" class="tps-gallery-title">
        Explore Public Reports
      </h1>
      <div class="tps-gallery-controls">
        <input
          v-model="search"
          type="search"
          placeholder="Search reports..."
          class="tps-gallery-search"
          @keyup.enter="handleSearch"
        >
        <select v-model="sortBy" class="tps-gallery-sort" @change="handleSortChange">
          <option value="recent">
            Most Recent
          </option>
          <option value="popular">
            Most Popular
          </option>
          <option value="title">
            Title A-Z
          </option>
        </select>
      </div>
    </header>

    <div v-if="isLoading" class="tps-gallery-loading">
      <div class="tps-gallery-spinner" />
      <span>Loading reports...</span>
    </div>

    <div v-else-if="reports.length === 0" class="tps-gallery-empty">
      <svg class="tps-gallery-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
      <p>No public reports found</p>
      <p v-if="search" class="tps-gallery-empty-hint">
        Try adjusting your search terms
      </p>
    </div>

    <div v-else class="tps-gallery-grid">
      <a
        v-for="report in reports"
        :key="report.token"
        :href="`/view/${report.token}`"
        class="tps-gallery-card"
      >
        <div class="tps-gallery-card-content">
          <h3 class="tps-gallery-card-title">
            {{ report.pageTitle }}
          </h3>
          <p v-if="report.pageDescription" class="tps-gallery-card-description">
            {{ report.pageDescription }}
          </p>
          <div v-if="report.tags && report.tags.length > 0" class="tps-gallery-card-tags">
            <span v-for="tag in report.tags.slice(0, 3)" :key="tag" class="tps-gallery-card-tag">
              {{ tag }}
            </span>
          </div>
        </div>
        <div class="tps-gallery-card-footer">
          <span v-if="report.authorName" class="tps-gallery-card-author">
            By {{ report.authorName }}
          </span>
          <span class="tps-gallery-card-meta">
            <span class="tps-gallery-card-views">{{ report.viewCount }} views</span>
            <span class="tps-gallery-card-date">{{ formatDate(report.publishedAt) }}</span>
          </span>
        </div>
      </a>
    </div>
  </div>
</template>

<style scoped>
.tps-gallery {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  padding: 1.5rem;
}

.tps-gallery-compact {
  padding: 1rem;
}

/* Header */
.tps-gallery-header {
  margin-bottom: 1.5rem;
}

.tps-gallery-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: #1e293b;
  margin: 0 0 1rem;
}

.tps-gallery-controls {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.tps-gallery-compact .tps-gallery-controls {
  flex-direction: column;
}

.tps-gallery-search {
  flex: 1;
  min-width: 200px;
  padding: 0.5rem 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.875rem;
  color: #334155;
  background: #ffffff;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.tps-gallery-search:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.tps-gallery-search::placeholder {
  color: #94a3b8;
}

.tps-gallery-sort {
  padding: 0.5rem 2rem 0.5rem 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.875rem;
  color: #334155;
  background: #ffffff url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e") right 0.5rem center / 1.25rem no-repeat;
  appearance: none;
  cursor: pointer;
  transition: border-color 0.15s;
}

.tps-gallery-sort:focus {
  outline: none;
  border-color: #3b82f6;
}

.tps-gallery-compact .tps-gallery-search,
.tps-gallery-compact .tps-gallery-sort {
  width: 100%;
}

/* Loading state */
.tps-gallery-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  color: #64748b;
  gap: 0.75rem;
}

.tps-gallery-spinner {
  width: 2rem;
  height: 2rem;
  border: 2px solid #e2e8f0;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: tps-gallery-spin 0.8s linear infinite;
}

@keyframes tps-gallery-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Empty state */
.tps-gallery-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  color: #64748b;
  text-align: center;
}

.tps-gallery-empty-icon {
  width: 3rem;
  height: 3rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.tps-gallery-empty p {
  margin: 0;
}

.tps-gallery-empty-hint {
  font-size: 0.875rem;
  margin-top: 0.5rem;
  opacity: 0.8;
}

/* Grid */
.tps-gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.tps-gallery-compact .tps-gallery-grid {
  grid-template-columns: 1fr;
}

/* Card */
.tps-gallery-card {
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
  overflow: hidden;
}

.tps-gallery-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
}

.tps-gallery-card:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.tps-gallery-card-content {
  flex: 1;
  padding: 1rem;
}

.tps-gallery-card-title {
  font-size: 1rem;
  font-weight: 600;
  color: #1e293b;
  margin: 0 0 0.5rem;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tps-gallery-card-description {
  font-size: 0.875rem;
  color: #64748b;
  margin: 0 0 0.75rem;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tps-gallery-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.tps-gallery-card-tag {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  background: #f1f5f9;
  color: #475569;
  border-radius: 4px;
}

.tps-gallery-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  font-size: 0.75rem;
  color: #64748b;
}

.tps-gallery-card-author {
  font-weight: 500;
}

.tps-gallery-card-meta {
  display: flex;
  gap: 0.75rem;
}

.tps-gallery-card-views,
.tps-gallery-card-date {
  white-space: nowrap;
}
</style>
