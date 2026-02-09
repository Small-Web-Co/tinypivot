# Publish, Preview & Gallery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable dashboard publishing via shareable URLs, improve edit/preview UX with hover-reveal controls, persist widget state across reloads, and provide a gallery for discovering public reports.

**Architecture:** Widget controls hide by default and reveal on hover/focus. A new `PageViewer` component renders pages in read-only mode for shared URLs. Vue Router handles `/view/:token` and `/explore` routes. State persists to localStorage.

**Tech Stack:** Vue 3, Vue Router, GridStack.js, IndexedDB storage adapter, localStorage for widget state

---

## Phase 1: Widget Hover UX

### Task 1.1: Add Hover State Tracking to Widget Blocks

**Files:**
- Modify: `/Users/bvallieres/Dev/tinypivot/packages/studio-vue/src/components/TinyPivotStudio.vue:2420-2520`

**Step 1: Add hover tracking refs**

In the `<script setup>` section around line 180, add:

```typescript
// Widget hover state tracking
const hoveredBlockId = ref<string | null>(null)
const focusedBlockId = ref<string | null>(null)
```

**Step 2: Add computed for showing controls**

```typescript
function shouldShowControls(blockId: string): boolean {
  return hoveredBlockId.value === blockId || focusedBlockId.value === blockId
}
```

**Step 3: Run dev server to verify no errors**

Run: `cd /Users/bvallieres/Dev/tinypivot/examples/studio-vue-demo && pnpm dev`
Expected: Dev server starts without errors

**Step 4: Commit**

```bash
git add packages/studio-vue/src/components/TinyPivotStudio.vue
git commit -m "feat(studio): add hover and focus state tracking for widget blocks"
```

---

### Task 1.2: Add Mouse Event Handlers to Widget Blocks

**Files:**
- Modify: `/Users/bvallieres/Dev/tinypivot/packages/studio-vue/src/components/TinyPivotStudio.vue:2420-2520`

**Step 1: Find the widget block container**

Around line 2420, locate:
```html
<div
  v-else-if="block.type === 'widget'"
  :key="block.id"
  class="tps-block tps-block-widget grid-stack-item"
```

**Step 2: Add mouse event handlers**

Update to:
```html
<div
  v-else-if="block.type === 'widget'"
  :key="block.id"
  class="tps-block tps-block-widget grid-stack-item"
  :class="{ 'tps-block-controls-visible': shouldShowControls(block.id) }"
  @mouseenter="hoveredBlockId = block.id"
  @mouseleave="hoveredBlockId = null"
  @focusin="focusedBlockId = block.id"
  @focusout="handleBlockFocusOut($event, block.id)"
```

**Step 3: Add focus out handler to prevent losing focus when interacting with dropdowns**

```typescript
function handleBlockFocusOut(event: FocusEvent, blockId: string) {
  const relatedTarget = event.relatedTarget as HTMLElement | null
  const blockElement = (event.currentTarget as HTMLElement)

  // Keep focus if the new target is still within the block
  if (relatedTarget && blockElement.contains(relatedTarget)) {
    return
  }
  focusedBlockId.value = null
}
```

**Step 4: Verify hover tracking works**

Run: `pnpm dev`
Open browser, hover over widget blocks, check Vue DevTools for `hoveredBlockId` changes

**Step 5: Commit**

```bash
git add packages/studio-vue/src/components/TinyPivotStudio.vue
git commit -m "feat(studio): add mouse/focus event handlers to widget blocks"
```

---

### Task 1.3: Update CSS for Control Visibility

**Files:**
- Modify: `/Users/bvallieres/Dev/tinypivot/packages/studio/src/style.css:720-760`

**Step 1: Find existing hover styles for block actions**

Around line 737, locate:
```css
.tps-block:hover .tps-block-actions {
  opacity: 1;
}
```

**Step 2: Replace hover-based visibility with class-based**

Replace the hover rules with:
```css
/* Hide controls by default */
.tps-block .tps-block-actions,
.tps-block .tps-block-drag-handle {
  opacity: 0;
  transition: opacity 0.15s ease;
}

/* Show controls when block has controls-visible class */
.tps-block.tps-block-controls-visible .tps-block-actions,
.tps-block.tps-block-controls-visible .tps-block-drag-handle {
  opacity: 1;
}

/* Also show on direct hover as fallback */
.tps-block:hover .tps-block-actions,
.tps-block:hover .tps-block-drag-handle {
  opacity: 1;
}
```

**Step 3: Test in browser**

Run: `pnpm dev`
Verify: Controls appear on hover and stay visible when focused

**Step 4: Commit**

```bash
git add packages/studio/src/style.css
git commit -m "style(studio): use class-based control visibility instead of hover-only"
```

---

### Task 1.4: Hide Widget Tab Bar When Unfocused

**Files:**
- Modify: `/Users/bvallieres/Dev/tinypivot/packages/vue/src/components/DataGrid.vue:32-79` (props)
- Modify: `/Users/bvallieres/Dev/tinypivot/packages/vue/src/components/DataGrid.vue:1036-1093` (tab bar)

**Step 1: Add `showControls` prop to DataGrid**

In the props interface around line 32, add:
```typescript
showControls?: boolean
```

With default:
```typescript
const props = withDefaults(defineProps<DataGridProps>(), {
  // ... existing defaults
  showControls: true,
})
```

**Step 2: Conditionally render tab bar**

Around line 1036, wrap the tab bar:
```html
<Transition name="vpg-fade">
  <div v-if="showPivot && props.showControls" class="vpg-view-toggle">
    <!-- existing tab buttons -->
  </div>
</Transition>
```

**Step 3: Add CSS transition**

At end of DataGrid's style section, add:
```css
.vpg-fade-enter-active,
.vpg-fade-leave-active {
  transition: opacity 0.15s ease;
}

.vpg-fade-enter-from,
.vpg-fade-leave-to {
  opacity: 0;
}
```

**Step 4: Test tab bar visibility**

Run: `pnpm dev`
Verify: Tab bar visible by default (showControls defaults to true)

**Step 5: Commit**

```bash
git add packages/vue/src/components/DataGrid.vue
git commit -m "feat(vue): add showControls prop to DataGrid for hiding tab bar"
```

---

### Task 1.5: Wire Up showControls in TinyPivotStudio

**Files:**
- Modify: `/Users/bvallieres/Dev/tinypivot/packages/studio-vue/src/components/TinyPivotStudio.vue:2470-2530`

**Step 1: Find where DataGrid/PivotSkeleton is rendered in widget blocks**

Around line 2470, locate the DataGrid component usage.

**Step 2: Pass showControls prop**

Update to:
```html
<DataGrid
  v-if="block.metadata?.visualizationType === 'table' || !block.metadata?.visualizationType"
  :show-controls="shouldShowControls(block.id)"
  <!-- ... other props -->
/>
```

