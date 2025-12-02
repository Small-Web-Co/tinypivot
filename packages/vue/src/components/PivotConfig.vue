<script setup lang="ts">
/**
 * Pivot Table Configuration Panel
 * Draggable fields with aggregation selection
 */
import { computed, ref } from 'vue'
import type { AggregationFunction, PivotValueField, CalculatedField } from '@smallwebco/tinypivot-core'
import { AGGREGATION_OPTIONS, getAggregationSymbol } from '@smallwebco/tinypivot-core'
import { useLicense } from '../composables/useLicense'
import CalculatedFieldModal from './CalculatedFieldModal.vue'

interface FieldStats {
  field: string
  type: 'string' | 'number' | 'date' | 'boolean' | 'mixed'
  uniqueCount: number
  isNumeric: boolean
}

const props = defineProps<{
  availableFields: FieldStats[]
  rowFields: string[]
  columnFields: string[]
  valueFields: PivotValueField[]
  showRowTotals: boolean
  showColumnTotals: boolean
  calculatedFields?: CalculatedField[]
}>()

const emit = defineEmits<{
  (e: 'update:showRowTotals', value: boolean): void
  (e: 'update:showColumnTotals', value: boolean): void
  (e: 'clearConfig'): void
  (e: 'dragStart', field: string, event: DragEvent): void
  (e: 'dragEnd'): void
  (e: 'updateAggregation', field: string, oldAgg: AggregationFunction, newAgg: AggregationFunction): void
  (e: 'addRowField', field: string): void
  (e: 'removeRowField', field: string): void
  (e: 'addColumnField', field: string): void
  (e: 'removeColumnField', field: string): void
  (e: 'addValueField', field: string, aggregation: AggregationFunction): void
  (e: 'removeValueField', field: string, aggregation: AggregationFunction): void
  (e: 'addCalculatedField', field: CalculatedField): void
  (e: 'removeCalculatedField', id: string): void
  (e: 'updateCalculatedField', field: CalculatedField): void
}>()

const { isPro } = useLicense()

// Use aggregation options from core
const aggregationOptions = AGGREGATION_OPTIONS

// Calculated field modal state
const showCalcModal = ref(false)
const editingCalcField = ref<CalculatedField | null>(null)

// Get only numeric field names for calculated field formulas
const numericFieldNames = computed(() =>
  props.availableFields
    .filter(f => f.isNumeric)
    .map(f => f.field)
)

function openCalcModal(field?: CalculatedField) {
  editingCalcField.value = field || null
  showCalcModal.value = true
}

function handleSaveCalcField(field: CalculatedField) {
  if (editingCalcField.value) {
    emit('updateCalculatedField', field)
  } else {
    emit('addCalculatedField', field)
  }
  showCalcModal.value = false
  editingCalcField.value = null
}

// Toggle both row and column totals together
function handleTotalsToggle(checked: boolean) {
  emit('update:showRowTotals', checked)
  emit('update:showColumnTotals', checked)
}

// Convert calculated fields to virtual FieldStats for display
const calculatedFieldsAsStats = computed(() => {
  if (!props.calculatedFields) return []
  return props.calculatedFields.map(calc => ({
    field: `calc:${calc.id}`,
    type: 'number' as const,
    uniqueCount: 0,
    isNumeric: true,
    isCalculated: true,
    calcId: calc.id,
    calcName: calc.name,
    calcFormula: calc.formula,
  }))
})

// Combined available fields (data fields + calculated fields)
const allAvailableFields = computed(() => [
  ...props.availableFields.map(f => ({ ...f, isCalculated: false })),
  ...calculatedFieldsAsStats.value,
])

// Assigned fields
const assignedFields = computed(() => {
  const rowSet = new Set(props.rowFields)
  const colSet = new Set(props.columnFields)
  const valueMap = new Map(props.valueFields.map(v => [v.field, v]))

  return allAvailableFields.value
    .filter(f => rowSet.has(f.field) || colSet.has(f.field) || valueMap.has(f.field))
    .map(f => ({
      ...f,
      assignedTo: rowSet.has(f.field)
        ? 'row' as const
        : colSet.has(f.field)
          ? 'column' as const
          : 'value' as const,
      valueConfig: valueMap.get(f.field),
    }))
})

