<script setup lang="ts">
/**
 * Datasource Management Dialog
 *
 * Dialog component for managing data source connections.
 * Supports creating, editing, testing, and deleting datasources.
 */

import type { DatasourceInfo, OAuthSuccessData } from '@smallwebco/tinypivot-studio'
import { generateOAuthState, openOAuthPopup } from '@smallwebco/tinypivot-studio'
import { computed, ref, watch } from 'vue'

interface Props {
  /** Whether the dialog is open */
  open: boolean
  /** API endpoint for datasource operations */
  apiEndpoint: string
  /** User ID for authentication */
  userId: string
  /** User's encryption key for credentials */
  userKey: string
  /** Currently selected datasource ID */
  selectedDatasourceId?: string
  /** Snowflake OAuth base URL (for SSO) */
  snowflakeOAuthUrl?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  /** Called when dialog should close */
  close: []
  /** Called when a datasource is selected */
  select: [datasource: DatasourceInfo]
}>()

type DialogView = 'list' | 'create' | 'edit'

interface DatasourceFormData {
  name: string
  type: 'postgres' | 'snowflake'
  description: string
  host: string
  port: string
  database: string
  schema: string
  account: string
  warehouse: string
  role: string
  username: string
  password: string
}

const defaultFormData: DatasourceFormData = {
  name: '',
  type: 'postgres',
  description: '',
  host: '',
  port: '5432',
  database: '',
  schema: 'public',
  account: '',
  warehouse: '',
  role: '',
  username: '',
  password: '',
}

const view = ref<DialogView>('list')
const datasources = ref<DatasourceInfo[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const testingId = ref<string | null>(null)
const testResults = ref<Record<string, { success: boolean, message: string }>>({})
const formData = ref<DatasourceFormData>({ ...defaultFormData })
const editingId = ref<string | null>(null)

// Load datasources when dialog opens
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    loadDatasources()
  }
})

async function loadDatasources() {
  loading.value = true
  error.value = null
  try {
    const response = await fetch(props.apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'list-datasources',
        userId: props.userId,
      }),
    })
    const data = await response.json()
    if (data.error) {
      throw new Error(data.error)
    }
    datasources.value = data.datasources || []
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load datasources'
  }
  finally {
    loading.value = false
  }
}

async function handleTest(datasourceId: string) {
  testingId.value = datasourceId
  try {
    const response = await fetch(props.apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'test-datasource',
        datasourceId,
        userId: props.userId,
        userKey: props.userKey,
      }),
    })
    const data = await response.json()
    if (data.status?.connected) {
      testResults.value[datasourceId] = { success: true, message: 'Connection successful' }
    }
    else {
      testResults.value[datasourceId] = { success: false, message: data.status?.error || 'Connection failed' }
    }
  }
  catch (err) {
    testResults.value[datasourceId] = { success: false, message: err instanceof Error ? err.message : 'Test failed' }
  }
  finally {
    testingId.value = null
  }
}

async function handleDelete(datasourceId: string) {
  if (!confirm('Are you sure you want to delete this datasource?')) {
    return
  }

  try {
    const response = await fetch(props.apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'delete-datasource',
        datasourceId,
        userId: props.userId,
      }),
    })
    const data = await response.json()
    if (data.error) {
      throw new Error(data.error)
    }
    await loadDatasources()
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to delete datasource'
  }
}

async function handleCreate() {
  loading.value = true
  error.value = null
  try {
    const response = await fetch(props.apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create-datasource',
        userId: props.userId,
        userKey: props.userKey,
        datasourceConfig: {
          name: formData.value.name,
          type: formData.value.type,
          description: formData.value.description || undefined,
          connectionConfig: formData.value.type === 'postgres'
            ? {
                host: formData.value.host,
                port: formData.value.port ? Number.parseInt(formData.value.port, 10) : 5432,
                database: formData.value.database,
                schema: formData.value.schema || 'public',
              }
            : {
                account: formData.value.account,
                warehouse: formData.value.warehouse || undefined,
                database: formData.value.database || undefined,
                schema: formData.value.schema || undefined,
                role: formData.value.role || undefined,
              },
          credentials: {
            username: formData.value.username,
            password: formData.value.password,
          },
        },
      }),
    })
    const data = await response.json()
    if (data.error) {
      throw new Error(data.error)
    }
    formData.value = { ...defaultFormData }
    view.value = 'list'
    await loadDatasources()
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to create datasource'
  }
  finally {
    loading.value = false
  }
}