Do the same for PivotSkeleton and any other visualization components.

**Step 3: Test the full hover UX**

Run: `pnpm dev`
1. Hover over a widget - controls and tab bar appear
2. Move mouse away - controls and tab bar fade out
3. Click into widget - controls stay visible
4. Click outside - controls fade out

**Step 4: Commit**

```bash
git add packages/studio-vue/src/components/TinyPivotStudio.vue
git commit -m "feat(studio): wire showControls to widgets for hover-reveal UX"
```

---

## Phase 2: PageViewer Component & Share Flow

### Task 2.1: Create PageViewer Component

**Files:**
- Create: `/Users/bvallieres/Dev/tinypivot/packages/studio-vue/src/components/PageViewer.vue`

**Step 1: Create the component file**

```vue
<script setup lang="ts">
import type { Block, Page, PageShare } from '@smallwebco/tinypivot-studio'
import type { StorageAdapter } from '@smallwebco/tinypivot-studio'
import { computed, onMounted, ref } from 'vue'
import DataGrid from '@smallwebco/tinypivot-vue'

interface Props {
  page: Page
  share?: PageShare
  storage?: StorageAdapter
  apiEndpoint?: string
  userId?: string
  userKey?: string
}

const props = defineProps<Props>()

const isLoading = ref(false)
const error = ref<string | null>(null)

// Interactive mode based on share settings
const isInteractive = computed(() => {
  if (!props.share) return false
  return props.share.settings.accessLevel === 'interact'
})

// Render blocks in read-only mode
const renderableBlocks = computed(() => props.page.blocks || [])
</script>

<template>
  <div class="tps-page-viewer">
    <header v-if="page.title" class="tps-viewer-header">
      <h1>{{ page.title }}</h1>
      <p v-if="page.description">{{ page.description }}</p>
    </header>

    <main class="tps-viewer-content">
      <div
        v-for="block in renderableBlocks"
        :key="block.id"
        class="tps-viewer-block"
      >
        <!-- Text block -->
        <div v-if="block.type === 'text'" v-html="block.content" />

        <!-- Heading block -->
        <component
          v-else-if="block.type === 'heading'"
          :is="`h${block.level || 2}`"
        >
          {{ block.content }}
        </component>

        <!-- Widget block - render visualization only -->
        <div v-else-if="block.type === 'widget'" class="tps-viewer-widget">
          <h3 v-if="block.showTitle !== false && block.title">
            {{ block.title }}
          </h3>
          <!-- Widget data grid rendered here -->
          <DataGrid
            v-if="block.metadata?.visualizationType === 'table'"
            :show-controls="false"
            :show-pivot="false"
          />
        </div>

        <!-- Divider block -->
        <hr v-else-if="block.type === 'divider'" class="tps-viewer-divider" />
      </div>
    </main>

    <footer v-if="share?.settings.showAuthor" class="tps-viewer-footer">
      <span>Created by {{ page.createdBy }}</span>
    </footer>
  </div>
</template>

<style scoped>
.tps-page-viewer {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.tps-viewer-header {
  margin-bottom: 2rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e2e8f0;
}

.tps-viewer-header h1 {
  font-size: 2rem;
  font-weight: 600;
  color: #1e293b;
  margin: 0 0 0.5rem;
}

.tps-viewer-header p {
  color: #64748b;
  margin: 0;
}

.tps-viewer-block {
  margin-bottom: 1.5rem;
}

.tps-viewer-widget {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 1rem;
}

.tps-viewer-widget h3 {
  font-size: 1rem;
  font-weight: 500;
  color: #334155;
  margin: 0 0 1rem;
}

.tps-viewer-divider {
  border: none;
  border-top: 1px solid #e2e8f0;
  margin: 2rem 0;
}

.tps-viewer-footer {
  margin-top: 3rem;
  padding-top: 1rem;
  border-top: 1px solid #e2e8f0;
  color: #64748b;
  font-size: 0.875rem;
}
</style>
```

**Step 2: Export from index**

In `/Users/bvallieres/Dev/tinypivot/packages/studio-vue/src/components/index.ts`, add:
```typescript
export { default as PageViewer } from './PageViewer.vue'
```

**Step 3: Build to verify no TypeScript errors**

Run: `cd /Users/bvallieres/Dev/tinypivot && pnpm build:vue`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/studio-vue/src/components/PageViewer.vue packages/studio-vue/src/components/index.ts
git commit -m "feat(studio-vue): add PageViewer component for read-only page rendering"
```

---

### Task 2.2: Create ShareModal Component

**Files:**
- Create: `/Users/bvallieres/Dev/tinypivot/packages/studio-vue/src/components/ShareModal.vue`

**Step 1: Create the component**

```vue
<script setup lang="ts">
import type { PageShare, PageShareSettings } from '@smallwebco/tinypivot-studio'
import { computed, ref, watch } from 'vue'

interface Props {
  isOpen: boolean
  pageId: string
  pageTitle: string
  existingShare?: PageShare | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
  save: [settings: Partial<PageShareSettings>]
  revoke: []
}>()

// Form state
const visibility = ref<'public' | 'unlisted' | 'password'>('unlisted')
const accessLevel = ref<'view' | 'interact' | 'duplicate'>('view')
const password = ref('')
const showAuthor = ref(true)
const allowEmbed = ref(false)
const allowExport = ref(true)

// Populate from existing share
watch(() => props.existingShare, (share) => {
  if (share) {
    visibility.value = share.settings.visibility
    accessLevel.value = share.settings.accessLevel
    showAuthor.value = share.settings.showAuthor
    allowEmbed.value = share.settings.allowEmbed
    allowExport.value = share.settings.allowExport
  }
}, { immediate: true })

const shareUrl = computed(() => {
  if (!props.existingShare) return null
  return `${window.location.origin}/view/${props.existingShare.token}`
})

function handleSave() {
  emit('save', {
    visibility: visibility.value,
    accessLevel: accessLevel.value,
    password: visibility.value === 'password' ? password.value : undefined,
    showAuthor: showAuthor.value,
    allowEmbed: allowEmbed.value,
    allowExport: allowExport.value,
    enabled: true,
  })
}

function handleCopyLink() {
  if (shareUrl.value) {
    navigator.clipboard.writeText(shareUrl.value)
  }
}

