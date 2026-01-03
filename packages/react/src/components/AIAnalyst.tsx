/**
 * TinyPivot React - AI Data Analyst Component
 * Split-panel layout: 1/4 chat, 3/4 data preview
 * Each query step shows data visually with expandable SQL
 */
import type {
  AIAnalystConfig,
  AIConversationUpdateEvent,
  AIDataLoadedEvent,
  AIErrorEvent,
  AIMessage,
  AIQueryExecutedEvent,
  AITableSchema,
} from '@smallwebco/tinypivot-core'
import { stripSQLFromContent } from '@smallwebco/tinypivot-core'
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useAIAnalyst } from '../hooks/useAIAnalyst'

interface AIAnalystProps {
  config: AIAnalystConfig
  theme?: 'light' | 'dark'
  onDataLoaded?: (payload: AIDataLoadedEvent) => void
  onConversationUpdate?: (payload: AIConversationUpdateEvent) => void
  onQueryExecuted?: (payload: AIQueryExecutedEvent) => void
  onError?: (payload: AIErrorEvent) => void
  onViewResults?: (payload: { data: Record<string, unknown>[], query: string }) => void
}

export interface AIAnalystHandle {
  loadFullData: () => Promise<Record<string, unknown>[] | null>
  selectedDataSource: string | undefined
}