// Unassigned fields (including unassigned calculated fields)
const unassignedFields = computed(() => {
  const rowSet = new Set(props.rowFields)
  const colSet = new Set(props.columnFields)
  const valSet = new Set(props.valueFields.map(v => v.field))

  return allAvailableFields.value.filter(f =>
    !rowSet.has(f.field) && !colSet.has(f.field) && !valSet.has(f.field),
  )
})

const assignedCount = computed(() => assignedFields.value.length)

// Field search
const fieldSearch = ref('')
const filteredUnassignedFields = computed(() => {
  if (!fieldSearch.value.trim())
    return unassignedFields.value
  const search = fieldSearch.value.toLowerCase().trim()
  return unassignedFields.value.filter(f => {
    // Search by field name or calculated field display name
    const fieldName = f.field.toLowerCase()
    const displayName = f.isCalculated && f.calcName ? f.calcName.toLowerCase() : ''
    return fieldName.includes(search) || displayName.includes(search)
  })
})

// Field type icons
function getFieldIcon(type: FieldStats['type'], isCalculated?: boolean): string {
  if (isCalculated) return 'ƒ'
  switch (type) {
    case 'number': return '#'
    case 'date': return '📅'
    case 'boolean': return '✓'
    default: return 'Aa'
  }
}

// Get display name for field (handles calculated fields)
function getFieldDisplayName(field: any): string {
  if (field.isCalculated && field.calcName) {
    return field.calcName
  }
  return field.field
}

function handleDragStart(field: string, event: DragEvent) {
  event.dataTransfer?.setData('text/plain', field)
  event.dataTransfer!.effectAllowed = 'move'
  emit('dragStart', field, event)
}

function handleDragEnd() {
  emit('dragEnd')
}

function handleAggregationChange(field: string, currentAgg: AggregationFunction, newAgg: AggregationFunction) {
  emit('updateAggregation', field, currentAgg, newAgg)
}

function toggleRowColumn(field: string, currentAssignment: 'row' | 'column') {
  if (currentAssignment === 'row') {
    emit('removeRowField', field)
    emit('addColumnField', field)
  }
  else {
    emit('removeColumnField', field)
    emit('addRowField', field)
  }
}

function removeField(field: string, assignedTo: 'row' | 'column' | 'value', valueConfig?: PivotValueField) {
  if (assignedTo === 'row') {
    emit('removeRowField', field)
  }
  else if (assignedTo === 'column') {
    emit('removeColumnField', field)
  }
  else if (valueConfig) {
    emit('removeValueField', field, valueConfig.aggregation)
  }
}
</script>