function handleRevoke() {
  if (confirm('Are you sure you want to revoke this share link? Anyone with the link will no longer be able to access this page.')) {
    emit('revoke')
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="tps-modal-overlay" @click.self="emit('close')">
      <div class="tps-modal tps-share-modal">
        <header class="tps-modal-header">
          <h2>Share "{{ pageTitle }}"</h2>
          <button class="tps-modal-close" @click="emit('close')">
            &times;
          </button>
        </header>

        <div class="tps-modal-body">
          <!-- Existing share link -->
          <div v-if="existingShare && shareUrl" class="tps-share-url">
            <label>Share Link</label>
            <div class="tps-share-url-input">
              <input type="text" :value="shareUrl" readonly />
              <button @click="handleCopyLink">Copy</button>
            </div>
            <p class="tps-share-stats">
              {{ existingShare.viewCount }} views
            </p>
          </div>

          <!-- Visibility -->
          <div class="tps-form-group">
            <label>Visibility</label>
            <select v-model="visibility" class="tps-select">
              <option value="public">Public (listed in gallery)</option>
              <option value="unlisted">Unlisted (link only)</option>
              <option value="password">Password protected</option>
            </select>
          </div>

          <!-- Password field -->
          <div v-if="visibility === 'password'" class="tps-form-group">
            <label>Password</label>
            <input
              v-model="password"
              type="password"
              class="tps-input"
              placeholder="Enter password"
            />
          </div>

          <!-- Access level -->
          <div class="tps-form-group">
            <label>Access Level</label>
            <select v-model="accessLevel" class="tps-select">
              <option value="view">View only</option>
              <option value="interact">Interactive (filters work)</option>
              <option value="duplicate">Allow duplicate</option>
            </select>
          </div>

          <!-- Options -->
          <div class="tps-form-group">
            <label class="tps-checkbox-label">
              <input v-model="showAuthor" type="checkbox" />
              Show author name
            </label>
          </div>

          <div class="tps-form-group">
            <label class="tps-checkbox-label">
              <input v-model="allowExport" type="checkbox" />
              Allow PDF export
            </label>
          </div>

          <div class="tps-form-group">
            <label class="tps-checkbox-label">
              <input v-model="allowEmbed" type="checkbox" />
              Allow embedding
            </label>
          </div>
        </div>

        <footer class="tps-modal-footer">
          <button
            v-if="existingShare"
            class="tps-btn tps-btn-danger"
            @click="handleRevoke"
          >
            Revoke Link
          </button>
          <div class="tps-modal-footer-right">
            <button class="tps-btn" @click="emit('close')">
              Cancel
            </button>
            <button class="tps-btn tps-btn-primary" @click="handleSave">
              {{ existingShare ? 'Update' : 'Create Link' }}
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tps-share-modal {
  width: 480px;
}

.tps-share-url {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: #f8fafc;
  border-radius: 6px;
}

.tps-share-url label {
  display: block;
  font-size: 0.75rem;
  font-weight: 500;
  color: #64748b;
  margin-bottom: 0.5rem;
  text-transform: uppercase;
}

.tps-share-url-input {
  display: flex;
  gap: 0.5rem;
}

.tps-share-url-input input {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  font-size: 0.875rem;
  background: #ffffff;
}

.tps-share-url-input button {
  padding: 0.5rem 1rem;
  background: #4f46e5;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.tps-share-stats {
  margin: 0.5rem 0 0;
  font-size: 0.75rem;
  color: #64748b;
}

.tps-modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tps-modal-footer-right {
  display: flex;
  gap: 0.5rem;
}

.tps-btn-danger {
  background: #fee2e2;
  color: #dc2626;
  border-color: #fecaca;
}

.tps-btn-danger:hover {
  background: #fecaca;
}
</style>
```

**Step 2: Export from index**

Add to `/Users/bvallieres/Dev/tinypivot/packages/studio-vue/src/components/index.ts`:
```typescript
export { default as ShareModal } from './ShareModal.vue'
```

**Step 3: Build to verify**

Run: `pnpm build:vue`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/studio-vue/src/components/ShareModal.vue packages/studio-vue/src/components/index.ts
git commit -m "feat(studio-vue): add ShareModal component for page sharing"
```

---

### Task 2.3: Add Share Button and Wire Up Modal in TinyPivotStudio

**Files:**
- Modify: `/Users/bvallieres/Dev/tinypivot/packages/studio-vue/src/components/TinyPivotStudio.vue`

**Step 1: Import ShareModal**

Add import:
```typescript
import ShareModal from './ShareModal.vue'
```

**Step 2: Add share modal state**

Around line 175 with other modal states:
```typescript
// Share modal state
const showShareModal = ref(false)
const currentPageShare = ref<PageShare | null>(null)
```

**Step 3: Add share handlers**

```typescript
async function openShareModal() {
  if (!currentPage.value || !storage) return

  // Try to get existing share
  const settings = await storage.getShareSettings(currentPage.value.id)
  if (settings?.enabled) {
    // Find active share token - this is simplified, may need storage method
    currentPageShare.value = null // Would need getActiveShare method
  }
  showShareModal.value = true
}

async function handleShareSave(settings: Partial<PageShareSettings>) {
  if (!currentPage.value || !storage) return

  try {
    if (currentPageShare.value) {
      await storage.updateShareSettings(currentPage.value.id, settings)
    } else {
      const share = await storage.createShare(currentPage.value.id, settings)
      currentPageShare.value = share
    }
    // Keep modal open to show the link
  } catch (err) {
    console.error('Failed to create share:', err)
  }
}

async function handleShareRevoke() {
  if (!currentPageShare.value || !storage) return

  await storage.revokeShare(currentPageShare.value.token)
  currentPageShare.value = null
  showShareModal.value = false
}
```

**Step 4: Add Share button to toolbar**

Find the page header/toolbar area and add:
```html
<button
  v-if="currentPage"
  class="tps-btn tps-btn-share"
  @click="openShareModal"
>
  Share
</button>
```

**Step 5: Add ShareModal to template**

At end of template:
```html
<ShareModal
  :is-open="showShareModal"
  :page-id="currentPage?.id ?? ''"
  :page-title="currentPage?.title ?? ''"
  :existing-share="currentPageShare"
  @close="showShareModal = false"
  @save="handleShareSave"
  @revoke="handleShareRevoke"
/>
```

**Step 6: Test share flow**

Run: `pnpm dev`
1. Open a page
2. Click Share button
3. Configure settings
4. Click Create Link
5. Verify link is generated

**Step 7: Commit**

```bash
git add packages/studio-vue/src/components/TinyPivotStudio.vue
git commit -m "feat(studio): integrate share modal and share button"
```

---

### Task 2.4: Set Up Vue Router in Demo App

**Files:**
- Create: `/Users/bvallieres/Dev/tinypivot/examples/studio-vue-demo/src/router.ts`
- Modify: `/Users/bvallieres/Dev/tinypivot/examples/studio-vue-demo/src/main.ts`
- Modify: `/Users/bvallieres/Dev/tinypivot/examples/studio-vue-demo/package.json`

**Step 1: Install vue-router (if not already)**

Check package.json - vue-router is in root package.json. Add to demo:
```bash
cd /Users/bvallieres/Dev/tinypivot/examples/studio-vue-demo
pnpm add vue-router
```

**Step 2: Create router.ts**

```typescript
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'studio',
      component: () => import('./views/StudioView.vue'),
    },
    {
      path: '/view/:token',
      name: 'view',
      component: () => import('./views/SharedPageView.vue'),
    },
    {
      path: '/explore',
      name: 'explore',
      component: () => import('./views/ExploreView.vue'),
    },
  ],
})

export default router
```

**Step 3: Create views directory and move App content**

Create `/Users/bvallieres/Dev/tinypivot/examples/studio-vue-demo/src/views/StudioView.vue`:
```vue
<script setup lang="ts">
import type { Page, WidgetConfig } from '@smallwebco/tinypivot-studio-vue'
import { createIndexedDBStorage } from '@smallwebco/tinypivot-storage-indexeddb'
import { TinyPivotStudio } from '@smallwebco/tinypivot-studio-vue'
import '@smallwebco/tinypivot-studio-vue/style.css'

const storage = createIndexedDBStorage()

const userId = 'demo-user'
const userKey = 'demo-user-key-for-encryption'
const apiEndpoint = '/api/tinypivot'

const aiAnalystConfig = {
  endpoint: apiEndpoint,
}

function handlePageSave(page: Page) {
  console.log('Page saved:', page)
}

function handleWidgetSave(widget: WidgetConfig) {
  console.log('Widget saved:', widget)
}
</script>

<template>
  <div style="height: 100vh">
    <TinyPivotStudio
      :user-id="userId"
      :storage="storage"
      :api-endpoint="apiEndpoint"
      :user-key="userKey"
      :ai-analyst="aiAnalystConfig"
      @page-save="handlePageSave"
      @widget-save="handleWidgetSave"
    />
  </div>
</template>
```

**Step 4: Create SharedPageView.vue**

Create `/Users/bvallieres/Dev/tinypivot/examples/studio-vue-demo/src/views/SharedPageView.vue`:
```vue
<script setup lang="ts">
import type { Page, PageShare } from '@smallwebco/tinypivot-studio'
import { createIndexedDBStorage } from '@smallwebco/tinypivot-storage-indexeddb'
import { PageViewer } from '@smallwebco/tinypivot-studio-vue'
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const storage = createIndexedDBStorage()

const page = ref<Page | null>(null)
const share = ref<PageShare | null>(null)
const error = ref<string | null>(null)
const isLoading = ref(true)

onMounted(async () => {
  const token = route.params.token as string

  try {
    // Get share by token
    const shareData = await storage.getShareByToken(token)
    if (!shareData) {
      error.value = 'This page is no longer available'
      return
    }

    if (!shareData.active) {
      error.value = 'This share link has been revoked'
      return
    }

    share.value = shareData

    // Load the page
    const pageData = await storage.getPage(shareData.pageId)
    if (!pageData) {
      error.value = 'Page not found'
      return
    }

    page.value = pageData

    // Record view
    await storage.recordShareView(token)
  } catch (err) {
    error.value = 'Failed to load page'
    console.error(err)
  } finally {
    isLoading.value = false
  }
})
</script>

<template>
  <div class="shared-page-container">
    <div v-if="isLoading" class="loading">
      Loading...
    </div>

    <div v-else-if="error" class="error">
      {{ error }}
    </div>

    <PageViewer
      v-else-if="page && share"
      :page="page"
      :share="share"
      :storage="storage"
    />
  </div>
</template>

<style scoped>
.shared-page-container {
  min-height: 100vh;
  background: #f8fafc;
}

.loading, .error {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  color: #64748b;
}

.error {
  color: #dc2626;
}
</style>
```

**Step 5: Create placeholder ExploreView.vue**

Create `/Users/bvallieres/Dev/tinypivot/examples/studio-vue-demo/src/views/ExploreView.vue`:
```vue
<script setup lang="ts">
// Placeholder - will be implemented in Phase 4
</script>

<template>
  <div class="explore-container">
    <h1>Explore Public Reports</h1>
    <p>Coming soon...</p>
  </div>
</template>

<style scoped>
.explore-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}
</style>
```

**Step 6: Update main.ts**

```typescript
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

createApp(App)
  .use(router)
  .mount('#app')
```

**Step 7: Update App.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'

const theme = ref<'light' | 'dark'>('light')

function toggleTheme() {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
}
</script>

<template>
  <div :class="{ 'dark-theme': theme === 'dark' }">
    <router-view />

    <!-- Theme toggle button -->
    <button
      :style="{
        position: 'fixed',
        bottom: '16px',
        right: '16px',
        padding: '8px 16px',
        borderRadius: '6px',
        border: '1px solid #cbd5e1',
        background: theme === 'light' ? '#ffffff' : '#1e293b',
        color: theme === 'light' ? '#334155' : '#e2e8f0',
        cursor: 'pointer',
        fontSize: '14px',
        zIndex: 1000,
      }"
      @click="toggleTheme"
    >
      {{ theme === 'light' ? '🌙 Dark' : '☀️ Light' }}
    </button>
  </div>
</template>
```

**Step 8: Create main.ts if missing**

Check if main.ts exists, create if needed:
```typescript
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

createApp(App)
  .use(router)
  .mount('#app')
```

**Step 9: Test routing**

Run: `pnpm dev`
1. Navigate to `/` - should show studio
2. Navigate to `/explore` - should show placeholder
3. Navigate to `/view/test-token` - should show error (no such token)

**Step 10: Commit**

```bash
git add examples/studio-vue-demo/src/
git commit -m "feat(demo): add vue-router with studio, view, and explore routes"
```

---

## Phase 3: State Persistence

### Task 3.1: Create Widget State Storage Utility

**Files:**
- Create: `/Users/bvallieres/Dev/tinypivot/packages/studio-vue/src/utils/widgetState.ts`

**Step 1: Create the utility**

```typescript
export interface WidgetViewState {
  activeTab: 'ai' | 'grid' | 'pivot' | 'chart'
  columns?: string[]
  sortOrder?: { column: string; direction: 'asc' | 'desc' }[]
  filters?: Record<string, unknown>
}

const STORAGE_PREFIX = 'tinypivot-widget-state-'
const LAST_PAGE_KEY = 'tinypivot-last-page'

export function saveWidgetState(widgetId: string, state: Partial<WidgetViewState>): void {
  try {
    const existing = getWidgetState(widgetId)
    const merged = { ...existing, ...state }
    localStorage.setItem(`${STORAGE_PREFIX}${widgetId}`, JSON.stringify(merged))
  } catch (err) {
    console.warn('Failed to save widget state:', err)
  }
}

export function getWidgetState(widgetId: string): WidgetViewState | null {
  try {
    const stored = localStorage.getItem(`${STORAGE_PREFIX}${widgetId}`)
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}

export function clearWidgetState(widgetId: string): void {
  localStorage.removeItem(`${STORAGE_PREFIX}${widgetId}`)
}

export function saveLastPage(pageId: string): void {
  try {
    localStorage.setItem(LAST_PAGE_KEY, pageId)
  } catch (err) {
    console.warn('Failed to save last page:', err)
  }
}

export function getLastPage(): string | null {
  return localStorage.getItem(LAST_PAGE_KEY)
}

export function clearLastPage(): void {
  localStorage.removeItem(LAST_PAGE_KEY)
}
```

**Step 2: Export from utils index**

Create `/Users/bvallieres/Dev/tinypivot/packages/studio-vue/src/utils/index.ts`:
```typescript
export * from './widgetState'
```

**Step 3: Commit**

```bash
git add packages/studio-vue/src/utils/
git commit -m "feat(studio-vue): add widget state persistence utilities"
```

---

### Task 3.2: Integrate State Persistence in TinyPivotStudio

**Files:**
- Modify: `/Users/bvallieres/Dev/tinypivot/packages/studio-vue/src/components/TinyPivotStudio.vue`

**Step 1: Import state utilities**

```typescript
import { getLastPage, saveLastPage, saveWidgetState, getWidgetState } from '../utils/widgetState'
```

**Step 2: Restore last page on mount**

In onMounted, add:
```typescript
onMounted(async () => {
  // ... existing initialization

  // Restore last page
  const lastPageId = getLastPage()
  if (lastPageId && pages.value.length > 0) {
    const lastPage = pages.value.find(p => p.id === lastPageId)
    if (lastPage) {
      await handleSelectPage(lastPageId)
    }
  }
})
```

**Step 3: Save last page on selection**

In `handleSelectPage`, add:
```typescript
async function handleSelectPage(pageId: string) {
  // ... existing code

  // Save as last page
  saveLastPage(pageId)
}
```

**Step 4: Test last page persistence**

Run: `pnpm dev`
1. Open a page
2. Refresh the browser
3. Verify same page is selected

**Step 5: Commit**

```bash
git add packages/studio-vue/src/components/TinyPivotStudio.vue
git commit -m "feat(studio): persist and restore last opened page"
```

---

### Task 3.3: Add View State Persistence to DataGrid

**Files:**
- Modify: `/Users/bvallieres/Dev/tinypivot/packages/vue/src/components/DataGrid.vue`

**Step 1: Add widgetId prop**

In props:
```typescript
widgetId?: string
```

**Step 2: Add emit for state changes**

```typescript
const emit = defineEmits<{
  // ... existing emits
  'view-state-change': [state: { activeTab: string }]
}>()
```

**Step 3: Watch viewMode and emit changes**

```typescript
watch(viewMode, (newMode) => {
  if (props.widgetId) {
    emit('view-state-change', { activeTab: newMode })
  }
})
```

**Step 4: Accept initial view state**

Add prop:
```typescript
initialViewState?: { activeTab?: 'ai' | 'grid' | 'pivot' | 'chart' }
```

Initialize viewMode from it:
```typescript
const viewMode = ref<'ai' | 'grid' | 'pivot' | 'chart'>(
  props.initialViewState?.activeTab || props.initialViewMode || 'grid'
)
```

**Step 5: Commit**

```bash
git add packages/vue/src/components/DataGrid.vue
git commit -m "feat(vue): add view state persistence support to DataGrid"
```

---

### Task 3.4: Wire State Persistence in Widget Blocks

**Files:**
- Modify: `/Users/bvallieres/Dev/tinypivot/packages/studio-vue/src/components/TinyPivotStudio.vue`

**Step 1: Pass widgetId and initialViewState to DataGrid**

```html
<DataGrid
  :widget-id="block.id"
  :initial-view-state="getWidgetState(block.id)"
  :show-controls="shouldShowControls(block.id)"
  @view-state-change="(state) => saveWidgetState(block.id, state)"
/>
```

**Step 2: Test state persistence**

Run: `pnpm dev`
1. Switch a widget to Chart view
2. Refresh the page
3. Verify widget is still on Chart view

**Step 3: Commit**

```bash
git add packages/studio-vue/src/components/TinyPivotStudio.vue
git commit -m "feat(studio): wire widget state persistence to DataGrid"
```

---

## Phase 4: Gallery

### Task 4.1: Add listPublicShares to Storage Adapter

**Files:**
- Modify: `/Users/bvallieres/Dev/tinypivot/packages/studio/src/types/storage.ts`
- Modify: `/Users/bvallieres/Dev/tinypivot/packages/storage-indexeddb/src/adapter.ts`

**Step 1: Add type definition**

In storage.ts:
```typescript
export interface PublicShareListItem {
  token: string
  pageTitle: string
  pageDescription?: string
  authorName?: string
  viewCount: number
  publishedAt: Date
  tags?: string[]
}

export interface ListPublicSharesOptions {
  sortBy?: 'recent' | 'popular' | 'title'
  search?: string
  limit?: number
  offset?: number
}
```

Add to StorageAdapter interface:
```typescript
listPublicShares(options?: ListPublicSharesOptions): Promise<PaginatedResult<PublicShareListItem>>
```

**Step 2: Implement in IndexedDB adapter**

```typescript
async function listPublicShares(options: ListPublicSharesOptions = {}): Promise<PaginatedResult<PublicShareListItem>> {
  const { sortBy = 'recent', search, limit = 20, offset = 0 } = options
  const database = await getDB()

  // Get all active, public shares
  const allShares = await database.getAll('shares')
  const publicShares = allShares.filter(s =>
    s.active && s.settings.visibility === 'public'
  )

  // Load page data for each share
  const items: PublicShareListItem[] = []
  for (const share of publicShares) {
    const page = await database.get('pages', share.pageId)
    if (!page) continue

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase()
      if (!page.title.toLowerCase().includes(searchLower) &&
          !page.description?.toLowerCase().includes(searchLower)) {
        continue
      }
    }

    items.push({
      token: share.token,
      pageTitle: page.title,
      pageDescription: page.description,
      authorName: share.settings.showAuthor ? page.createdBy : undefined,
      viewCount: share.viewCount,
      publishedAt: new Date(share.createdAt),
      tags: page.tags,
    })
  }

  // Sort
  items.sort((a, b) => {
    switch (sortBy) {
      case 'popular':
        return b.viewCount - a.viewCount
      case 'title':
        return a.pageTitle.localeCompare(b.pageTitle)
      case 'recent':
      default:
        return b.publishedAt.getTime() - a.publishedAt.getTime()
    }
  })

  // Paginate
  const paginated = items.slice(offset, offset + limit)

  return {
    items: paginated,
    total: items.length,
    offset,
    limit,
    hasMore: offset + limit < items.length,
  }
}
```

**Step 3: Export in adapter return**

Add `listPublicShares` to the returned object.

**Step 4: Commit**

```bash
git add packages/studio/src/types/storage.ts packages/storage-indexeddb/src/adapter.ts
git commit -m "feat(storage): add listPublicShares method for gallery"
```

---

### Task 4.2: Implement ReportGallery Component

**Files:**
- Create: `/Users/bvallieres/Dev/tinypivot/packages/studio-vue/src/components/ReportGallery.vue`

**Step 1: Create the component**

```vue
<script setup lang="ts">
import type { PublicShareListItem, StorageAdapter } from '@smallwebco/tinypivot-studio'
import { onMounted, ref } from 'vue'

interface Props {
  storage: StorageAdapter
}

const props = defineProps<Props>()

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
      limit: 50,
    })
    reports.value = result.items
  } catch (err) {
    console.error('Failed to load reports:', err)
  } finally {
    isLoading.value = false
  }
}