export const AIAnalyst = forwardRef<AIAnalystHandle, AIAnalystProps>(({
  config,
  theme = 'light',
  onDataLoaded,
  onConversationUpdate,
  onQueryExecuted,
  onError,
  onViewResults,
}, ref) => {
  const {
    messages,
    hasMessages,
    isLoading,
    isLoadingTables,
    schemas,
    selectedDataSource,
    selectedDataSourceInfo,
    lastLoadedData,
    dataSources,
    selectDataSource,
    sendMessage,
    clearConversation,
    loadFullData,
  } = useAIAnalyst({
    config,
    onDataLoaded,
    onConversationUpdate,
    onQueryExecuted,
    onError,
  })

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    loadFullData,
    selectedDataSource,
  }), [loadFullData, selectedDataSource])

  const [inputText, setInputText] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const [showSqlPanel, setShowSqlPanel] = useState(false)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Filter data sources by search
  const filteredDataSources = useMemo(() => {
    if (!searchQuery.trim())
      return dataSources
    const q = searchQuery.toLowerCase()
    return dataSources.filter((ds: { name: string, description?: string, table: string }) =>
      ds.name.toLowerCase().includes(q)
      || ds.description?.toLowerCase().includes(q)
      || ds.table.toLowerCase().includes(q),
    )
  }, [dataSources, searchQuery])

  // Get schema for selected data source
  const currentSchema: AITableSchema | undefined = useMemo(() => {
    if (!selectedDataSource)
      return undefined
    return schemas.get(selectedDataSource)
  }, [selectedDataSource, schemas])

  // Get data for the selected message (or latest)
  const previewData = useMemo(() => {
    if (selectedMessageId) {
      const msg = messages.find((m: AIMessage) => m.id === selectedMessageId)
      if (msg?.metadata?.data) {
        return msg.metadata.data.slice(0, 100)
      }
    }
    if (!lastLoadedData)
      return []
    return lastLoadedData.slice(0, 100)
  }, [selectedMessageId, messages, lastLoadedData])

  // Get full data for the selected message
  const fullPreviewData = useMemo(() => {
    if (selectedMessageId) {
      const msg = messages.find((m: AIMessage) => m.id === selectedMessageId)
      if (msg?.metadata?.data) {
        return msg.metadata.data
      }
    }
    return lastLoadedData || []
  }, [selectedMessageId, messages, lastLoadedData])

  // Get column keys from preview data
  const previewColumns = useMemo(() => {
    if (previewData.length > 0) {
      return Object.keys(previewData[0])
    }
    if (currentSchema) {
      return currentSchema.columns.map((c: { name: string }) => c.name)
    }
    return []
  }, [previewData, currentSchema])

  // Get the selected message's query
  const selectedQuery = useMemo(() => {
    if (selectedMessageId) {
      const msg = messages.find((m: AIMessage) => m.id === selectedMessageId)
      return msg?.metadata?.query || ''
    }
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].metadata?.data) {
        return messages[i].metadata?.query || ''
      }
    }
    return ''
  }, [selectedMessageId, messages])

  // Scroll to bottom when messages change and auto-select latest with data
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
    const latestWithData = [...messages].reverse().find((m: AIMessage) => m.metadata?.data)
    if (latestWithData) {
      setSelectedMessageId(latestWithData.id)
    }
  }, [messages])

  // Auto-resize textarea
  const autoResizeTextarea = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }, [])

  useEffect(() => {
    autoResizeTextarea()
  }, [inputText, autoResizeTextarea])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    if (!inputText.trim() || isLoading)
      return
    sendMessage(inputText)
    setInputText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [inputText, isLoading, sendMessage])

  const handleKeydown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!inputText.trim() || isLoading)
        return
      sendMessage(inputText)
      setInputText('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }
  }, [inputText, isLoading, sendMessage])

  const handleViewResults = useCallback(() => {
    if (fullPreviewData.length > 0) {
      onViewResults?.({ data: fullPreviewData, query: selectedQuery })
    }
  }, [fullPreviewData, selectedQuery, onViewResults])

  const selectMessage = useCallback((messageId: string) => {
    const msg = messages.find((m: AIMessage) => m.id === messageId)
    if (msg?.metadata?.data) {
      setSelectedMessageId(messageId)
    }
  }, [messages])

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text)
  }, [])

  const handleClearConversation = useCallback(() => {
    clearConversation()
    setSearchQuery('')
    setSelectedMessageId(null)
    setShowSqlPanel(false)
  }, [clearConversation])

  const handleChangeDataSource = useCallback(() => {
    clearConversation()
    setSearchQuery('')
    setSelectedMessageId(null)
    setShowSqlPanel(false)
  }, [clearConversation])

  const toggleSqlPanel = useCallback(() => {
    setShowSqlPanel(prev => !prev)
  }, [])

  const getColumnTypeIcon = (type: string): string => {
    const t = type.toLowerCase()
    if (t.includes('int') || t.includes('float') || t.includes('decimal') || t.includes('number'))
      return '#'
    if (t.includes('date') || t.includes('time'))
      return 'D'
    if (t.includes('bool'))
      return '?'
    return 'T'
  }

  const formatCellValue = (value: unknown): string => {
    if (value === null || value === undefined)
      return ''
    if (typeof value === 'number') {
      if (Math.abs(value) >= 1000) {
        return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
      }
      return String(value)
    }
    return String(value)
  }

  const getMessageContent = (message: AIMessage): string => {
    // Strip SQL blocks and clean up markdown formatting
    return stripSQLFromContent(message.content)
      .replace(/\*\*/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .trim()
  }

  const hasQueryResult = (message: AIMessage): boolean => {
    return !!message.metadata?.data && message.metadata.data.length > 0
  }

  // Render data source picker (full screen)
  if (!selectedDataSource) {
    return (
      <div className={`vpg-ai-analyst ${theme === 'dark' ? 'vpg-theme-dark' : ''}`}>
        <div className="vpg-ai-picker-fullscreen">
          <div className="vpg-ai-picker-content">
            <div className="vpg-ai-picker-header">
              <div className="vpg-ai-icon-lg">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
                  <circle cx="7.5" cy="14.5" r="1.5" fill="currentColor" />
                  <circle cx="16.5" cy="14.5" r="1.5" fill="currentColor" />
                </svg>
              </div>
              <h2>AI Data Analyst</h2>
              <p>Select a data source to start exploring with AI</p>
            </div>

            {dataSources.length === 0 && !isLoadingTables ? (
              <div className="vpg-ai-empty-state">
                <p>No data sources configured.</p>
                <a
                  href="https://tinypivot.com/docs/ai-analyst"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="vpg-ai-docs-link"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  View Documentation
                </a>
              </div>
            ) : (
              <>
                <div className="vpg-ai-search">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search data sources..."
                    className="vpg-ai-search-input"
                  />
                </div>
                <div className="vpg-ai-datasource-grid">
                  {filteredDataSources.map((ds: { id: string, name: string, description?: string }) => (
                    <button
                      key={ds.id}
                      className="vpg-ai-datasource-card"
                      onClick={() => selectDataSource(ds.id)}
                    >
                      <div className="vpg-ai-datasource-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <ellipse cx="12" cy="5" rx="9" ry="3" />
                          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                        </svg>
                      </div>
                      <div className="vpg-ai-datasource-info">
                        <span className="vpg-ai-datasource-name">{ds.name}</span>
                        {ds.description && (
                          <span className="vpg-ai-datasource-desc">{ds.description}</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
                {filteredDataSources.length === 0 && (
                  <div className="vpg-ai-no-results">
                    No data sources match "
                    {searchQuery}
                    "
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Render split layout
  return (
    <div className={`vpg-ai-analyst ${theme === 'dark' ? 'vpg-theme-dark' : ''}`}>
      <div className="vpg-ai-split-layout">
        {/* Left Panel: Chat */}
        <div className="vpg-ai-chat-panel">
          {/* Chat Header */}
          <div className="vpg-ai-chat-header">
            <button
              className="vpg-ai-back-btn"
              title="Change data source"
              onClick={handleChangeDataSource}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div className="vpg-ai-chat-title">
              <span className="vpg-ai-chat-name">{selectedDataSourceInfo?.name}</span>
            </div>
            {hasMessages && (
              <button
                className="vpg-ai-clear-btn"
                title="Clear conversation"
                onClick={handleClearConversation}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            )}
          </div>

          {/* Messages */}
          <div ref={messagesContainerRef} className="vpg-ai-messages">
            {/* Welcome message */}
            {!hasMessages && (
              <div className="vpg-ai-welcome">
                <p>Ask questions about your data</p>
                <div className="vpg-ai-suggestions">
                  <button onClick={() => sendMessage('Show me a summary of the data')}>
                    Summary
                  </button>
                  <button onClick={() => sendMessage('Show me the top 10 records')}>
                    Top 10
                  </button>
                  <button onClick={() => sendMessage('What are the trends?')}>
                    Trends
                  </button>
                </div>
              </div>
            )}

            {/* Message list */}
            {messages.map((message: AIMessage) => {
              if (message.role === 'user') {
                return (
                  <div key={message.id} className="vpg-ai-msg vpg-ai-msg-user">
                    <span>{message.content}</span>
                  </div>
                )
              }

              if (hasQueryResult(message)) {
                return (
                  <div
                    key={message.id}
                    className={`vpg-ai-msg vpg-ai-msg-result ${selectedMessageId === message.id ? 'vpg-ai-msg-selected' : ''}`}
                    onClick={() => selectMessage(message.id)}
                  >
                    {/* Header with result badge and SQL toggle */}
                    <div className="vpg-ai-result-header">
                      <div className="vpg-ai-result-badge">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                          <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                        <span>
                          {message.metadata?.rowCount?.toLocaleString()}
                          {' '}
                          rows
                        </span>
                      </div>
                      {/* SQL toggle button - toggles right pane SQL panel */}
                      {message.metadata?.query && (
                        <button
                          className={`vpg-ai-sql-toggle ${showSqlPanel && selectedMessageId === message.id ? 'vpg-ai-sql-expanded' : ''}`}
                          title="View SQL query"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleSqlPanel()
                          }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="16 18 22 12 16 6" />
                            <polyline points="8 6 2 12 8 18" />
                          </svg>
                          <span>SQL</span>
                        </button>
                      )}
                    </div>
                    {/* Full message content (insight from AI) */}
                    <div className="vpg-ai-result-content">
                      {getMessageContent(message)}
                    </div>
                  </div>
                )
              }

              // Regular assistant message
              return (
                <div key={message.id} className="vpg-ai-msg vpg-ai-msg-assistant">
                  <div className="vpg-ai-assistant-content">{getMessageContent(message)}</div>
                  {message.metadata?.error && (
                    <div className="vpg-ai-msg-error">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      Error
                    </div>
                  )}
                </div>
              )
            })}

            {/* Loading indicator */}
            {isLoading && (
              <div className="vpg-ai-msg vpg-ai-msg-loading">
                <div className="vpg-ai-typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="vpg-ai-input-area">
            <form className="vpg-ai-input-form" onSubmit={handleSubmit}>
              <textarea
                ref={textareaRef}
                className="vpg-ai-input"
                placeholder="Ask about your data..."
                disabled={isLoading}
                rows={1}
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={handleKeydown}
              />
              <button
                type="submit"
                className="vpg-ai-send-btn"
                disabled={!inputText.trim() || isLoading}
                title="Send"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </form>
            {/* Input footer with model name and actions */}
            <div className="vpg-ai-input-footer">
              {config.aiModelName && (
                <span className="vpg-ai-model-name">{config.aiModelName}</span>
              )}
              <div className="vpg-ai-input-actions">
                {fullPreviewData.length > 0 && (
                  <button
                    className="vpg-ai-action-btn vpg-ai-action-primary"
                    title="View in Grid tab"
                    onClick={handleViewResults}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                    View in Grid
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel: Data Scratchpad */}
        <div className="vpg-ai-preview-panel">
          {/* Header with schema */}
          <div className="vpg-ai-preview-header">
            <div className="vpg-ai-preview-title-row">
              <h3>{selectedDataSourceInfo?.name}</h3>
              <div className="vpg-ai-preview-meta">
                {fullPreviewData.length > 0 && (
                  <span className="vpg-ai-preview-count">
                    {fullPreviewData.length.toLocaleString()}
                    {' '}
                    rows
                  </span>
                )}
                {selectedQuery && (
                  <button
                    className={`vpg-ai-preview-sql-btn ${showSqlPanel ? 'vpg-ai-sql-active' : ''}`}
                    title="Toggle SQL query"
                    onClick={toggleSqlPanel}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="16 18 22 12 16 6" />
                      <polyline points="8 6 2 12 8 18" />
                    </svg>
                    SQL
                  </button>
                )}
                {fullPreviewData.length > 0 && (
                  <button
                    className="vpg-ai-preview-view-btn"
                    title="View in Grid"
                    onClick={handleViewResults}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <line x1="3" y1="9" x2="21" y2="9" />
                      <line x1="9" y1="21" x2="9" y2="9" />
                    </svg>
                    View in Grid
                  </button>
                )}
              </div>
            </div>
            {/* Schema chips in preview header */}
            {currentSchema && (
              <div className="vpg-ai-schema-bar">
                {currentSchema.columns.map((col: { name: string, type: string }) => (
                  <div
                    key={col.name}
                    className="vpg-ai-schema-chip"
                    title={`${col.name} (${col.type})`}
                  >
                    <span className="vpg-ai-chip-type">{getColumnTypeIcon(col.type)}</span>
                    <span className="vpg-ai-chip-name">{col.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SQL Panel (expandable, above the table) */}
          {showSqlPanel && selectedQuery && (
            <div className="vpg-ai-sql-panel">
              <div className="vpg-ai-sql-panel-header">
                <span className="vpg-ai-sql-panel-title">SQL Query</span>
                <div className="vpg-ai-sql-panel-actions">
                  <button
                    className="vpg-ai-copy-btn"
                    title="Copy SQL"
                    onClick={() => copyToClipboard(selectedQuery)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                  <button
                    className="vpg-ai-sql-panel-close"
                    title="Close"
                    onClick={() => setShowSqlPanel(false)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>
              <pre className="vpg-ai-sql-panel-code"><code>{selectedQuery}</code></pre>
            </div>
          )}

          {/* Loading state */}
          {isLoading ? (
            <div className="vpg-ai-preview-loading">
              <div className="vpg-ai-preview-spinner" />
              <span>Running query...</span>
            </div>
          ) : previewData.length === 0 && currentSchema ? (
            /* Ready state (schema loaded, no data yet) */
            <div className="vpg-ai-preview-ready">
              <div className="vpg-ai-preview-ready-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <ellipse cx="12" cy="5" rx="9" ry="3" />
                  <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                  <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
                </svg>
              </div>
              <p>Data source connected</p>
              <span>
                {currentSchema.columns.length}
                {' '}
                columns available
              </span>
              <div className="vpg-ai-preview-hint">
                Ask a question to explore the data
              </div>
            </div>
          ) : previewData.length === 0 ? (
            /* No schema loaded yet */
            <div className="vpg-ai-preview-empty">
              <div className="vpg-ai-preview-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <p>Loading data source...</p>
            </div>
          ) : (
            /* Data table */
            <div className="vpg-ai-preview-table-container">
              <table className="vpg-ai-preview-table">
                <thead>
                  <tr>
                    {previewColumns.map((col: string) => (
                      <th key={col}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.map((row: Record<string, unknown>, idx: number) => (
                    <tr key={idx}>
                      {previewColumns.map((col: string) => (
                        <td key={col}>{formatCellValue(row[col])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {fullPreviewData.length > 100 && (
                <div className="vpg-ai-preview-more">
                  Showing 100 of
                  {' '}
                  {fullPreviewData.length.toLocaleString()}
                  {' '}
                  rows.
                  <button onClick={handleViewResults}>View all in Grid</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
})