async function handleUpdate() {
  if (!editingId.value) {
    return
  }

  loading.value = true
  error.value = null
  try {
    const response = await fetch(props.apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update-datasource',
        datasourceId: editingId.value,
        userId: props.userId,
        userKey: props.userKey,
        datasourceConfig: {
          name: formData.value.name,
          type: formData.value.type,
          description: formData.value.description || undefined,
          connectionConfig: formData.value.type === 'postgres'
            ? {
                host: formData.value.host,
                port: formData.value.port ? Number.parseInt(formData.value.port, 10) : 5432,
                database: formData.value.database,
                schema: formData.value.schema || 'public',
              }
            : {
                account: formData.value.account,
                warehouse: formData.value.warehouse || undefined,
                database: formData.value.database || undefined,
                schema: formData.value.schema || undefined,
                role: formData.value.role || undefined,
              },
          credentials: {
            username: formData.value.username,
            password: formData.value.password || undefined,
          },
        },
      }),
    })
    const data = await response.json()
    if (data.error) {
      throw new Error(data.error)
    }
    formData.value = { ...defaultFormData }
    editingId.value = null
    view.value = 'list'
    await loadDatasources()
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to update datasource'
  }
  finally {
    loading.value = false
  }
}

function handleEdit(datasource: DatasourceInfo) {
  editingId.value = datasource.id
  formData.value = {
    name: datasource.name,
    type: datasource.type as 'postgres' | 'snowflake',
    description: datasource.description || '',
    host: datasource.connectionConfig?.host || '',
    port: String(datasource.connectionConfig?.port || 5432),
    database: datasource.connectionConfig?.database || '',
    schema: datasource.connectionConfig?.schema || 'public',
    account: datasource.connectionConfig?.account || '',
    warehouse: datasource.connectionConfig?.warehouse || '',
    role: datasource.connectionConfig?.role || '',
    username: '',
    password: '',
  }
  view.value = 'edit'
}

function handleSnowflakeSSO() {
  if (!props.snowflakeOAuthUrl) {
    error.value = 'Snowflake OAuth is not configured'
    return
  }

  const state = generateOAuthState()

  openOAuthPopup({
    url: `${props.snowflakeOAuthUrl}?state=${state}`,
    onSuccess: (_data: OAuthSuccessData) => {
      loadDatasources()
      view.value = 'list'
    },
    onError: (errorMessage: string) => {
      error.value = `Snowflake SSO failed: ${errorMessage}`
    },
  })
}

function handleSelect(datasource: DatasourceInfo) {
  emit('select', datasource)
}

function handleClose() {
  emit('close')
}

function startCreate() {
  formData.value = { ...defaultFormData }
  view.value = 'create'
}

function cancelForm() {
  view.value = 'list'
  editingId.value = null
  formData.value = { ...defaultFormData }
}

const dialogTitle = computed(() => {
  if (view.value === 'list')
    return 'Data Sources'
  if (view.value === 'create')
    return 'Add Data Source'
  return 'Edit Data Source'
})
</script>