function handleSearch() {
  loadReports()
}

function handleSortChange() {
  loadReports()
}

onMounted(loadReports)
</script>

<template>
  <div class="tps-gallery">
    <header class="tps-gallery-header">
      <h1>Explore Public Reports</h1>

      <div class="tps-gallery-controls">
        <input
          v-model="search"
          type="search"
          placeholder="Search reports..."
          class="tps-gallery-search"
          @keyup.enter="handleSearch"
        />

        <select v-model="sortBy" class="tps-gallery-sort" @change="handleSortChange">
          <option value="recent">Most Recent</option>
          <option value="popular">Most Popular</option>
          <option value="title">Title A-Z</option>
        </select>
      </div>
    </header>

    <div v-if="isLoading" class="tps-gallery-loading">
      Loading reports...
    </div>

    <div v-else-if="reports.length === 0" class="tps-gallery-empty">
      No public reports found
    </div>

    <div v-else class="tps-gallery-grid">
      <a
        v-for="report in reports"
        :key="report.token"
        :href="`/view/${report.token}`"
        class="tps-gallery-card"
      >
        <div class="tps-gallery-card-content">
          <h3>{{ report.pageTitle }}</h3>
          <p v-if="report.pageDescription">{{ report.pageDescription }}</p>
        </div>
        <div class="tps-gallery-card-footer">
          <span v-if="report.authorName">By {{ report.authorName }}</span>
          <span>{{ report.viewCount }} views</span>
        </div>
      </a>
    </div>
  </div>
