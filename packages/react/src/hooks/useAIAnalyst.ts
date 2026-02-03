/**
 * TinyPivot React - AI Analyst Hook
 * Manages AI conversation state and data fetching
 */
import type {
  AIAnalystConfig,
  AIConversation,
  AIConversationUpdateEvent,
  AIDataLoadedEvent,
  AIDataSource,
  AIErrorEvent,
  AIProxyResponse,
  AIQueryExecutedEvent,
  AITableSchema,
  ListTablesResponse,
  SchemaResponse,
} from '@smallwebco/tinypivot-core'
import {
  addMessageToConversation,
  buildSystemPrompt,
  createAssistantMessage,
  createConversation,
  createUserMessage,
  extractSQLFromResponse,
  findDemoResponse,
  getDefaultDemoResponse,
  getDemoSchema,
  getInitialDemoData,
  getMessagesForAPI,
  setConversationDataSource,
  validateSQLSafety,
} from '@smallwebco/tinypivot-core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export interface UseAIAnalystOptions {
  config: AIAnalystConfig
  onDataLoaded?: (event: AIDataLoadedEvent) => void
  onConversationUpdate?: (event: AIConversationUpdateEvent) => void
  onQueryExecuted?: (event: AIQueryExecutedEvent) => void
  onError?: (event: AIErrorEvent) => void
}

