<script setup lang="ts">
import type { CalculatedField } from '@smallwebco/tinypivot-core'
import {
  validateSimpleFormula,
} from '@smallwebco/tinypivot-core'
/**
 * Calculated Field Modal
 * UI for creating custom calculated fields with formulas
 */
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  show: boolean
  availableFields: string[]
  existingField?: CalculatedField | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', field: CalculatedField): void
}>()

// Form state
const name = ref('')
const formula = ref('')
const formatAs = ref<'number' | 'percent' | 'currency'>('number')
const decimals = ref(2)
const error = ref<string | null>(null)

// Reset form when modal opens
watch(() => props.show, (show) => {
  if (show) {
    if (props.existingField) {
      name.value = props.existingField.name
      formula.value = props.existingField.formula
      formatAs.value = props.existingField.formatAs || 'number'
      decimals.value = props.existingField.decimals ?? 2
    }
    else {
      name.value = ''
      formula.value = ''
      formatAs.value = 'number'
      decimals.value = 2
    }
    error.value = null
  }
})

// Validate formula on change
const validationError = computed(() => {
  if (!formula.value.trim())
    return null
  return validateSimpleFormula(formula.value, props.availableFields)
})

// Insert field into formula
function insertField(field: string) {
  // Add field with space padding if there's already content
  if (formula.value.trim() && !formula.value.endsWith(' ')) {
    formula.value += ' '
  }
  formula.value += field
}

// Insert operator into formula
function insertOperator(op: string) {
  if (formula.value.trim() && !formula.value.endsWith(' ')) {
    formula.value += ' '
  }
  formula.value += `${op} `
}

// Save calculated field
function save() {
  if (!name.value.trim()) {
    error.value = 'Name is required'
    return
  }

  const validationResult = validateSimpleFormula(formula.value, props.availableFields)
  if (validationResult) {
    error.value = validationResult
    return
  }

  const field: CalculatedField = {
    id: props.existingField?.id || `calc_${Date.now()}`,
    name: name.value.trim(),
    formula: formula.value.trim(),
    formatAs: formatAs.value,
    decimals: decimals.value,
  }

  emit('save', field)
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="vpg-modal-overlay" @click.self="emit('close')">
      <div class="vpg-modal">
        <div class="vpg-modal-header">
          <h3>{{ existingField ? 'Edit' : 'Create' }} Calculated Field</h3>
          <button class="vpg-modal-close" @click="emit('close')">
            ×
          </button>
        </div>

        <div class="vpg-modal-body">
          <!-- Name -->
          <div class="vpg-form-group">
            <label class="vpg-label">Name</label>
            <input
              v-model="name"
              type="text"
              class="vpg-input"
              placeholder="e.g., Profit Margin %"
            >
          </div>

          <!-- Formula -->
          <div class="vpg-form-group">
            <label class="vpg-label">Formula</label>
            <textarea
              v-model="formula"
              class="vpg-textarea"
              placeholder="e.g., revenue / units"
              rows="2"
            />
            <div class="vpg-formula-hint">
              Use field names with math operators: + - * / ( )
            </div>
            <div v-if="validationError" class="vpg-error">
              {{ validationError }}
            </div>
          </div>

          <!-- Quick Insert: Operators -->
          <div class="vpg-form-group">
            <label class="vpg-label-small">Operators</label>
            <div class="vpg-button-group">
              <button class="vpg-insert-btn vpg-op-btn" @click="insertOperator('+')">
                +
              </button>
              <button class="vpg-insert-btn vpg-op-btn" @click="insertOperator('-')">
                −
              </button>
              <button class="vpg-insert-btn vpg-op-btn" @click="insertOperator('*')">
                ×
              </button>
              <button class="vpg-insert-btn vpg-op-btn" @click="insertOperator('/')">
                ÷
              </button>
              <button class="vpg-insert-btn vpg-op-btn" @click="insertOperator('(')">
                (
              </button>
              <button class="vpg-insert-btn vpg-op-btn" @click="insertOperator(')')">
                )
              </button>
            </div>
          </div>

          <!-- Quick Insert: Fields (numeric only) -->
          <div class="vpg-form-group">
            <label class="vpg-label-small">Insert Field</label>
            <div v-if="availableFields.length > 0" class="vpg-button-group vpg-field-buttons">
              <button
                v-for="field in availableFields"
                :key="field"
                class="vpg-insert-btn vpg-field-btn"
                @click="insertField(field)"
              >
                {{ field }}
              </button>
            </div>
            <div v-else class="vpg-no-fields">
              No numeric fields available
            </div>
          </div>

          <!-- Format Options -->
          <div class="vpg-form-row">
            <div class="vpg-form-group vpg-form-group-half">
              <label class="vpg-label">Format As</label>
              <select v-model="formatAs" class="vpg-select">
                <option value="number">
                  Number
                </option>
                <option value="percent">
                  Percentage
                </option>
                <option value="currency">
                  Currency ($)
                </option>
              </select>
            </div>
            <div class="vpg-form-group vpg-form-group-half">
              <label class="vpg-label">Decimals</label>
              <input
                v-model.number="decimals"
                type="number"
                class="vpg-input"
                min="0"
                max="6"
              >
            </div>
          </div>

          <!-- Error -->
          <div v-if="error" class="vpg-error vpg-error-box">
            {{ error }}
          </div>
        </div>

        <div class="vpg-modal-footer">
          <button class="vpg-btn vpg-btn-secondary" @click="emit('close')">
            Cancel
          </button>
          <button class="vpg-btn vpg-btn-primary" @click="save">
            {{ existingField ? 'Update' : 'Add' }} Field
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.vpg-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(2px);
}