</template>

<style scoped>
.tps-gallery {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.tps-gallery-header {
  margin-bottom: 2rem;
}

.tps-gallery-header h1 {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0 0 1rem;
}

.tps-gallery-controls {
  display: flex;
  gap: 1rem;
}

.tps-gallery-search {
  flex: 1;
  max-width: 400px;
  padding: 0.5rem 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.875rem;
}

.tps-gallery-sort {
  padding: 0.5rem 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.875rem;
  background: white;
}

.tps-gallery-loading,
.tps-gallery-empty {
  text-align: center;
  padding: 3rem;
  color: #64748b;
}

.tps-gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
}

.tps-gallery-card {
  display: flex;
  flex-direction: column;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  text-decoration: none;
  color: inherit;
  transition: box-shadow 0.15s, border-color 0.15s;
}

.tps-gallery-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.tps-gallery-card-content {
  padding: 1.25rem;
  flex: 1;
}

.tps-gallery-card-content h3 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 0.5rem;
  color: #1e293b;
}

.tps-gallery-card-content p {
  font-size: 0.875rem;
  color: #64748b;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tps-gallery-card-footer {
  display: flex;
  justify-content: space-between;
  padding: 0.75rem 1.25rem;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  font-size: 0.75rem;
  color: #64748b;
}
</style>
```

**Step 2: Export from components index**

Add to index.ts:
```typescript
export { default as ReportGallery } from './ReportGallery.vue'
```

**Step 3: Commit**

```bash
git add packages/studio-vue/src/components/ReportGallery.vue packages/studio-vue/src/components/index.ts
git commit -m "feat(studio-vue): add ReportGallery component"
```

---

### Task 4.3: Update ExploreView to Use ReportGallery

**Files:**
- Modify: `/Users/bvallieres/Dev/tinypivot/examples/studio-vue-demo/src/views/ExploreView.vue`

**Step 1: Update the view**

```vue
<script setup lang="ts">
import { createIndexedDBStorage } from '@smallwebco/tinypivot-storage-indexeddb'
import { ReportGallery } from '@smallwebco/tinypivot-studio-vue'
import '@smallwebco/tinypivot-studio-vue/style.css'

