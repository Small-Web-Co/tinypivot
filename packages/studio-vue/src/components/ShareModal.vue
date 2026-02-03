<script setup lang="ts">
/**
 * ShareModal Component
 * Modal for configuring page sharing settings (visibility, access level, password, etc.)
 */
import type { PageShare, PageShareSettings } from '@smallwebco/tinypivot-studio'
import { computed, ref, watch } from 'vue'

/**
 * Props for ShareModal component
 */
export interface ShareModalProps {
  /** Whether the modal is open */
  isOpen: boolean
  /** ID of the page being shared */
  pageId: string
  /** Title of the page (for display) */
  pageTitle: string
  /** Existing share configuration (if already shared) */
  existingShare?: PageShare | null
}

const props = defineProps<ShareModalProps>()

const emit = defineEmits<{
  /** Emitted when user closes the modal */
  close: []
  /** Emitted when user saves share settings */
  save: [settings: Partial<PageShareSettings>]
  /** Emitted when user revokes the share link */
  revoke: []
}>()

// Form state
const visibility = ref<'public' | 'unlisted' | 'password'>('unlisted')
const accessLevel = ref<'view' | 'interact' | 'duplicate'>('view')
const password = ref('')
const showAuthor = ref(true)
const allowEmbed = ref(false)
const allowExport = ref(true)

// Track if copy was successful for feedback
const copySuccess = ref(false)

// Populate from existing share when it changes
watch(
  () => props.existingShare,
  (share) => {
    if (share) {
      visibility.value = share.settings.visibility
      accessLevel.value = share.settings.accessLevel
      showAuthor.value = share.settings.showAuthor
      allowEmbed.value = share.settings.allowEmbed
      allowExport.value = share.settings.allowExport
    }
    else {
      // Reset to defaults when no share exists
      visibility.value = 'unlisted'
      accessLevel.value = 'view'
      password.value = ''
      showAuthor.value = true
      allowEmbed.value = false
      allowExport.value = true
    }
  },
  { immediate: true },
)

