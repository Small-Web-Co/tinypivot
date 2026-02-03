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
  /** When true, component fills parent container (for use in studio/embedded contexts) */
  embedded?: boolean
  onDataLoaded?: (payload: AIDataLoadedEvent) => void
  onConversationUpdate?: (payload: AIConversationUpdateEvent) => void
  onQueryExecuted?: (payload: AIQueryExecutedEvent) => void
  onError?: (payload: AIErrorEvent) => void
  onViewResults?: (payload: { data: Record<string, unknown>[], query: string }) => void
}

export interface AIAnalystHandle {
  loadFullData: () => Promise<{ data: Record<string, unknown>[] | null, hasMore: boolean, offset: number }>
  fetchMoreData: (offset: number) => Promise<{ data: Record<string, unknown>[] | null, hasMore: boolean }>
  selectedDataSource: string | undefined
}

export const AIAnalyst = forwardRef<AIAnalystHandle, AIAnalystProps>(({
  config,
  theme = 'light',
  embedded = true,
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
    error,
    schemas,
    selectedDataSource,
    selectedDataSourceInfo,
    lastLoadedData,
    dataSources,
    selectDataSource,
    sendMessage,
    clearConversation,
    loadFullData,
    fetchMoreData,
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
    fetchMoreData,
    selectedDataSource,
  }), [loadFullData, fetchMoreData, selectedDataSource])

  const [inputText, setInputText] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const [showSqlPanel, setShowSqlPanel] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Pagination constants
  const rowsPerPage = 50

  // Group data sources by schema for tree view
  const schemaTree = useMemo(() => {
    const tree: Record<string, typeof dataSources> = {}
    for (const ds of dataSources) {
      // Extract schema from the table identifier (e.g., "public.users" -> "public")
      const schema = ds.table?.includes('.')
        ? ds.table.split('.')[0]
        : 'default'
      if (!tree[schema])
        tree[schema] = []
      tree[schema].push(ds)
    }
    // Sort schemas: 'public' first, then alphabetically
    return Object.fromEntries(
      Object.entries(tree).sort(([a], [b]) => {
        if (a === 'public')
          return -1
        if (b === 'public')
          return 1
        return a.localeCompare(b)
      }),
    )
  }, [dataSources])

  // Get schema for selected data source
  const currentSchema: AITableSchema | undefined = useMemo(() => {
    if (!selectedDataSource)
      return undefined
    return schemas.get(selectedDataSource)
  }, [selectedDataSource, schemas])

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

  // Get data for the selected message (or latest) - with pagination
  const previewData = useMemo(() => {
    if (!fullPreviewData || fullPreviewData.length === 0)
      return []
    const startIndex = (currentPage - 1) * rowsPerPage
    const endIndex = startIndex + rowsPerPage
    return fullPreviewData.slice(startIndex, endIndex)
  }, [fullPreviewData, currentPage, rowsPerPage])

  // Pagination info
  const totalPages = useMemo(() => Math.ceil(fullPreviewData.length / rowsPerPage), [fullPreviewData.length, rowsPerPage])
  const canGoPrev = currentPage > 1
  const canGoNext = currentPage < totalPages

  // Reset page when data changes
  useEffect(() => {
    setCurrentPage(1)
  }, [fullPreviewData])

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
      if (Number.isInteger(value)) {
        return String(value)
      }
      return value.toLocaleString('en-US', { maximumFractionDigits: 4, useGrouping: false })
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
      <div className={`vpg-ai-analyst ${theme === 'dark' ? 'vpg-theme-dark' : ''} ${embedded ? 'vpg-ai-analyst--embedded' : ''}`}>
        <div className="vpg-ai-picker">
          {/* Subtle branding in corner */}
          <div className="vpg-ai-picker-brand">
            <div className="vpg-ai-picker-brand-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
                <circle cx="7.5" cy="14.5" r="1.5" fill="currentColor" />
                <circle cx="16.5" cy="14.5" r="1.5" fill="currentColor" />
              </svg>
            </div>
            <span className="vpg-ai-picker-brand-text">AI Analyst</span>
          </div>

          {/* Main content area */}
          <div className="vpg-ai-picker-main">
            {dataSources.length === 0 && !isLoadingTables ? (
              <div className="vpg-ai-picker-empty">
                <h2>No data sources</h2>
                <p>Configure a data source to start exploring with AI</p>
                <a
                  href="https://tinypivot.com/docs/ai-analyst"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="vpg-ai-picker-docs-link"
                >
                  View documentation
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M7 17L17 7M17 7H7M17 7V17" />
                  </svg>
                </a>
              </div>
            ) : (
              <>
                {/* Centered search */}
                <div className="vpg-ai-picker-search-container">
                  <h2 className="vpg-ai-picker-title">Select a table to explore</h2>
                  <div className="vpg-ai-picker-search">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search tables..."
                      className="vpg-ai-picker-search-input"
                    />
                    <kbd className="vpg-ai-picker-kbd">/</kbd>
                  </div>
                </div>

                {/* Scrollable grid of tables */}
                <div className="vpg-ai-picker-grid-container">
                  <div className="vpg-ai-picker-grid">
                    {Object.entries(schemaTree).map(([schemaName, tables]) => (
                      <React.Fragment key={schemaName}>
                        {/* Schema divider (only show if multiple schemas) */}
                        {Object.keys(schemaTree).length > 1 && (
                          <div className="vpg-ai-picker-schema-divider vpg-ai-picker-grid-full">
                            <span>{schemaName}</span>
                          </div>
                        )}
                        {/* Table items */}
                        {tables
                          .filter((t: { name: string, table: string }) =>
                            !searchQuery.trim()
                            || t.name.toLowerCase().includes(searchQuery.toLowerCase())
                            || t.table.toLowerCase().includes(searchQuery.toLowerCase()),
                          )
                          .map((table: { id: string, name: string }, idx: number) => (
                            <button
                              key={table.id}
                              type="button"
                              className="vpg-ai-picker-table-item"
                              style={{ animationDelay: `${idx * 30}ms` }}
                              onClick={() => selectDataSource(table.id)}
                            >
                              <div className="vpg-ai-picker-table-icon">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                  <rect x="3" y="3" width="18" height="18" rx="2" />
                                  <line x1="3" y1="9" x2="21" y2="9" />
                                  <line x1="9" y1="21" x2="9" y2="9" />
                                </svg>
                              </div>
                              <div className="vpg-ai-picker-table-info">
                                <span className="vpg-ai-picker-table-name">
                                  {table.name.includes('.') ? table.name.split('.')[1] : table.name}
                                </span>
                              </div>
                              <svg width="16" height="16" className="vpg-ai-picker-table-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M5 12h14M12 5l7 7-7 7" />
                              </svg>
                            </button>
                          ))}
                      </React.Fragment>
                    ))}
                  </div>

                  {(Object.keys(schemaTree).length === 0 || (searchQuery.trim() && !Object.values(schemaTree).flat().some((t: { name: string, table: string }) => t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.table.toLowerCase().includes(searchQuery.toLowerCase())))) && (
                    <div className="vpg-ai-picker-no-results">
                      No tables found
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Render split layout
  return (
    <div className={`vpg-ai-analyst ${theme === 'dark' ? 'vpg-theme-dark' : ''} ${embedded ? 'vpg-ai-analyst--embedded' : ''}`}>
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
              <span className="vpg-ai-model-name">{config.aiModelName || 'AI Model'}</span>
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
          ) : error ? (
            /* Error loading data */
            <div className="vpg-ai-preview-empty vpg-ai-preview-error">
              <div className="vpg-ai-preview-empty-icon" style={{ background: '#fee2e2' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <p style={{ color: '#ef4444' }}>{error}</p>
            </div>
          ) : previewData.length === 0 && lastLoadedData === null ? (
            /* Still loading */
            <div className="vpg-ai-preview-empty">
              <div className="vpg-ai-preview-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <p>Loading data source...</p>
            </div>
          ) : previewData.length === 0 ? (
            /* Empty table */
            <div className="vpg-ai-preview-empty">
              <div className="vpg-ai-preview-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <p>No data in this table</p>
            </div>
          ) : (
            /* Data table */
            <div className="vpg-ai-preview-table-container">
              <div className="vpg-ai-preview-table-scroll">
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
              </div>
              {fullPreviewData.length > rowsPerPage && (
                <div className="vpg-ai-preview-pagination">
                  <div className="vpg-ai-pagination-info">
                    Showing
                    {' '}
                    {((currentPage - 1) * rowsPerPage) + 1}
                    -
                    {Math.min(currentPage * rowsPerPage, fullPreviewData.length)}
                    {' of '}
                    {fullPreviewData.length.toLocaleString()}
                    {' '}
                    rows
                  </div>
                  <div className="vpg-ai-pagination-controls">
                    <button
                      className="vpg-ai-pagination-btn"
                      disabled={!canGoPrev}
                      title="Previous page"
                      onClick={() => setCurrentPage(p => p - 1)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                    </button>
                    <span className="vpg-ai-pagination-page">
                      {currentPage}
                      {' '}
                      /
                      {' '}
                      {totalPages}
                    </span>
                    <button
                      className="vpg-ai-pagination-btn"
                      disabled={!canGoNext}
                      title="Next page"
                      onClick={() => setCurrentPage(p => p + 1)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  </div>
                  <button className="vpg-ai-view-grid-btn" onClick={handleViewResults}>
                    View all in Grid
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
})