const storage = createIndexedDBStorage()
</script>

<template>
  <ReportGallery :storage="storage" />
</template>
```

**Step 2: Test the gallery**

Run: `pnpm dev`
Navigate to `/explore`
Verify gallery loads (may be empty if no public shares)

**Step 3: Commit**

```bash
git add examples/studio-vue-demo/src/views/ExploreView.vue
git commit -m "feat(demo): integrate ReportGallery in explore view"
```

---

### Task 4.4: Add Gallery Tab to Studio Sidebar

**Files:**
- Modify: `/Users/bvallieres/Dev/tinypivot/packages/studio-vue/src/components/TinyPivotStudio.vue`

**Step 1: Add sidebar tab state**

```typescript
const sidebarTab = ref<'pages' | 'explore'>('pages')
```

**Step 2: Add tab UI to sidebar**

Find the sidebar section and add tab buttons:
```html
<div class="tps-sidebar-tabs">
  <button
    :class="{ active: sidebarTab === 'pages' }"
    @click="sidebarTab = 'pages'"
  >
    My Pages
  </button>
  <button
    :class="{ active: sidebarTab === 'explore' }"
    @click="sidebarTab = 'explore'"
  >
    Explore
  </button>
</div>
```

**Step 3: Conditionally render page list or gallery**

```html
<div v-if="sidebarTab === 'pages'" class="tps-page-list">
  <!-- existing page list -->
</div>

<div v-else class="tps-sidebar-gallery">
  <ReportGallery :storage="storage" :compact="true" />
</div>
```

**Step 4: Add compact mode to ReportGallery**

Add prop for compact layout in sidebar.

**Step 5: Commit**

```bash
git add packages/studio-vue/src/components/TinyPivotStudio.vue
git commit -m "feat(studio): add explore tab to sidebar with gallery"
```

---

## Phase 5: Collision-Aware Resize

### Task 5.1: Create Resize Collision Detection Utility

**Files:**
- Create: `/Users/bvallieres/Dev/tinypivot/packages/studio-vue/src/utils/gridCollision.ts`

**Step 1: Create the utility**

```typescript
import type { Block, GridPosition } from '@smallwebco/tinypivot-studio'

