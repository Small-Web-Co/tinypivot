/**
 * Datasource Management Dialog
 *
 * Dialog component for managing data source connections.
 * Supports creating, editing, testing, and deleting datasources.
 */

import type { DatasourceInfo, OAuthSuccessData } from '@smallwebco/tinypivot-studio'
import { generateOAuthState, openOAuthPopup } from '@smallwebco/tinypivot-studio'
import { useCallback, useEffect, useState } from 'react'

export interface DatasourceDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Called when dialog should close */
  onClose: () => void
  /** API endpoint for datasource operations */
  apiEndpoint: string
  /** User ID for authentication */
  userId: string
  /** User's encryption key for credentials */
  userKey: string
  /** Called when a datasource is selected */
  onSelect?: (datasource: DatasourceInfo) => void
  /** Currently selected datasource ID */
  selectedDatasourceId?: string
  /** Snowflake OAuth base URL (for SSO) */
  snowflakeOAuthUrl?: string
}

interface DatasourceFormData {
  name: string
  type: 'postgres' | 'snowflake'
  description: string
  // Connection config
  host: string
  port: string
  database: string
  schema: string
  // Snowflake-specific
  account: string
  warehouse: string
  role: string
  // Credentials
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

type DialogView = 'list' | 'create' | 'edit'

export function DatasourceDialog({
  open,
  onClose,
  apiEndpoint,
  userId,
  userKey,
  onSelect,
  selectedDatasourceId,
  snowflakeOAuthUrl,
}: DatasourceDialogProps): React.ReactElement | null {
  const [view, setView] = useState<DialogView>('list')
  const [datasources, setDatasources] = useState<DatasourceInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { success: boolean, message: string }>>({})
  const [formData, setFormData] = useState<DatasourceFormData>(defaultFormData)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Load datasources when dialog opens
  useEffect(() => {
    if (open) {
      loadDatasources()
    }
  }, [open])

  const loadDatasources = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'list-datasources',
          userId,
        }),
      })
      const data = await response.json()
      if (data.error) {
        throw new Error(data.error)
      }
      setDatasources(data.datasources || [])
    }
    catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load datasources')
    }
    finally {
      setLoading(false)
    }
  }

  const handleTest = async (datasourceId: string) => {
    setTestingId(datasourceId)
    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test-datasource',
          datasourceId,
          userId,
          userKey,
        }),
      })
      const data = await response.json()
      if (data.status?.connected) {
        setTestResults(prev => ({
          ...prev,
          [datasourceId]: { success: true, message: 'Connection successful' },
        }))
      }
      else {
        setTestResults(prev => ({
          ...prev,
          [datasourceId]: { success: false, message: data.status?.error || 'Connection failed' },
        }))
      }
    }
    catch (err) {
      setTestResults(prev => ({
        ...prev,
        [datasourceId]: { success: false, message: err instanceof Error ? err.message : 'Test failed' },
      }))
    }
    finally {
      setTestingId(null)
    }
  }

  const handleDelete = async (datasourceId: string) => {
    if (!confirm('Are you sure you want to delete this datasource?')) {
      return
    }

    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete-datasource',
          datasourceId,
          userId,
        }),
      })
      const data = await response.json()
      if (data.error) {
        throw new Error(data.error)
      }
      await loadDatasources()
    }
    catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete datasource')
    }
  }

  const handleCreate = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create-datasource',
          userId,
          userKey,
          datasourceConfig: {
            name: formData.name,
            type: formData.type,
            description: formData.description || undefined,
            connectionConfig: formData.type === 'postgres'
              ? {
                  host: formData.host,
                  port: formData.port ? Number.parseInt(formData.port, 10) : 5432,
                  database: formData.database,
                  schema: formData.schema || 'public',
                }
              : {
                  account: formData.account,
                  warehouse: formData.warehouse || undefined,
                  database: formData.database || undefined,
                  schema: formData.schema || undefined,
                  role: formData.role || undefined,
                },
            credentials: {
              username: formData.username,
              password: formData.password,
            },
          },
        }),
      })
      const data = await response.json()
      if (data.error) {
        throw new Error(data.error)
      }
      setFormData(defaultFormData)
      setView('list')
      await loadDatasources()
    }
    catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create datasource')
    }
    finally {
      setLoading(false)
    }
  }

  const handleUpdate = async () => {
    if (!editingId) {
      return
    }

    setLoading(true)
    setError(null)
    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update-datasource',
          datasourceId: editingId,
          userId,
          userKey,
          datasourceConfig: {
            name: formData.name,
            type: formData.type,
            description: formData.description || undefined,
            connectionConfig: formData.type === 'postgres'
              ? {
                  host: formData.host,
                  port: formData.port ? Number.parseInt(formData.port, 10) : 5432,
                  database: formData.database,
                  schema: formData.schema || 'public',
                }
              : {
                  account: formData.account,
                  warehouse: formData.warehouse || undefined,
                  database: formData.database || undefined,
                  schema: formData.schema || undefined,
                  role: formData.role || undefined,
                },
            credentials: {
              username: formData.username,
              password: formData.password || undefined,
            },
          },
        }),
      })
      const data = await response.json()
      if (data.error) {
        throw new Error(data.error)
      }
      setFormData(defaultFormData)
      setEditingId(null)
      setView('list')
      await loadDatasources()
    }
    catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update datasource')
    }
    finally {
      setLoading(false)
    }
  }

  const handleEdit = (datasource: DatasourceInfo) => {
    setEditingId(datasource.id)
    setFormData({
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
      username: '', // Don't prefill credentials
      password: '',
    })
    setView('edit')
  }

  const handleSnowflakeSSO = useCallback(() => {
    if (!snowflakeOAuthUrl) {
      setError('Snowflake OAuth is not configured')
      return
    }

    const state = generateOAuthState()

    openOAuthPopup({
      url: `${snowflakeOAuthUrl}?state=${state}`,
      onSuccess: (_data: OAuthSuccessData) => {
        // Refresh datasource list
        loadDatasources()
        setView('list')
      },
      onError: (errorMessage: string) => {
        setError(`Snowflake SSO failed: ${errorMessage}`)
      },
    })
  }, [snowflakeOAuthUrl])

  const handleFormChange = (field: keyof DatasourceFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  if (!open) {
    return null
  }

  return (
    <div className="tps-dialog-overlay" onClick={onClose}>
      <div className="tps-dialog" onClick={e => e.stopPropagation()}>
        <div className="tps-dialog-header">
          <h2 className="tps-dialog-title">
            {view === 'list' && 'Data Sources'}
            {view === 'create' && 'Add Data Source'}
            {view === 'edit' && 'Edit Data Source'}
          </h2>
          <button className="tps-dialog-close" onClick={onClose} type="button">
            &times;
          </button>
        </div>

        <div className="tps-dialog-content">
          {error && (
            <div className="tps-error-message">
              {error}
              <button onClick={() => setError(null)} type="button">&times;</button>
            </div>
          )}

          {view === 'list' && (
            <>
              <div className="tps-dialog-actions">
                <button
                  className="tps-button tps-button-primary"
                  onClick={() => {
                    setFormData(defaultFormData)
                    setView('create')
                  }}
                  type="button"
                >
                  + Add Connection
                </button>
                {snowflakeOAuthUrl && (
                  <button
                    className="tps-button tps-button-secondary"
                    onClick={handleSnowflakeSSO}
                    type="button"
                  >
                    Connect with Snowflake SSO
                  </button>
                )}
              </div>

              {loading
                ? (
                    <div className="tps-loading">Loading...</div>
                  )
                : datasources.length === 0
                  ? (
                      <div className="tps-empty-state">
                        <p>No data sources configured.</p>
                        <p>Add a connection to get started.</p>
                      </div>
                    )
                  : (
                      <div className="tps-datasource-list">
                        {datasources.map(ds => (
                          <div
                            key={ds.id}
                            className={`tps-datasource-item ${selectedDatasourceId === ds.id ? 'tps-selected' : ''}`}
                          >
                            <div className="tps-datasource-info" onClick={() => onSelect?.(ds)}>
                              <div className="tps-datasource-name">
                                <span className={`tps-datasource-type tps-type-${ds.type}`}>
                                  {ds.type === 'postgres' ? 'PG' : 'SF'}
                                </span>
                                {ds.name}
                                {ds.tier === 'org' && (
                                  <span className="tps-badge tps-badge-org">Org</span>
                                )}
                              </div>
                              {ds.description && (
                                <div className="tps-datasource-desc">{ds.description}</div>
                              )}
                              {testResults[ds.id] && (
                                <div className={`tps-test-result ${testResults[ds.id]?.success ? 'tps-success' : 'tps-error'}`}>
                                  {testResults[ds.id]?.message}
                                </div>
                              )}
                            </div>
                            <div className="tps-datasource-actions">
                              <button
                                className="tps-button tps-button-sm"
                                onClick={() => handleTest(ds.id)}
                                disabled={testingId === ds.id}
                                type="button"
                              >
                                {testingId === ds.id ? 'Testing...' : 'Test'}
                              </button>
                              {ds.tier !== 'org' && (
                                <>
                                  <button
                                    className="tps-button tps-button-sm"
                                    onClick={() => handleEdit(ds)}
                                    type="button"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    className="tps-button tps-button-sm tps-button-danger"
                                    onClick={() => handleDelete(ds.id)}
                                    type="button"
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
            </>
          )}

          {(view === 'create' || view === 'edit') && (
            <form
              className="tps-datasource-form"
              onSubmit={(e) => {
                e.preventDefault()
                view === 'create' ? handleCreate() : handleUpdate()
              }}
            >
              <div className="tps-form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => handleFormChange('name', e.target.value)}
                  placeholder="My Database"
                  required
                />
              </div>

              <div className="tps-form-group">
                <label>Type</label>
                <select
                  value={formData.type}
                  onChange={e => handleFormChange('type', e.target.value)}
                  disabled={view === 'edit'}
                >
                  <option value="postgres">PostgreSQL</option>
                  <option value="snowflake">Snowflake</option>
                </select>
              </div>

              <div className="tps-form-group">
                <label>Description (optional)</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={e => handleFormChange('description', e.target.value)}
                  placeholder="Analytics database"
                />
              </div>

              {formData.type === 'postgres'
                ? (
                    <>
                      <div className="tps-form-row">
                        <div className="tps-form-group tps-flex-grow">
                          <label>Host</label>
                          <input
                            type="text"
                            value={formData.host}
                            onChange={e => handleFormChange('host', e.target.value)}
                            placeholder="localhost"
                            required
                          />
                        </div>
                        <div className="tps-form-group tps-w-24">
                          <label>Port</label>
                          <input
                            type="text"
                            value={formData.port}
                            onChange={e => handleFormChange('port', e.target.value)}
                            placeholder="5432"
                          />
                        </div>
                      </div>

                      <div className="tps-form-row">
                        <div className="tps-form-group">
                          <label>Database</label>
                          <input
                            type="text"
                            value={formData.database}
                            onChange={e => handleFormChange('database', e.target.value)}
                            placeholder="postgres"
                            required
                          />
                        </div>
                        <div className="tps-form-group">
                          <label>Schema</label>
                          <input
                            type="text"
                            value={formData.schema}
                            onChange={e => handleFormChange('schema', e.target.value)}
                            placeholder="public"
                          />
                        </div>
                      </div>
                    </>
                  )
                : (
                    <>
                      <div className="tps-form-group">
                        <label>Account</label>
                        <input
                          type="text"
                          value={formData.account}
                          onChange={e => handleFormChange('account', e.target.value)}
                          placeholder="xy12345.us-east-1"
                          required
                        />
                      </div>

                      <div className="tps-form-row">
                        <div className="tps-form-group">
                          <label>Warehouse</label>
                          <input
                            type="text"
                            value={formData.warehouse}
                            onChange={e => handleFormChange('warehouse', e.target.value)}
                            placeholder="COMPUTE_WH"
                          />
                        </div>
                        <div className="tps-form-group">
                          <label>Role</label>
                          <input
                            type="text"
                            value={formData.role}
                            onChange={e => handleFormChange('role', e.target.value)}
                            placeholder="ACCOUNTADMIN"
                          />
                        </div>
                      </div>

                      <div className="tps-form-row">
                        <div className="tps-form-group">
                          <label>Database</label>
                          <input
                            type="text"
                            value={formData.database}
                            onChange={e => handleFormChange('database', e.target.value)}
                            placeholder="ANALYTICS"
                          />
                        </div>
                        <div className="tps-form-group">
                          <label>Schema</label>
                          <input
                            type="text"
                            value={formData.schema}
                            onChange={e => handleFormChange('schema', e.target.value)}
                            placeholder="PUBLIC"
                          />
                        </div>
                      </div>
                    </>
                  )}

              <div className="tps-form-section">
                <h4>Credentials</h4>
                <div className="tps-form-row">
                  <div className="tps-form-group">
                    <label>Username</label>
                    <input
                      type="text"
                      value={formData.username}
                      onChange={e => handleFormChange('username', e.target.value)}
                      placeholder="db_user"
                      required={view === 'create'}
                    />
                  </div>
                  <div className="tps-form-group">
                    <label>Password</label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={e => handleFormChange('password', e.target.value)}
                      placeholder={view === 'edit' ? '(unchanged)' : 'password'}
                      required={view === 'create'}
                    />
                  </div>
                </div>
              </div>

              <div className="tps-form-actions">
                <button
                  type="button"
                  className="tps-button tps-button-secondary"
                  onClick={() => {
                    setView('list')
                    setEditingId(null)
                    setFormData(defaultFormData)
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="tps-button tps-button-primary"
                  disabled={loading}
                >
                  {loading ? 'Saving...' : (view === 'create' ? 'Create' : 'Save')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