<template>
  <div class="vpg-pivot-config">
    <!-- Header -->
    <div class="vpg-config-header">
      <h3 class="vpg-config-title">
        <svg class="vpg-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
        Fields
      </h3>
      <div class="vpg-header-actions">
        <button
          v-if="assignedCount > 0"
          class="vpg-action-btn vpg-clear-btn"
          title="Clear all"
          @click="emit('clearConfig')"
        >
          <svg class="vpg-icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Assigned Fields -->
    <div v-if="assignedCount > 0" class="vpg-assigned-section">
      <div class="vpg-section-label">Active</div>
      <div class="vpg-assigned-list">
        <div
          v-for="field in assignedFields"
          :key="field.field"
          class="vpg-assigned-item"
          :class="[`vpg-type-${field.assignedTo}`, { 'vpg-type-calc': field.isCalculated }]"
          :title="field.isCalculated ? field.calcFormula : field.field"
          draggable="true"
          @dragstart="handleDragStart(field.field, $event)"
          @dragend="handleDragEnd"
        >
          <div class="vpg-item-main">
            <span class="vpg-item-badge" :class="[field.assignedTo, { calc: field.isCalculated }]">
              {{ field.isCalculated ? 'ƒ' : (field.assignedTo === 'row' ? 'R' : field.assignedTo === 'column' ? 'C' : getAggregationSymbol(field.valueConfig?.aggregation || 'sum')) }}
            </span>
            <span class="vpg-item-name">{{ getFieldDisplayName(field) }}</span>
          </div>

          <div class="vpg-item-actions">
            <button
              v-if="field.assignedTo === 'row' || field.assignedTo === 'column'"
              class="vpg-toggle-btn"
              :title="field.assignedTo === 'row' ? 'Move to Columns' : 'Move to Rows'"
              @click.stop="toggleRowColumn(field.field, field.assignedTo)"
            >
              <svg class="vpg-icon-xs" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </button>

            <select
              v-if="field.assignedTo === 'value' && field.valueConfig"
              class="vpg-agg-select"
              :value="field.valueConfig.aggregation"
              @change="handleAggregationChange(field.field, field.valueConfig!.aggregation, ($event.target as HTMLSelectElement).value as AggregationFunction)"
              @click.stop
            >
              <option v-for="agg in aggregationOptions" :key="agg.value" :value="agg.value">
                {{ agg.symbol }} {{ agg.label }}
              </option>
            </select>

            <button
              class="vpg-remove-btn"
              title="Remove"
              @click.stop="removeField(field.field, field.assignedTo, field.valueConfig)"
            >
              ×
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Unassigned Fields -->
    <div class="vpg-unassigned-section">
      <div class="vpg-section-header">
        <div class="vpg-section-label">
          Available <span class="vpg-count">{{ unassignedFields.length }}</span>
        </div>
      </div>

      <!-- Field Search -->
      <div class="vpg-field-search">
        <svg class="vpg-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          v-model="fieldSearch"
          type="text"
          placeholder="Search fields..."
          class="vpg-search-input"
        >
        <button v-if="fieldSearch" class="vpg-clear-search" @click="fieldSearch = ''">
          <svg class="vpg-icon-xs" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="vpg-field-list">
        <div
          v-for="field in filteredUnassignedFields"
          :key="field.field"
          class="vpg-field-item"
          :class="{ 
            'vpg-is-numeric': field.isNumeric && !field.isCalculated,
            'vpg-is-calculated': field.isCalculated 
          }"
          :title="field.isCalculated ? field.calcFormula : field.field"
          draggable="true"
          @dragstart="handleDragStart(field.field, $event)"
          @dragend="handleDragEnd"
        >
          <span class="vpg-field-type-icon" :class="{ 'vpg-calc-type': field.isCalculated }">
            {{ getFieldIcon(field.type, field.isCalculated) }}
          </span>
          <span class="vpg-field-name">{{ getFieldDisplayName(field) }}</span>
          <template v-if="field.isCalculated">
            <button
              class="vpg-field-edit"
              title="Edit calculated field"
              @click.stop="openCalcModal(calculatedFields?.find(c => c.id === field.calcId))"
            >✎</button>
            <button
              class="vpg-field-delete"
              title="Delete calculated field"
              @click.stop="emit('removeCalculatedField', field.calcId)"
            >×</button>
          </template>
          <template v-else>
            <span class="vpg-unique-count">{{ field.uniqueCount }}</span>
          </template>
        </div>
        <div v-if="filteredUnassignedFields.length === 0 && fieldSearch" class="vpg-empty-hint">
          No fields match "{{ fieldSearch }}"
        </div>
        <div v-else-if="unassignedFields.length === 0" class="vpg-empty-hint">
          All fields assigned
        </div>
      </div>
    </div>

    <!-- Options -->
    <div class="vpg-options-section">
      <label class="vpg-option-toggle">
        <input
          type="checkbox"
          :checked="showRowTotals"
          @change="handleTotalsToggle(($event.target as HTMLInputElement).checked)"
        >
        <span>Totals</span>
      </label>
      <button class="vpg-calc-btn" @click="openCalcModal()" title="Add calculated field (e.g. Profit Margin %)">
        <span class="vpg-calc-icon">ƒ</span>
        <span>+ Calc</span>
      </button>
    </div>

    <!-- Calculated Field Modal -->
    <CalculatedFieldModal
      :show="showCalcModal"
      :available-fields="numericFieldNames"
      :existing-field="editingCalcField"
      @close="showCalcModal = false; editingCalcField = null"
      @save="handleSaveCalcField"
    />
  </div>
</template>