const MIN_WIDTH = 2 // Minimum 2 columns
const MIN_HEIGHT = 2 // Minimum 2 rows

interface CollisionResult {
  canResize: boolean
  neighborAdjustments: Array<{
    blockId: string
    newPosition: GridPosition
  }>
}

export function findHorizontalNeighbor(
  blocks: Block[],
  resizingBlockId: string,
  direction: 'left' | 'right'
): Block | null {
  const resizingBlock = blocks.find(b => b.id === resizingBlockId)
  if (!resizingBlock?.gridPosition) return null

  const { x, y, w, h } = resizingBlock.gridPosition

  // Find blocks that share a vertical edge with the resizing block
  return blocks.find(b => {
    if (b.id === resizingBlockId || !b.gridPosition) return false
    const pos = b.gridPosition

    // Check if blocks are on the same row (overlapping Y range)
    const yOverlap = pos.y < y + h && pos.y + pos.h > y

    if (!yOverlap) return false

    if (direction === 'right') {
      // Neighbor is immediately to the right
      return pos.x === x + w
    } else {
      // Neighbor is immediately to the left
      return pos.x + pos.w === x
    }
  }) || null
}

export function calculateResizeWithCollision(
  blocks: Block[],
  resizingBlockId: string,
  newWidth: number,
  direction: 'left' | 'right'
): CollisionResult {
  const resizingBlock = blocks.find(b => b.id === resizingBlockId)
  if (!resizingBlock?.gridPosition) {
    return { canResize: true, neighborAdjustments: [] }
  }

  const currentPos = resizingBlock.gridPosition
  const widthDelta = newWidth - currentPos.w

  if (widthDelta <= 0) {
    // Shrinking - always allowed
    return { canResize: true, neighborAdjustments: [] }
  }

  // Growing - check for collision
  const neighbor = findHorizontalNeighbor(blocks, resizingBlockId, direction)

  if (!neighbor?.gridPosition) {
    // No neighbor, check grid boundary
    if (direction === 'right' && currentPos.x + newWidth > 12) {
      return { canResize: false, neighborAdjustments: [] }
    }
    return { canResize: true, neighborAdjustments: [] }
  }

  const neighborPos = neighbor.gridPosition
  const neighborNewWidth = neighborPos.w - widthDelta

  if (neighborNewWidth < MIN_WIDTH) {
    // Can only partially resize
    const allowedDelta = neighborPos.w - MIN_WIDTH
    if (allowedDelta <= 0) {
      return { canResize: false, neighborAdjustments: [] }
    }

    return {
      canResize: true,
      neighborAdjustments: [{
        blockId: neighbor.id,
        newPosition: {
          ...neighborPos,
          x: direction === 'right' ? neighborPos.x + allowedDelta : neighborPos.x,
          w: MIN_WIDTH,
        },
      }],
    }
  }

  return {
    canResize: true,
    neighborAdjustments: [{
      blockId: neighbor.id,
      newPosition: {
        ...neighborPos,
        x: direction === 'right' ? neighborPos.x + widthDelta : neighborPos.x,
        w: neighborNewWidth,
      },
    }],
  }
}
```

**Step 2: Export from utils**

Add to utils/index.ts:
```typescript
export * from './gridCollision'
```

**Step 3: Commit**

```bash
git add packages/studio-vue/src/utils/gridCollision.ts packages/studio-vue/src/utils/index.ts
git commit -m "feat(studio-vue): add grid collision detection utility"
```

---

### Task 5.2: Integrate Collision-Aware Resize with GridStack

**Files:**
- Modify: `/Users/bvallieres/Dev/tinypivot/packages/studio-vue/src/components/TinyPivotStudio.vue`

**Step 1: Import collision utilities**

```typescript
import { calculateResizeWithCollision } from '../utils/gridCollision'
```

**Step 2: Add custom resize handler**

```typescript
function handleGridResize(event: Event, element: HTMLElement, newWidth: number) {
  const blockId = element.getAttribute('data-gs-id')
  if (!blockId) return

  const direction = 'right' // Determine from resize handle
  const result = calculateResizeWithCollision(
    editorBlocks.value,
    blockId,
    newWidth,
    direction
  )

  if (!result.canResize) {
    // Prevent resize
    return false
  }

  // Apply neighbor adjustments
  for (const adj of result.neighborAdjustments) {
    const block = editorBlocks.value.find(b => b.id === adj.blockId)
    if (block) {
      block.gridPosition = adj.newPosition
      // Update GridStack
      const neighborEl = gridContainerRef.value?.querySelector(`[data-gs-id="${adj.blockId}"]`)
      if (neighborEl && gridInstance.value) {
        gridInstance.value.update(neighborEl as HTMLElement, {
          x: adj.newPosition.x,
          w: adj.newPosition.w,
        })
      }
    }
  }

  return true
}
```

**Step 3: Register resize handler with GridStack**

In `initGrid`, add resize event listener:
```typescript
gridInstance.value.on('resizestart', (event, el) => {
  // Store initial state for collision detection
})

gridInstance.value.on('resize', (event, el, w, h) => {
  handleGridResize(event, el as HTMLElement, w)
})
```

**Step 4: Test collision-aware resize**

Run: `pnpm dev`
1. Place two widgets side by side
2. Resize one toward the other
3. Verify neighbor shrinks instead of pushing

**Step 5: Commit**

```bash
git add packages/studio-vue/src/components/TinyPivotStudio.vue
git commit -m "feat(studio): integrate collision-aware resize with GridStack"
```

---

## Phase 6: PDF Export

### Task 6.1: Add Print Styles

**Files:**
- Modify: `/Users/bvallieres/Dev/tinypivot/packages/studio/src/style.css`

**Step 1: Add print media query**

At end of file:
```css
@media print {
  /* Hide all edit chrome */
  .tps-sidebar,
  .tps-toolbar,
  .tps-block-actions,
  .tps-block-drag-handle,
  .tps-modal-overlay,
  .vpg-view-toggle,
  .tps-btn {
    display: none !important;
  }

  /* Full width content */
  .tps-editor-content,
  .tps-page-viewer {
    max-width: 100% !important;
    padding: 0 !important;
    margin: 0 !important;
  }

  /* Page breaks */
  .tps-block {
    page-break-inside: avoid;
  }

  .tps-block-widget {
    page-break-before: auto;
    page-break-after: auto;
  }

  /* Remove shadows and borders */
  .tps-block,
  .tps-viewer-widget {
    box-shadow: none !important;
    border: 1px solid #e2e8f0 !important;
  }

  /* Print-friendly colors */
  body {
    background: white !important;
    color: black !important;
  }

  /* Expand collapsed content */
  .tps-collapsed {
    max-height: none !important;
    overflow: visible !important;
  }
}
```

**Step 2: Commit**

```bash
git add packages/studio/src/style.css
git commit -m "style(studio): add print media styles for PDF export"
```

---

### Task 6.2: Add Export PDF Button to PageViewer

**Files:**
- Modify: `/Users/bvallieres/Dev/tinypivot/packages/studio-vue/src/components/PageViewer.vue`

**Step 1: Add export button and handler**

In script:
```typescript
function handleExportPDF() {
  window.print()
}
```

In template, add button in header:
```html
<header v-if="page.title" class="tps-viewer-header">
  <div class="tps-viewer-header-content">
    <h1>{{ page.title }}</h1>
    <p v-if="page.description">{{ page.description }}</p>
  </div>
  <button
    v-if="share?.settings.allowExport"
    class="tps-btn tps-btn-export"
    @click="handleExportPDF"
  >
    Export PDF
  </button>