.vpg-modal {
  background: white;
  border-radius: 0.75rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  width: 90%;
  max-width: 520px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.vpg-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
}

.vpg-modal-header h3 {
  font-size: 1rem;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
}

.vpg-modal-close {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  color: #64748b;
  background: transparent;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s;
}

.vpg-modal-close:hover {
  background: #e2e8f0;
  color: #1e293b;
}

.vpg-modal-body {
  padding: 1.25rem;
  overflow-y: auto;
  flex: 1;
}

.vpg-form-group {
  margin-bottom: 1rem;
}

.vpg-form-group-half {
  flex: 1;
}

.vpg-form-row {
  display: flex;
  gap: 1rem;
}

.vpg-label {
  display: block;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 0.375rem;
}

.vpg-label-small {
  display: block;
  font-size: 0.6875rem;
  font-weight: 500;
  color: #64748b;
  margin-bottom: 0.375rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.vpg-input,
.vpg-textarea,
.vpg-select {
  width: 100%;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  background: white;
  color: #1e293b;
  transition: all 0.15s;
}

.vpg-input:focus,
.vpg-textarea:focus,
.vpg-select:focus {
  outline: none;
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.vpg-textarea {
  font-family: ui-monospace, monospace;
  resize: vertical;
}

.vpg-button-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.vpg-field-buttons {
  max-height: 80px;
  overflow-y: auto;
}

.vpg-insert-btn {
  padding: 0.25rem 0.5rem;
  font-size: 0.6875rem;
  font-weight: 600;
  background: #eef2ff;
  color: #4f46e5;
  border: 1px solid #c7d2fe;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.15s;
}

.vpg-insert-btn:hover {
  background: #e0e7ff;
  border-color: #a5b4fc;
}

.vpg-op-btn {
  min-width: 2rem;
  font-size: 0.875rem;
  font-weight: 500;
}

.vpg-formula-hint {
  margin-top: 0.25rem;
  font-size: 0.6875rem;
  color: #64748b;
}

.vpg-field-btn {
  background: #f0fdf4;
  color: #15803d;
  border-color: #bbf7d0;
}

.vpg-field-btn:hover {
  background: #dcfce7;
  border-color: #86efac;
}

.vpg-no-fields {
  font-size: 0.75rem;
  color: #94a3b8;
  font-style: italic;
  padding: 0.5rem;
  text-align: center;
  background: #f8fafc;
  border-radius: 0.375rem;
}

.vpg-error {
  font-size: 0.75rem;
  color: #dc2626;
  margin-top: 0.25rem;
}

.vpg-error-box {
  padding: 0.5rem 0.75rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 0.375rem;
  margin-top: 0.5rem;
}

.vpg-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
}

.vpg-btn {
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s;
}

.vpg-btn-secondary {
  background: white;
  color: #374151;
  border: 1px solid #d1d5db;
}

.vpg-btn-secondary:hover {
  background: #f3f4f6;
}

.vpg-btn-primary {
  background: #4f46e5;
  color: white;
  border: 1px solid #4f46e5;
}

.vpg-btn-primary:hover {
  background: #4338ca;
  border-color: #4338ca;
}
</style>

<style>
/* Dark mode styles */
.vpg-theme-dark .vpg-modal {
  background: #1e293b;
}

.vpg-theme-dark .vpg-modal-header {
  background: #0f172a;
  border-color: #334155;
}

.vpg-theme-dark .vpg-modal-header h3 {
  color: #f1f5f9;
}

.vpg-theme-dark .vpg-modal-close {
  color: #94a3b8;
}

.vpg-theme-dark .vpg-modal-close:hover {
  background: #334155;
  color: #f1f5f9;
}

.vpg-theme-dark .vpg-label {
  color: #e2e8f0;
}

.vpg-theme-dark .vpg-label-small {
  color: #94a3b8;
}

.vpg-theme-dark .vpg-input,
.vpg-theme-dark .vpg-textarea,
.vpg-theme-dark .vpg-select {
  background: #0f172a;
  border-color: #334155;
  color: #f1f5f9;
}

.vpg-theme-dark .vpg-input:focus,
.vpg-theme-dark .vpg-textarea:focus,
.vpg-theme-dark .vpg-select:focus {
  border-color: #6366f1;
}

.vpg-theme-dark .vpg-insert-btn {
  background: rgba(99, 102, 241, 0.15);
  color: #a5b4fc;
  border-color: rgba(99, 102, 241, 0.3);
}

.vpg-theme-dark .vpg-field-btn {
  background: rgba(34, 197, 94, 0.15);
  color: #86efac;
  border-color: rgba(34, 197, 94, 0.3);
}

.vpg-theme-dark .vpg-no-fields {
  background: #334155;
  color: #64748b;
}

.vpg-theme-dark .vpg-modal-footer {
  background: #0f172a;
  border-color: #334155;
}

.vpg-theme-dark .vpg-btn-secondary {
  background: #334155;
  color: #e2e8f0;
  border-color: #475569;
}

.vpg-theme-dark .vpg-btn-secondary:hover {
  background: #475569;
}

.vpg-theme-dark .vpg-error-box {
  background: rgba(220, 38, 38, 0.15);
  border-color: rgba(220, 38, 38, 0.3);
}
</style>