export function useAIAnalyst(options: UseAIAnalystOptions) {
  const { config, onDataLoaded, onConversationUpdate, onQueryExecuted, onError } = options

  // Use refs to avoid stale closures in callbacks
  const configRef = useRef(config)
  configRef.current = config

  // LocalStorage key for persistence
  const storageKey = config.persistToLocalStorage
    ? `tinypivot-ai-conversation-${config.sessionId || 'default'}`
    : null

  // Load initial conversation from localStorage if enabled
  const loadFromStorage = useCallback((): AIConversation => {
    if (storageKey && typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(storageKey)
        if (stored) {
          const parsed = JSON.parse(stored)
          if (parsed.id && Array.isArray(parsed.messages)) {
            return parsed as AIConversation
          }
        }
      }
      catch (e) {
        console.warn('[TinyPivot] Failed to load conversation from localStorage:', e)
      }
    }
    return createConversation(config.sessionId)
  }, [storageKey, config.sessionId])

  // Save conversation to localStorage if enabled
  const saveToStorage = useCallback((conv: AIConversation) => {
    if (storageKey && typeof window !== 'undefined') {
      try {
        // Custom replacer to handle BigInt values (common in DuckDB results)
        const replacer = (_key: string, value: unknown) => {
          if (typeof value === 'bigint') {
            return Number(value)
          }
          return value
        }
        localStorage.setItem(storageKey, JSON.stringify(conv, replacer))
      }
      catch (e) {
        console.warn('[TinyPivot] Failed to save conversation to localStorage:', e)
      }
    }
  }, [storageKey])

  // State
  const [conversation, setConversation] = useState<AIConversation>(() => loadFromStorage())
  const [schemas, setSchemas] = useState<Map<string, AITableSchema>>(new Map())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastLoadedData, setLastLoadedData] = useState<Record<string, unknown>[] | null>(null)

  // Dynamic data sources (discovered from endpoint)
  const [discoveredDataSources, setDiscoveredDataSources] = useState<AIDataSource[]>([])
  const [isLoadingTables, setIsLoadingTables] = useState(false)

  // Get effective data sources (config or discovered)
  const effectiveDataSources = useMemo<AIDataSource[]>(() => {
    if (config.dataSources && config.dataSources.length > 0) {
      return config.dataSources
    }
    return discoveredDataSources
  }, [config.dataSources, discoveredDataSources])

  // Save to storage whenever conversation changes
  useEffect(() => {
    saveToStorage(conversation)
  }, [conversation, saveToStorage])

  // Computed values
  const selectedDataSource = conversation.dataSourceId
  const selectedDataSourceInfo = useMemo(
    () => effectiveDataSources.find((ds: AIDataSource) => ds.id === conversation.dataSourceId),
    [effectiveDataSources, conversation.dataSourceId],
  )
  const messages = conversation.messages
  const hasMessages = conversation.messages.length > 0

  /**
   * Fetch available tables from endpoint (auto-discovery mode)
   * If config.datasourceId is set, fetches tables from that specific datasource
   */
  const fetchTables = useCallback(async () => {
    if (!configRef.current.endpoint)
      return

    setIsLoadingTables(true)
    try {
      // Build request body - use datasource-specific action if datasourceId is set
      const requestBody: Record<string, unknown> = configRef.current.datasourceId
        ? {
            action: 'list-datasource-tables',
            datasourceId: configRef.current.datasourceId,
            userId: configRef.current.userId,
            userKey: configRef.current.userKey || configRef.current.userId,
          }
        : { action: 'list-tables' }

      const response = await fetch(configRef.current.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch tables: ${response.statusText}`)
      }

      const data: ListTablesResponse = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      // Convert to AIDataSource format
      setDiscoveredDataSources(data.tables.map((t: { name: string, schema?: string, description?: string }) => ({
        id: t.schema ? `${t.schema}.${t.name}` : t.name,
        table: t.schema ? `${t.schema}.${t.name}` : t.name,
        name: t.schema ? `${t.schema}.${t.name}` : t.name,
        description: t.description,
      })))

      // Schema is now fetched on-demand when a table is selected via selectDataSource()
      // This avoids expensive DESCRIBE queries for all tables upfront
    }
    catch (err) {
      console.warn('[TinyPivot] Failed to fetch tables:', err)
      onError?.({
        message: err instanceof Error ? err.message : 'Failed to fetch tables',
        type: 'network',
      })
    }
    finally {
      setIsLoadingTables(false)
    }
  }, [onError])

  // Initialize: fetch tables if using endpoint
  useEffect(() => {
    if (configRef.current.endpoint && (!config.dataSources || config.dataSources.length === 0)) {
      fetchTables()
    }
  }, [fetchTables, config.dataSources])

  /**
   * Fetch schema from the unified endpoint
   */
  const fetchSchema = useCallback(async (dataSource: AIDataSource) => {
    if (!configRef.current.endpoint)
      return

    try {
      // Build request body - include datasource info if available
      const requestBody: Record<string, unknown> = {
        action: 'get-schema',
        tables: [dataSource.table],
      }
      if (configRef.current.datasourceId) {
        requestBody.datasourceId = configRef.current.datasourceId
        requestBody.userId = configRef.current.userId
        requestBody.userKey = configRef.current.userKey || configRef.current.userId
      }

      const response = await fetch(configRef.current.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch schema: ${response.statusText}`)
      }

      const data: SchemaResponse = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      if (data.schemas.length > 0) {
        setSchemas(prev => new Map(prev).set(dataSource.id, data.schemas[0]))
      }
    }
    catch (err) {
      // Schema fetch is optional - continue without it
      console.warn('Failed to fetch schema:', err)
    }
  }, [])

  /**
   * Fetch sample data (first 100 rows) from the unified endpoint
   */
  const fetchSampleData = useCallback(async (dataSource: AIDataSource) => {
    if (!configRef.current.endpoint)
      return

    try {
      const sql = `SELECT * FROM ${dataSource.table} LIMIT 100`

      // Build request body - use datasource-specific query if datasourceId is set
      const requestBody: Record<string, unknown> = configRef.current.datasourceId
        ? {
            action: 'query-datasource',
            datasourceId: configRef.current.datasourceId,
            userId: configRef.current.userId,
            userKey: configRef.current.userKey || configRef.current.userId,
            sql,
            maxRows: 100,
          }
        : {
            action: 'query',
            sql,
            table: dataSource.table,
          }

      const response = await fetch(configRef.current.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch sample data: ${response.statusText}`)
      }

      const result = await response.json()

      if (result.error) {
        throw new Error(result.error)
      }

      if (result.data && result.data.length > 0) {
        setLastLoadedData(result.data)
        onDataLoaded?.({
          data: result.data,
          query: sql,
          dataSourceId: dataSource.id,
          rowCount: result.data.length,
        })
      }
      else {
        // Empty result - set to empty array so UI knows loading completed
        setLastLoadedData([])
      }
    }
    catch (err) {
      // Set error so UI can show it instead of infinite loading
      const errMsg = err instanceof Error ? err.message : 'Failed to load data'
      setError(errMsg)
      console.warn('Failed to fetch sample data:', err)
      // Set to empty array so UI knows loading completed (even with error)
      setLastLoadedData([])
    }
  }, [onDataLoaded])

  /**
   * Select a data source and fetch its schema
   */
  const selectDataSource = useCallback(async (dataSourceId: string) => {
    const dataSource = effectiveDataSources.find(ds => ds.id === dataSourceId)
    if (!dataSource) {
      setError(`Data source "${dataSourceId}" not found`)
      return
    }

    // Update conversation
    setConversation((prev) => {
      const updated = setConversationDataSource(prev, dataSourceId)
      const withMessage = addMessageToConversation(
        updated,
        createAssistantMessage(
          `I'm now connected to **${dataSource.name}**. ${dataSource.description || ''}\n\nWhat would you like to know about this data?`,
        ),
      )
      onConversationUpdate?.({ conversation: withMessage })
      return withMessage
    })

    // Load data source if custom loader is provided (demo mode)
    if (configRef.current.dataSourceLoader) {
      try {
        const { data, schema } = await configRef.current.dataSourceLoader(dataSourceId)
        if (schema) {
          setSchemas(prev => new Map(prev).set(dataSourceId, schema))
        }
        // Store the loaded data for the data source
        if (data && data.length > 0) {
          setLastLoadedData(data)
          onDataLoaded?.({
            data,
            query: `SELECT * FROM ${dataSource.table} LIMIT 100`,
            dataSourceId,
            rowCount: data.length,
          })
        }
      }
      catch (err) {
        console.warn('Failed to load data source:', err)
      }
    }
    // Fetch schema (demo mode uses mock schemas)
    else if (configRef.current.demoMode) {
      const demoSchema = getDemoSchema(dataSourceId)
      if (demoSchema) {
        setSchemas(prev => new Map(prev).set(dataSourceId, demoSchema))
      }
      // Load initial sample data for the preview
      const initialData = getInitialDemoData(dataSourceId)
      if (initialData) {
        setLastLoadedData(initialData)
        onDataLoaded?.({
          data: initialData,
          query: `SELECT * FROM ${dataSource.table} LIMIT 10`,
          dataSourceId,
          rowCount: initialData.length,
        })
      }
    }
    // Use endpoint for schema discovery and sample data
    else if (configRef.current.endpoint) {
      await fetchSchema(dataSource)
      await fetchSampleData(dataSource)
    }
  }, [effectiveDataSources, fetchSchema, fetchSampleData, onConversationUpdate, onDataLoaded])

  /**
   * Call the AI endpoint
   */
  const callAIEndpoint = useCallback(async (
    userInput: string,
    currentConversation: AIConversation,
    currentSchemas: Map<string, AITableSchema>,
    currentDataSources: AIDataSource[],
  ): Promise<string> => {
    if (!configRef.current.endpoint) {
      throw new Error('No endpoint configured. Set `endpoint` in AI analyst config.')
    }

    const dataSourceId = currentConversation.dataSourceId

    // Build system prompt using effective data sources
    const systemPrompt = buildSystemPrompt(
      currentDataSources,
      currentSchemas,
      dataSourceId,
    )

    // Get conversation messages for API
    const apiMessages = getMessagesForAPI(currentConversation)

    // Add system prompt and current user message
    const messages = [
      { role: 'user' as const, content: systemPrompt },
      { role: 'assistant' as const, content: 'I understand. I\'m ready to help you analyze the data.' },
      ...apiMessages.slice(0, -1), // Exclude the just-added user message
      { role: 'user' as const, content: userInput },
    ]

    const response = await fetch(configRef.current.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'chat',
        messages,
        apiKey: configRef.current.apiKey,
        aiBaseUrl: configRef.current.aiBaseUrl,
        aiModel: configRef.current.aiModel,
      }),
    })

    if (!response.ok) {
      throw new Error(`AI request failed: ${response.statusText}`)
    }

    const data: AIProxyResponse = await response.json()

    if (data.error) {
      throw new Error(data.error)
    }

    return data.content
  }, [])

  /**
   * Execute a SQL query and update the specified message with results
   * @param sql The SQL query to execute
   * @param currentConversation Current conversation state
   * @param currentDataSources Available data sources
   * @param messageId Optional message ID to update with results (instead of adding new message)
   */
  const executeQuery = useCallback(async (
    sql: string,
    currentConversation: AIConversation,
    currentDataSources: AIDataSource[],
    messageId?: string,
  ) => {
    const dataSourceId = currentConversation.dataSourceId
    if (!dataSourceId)
      return

    const dataSource = currentDataSources.find((ds: { id: string }) => ds.id === dataSourceId)
    if (!dataSource)
      return

    const startTime = Date.now()

    try {
      let data: { data?: Record<string, unknown>[], rowCount?: number, truncated?: boolean, error?: string, success?: boolean }

      // Use custom query executor if provided (demo mode)
      if (configRef.current.queryExecutor) {
        const result = await configRef.current.queryExecutor(sql, dataSource.table)
        data = {
          data: result.data,
          rowCount: result.rowCount,
          truncated: result.truncated,
          error: result.error,
          success: !result.error,
        }
      }
      // Use unified endpoint
      else if (configRef.current.endpoint) {
        // Build request body - use datasource-specific query if datasourceId is set
        const requestBody: Record<string, unknown> = configRef.current.datasourceId
          ? {
              action: 'query-datasource',
              datasourceId: configRef.current.datasourceId,
              userId: configRef.current.userId,
              userKey: configRef.current.userKey || configRef.current.userId,
              sql,
              maxRows: configRef.current.maxRows || 10000,
            }
          : {
              action: 'query',
              sql,
              table: dataSource.table,
            }

        const response = await fetch(configRef.current.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        })

        data = await response.json()
      }
      else {
        throw new Error('No query executor or endpoint configured')
      }

      const duration = Date.now() - startTime

      if (!data.success || data.error) {
        // Add error message
        setConversation((prev: AIConversation) => {
          const updated = addMessageToConversation(
            prev,
            createAssistantMessage(
              `The query failed: ${data.error || 'Unknown error'}. Would you like me to try a different approach?`,
              { error: data.error, query: sql },
            ),
          )
          onConversationUpdate?.({ conversation: updated })
          return updated
        })

        onQueryExecuted?.({
          query: sql,
          rowCount: 0,
          duration,
          dataSourceId,
          success: false,
          error: data.error,
        })

        onError?.({
          message: data.error || 'Query failed',
          query: sql,
          type: 'query',
        })
        return
      }

      // Success - load data
      if (data.data) {
        setLastLoadedData(data.data)

        // Update the existing message with data, or add a new one if no messageId
        if (messageId) {
          // Find and update the existing message's metadata with the data
          setConversation((prev: AIConversation) => {
            const updatedMessages = prev.messages.map((msg) => {
              if (msg.id === messageId) {
                return {
                  ...msg,
                  metadata: {
                    ...msg.metadata,
                    data: data.data,
                    rowCount: data.rowCount,
                    truncated: data.truncated,
                  },
                }
              }
              return msg
            })
            const updated = {
              ...prev,
              messages: updatedMessages,
              updatedAt: Date.now(),
            }
            onConversationUpdate?.({ conversation: updated })
            return updated
          })
        }
        else {
          // Fallback: add a new message (shouldn't happen in normal flow)
          const truncatedNote = data.truncated
            ? ` (limited to ${configRef.current.maxRows || 10000} rows)`
            : ''

          setConversation((prev: AIConversation) => {
            const updated = addMessageToConversation(
              prev,
              createAssistantMessage(
                `Retrieved **${data.rowCount} rows**${truncatedNote}.`,
                { query: sql, rowCount: data.rowCount, data: data.data },
              ),
            )
            onConversationUpdate?.({ conversation: updated })
            return updated
          })
        }

        onDataLoaded?.({
          data: data.data,
          query: sql,
          dataSourceId,
          rowCount: data.rowCount || data.data.length,
        })

        onQueryExecuted?.({
          query: sql,
          rowCount: data.rowCount || data.data.length,
          duration,
          dataSourceId,
          success: true,
        })
      }
    }
    catch (err) {
      const duration = Date.now() - startTime
      const errorMsg = err instanceof Error ? err.message : 'Query execution failed'

      setConversation((prev: AIConversation) => {
        const updated = addMessageToConversation(
          prev,
          createAssistantMessage(
            `Failed to execute query: ${errorMsg}`,
            { error: errorMsg, query: sql },
          ),
        )
        onConversationUpdate?.({ conversation: updated })
        return updated
      })

      onQueryExecuted?.({
        query: sql,
        rowCount: 0,
        duration,
        dataSourceId,
        success: false,
        error: errorMsg,
      })

      onError?.({
        message: errorMsg,
        query: sql,
        type: 'network',
      })
    }
  }, [onConversationUpdate, onDataLoaded, onQueryExecuted, onError])

  /**
   * Handle demo mode responses
   */
  const handleDemoResponse = useCallback(async (
    userInput: string,
    currentConversation: AIConversation,
  ) => {
    // Simulate loading delay
    await new Promise(resolve => setTimeout(resolve, 800))

    const dataSourceId = currentConversation.dataSourceId

    if (!dataSourceId) {
      setConversation((prev) => {
        const updated = addMessageToConversation(
          prev,
          createAssistantMessage(
            'Please select a data source first by clicking one of the options above.',
          ),
        )
        onConversationUpdate?.({ conversation: updated })
        return updated
      })
      return
    }

    // Find matching demo response
    const demoTrigger = findDemoResponse(dataSourceId, userInput)

    if (demoTrigger) {
      // Add AI response
      setConversation((prev) => {
        const updated = addMessageToConversation(
          prev,
          createAssistantMessage(demoTrigger.response, {
            query: demoTrigger.query,
            rowCount: demoTrigger.mockData?.length,
          }),
        )
        onConversationUpdate?.({ conversation: updated })
        return updated
      })

      // Load mock data
      if (demoTrigger.mockData) {
        setLastLoadedData(demoTrigger.mockData)

        onDataLoaded?.({
          data: demoTrigger.mockData,
          query: demoTrigger.query || '',
          dataSourceId,
          rowCount: demoTrigger.mockData.length,
        })

        onQueryExecuted?.({
          query: demoTrigger.query || '',
          rowCount: demoTrigger.mockData.length,
          duration: 150, // Fake duration
          dataSourceId,
          success: true,
        })
      }
    }
    else {
      // Use default response
      const defaultResponse = getDefaultDemoResponse(dataSourceId)
      setConversation((prev) => {
        const updated = addMessageToConversation(
          prev,
          createAssistantMessage(defaultResponse),
        )
        onConversationUpdate?.({ conversation: updated })
        return updated
      })
    }
  }, [onConversationUpdate, onDataLoaded, onQueryExecuted])

  /**
   * Send a message to the AI
   */
  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim())
      return
    if (isLoading)
      return

    setError(null)
    setIsLoading(true)

    // Add user message
    let updatedConversation: AIConversation
    setConversation((prev) => {
      updatedConversation = addMessageToConversation(prev, createUserMessage(content))
      onConversationUpdate?.({ conversation: updatedConversation })
      return updatedConversation
    })

    try {
      // Wait for state to update
      await new Promise(resolve => setTimeout(resolve, 0))

      // Get current state
      const currentConv = updatedConversation!

      // Handle demo mode
      if (configRef.current.demoMode) {
        await handleDemoResponse(content, currentConv)
        return
      }

      // Check if data source is selected
      if (!currentConv.dataSourceId) {
        setConversation((prev) => {
          const updated = addMessageToConversation(
            prev,
            createAssistantMessage(
              'Please select a data source first by clicking one of the options above.',
            ),
          )
          onConversationUpdate?.({ conversation: updated })
          return updated
        })
        return
      }

      // Call AI endpoint
      const aiResponse = await callAIEndpoint(content, currentConv, schemas, effectiveDataSources)

      // Check if AI wants to run a query
      const sqlQuery = extractSQLFromResponse(aiResponse)

      if (sqlQuery) {
        // Validate SQL
        const validation = validateSQLSafety(sqlQuery)
        if (!validation.valid) {
          setConversation((prev) => {
            const updated = addMessageToConversation(
              prev,
              createAssistantMessage(
                `I generated an invalid query: ${validation.error}. Let me try again with a corrected approach.`,
                { error: validation.error },
              ),
            )
            onConversationUpdate?.({ conversation: updated })
            return updated
          })
          return
        }

        // Create the AI message and capture its ID for updating with query results
        const aiMessage = createAssistantMessage(aiResponse, { query: sqlQuery })

        setConversation((prev) => {
          const updated = addMessageToConversation(prev, aiMessage)
          onConversationUpdate?.({ conversation: updated })
          return updated
        })

        // Execute query and update the same message with data
        await executeQuery(sqlQuery, currentConv, effectiveDataSources, aiMessage.id)
      }
      else {
        // Just add AI response
        setConversation((prev) => {
          const updated = addMessageToConversation(
            prev,
            createAssistantMessage(aiResponse),
          )
          onConversationUpdate?.({ conversation: updated })
          return updated
        })
      }
    }
    catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'An error occurred'
      setError(errorMsg)

      setConversation((prev) => {
        const updated = addMessageToConversation(
          prev,
          createAssistantMessage(
            `Sorry, I encountered an error: ${errorMsg}. Please try again.`,
            { error: errorMsg },
          ),
        )
        onConversationUpdate?.({ conversation: updated })
        return updated
      })

      onError?.({
        message: errorMsg,
        type: 'ai',
      })
    }
    finally {
      setIsLoading(false)
    }
  }, [isLoading, schemas, effectiveDataSources, callAIEndpoint, executeQuery, handleDemoResponse, onConversationUpdate, onError])

  /**
   * Load full data for the currently selected data source
   * Returns the first batch of data for displaying in the grid (supports infinite scroll)
   */
  const loadFullData = useCallback(async (): Promise<{
    data: Record<string, unknown>[] | null
    hasMore: boolean
    offset: number
  }> => {
    const dataSourceId = conversation.dataSourceId
    if (!dataSourceId) {
      return { data: null, hasMore: false, offset: 0 }
    }

    const dataSource = effectiveDataSources.find(ds => ds.id === dataSourceId)
    if (!dataSource) {
      return { data: null, hasMore: false, offset: 0 }
    }

    const currentConfig = configRef.current
    const batchSize = currentConfig.batchSize || 1000
    const enableInfiniteScroll = currentConfig.enableInfiniteScroll !== false

    // Use custom data source loader if provided (no pagination support)
    if (currentConfig.dataSourceLoader) {
      try {
        const { data } = await currentConfig.dataSourceLoader(dataSourceId)
        if (data && data.length > 0) {
          return { data, hasMore: false, offset: data.length }
        }
      }
      catch (err) {
        console.warn('Failed to load full data:', err)
        onError?.({
          message: err instanceof Error ? err.message : 'Failed to load full data',
          type: 'network',
        })
      }
      return { data: null, hasMore: false, offset: 0 }
    }

    // Use query executor to get all data (no pagination support)
    if (currentConfig.queryExecutor) {
      try {
        const result = await currentConfig.queryExecutor(
          `SELECT * FROM ${dataSource.table}`,
          dataSource.table,
        )
        if (result.data && result.data.length > 0) {
          return { data: result.data, hasMore: false, offset: result.data.length }
        }
      }
      catch (err) {
        console.warn('Failed to load full data via query:', err)
        onError?.({
          message: err instanceof Error ? err.message : 'Failed to load full data',
          type: 'network',
        })
      }
      return { data: null, hasMore: false, offset: 0 }
    }

    // Use endpoint query action - prefer datasource-specific path if datasourceId is set
    if (currentConfig.endpoint && currentConfig.datasourceId) {
      try {
        // Use paginated query for infinite scroll
        if (enableInfiniteScroll) {
          const requestBody = {
            action: 'query-datasource-paginated',
            datasourceId: currentConfig.datasourceId,
            userId: currentConfig.userId,
            userKey: currentConfig.userKey || currentConfig.userId,
            sql: `SELECT * FROM ${dataSource.table}`,
            offset: 0,
            limit: batchSize,
          }

          const response = await fetch(currentConfig.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          })

          if (!response.ok) {
            throw new Error(`Failed to load data: ${response.statusText}`)
          }

          const result = await response.json()
          if (result.success && result.data) {
            return {
              data: result.data,
              hasMore: result.hasMore,
              offset: result.data.length,
            }
          }
          if (result.error) {
            throw new Error(result.error)
          }
        }
        else {
          // Non-paginated query
          const requestBody = {
            action: 'query-datasource',
            datasourceId: currentConfig.datasourceId,
            userId: currentConfig.userId,
            userKey: currentConfig.userKey || currentConfig.userId,
            sql: `SELECT * FROM ${dataSource.table}`,
            maxRows: currentConfig.maxRows || 10000,
          }

          const response = await fetch(currentConfig.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          })

          if (!response.ok) {
            throw new Error(`Failed to load data: ${response.statusText}`)
          }

          const data = await response.json()
          if (data.data && data.data.length > 0) {
            return { data: data.data, hasMore: false, offset: data.data.length }
          }
        }
      }
      catch (err) {
        console.warn('Failed to load full data from endpoint:', err)
        onError?.({
          message: err instanceof Error ? err.message : 'Failed to load full data',
          type: 'network',
        })
      }
      return { data: null, hasMore: false, offset: 0 }
    }

    // Standard endpoint without datasourceId (DuckDB-style)
    if (currentConfig.endpoint) {
      try {
        const requestBody = {
          action: 'query',
          sql: `SELECT * FROM ${dataSource.table}`,
          table: dataSource.table,
        }

        const response = await fetch(currentConfig.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        })

        if (!response.ok) {
          throw new Error(`Failed to load data: ${response.statusText}`)
        }

        const data = await response.json()
        if (data.data && data.data.length > 0) {
          return { data: data.data, hasMore: false, offset: data.data.length }
        }
      }
      catch (err) {
        console.warn('Failed to load full data from endpoint:', err)
        onError?.({
          message: err instanceof Error ? err.message : 'Failed to load full data',
          type: 'network',
        })
      }
      return { data: null, hasMore: false, offset: 0 }
    }

    // Demo mode - get initial data
    if (currentConfig.demoMode) {
      const initialData = getInitialDemoData(dataSourceId)
      return { data: initialData || null, hasMore: false, offset: initialData?.length || 0 }
    }

    return { data: null, hasMore: false, offset: 0 }
  }, [conversation.dataSourceId, effectiveDataSources, onError])

  /**
   * Fetch more data for infinite scroll
   * @param offset The current data offset
   * @returns The next batch of data and pagination info
   */
  const fetchMoreData = useCallback(async (offset: number): Promise<{
    data: Record<string, unknown>[] | null
    hasMore: boolean
  }> => {
    const dataSourceId = conversation.dataSourceId
    if (!dataSourceId) {
      return { data: null, hasMore: false }
    }

    const dataSource = effectiveDataSources.find(ds => ds.id === dataSourceId)
    if (!dataSource) {
      return { data: null, hasMore: false }
    }

    const currentConfig = configRef.current
    const batchSize = currentConfig.batchSize || 1000

    // Only datasource endpoint supports pagination
    if (!currentConfig.endpoint || !currentConfig.datasourceId) {
      return { data: null, hasMore: false }
    }

    try {
      const requestBody = {
        action: 'query-datasource-paginated',
        datasourceId: currentConfig.datasourceId,
        userId: currentConfig.userId,
        userKey: currentConfig.userKey || currentConfig.userId,
        sql: `SELECT * FROM ${dataSource.table}`,
        offset,
        limit: batchSize,
      }

      const response = await fetch(currentConfig.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        throw new Error(`Failed to load more data: ${response.statusText}`)
      }

      const result = await response.json()
      if (result.success && result.data) {
        return {
          data: result.data,
          hasMore: result.hasMore,
        }
      }
      if (result.error) {
        throw new Error(result.error)
      }
    }
    catch (err) {
      console.warn('Failed to fetch more data:', err)
      onError?.({
        message: err instanceof Error ? err.message : 'Failed to load more data',
        type: 'network',
      })
    }

    return { data: null, hasMore: false }
  }, [conversation.dataSourceId, effectiveDataSources, onError])

  /**
   * Clear the conversation
   */
  const clearConversation = useCallback(() => {
    const newConv = createConversation(configRef.current.sessionId)
    setConversation(newConv)
    setError(null)
    setLastLoadedData(null)
    onConversationUpdate?.({ conversation: newConv })
  }, [onConversationUpdate])

  /**
   * Export conversation for persistence
   */
  const exportConversation = useCallback((): AIConversation => {
    return { ...conversation }
  }, [conversation])

  /**
   * Import a conversation
   */
  const importConversation = useCallback((conv: AIConversation) => {
    setConversation(conv)
    onConversationUpdate?.({ conversation: conv })
  }, [onConversationUpdate])

  return {
    // State
    conversation,
    messages,
    hasMessages,
    schemas,
    isLoading,
    isLoadingTables,
    error,
    lastLoadedData,
    selectedDataSource,
    selectedDataSourceInfo,
    /** Available data sources (either from config or auto-discovered) */
    dataSources: effectiveDataSources,

    // Actions
    selectDataSource,
    sendMessage,
    clearConversation,
    exportConversation,
    importConversation,
    /** Refresh table list from endpoint */
    fetchTables,
    /** Load full data for the currently selected data source (first batch) */
    loadFullData,
    /** Fetch more data for infinite scroll */
    fetchMoreData,
  }
}