</header>
```

**Step 2: Style the export button**

```css
.tps-viewer-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.tps-btn-export {
  padding: 0.5rem 1rem;
  background: #4f46e5;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
}

.tps-btn-export:hover {
  background: #4338ca;
}

@media print {
  .tps-btn-export {
    display: none !important;
  }
}
```

**Step 3: Test PDF export**

Run: `pnpm dev`
1. Share a page
2. Open shared page
3. Click Export PDF
4. Verify print dialog opens with clean layout

**Step 4: Commit**

```bash
git add packages/studio-vue/src/components/PageViewer.vue
git commit -m "feat(studio-vue): add PDF export button to PageViewer"
```

---

## Phase 7: Thumbnail Capture (Optional Enhancement)

### Task 7.1: Add html2canvas Dependency

**Files:**
- Modify: `/Users/bvallieres/Dev/tinypivot/packages/studio-vue/package.json`

**Step 1: Install html2canvas**

```bash
cd /Users/bvallieres/Dev/tinypivot/packages/studio-vue
pnpm add html2canvas
```

**Step 2: Commit**

```bash
git add packages/studio-vue/package.json pnpm-lock.yaml
git commit -m "chore(studio-vue): add html2canvas for thumbnail capture"
```

---

### Task 7.2: Create Thumbnail Capture Utility

**Files:**
- Create: `/Users/bvallieres/Dev/tinypivot/packages/studio-vue/src/utils/thumbnail.ts`

**Step 1: Create the utility**

```typescript
import html2canvas from 'html2canvas'

export async function capturePageThumbnail(
  element: HTMLElement,
  options: { width?: number; height?: number } = {}
): Promise<string> {
  const { width = 400, height = 300 } = options

  const canvas = await html2canvas(element, {
    scale: 0.5, // Reduce scale for smaller file size
    useCORS: true,
    logging: false,
    width: element.scrollWidth,
    height: Math.min(element.scrollHeight, 1200), // Cap height
  })

  // Create scaled canvas for thumbnail
  const thumbCanvas = document.createElement('canvas')
  thumbCanvas.width = width
  thumbCanvas.height = height
  const ctx = thumbCanvas.getContext('2d')

  if (ctx) {
    ctx.drawImage(canvas, 0, 0, width, height)
  }

  return thumbCanvas.toDataURL('image/jpeg', 0.7)
}
```

**Step 2: Export from utils**

Add to utils/index.ts:
```typescript
export * from './thumbnail'
```

**Step 3: Commit**

```bash
git add packages/studio-vue/src/utils/thumbnail.ts packages/studio-vue/src/utils/index.ts
git commit -m "feat(studio-vue): add thumbnail capture utility"
```

---

### Task 7.3: Capture Thumbnail on Share Creation

**Files:**
- Modify: `/Users/bvallieres/Dev/tinypivot/packages/studio-vue/src/components/TinyPivotStudio.vue`

**Step 1: Import thumbnail utility**

```typescript
import { capturePageThumbnail } from '../utils/thumbnail'
```

**Step 2: Capture thumbnail in share handler**

Update `handleShareSave`:
```typescript
async function handleShareSave(settings: Partial<PageShareSettings>) {
  if (!currentPage.value || !storage) return

  try {
    // Capture thumbnail before sharing
    const editorContent = document.querySelector('.tps-editor-content') as HTMLElement
    let thumbnailUrl: string | undefined

    if (editorContent && settings.visibility === 'public') {
      try {
        thumbnailUrl = await capturePageThumbnail(editorContent)
      } catch (err) {
        console.warn('Failed to capture thumbnail:', err)
      }
    }

    if (currentPageShare.value) {
      await storage.updateShareSettings(currentPage.value.id, {
        ...settings,
        thumbnailUrl,
      })
    } else {
      const share = await storage.createShare(currentPage.value.id, {
        ...settings,
        thumbnailUrl,
      })
      currentPageShare.value = share
    }
  } catch (err) {
    console.error('Failed to create share:', err)
  }
}
```

**Step 3: Add thumbnailUrl to share settings type**

In types, add:
```typescript
thumbnailUrl?: string
```

**Step 4: Display thumbnail in gallery cards**

Update ReportGallery to show thumbnails.

**Step 5: Commit**

```bash
git add packages/studio-vue/src/components/TinyPivotStudio.vue packages/studio-vue/src/components/ReportGallery.vue
git commit -m "feat(studio): capture and display thumbnails for shared pages"
```

---

## Final Verification

### Task: End-to-End Test

**Step 1: Build all packages**

```bash
cd /Users/bvallieres/Dev/tinypivot
pnpm build
```

**Step 2: Run demo**

```bash
cd examples/studio-vue-demo
pnpm dev
```

**Step 3: Test complete flow**

1. Create a page with widgets
2. Hover widgets - verify controls appear/disappear
3. Switch widget tabs - verify state persists on reload
4. Share page as public
5. Open shared URL in incognito - verify read-only view
6. Navigate to /explore - verify gallery shows public pages
7. Export PDF - verify clean print layout
8. Resize widgets - verify neighbors shrink (if implemented)

**Step 4: Final commit**

```bash
git add .
git commit -m "feat: complete publish, preview, and gallery implementation"
```

---

## Summary

| Phase | Tasks | Key Files |
|-------|-------|-----------|
| 1 | Widget Hover UX | TinyPivotStudio.vue, DataGrid.vue, style.css |
| 2 | PageViewer + Share | PageViewer.vue, ShareModal.vue, router.ts |
| 3 | State Persistence | widgetState.ts, TinyPivotStudio.vue |
| 4 | Gallery | ReportGallery.vue, ExploreView.vue, adapter.ts |
| 5 | Collision Resize | gridCollision.ts, TinyPivotStudio.vue |
| 6 | PDF Export | style.css, PageViewer.vue |
| 7 | Thumbnails | thumbnail.ts, TinyPivotStudio.vue |