<template>
  <div v-if="open" class="tps-dialog-overlay" @click="handleClose">
    <div class="tps-dialog" @click.stop>
      <div class="tps-dialog-header">
        <h2 class="tps-dialog-title">
          {{ dialogTitle }}
        </h2>
        <button class="tps-dialog-close" type="button" @click="handleClose">
          &times;
        </button>
      </div>

      <div class="tps-dialog-content">
        <div v-if="error" class="tps-error-message">
          {{ error }}
          <button type="button" @click="error = null">
            &times;
          </button>
        </div>

        <!-- List View -->
        <template v-if="view === 'list'">
          <div class="tps-dialog-actions">
            <button
              class="tps-button tps-button-primary"
              type="button"
              @click="startCreate"
            >
              + Add Connection
            </button>
            <button
              v-if="snowflakeOAuthUrl"
              class="tps-button tps-button-secondary"
              type="button"
              @click="handleSnowflakeSSO"
            >
              Connect with Snowflake SSO
            </button>
          </div>

          <div v-if="loading" class="tps-loading">
            Loading...
          </div>
          <div v-else-if="datasources.length === 0" class="tps-empty-state">
            <p>No data sources configured.</p>
            <p>Add a connection to get started.</p>
          </div>
          <div v-else class="tps-datasource-list">
            <div
              v-for="ds in datasources"
              :key="ds.id"
              class="tps-datasource-item" :class="[{ 'tps-selected': selectedDatasourceId === ds.id }]"
            >
              <div class="tps-datasource-info" @click="handleSelect(ds)">
                <div class="tps-datasource-name">
                  <span :class="`tps-datasource-type tps-type-${ds.type}`">
                    {{ ds.type === 'postgres' ? 'PG' : 'SF' }}
                  </span>
                  {{ ds.name }}
                  <span v-if="ds.tier === 'org'" class="tps-badge tps-badge-org">Org</span>
                </div>
                <div v-if="ds.description" class="tps-datasource-desc">
                  {{ ds.description }}
                </div>
                <div
                  v-if="testResults[ds.id]"
                  class="tps-test-result" :class="[testResults[ds.id]?.success ? 'tps-success' : 'tps-error']"
                >
                  {{ testResults[ds.id]?.message }}
                </div>
              </div>
              <div class="tps-datasource-actions">
                <button
                  class="tps-button tps-button-sm"
                  :disabled="testingId === ds.id"
                  type="button"
                  @click="handleTest(ds.id)"
                >
                  {{ testingId === ds.id ? 'Testing...' : 'Test' }}
                </button>
                <template v-if="ds.tier !== 'org'">
                  <button
                    class="tps-button tps-button-sm"
                    type="button"
                    @click="handleEdit(ds)"
                  >
                    Edit
                  </button>
                  <button
                    class="tps-button tps-button-sm tps-button-danger"
                    type="button"
                    @click="handleDelete(ds.id)"
                  >
                    Delete
                  </button>
                </template>
              </div>
            </div>
          </div>
        </template>

        <!-- Create/Edit Form -->
        <template v-if="view === 'create' || view === 'edit'">
          <form
            class="tps-datasource-form"
            @submit.prevent="view === 'create' ? handleCreate() : handleUpdate()"
          >
            <div class="tps-form-group">
              <label>Name</label>
              <input
                v-model="formData.name"
                type="text"
                placeholder="My Database"
                required
              >
            </div>

            <div class="tps-form-group">
              <label>Type</label>
              <select
                v-model="formData.type"
                :disabled="view === 'edit'"
              >
                <option value="postgres">
                  PostgreSQL
                </option>
                <option value="snowflake">
                  Snowflake
                </option>
              </select>
            </div>

            <div class="tps-form-group">
              <label>Description (optional)</label>
              <input
                v-model="formData.description"
                type="text"
                placeholder="Analytics database"
              >
            </div>

            <!-- PostgreSQL fields -->
            <template v-if="formData.type === 'postgres'">
              <div class="tps-form-row">
                <div class="tps-form-group tps-flex-grow">
                  <label>Host</label>
                  <input
                    v-model="formData.host"
                    type="text"
                    placeholder="localhost"
                    required
                  >
                </div>
                <div class="tps-form-group tps-w-24">
                  <label>Port</label>
                  <input
                    v-model="formData.port"
                    type="text"
                    placeholder="5432"
                  >
                </div>
              </div>

              <div class="tps-form-row">
                <div class="tps-form-group">
                  <label>Database</label>
                  <input
                    v-model="formData.database"
                    type="text"
                    placeholder="postgres"
                    required
                  >
                </div>
                <div class="tps-form-group">
                  <label>Schema</label>
                  <input
                    v-model="formData.schema"
                    type="text"
                    placeholder="public"
                  >
                </div>
              </div>
            </template>

            <!-- Snowflake fields -->
            <template v-else>
              <div class="tps-form-group">
                <label>Account</label>
                <input
                  v-model="formData.account"
                  type="text"
                  placeholder="xy12345.us-east-1"
                  required
                >
              </div>

              <div class="tps-form-row">
                <div class="tps-form-group">
                  <label>Warehouse</label>
                  <input
                    v-model="formData.warehouse"
                    type="text"
                    placeholder="COMPUTE_WH"
                  >
                </div>
                <div class="tps-form-group">
                  <label>Role</label>
                  <input
                    v-model="formData.role"
                    type="text"
                    placeholder="ACCOUNTADMIN"
                  >
                </div>
              </div>

              <div class="tps-form-row">
                <div class="tps-form-group">
                  <label>Database</label>
                  <input
                    v-model="formData.database"
                    type="text"
                    placeholder="ANALYTICS"
                  >
                </div>
                <div class="tps-form-group">
                  <label>Schema</label>
                  <input
                    v-model="formData.schema"
                    type="text"
                    placeholder="PUBLIC"
                  >
                </div>
              </div>
            </template>

            <div class="tps-form-section">
              <h4>Credentials</h4>
              <div class="tps-form-row">
                <div class="tps-form-group">
                  <label>Username</label>
                  <input
                    v-model="formData.username"
                    type="text"
                    placeholder="db_user"
                    :required="view === 'create'"
                  >
                </div>
                <div class="tps-form-group">
                  <label>Password</label>
                  <input
                    v-model="formData.password"
                    type="password"
                    :placeholder="view === 'edit' ? '(unchanged)' : 'password'"
                    :required="view === 'create'"
                  >
                </div>
              </div>
            </div>

            <div class="tps-form-actions">
              <button
                type="button"
                class="tps-button tps-button-secondary"
                @click="cancelForm"
              >
                Cancel
              </button>
              <button
                type="submit"
                class="tps-button tps-button-primary"
                :disabled="loading"
              >
                {{ loading ? 'Saving...' : (view === 'create' ? 'Create' : 'Save') }}
              </button>
            </div>
          </form>
        </template>
      </div>
    </div>
  </div>
</template>