<style scoped>
.vpg-pivot-config {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);
  overflow: hidden;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.vpg-config-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.vpg-config-title {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.vpg-icon {
  width: 1rem;
  height: 1rem;
}

.vpg-icon-sm {
  width: 0.875rem;
  height: 0.875rem;
}

.vpg-icon-xs {
  width: 0.75rem;
  height: 0.75rem;
}

.vpg-header-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.vpg-action-btn {
  padding: 0.375rem;
  border-radius: 0.25rem;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}

.vpg-clear-btn {
  color: #94a3b8;
}

.vpg-clear-btn:hover {
  background: #fee2e2;
  color: #ef4444;
}

.vpg-section-label {
  font-size: 0.625rem;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 0.25rem 0.5rem;
}

.vpg-section-label .vpg-count {
  color: #cbd5e1;
  margin-left: 0.25rem;
}

.vpg-assigned-section {
  border-bottom: 1px solid #e2e8f0;
  background: linear-gradient(to bottom, #f8fafc, white);
  padding-bottom: 0.5rem;
  flex-shrink: 0;
}

.vpg-assigned-list {
  padding: 0 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.vpg-assigned-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  border-radius: 0.5rem;
  font-size: 0.75rem;
  cursor: grab;
  transition: all 0.15s;
}

.vpg-assigned-item:active {
  cursor: grabbing;
  transform: scale(0.98);
}

.vpg-assigned-item.vpg-type-row {
  background: #eef2ff;
  border: 1px solid #c7d2fe;
}

.vpg-assigned-item.vpg-type-column {
  background: #f5f3ff;
  border: 1px solid #ddd6fe;
}

.vpg-assigned-item.vpg-type-value {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
}

.vpg-assigned-item.vpg-type-calc {
  background: #fdf4ff;
  border: 1px solid #f0abfc;
  cursor: pointer;
}

.vpg-item-main {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.vpg-item-badge {
  width: 1.25rem;
  height: 1.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.625rem;
  font-weight: 700;
  border-radius: 0.25rem;
}

.vpg-item-badge.row {
  background: #c7d2fe;
  color: #4338ca;
}

.vpg-item-badge.column {
  background: #ddd6fe;
  color: #7c3aed;
}

.vpg-item-badge.value {
  background: #a7f3d0;
  color: #059669;
}

.vpg-item-badge.calc {
  background: #f0abfc;
  color: #86198f;
}

.vpg-item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  color: #334155;
}

.vpg-item-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}

.vpg-toggle-btn {
  width: 1.25rem;
  height: 1.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.25rem;
  color: #94a3b8;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}

.vpg-toggle-btn:hover {
  background: white;
  color: #475569;
  box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
}

.vpg-agg-select {
  font-size: 0.625rem;
  background: white;
  border: 1px solid #a7f3d0;
  border-radius: 0.25rem;
  padding: 0.125rem 0.25rem;
  color: #059669;
  font-weight: 500;
  min-width: 70px;
  cursor: pointer;
}

.vpg-agg-select:focus {
  outline: none;
  box-shadow: 0 0 0 1px #10b981;
}

.vpg-remove-btn {
  width: 1.25rem;
  height: 1.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  line-height: 1;
  color: #94a3b8;
  background: transparent;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.15s;
}

.vpg-remove-btn:hover {
  background: #fee2e2;
  color: #ef4444;
}

.vpg-unassigned-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.vpg-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0.5rem;
}

.vpg-field-search {
  position: relative;
  margin: 0 0.5rem 0.5rem;
}

.vpg-search-icon {
  position: absolute;
  left: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  width: 0.875rem;
  height: 0.875rem;
  color: #94a3b8;
  pointer-events: none;
}

.vpg-search-input {
  width: 100%;
  padding: 0.375rem 1.75rem 0.375rem 1.75rem;
  font-size: 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.375rem;
  background: white;
  color: #334155;
}

.vpg-search-input::placeholder {
  color: #94a3b8;
}

.vpg-search-input:focus {
  outline: none;
  box-shadow: 0 0 0 1px #6366f1;
  border-color: #6366f1;
}

.vpg-clear-search {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  padding: 0.125rem;
  border-radius: 0.25rem;
  color: #94a3b8;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}

.vpg-clear-search:hover {
  background: #f1f5f9;
  color: #475569;
}

.vpg-field-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 0.5rem 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.vpg-field-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  cursor: grab;
  background: white;
  border: 1px solid #e2e8f0;
  color: #475569;
  transition: all 0.15s;
}

.vpg-field-item:hover {
  border-color: #cbd5e1;
  background: #f8fafc;
  box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
}

.vpg-field-item:active {
  cursor: grabbing;
  transform: scale(0.98);
}

.vpg-field-item.vpg-is-numeric {
  border-color: #bfdbfe;
  background: rgba(239, 246, 255, 0.3);
}

.vpg-field-item.vpg-is-calculated {
  border-color: #e9d5ff;
  background: rgba(250, 232, 255, 0.5);
}

.vpg-calc-type {
  background: #f0abfc !important;
  color: #86198f !important;
}

.vpg-field-edit,
.vpg-field-delete {
  width: 1.125rem;
  height: 1.125rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  line-height: 1;
  color: #94a3b8;
  background: transparent;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.vpg-field-edit:hover {
  background: #e0e7ff;
  color: #4f46e5;
}

.vpg-field-delete:hover {
  background: #fee2e2;
  color: #ef4444;
}

.vpg-field-type-icon {
  width: 1.25rem;
  height: 1.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.625rem;
  font-weight: 700;
  background: #f1f5f9;
  border-radius: 0.25rem;
  color: #64748b;
  flex-shrink: 0;
}

.vpg-field-item.vpg-is-numeric .vpg-field-type-icon {
  background: #dbeafe;
  color: #2563eb;
}

.vpg-field-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.vpg-unique-count {
  font-size: 0.625rem;
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.vpg-empty-hint {
  font-size: 0.6875rem;
  color: #94a3b8;
  font-style: italic;
  text-align: center;
  padding: 1rem;
}

.vpg-options-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-top: 1px solid #f1f5f9;
  background: rgba(248, 250, 252, 0.5);
  flex-shrink: 0;
}

.vpg-option-toggle {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.6875rem;
  color: #64748b;
  cursor: pointer;
  user-select: none;
}

.vpg-option-toggle input {
  width: 0.875rem;
  height: 0.875rem;
  border-radius: 0.25rem;
  accent-color: #10b981;
  cursor: pointer;
}

.vpg-calc-btn {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.6875rem;
  font-weight: 500;
  border-radius: 0.25rem;
  background: #fdf4ff;
  color: #a855f7;
  border: 1px solid #e9d5ff;
  cursor: pointer;
  transition: all 0.15s;
}

.vpg-calc-btn:hover {
  background: #fae8ff;
  border-color: #d8b4fe;
}

.vpg-calc-icon {
  font-size: 0.75rem;
  font-weight: 700;
}

/* Scrollbar */
.vpg-field-list::-webkit-scrollbar {
  width: 0.375rem;
}

.vpg-field-list::-webkit-scrollbar-track {
  background: transparent;
}

.vpg-field-list::-webkit-scrollbar-thumb {
  background: #e2e8f0;
  border-radius: 9999px;
}

.vpg-field-list::-webkit-scrollbar-thumb:hover {
  background: #cbd5e1;
}

</style>

<style>
/* Dark mode - PivotConfig */
.vpg-theme-dark .vpg-pivot-config {
  background: #1e293b;
  border-color: #334155;
}

.vpg-theme-dark .vpg-config-header {
  background: #0f172a;
  border-color: #334155;
}

.vpg-theme-dark .vpg-config-title {
  color: #94a3b8;
}

.vpg-theme-dark .vpg-pivot-config .vpg-clear-btn {
  color: #64748b;
}

.vpg-theme-dark .vpg-pivot-config .vpg-clear-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.vpg-theme-dark .vpg-pivot-config .vpg-section-label {
  color: #64748b;
}

.vpg-theme-dark .vpg-pivot-config .vpg-section-label .vpg-count {
  color: #475569;
}

.vpg-theme-dark .vpg-assigned-section {
  border-color: #334155;
  background: linear-gradient(to bottom, #0f172a, #1e293b);
}

.vpg-theme-dark .vpg-assigned-item.vpg-type-row {
  background: rgba(99, 102, 241, 0.15);
  border-color: rgba(99, 102, 241, 0.3);
}

.vpg-theme-dark .vpg-assigned-item.vpg-type-column {
  background: rgba(139, 92, 246, 0.15);
  border-color: rgba(139, 92, 246, 0.3);
}

.vpg-theme-dark .vpg-assigned-item.vpg-type-value {
  background: rgba(16, 185, 129, 0.15);
  border-color: rgba(16, 185, 129, 0.3);
}

.vpg-theme-dark .vpg-assigned-item.vpg-type-calc {
  background: rgba(168, 85, 247, 0.15);
  border-color: rgba(168, 85, 247, 0.3);
}

.vpg-theme-dark .vpg-item-badge.row {
  background: rgba(99, 102, 241, 0.3);
  color: #a5b4fc;
}

.vpg-theme-dark .vpg-item-badge.column {
  background: rgba(139, 92, 246, 0.3);
  color: #c4b5fd;
}

.vpg-theme-dark .vpg-item-badge.value {
  background: rgba(16, 185, 129, 0.3);
  color: #6ee7b7;
}

.vpg-theme-dark .vpg-item-badge.calc {
  background: rgba(168, 85, 247, 0.3);
  color: #c4b5fd;
}

.vpg-theme-dark .vpg-pivot-config .vpg-item-name {
  color: #e2e8f0;
}

.vpg-theme-dark .vpg-pivot-config .vpg-toggle-btn {
  color: #64748b;
}

.vpg-theme-dark .vpg-pivot-config .vpg-toggle-btn:hover {
  background: #334155;
  color: #cbd5e1;
}

.vpg-theme-dark .vpg-pivot-config .vpg-agg-select {
  background: #0f172a;
  border-color: rgba(16, 185, 129, 0.3);
  color: #6ee7b7;
}

.vpg-theme-dark .vpg-pivot-config .vpg-agg-select:focus {
  box-shadow: 0 0 0 1px #10b981;
}

.vpg-theme-dark .vpg-pivot-config .vpg-remove-btn {
  color: #64748b;
}

.vpg-theme-dark .vpg-pivot-config .vpg-remove-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.vpg-theme-dark .vpg-pivot-config .vpg-search-input {
  background: #0f172a;
  border-color: #334155;
  color: #e2e8f0;
}

.vpg-theme-dark .vpg-pivot-config .vpg-search-input::placeholder {
  color: #64748b;
}

.vpg-theme-dark .vpg-pivot-config .vpg-search-input:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 1px #6366f1;
}

.vpg-theme-dark .vpg-pivot-config .vpg-search-icon {
  color: #64748b;
}

.vpg-theme-dark .vpg-pivot-config .vpg-clear-search:hover {
  background: #334155;
  color: #cbd5e1;
}

.vpg-theme-dark .vpg-pivot-config .vpg-field-item {
  background: #0f172a;
  border-color: #334155;
  color: #cbd5e1;
}

.vpg-theme-dark .vpg-pivot-config .vpg-field-item:hover {
  border-color: #475569;
  background: #1e293b;
}

.vpg-theme-dark .vpg-pivot-config .vpg-field-item.vpg-is-numeric {
  border-color: rgba(59, 130, 246, 0.3);
  background: rgba(59, 130, 246, 0.1);
}

.vpg-theme-dark .vpg-pivot-config .vpg-field-type-icon {
  background: #334155;
  color: #94a3b8;
}

.vpg-theme-dark .vpg-pivot-config .vpg-field-item.vpg-is-numeric .vpg-field-type-icon {
  background: rgba(59, 130, 246, 0.3);
  color: #60a5fa;
}

.vpg-theme-dark .vpg-pivot-config .vpg-field-item.vpg-is-calculated {
  border-color: rgba(168, 85, 247, 0.3);
  background: rgba(168, 85, 247, 0.1);
}

.vpg-theme-dark .vpg-calc-type {
  background: rgba(168, 85, 247, 0.4) !important;
  color: #c4b5fd !important;
}

.vpg-theme-dark .vpg-field-edit,
.vpg-theme-dark .vpg-field-delete {
  color: #64748b;
}

.vpg-theme-dark .vpg-field-edit:hover {
  background: rgba(99, 102, 241, 0.2);
  color: #a5b4fc;
}

.vpg-theme-dark .vpg-field-delete:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.vpg-theme-dark .vpg-pivot-config .vpg-unique-count {
  color: #64748b;
}

.vpg-theme-dark .vpg-pivot-config .vpg-empty-hint {
  color: #64748b;
}

.vpg-theme-dark .vpg-options-section {
  border-color: #334155;
  background: rgba(15, 23, 42, 0.5);
}

.vpg-theme-dark .vpg-pivot-config .vpg-option-toggle {
  color: #94a3b8;
}

.vpg-theme-dark .vpg-calc-btn {
  background: rgba(168, 85, 247, 0.15);
  color: #c084fc;
  border-color: rgba(168, 85, 247, 0.3);
}

.vpg-theme-dark .vpg-calc-btn:hover {
  background: rgba(168, 85, 247, 0.25);
  border-color: rgba(168, 85, 247, 0.5);
}

.vpg-theme-dark .vpg-pivot-config .vpg-field-list::-webkit-scrollbar-thumb {
  background: #334155;
}

.vpg-theme-dark .vpg-pivot-config .vpg-field-list::-webkit-scrollbar-thumb:hover {
  background: #475569;
}

</style>