// Computed share URL
const shareUrl = computed(() => {
  if (!props.existingShare)
    return null
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

async function handleCopyLink() {
  if (shareUrl.value) {
    try {
      await navigator.clipboard.writeText(shareUrl.value)
      copySuccess.value = true
      setTimeout(() => {
        copySuccess.value = false
      }, 2000)
    }
    catch {
      // Fallback for older browsers
      const input = document.createElement('input')
      input.value = shareUrl.value
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      copySuccess.value = true
      setTimeout(() => {
        copySuccess.value = false
      }, 2000)
    }
  }
}

function handleRevoke() {
  if (confirm('Are you sure you want to revoke this share link? Anyone with the link will no longer be able to access this page.')) {
    emit('revoke')
  }
}

function handleOverlayClick(event: MouseEvent) {
  if (event.target === event.currentTarget) {
    emit('close')
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="tps-modal-overlay" @click="handleOverlayClick">
      <div class="tps-modal tps-share-modal" role="dialog" aria-modal="true" aria-labelledby="share-modal-title">
        <header class="tps-modal-header">
          <h2 id="share-modal-title">
            Share "{{ pageTitle }}"
          </h2>
          <button
            type="button"
            class="tps-modal-close"
            aria-label="Close modal"
            @click="emit('close')"
          >
            &times;
          </button>
        </header>

        <div class="tps-modal-body">
          <!-- Share link display when exists -->
          <div v-if="existingShare && shareUrl" class="tps-share-url">
            <label class="tps-share-url-label">Share Link</label>
            <div class="tps-share-url-input">
              <input type="text" :value="shareUrl" readonly aria-label="Share URL">
              <button
                type="button"
                class="tps-btn tps-btn-secondary"
                @click="handleCopyLink"
              >
                {{ copySuccess ? 'Copied!' : 'Copy' }}
              </button>
            </div>
            <p class="tps-share-stats">
              {{ existingShare.viewCount }} {{ existingShare.viewCount === 1 ? 'view' : 'views' }}
            </p>
          </div>

          <!-- Visibility select -->
          <div class="tps-form-group">
            <label for="share-visibility">Visibility</label>
            <select id="share-visibility" v-model="visibility" class="tps-select">
              <option value="public">
                Public (listed in gallery)
              </option>
              <option value="unlisted">
                Unlisted (link only)
              </option>
              <option value="password">
                Password protected
              </option>
            </select>
          </div>

          <!-- Password field when needed -->
          <div v-if="visibility === 'password'" class="tps-form-group">
            <label for="share-password">Password</label>
            <input
              id="share-password"
              v-model="password"
              type="password"
              class="tps-input"
              placeholder="Enter password"
              autocomplete="new-password"
            >
          </div>

          <!-- Access level -->
          <div class="tps-form-group">
            <label for="share-access-level">Access Level</label>
            <select id="share-access-level" v-model="accessLevel" class="tps-select">
              <option value="view">
                View only
              </option>
              <option value="interact">
                Interactive (filters work)
              </option>
              <option value="duplicate">
                Allow duplicate
              </option>
            </select>
            <p class="tps-form-help">
              <template v-if="accessLevel === 'view'">
                Viewers can only see the content. No interactivity.
              </template>
              <template v-else-if="accessLevel === 'interact'">
                Viewers can use filters and interact with charts.
              </template>
              <template v-else>
                Viewers can duplicate this page to their own account.
              </template>
            </p>
          </div>

          <!-- Checkboxes -->
          <div class="tps-form-group tps-form-group--checkbox">
            <label class="tps-checkbox-label">
              <input v-model="showAuthor" type="checkbox">
              <span>Show author name</span>
            </label>
          </div>
          <div class="tps-form-group tps-form-group--checkbox">
            <label class="tps-checkbox-label">
              <input v-model="allowExport" type="checkbox">
              <span>Allow PDF export</span>
            </label>
          </div>
          <div class="tps-form-group tps-form-group--checkbox">
            <label class="tps-checkbox-label">
              <input v-model="allowEmbed" type="checkbox">
              <span>Allow embedding</span>
            </label>
          </div>
        </div>

        <footer class="tps-modal-footer">
          <button
            v-if="existingShare"
            type="button"
            class="tps-btn tps-btn-danger"
            @click="handleRevoke"
          >
            Revoke Link
          </button>
          <div class="tps-modal-footer-right">
            <button type="button" class="tps-btn" @click="emit('close')">
              Cancel
            </button>
            <button type="button" class="tps-btn tps-btn-primary" @click="handleSave">
              {{ existingShare ? 'Update' : 'Create Link' }}
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tps-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.tps-modal {
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  max-width: 480px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  margin: 1rem;
}

.tps-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #e2e8f0;
}

.tps-modal-header h2 {
  font-size: 1.125rem;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tps-modal-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: #64748b;
  cursor: pointer;
  padding: 0.25rem;
  line-height: 1;
  border-radius: 4px;
  transition: background-color 0.15s, color 0.15s;
}

.tps-modal-close:hover {
  background: #f1f5f9;
  color: #1e293b;
}

.tps-modal-body {
  padding: 1.5rem;
}

.tps-share-url {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1.5rem;
}

.tps-share-url-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: #334155;
  margin-bottom: 0.5rem;
}

.tps-share-url-input {
  display: flex;
  gap: 0.5rem;
}

.tps-share-url-input input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.875rem;
  color: #334155;
  background: #ffffff;
}

.tps-share-url-input input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.tps-share-stats {
  margin: 0.5rem 0 0;
  font-size: 0.75rem;
  color: #64748b;
}

.tps-form-group {
  margin-bottom: 1rem;
}

.tps-form-group:last-child {
  margin-bottom: 0;
}

.tps-form-group label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: #334155;
  margin-bottom: 0.375rem;
}

.tps-form-group--checkbox {
  margin-bottom: 0.75rem;
}

.tps-select,
.tps-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.875rem;
  color: #334155;
  background: #ffffff;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.tps-select:focus,
.tps-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.tps-form-help {
  margin: 0.375rem 0 0;
  font-size: 0.75rem;
  color: #64748b;
}

.tps-checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-weight: 400;
}

.tps-checkbox-label input[type="checkbox"] {
  width: 1rem;
  height: 1rem;
  accent-color: #3b82f6;
  cursor: pointer;
}

.tps-modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 0 0 12px 12px;
}

.tps-modal-footer-right {
  display: flex;
  gap: 0.5rem;
  margin-left: auto;
}

.tps-btn {
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #334155;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s, color 0.15s;
}

.tps-btn:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.tps-btn-secondary {
  background: #f1f5f9;
}

.tps-btn-secondary:hover {
  background: #e2e8f0;
}

.tps-btn-primary {
  background: #3b82f6;
  border-color: #3b82f6;
  color: #ffffff;
}

.tps-btn-primary:hover {
  background: #2563eb;
  border-color: #2563eb;
}

.tps-btn-danger {
  background: #ffffff;
  border-color: #fca5a5;
  color: #dc2626;
}

.tps-btn-danger:hover {
  background: #fef2f2;
  border-color: #f87171;
}
</style>
