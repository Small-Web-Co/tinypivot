/**
 * TinyPivot Vue - AI Analyst Composable
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
import { computed, onMounted, ref } from 'vue'

export interface UseAIAnalystOptions {
  config: AIAnalystConfig
  onDataLoaded?: (event: AIDataLoadedEvent) => void
  onConversationUpdate?: (event: AIConversationUpdateEvent) => void
  onQueryExecuted?: (event: AIQueryExecutedEvent) => void
  onError?: (event: AIErrorEvent) => void
}

export function useAIAnalyst(options: UseAIAnalystOptions) {
  const { config, onDataLoaded, onConversationUpdate, onQueryExecuted, onError } = options

  // LocalStorage key for persistence
  const storageKey = config.persistToLocalStorage
    ? `tinypivot-ai-conversation-${config.sessionId || 'default'}`
    : null

  // Load initial conversation from localStorage if enabled
  function loadFromStorage(): AIConversation {
    if (storageKey && typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(storageKey)
        if (stored) {
          const parsed = JSON.parse(stored)
          // Validate basic structure
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
  }

  // Save conversation to localStorage if enabled
  function saveToStorage(conv: AIConversation) {
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
  }

  // State
  const conversation = ref<AIConversation>(loadFromStorage())
  const schemas = ref<Map<string, AITableSchema>>(new Map())
  const allSchemas = ref<AITableSchema[]>([]) // All table schemas for JOINs
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const lastLoadedData = ref<Record<string, unknown>[] | null>(null)

  // Dynamic data sources (discovered from endpoint)
  const discoveredDataSources = ref<AIDataSource[]>([])
  const isLoadingTables = ref(false)

  // Get effective data sources (config or discovered)
  const effectiveDataSources = computed<AIDataSource[]>(() => {
    if (config.dataSources && config.dataSources.length > 0) {
      return config.dataSources
    }
    return discoveredDataSources.value
  })

  // Computed
  const selectedDataSource = computed(() => conversation.value.dataSourceId)
  const selectedDataSourceInfo = computed(() =>
    effectiveDataSources.value.find(ds => ds.id === conversation.value.dataSourceId),
  )
  const messages = computed(() => conversation.value.messages)
  const hasMessages = computed(() => conversation.value.messages.length > 0)

  /**
   * Fetch available tables from endpoint (auto-discovery mode)
   */
  async function fetchTables() {
    if (!config.endpoint)
      return

    isLoadingTables.value = true
    try {
      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list-tables' }),
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch tables: ${response.statusText}`)
      }

      const data: ListTablesResponse = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      // Convert to AIDataSource format
      discoveredDataSources.value = data.tables.map((t: { name: string, description?: string }) => ({
        id: t.name,
        table: t.name,
        name: t.name.charAt(0).toUpperCase() + t.name.slice(1), // Capitalize
        description: t.description,
      }))

      // Fetch all schemas for JOIN support
      await fetchAllSchemas()
    }
    catch (err) {
      console.warn('[TinyPivot] Failed to fetch tables:', err)
      onError?.({
        message: err instanceof Error ? err.message : 'Failed to fetch tables',
        type: 'network',
      })
    }
    finally {
      isLoadingTables.value = false
    }
  }

  /**
   * Fetch schemas for ALL tables at once (enables JOINs)
   */
  async function fetchAllSchemas() {
    if (!config.endpoint)
      return

    try {
      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get-all-schemas' }),
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch all schemas: ${response.statusText}`)
      }

      const data: SchemaResponse = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      // Store all schemas for JOIN support
      allSchemas.value = data.schemas

      // Also populate the individual schemas map
      for (const schema of data.schemas) {
        schemas.value.set(schema.table, schema)
      }
    }
    catch (err) {
      // Schema fetch is optional - continue without it
      console.warn('[TinyPivot] Failed to fetch all schemas:', err)
    }
  }

  // Initialize: fetch tables if using endpoint
  onMounted(() => {
    if (config.endpoint && (!config.dataSources || config.dataSources.length === 0)) {
      fetchTables()
    }
  })

  /**
   * Select a data source and fetch its schema
   */
  async function selectDataSource(dataSourceId: string) {
    const dataSource = effectiveDataSources.value.find(ds => ds.id === dataSourceId)
    if (!dataSource) {
      error.value = `Data source "${dataSourceId}" not found`
      return
    }

    // Update conversation
    conversation.value = setConversationDataSource(conversation.value, dataSourceId)

    // Add system message about selection
    const systemMessage = createAssistantMessage(
      `I'm now connected to **${dataSource.name}**. ${dataSource.description || ''}\n\nWhat would you like to know about this data?`,
    )
    conversation.value = addMessageToConversation(conversation.value, systemMessage)

    // Load data source if custom loader is provided (demo mode)
    if (config.dataSourceLoader) {
      try {
        const { data, schema } = await config.dataSourceLoader(dataSourceId)
        if (schema) {
          schemas.value.set(dataSourceId, schema)
        }
        // Store the loaded data for the data source
        if (data && data.length > 0) {
          lastLoadedData.value = data
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
    else if (config.demoMode) {
      const demoSchema = getDemoSchema(dataSourceId)
      if (demoSchema) {
        schemas.value.set(dataSourceId, demoSchema)
      }
      // Load initial sample data for the preview
      const initialData = getInitialDemoData(dataSourceId)
      if (initialData) {
        lastLoadedData.value = initialData
        onDataLoaded?.({
          data: initialData,
          query: `SELECT * FROM ${dataSource.table} LIMIT 10`,
          dataSourceId,
          rowCount: initialData.length,
        })
      }
    }
    // Use endpoint for schema discovery and sample data
    else if (config.endpoint) {
      await fetchSchema(dataSource)
      await fetchSampleData(dataSource)
    }

    emitConversationUpdate()
  }

  /**
   * Fetch schema from the unified endpoint
   */
  async function fetchSchema(dataSource: AIDataSource) {
    if (!config.endpoint)
      return

    try {
      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get-schema',
          tables: [dataSource.table],
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch schema: ${response.statusText}`)
      }

      const data: SchemaResponse = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      if (data.schemas.length > 0) {
        schemas.value.set(dataSource.id, data.schemas[0])
      }
    }
    catch (err) {
      // Schema fetch is optional - continue without it
      console.warn('Failed to fetch schema:', err)
    }
  }

  /**
   * Fetch sample data (first 100 rows) from the unified endpoint
   */
  async function fetchSampleData(dataSource: AIDataSource) {
    if (!config.endpoint)
      return

    try {
      const sql = `SELECT * FROM ${dataSource.table} LIMIT 100`
      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'query',
          sql,
          table: dataSource.table,
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch sample data: ${response.statusText}`)
      }

      const result = await response.json()

      if (result.error) {
        throw new Error(result.error)
      }

      if (result.data && result.data.length > 0) {
        lastLoadedData.value = result.data
        onDataLoaded?.({
          data: result.data,
          query: sql,
          dataSourceId: dataSource.id,
          rowCount: result.data.length,
        })
      }
    }
    catch (err) {
      // Sample data fetch is optional - continue without it
      console.warn('Failed to fetch sample data:', err)
    }
  }

  /**
   * Send a message to the AI
   */
  async function sendMessage(content: string) {
    if (!content.trim())
      return
    if (isLoading.value)
      return

    error.value = null
    isLoading.value = true

    // Add user message
    const userMessage = createUserMessage(content)
    conversation.value = addMessageToConversation(conversation.value, userMessage)
    emitConversationUpdate()

    try {
      // Handle demo mode
      if (config.demoMode) {
        await handleDemoResponse(content)
        return
      }

      // Check if data source is selected
      if (!conversation.value.dataSourceId) {
        const assistantMessage = createAssistantMessage(
          'Please select a data source first by clicking one of the options above.',
        )
        conversation.value = addMessageToConversation(conversation.value, assistantMessage)
        emitConversationUpdate()
        return
      }

      // Call AI endpoint
      const aiResponse = await callAIEndpoint(content)

      // Check if AI wants to run a query
      const sqlQuery = extractSQLFromResponse(aiResponse)

      if (sqlQuery) {
        // Validate SQL
        const validation = validateSQLSafety(sqlQuery)
        if (!validation.valid) {
          const errorMessage = createAssistantMessage(
            `I generated an invalid query: ${validation.error}. Let me try again with a corrected approach.`,
            { error: validation.error },
          )
          conversation.value = addMessageToConversation(conversation.value, errorMessage)
          emitConversationUpdate()
          return
        }

        // Add AI response with query - the executeQuery will update this message with data
        const aiMessage = createAssistantMessage(aiResponse, { query: sqlQuery })
        conversation.value = addMessageToConversation(conversation.value, aiMessage)
        emitConversationUpdate()

        // Execute query - this will update the last message's metadata with data
        await executeQuery(sqlQuery, aiMessage.id)
      }
      else {
        // Just add AI response
        const aiMessage = createAssistantMessage(aiResponse)
        conversation.value = addMessageToConversation(conversation.value, aiMessage)
        emitConversationUpdate()
      }
    }
    catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'An error occurred'
      error.value = errorMsg

      const errorMessage = createAssistantMessage(
        `Sorry, I encountered an error: ${errorMsg}. Please try again.`,
        { error: errorMsg },
      )
      conversation.value = addMessageToConversation(conversation.value, errorMessage)
      emitConversationUpdate()

      onError?.({
        message: errorMsg,
        type: 'ai',
      })
    }
    finally {
      isLoading.value = false
    }
  }

  /**
   * Handle demo mode responses (canned AI + mock data)
   */
  async function handleDemoResponse(userInput: string) {
    // Simulate loading delay
    await new Promise(resolve => setTimeout(resolve, 800))

    const dataSourceId = conversation.value.dataSourceId

    if (!dataSourceId) {
      const assistantMessage = createAssistantMessage(
        'Please select a data source first by clicking one of the options above.',
      )
      conversation.value = addMessageToConversation(conversation.value, assistantMessage)
      emitConversationUpdate()
      isLoading.value = false
      return
    }

    // Find matching demo response
    const demoTrigger = findDemoResponse(dataSourceId, userInput)

    if (demoTrigger) {
      // Add AI response
      const aiMessage = createAssistantMessage(demoTrigger.response, {
        query: demoTrigger.query,
        rowCount: demoTrigger.mockData?.length,
      })
      conversation.value = addMessageToConversation(conversation.value, aiMessage)
      emitConversationUpdate()

      // Load mock data
      if (demoTrigger.mockData) {
        lastLoadedData.value = demoTrigger.mockData

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
      const aiMessage = createAssistantMessage(defaultResponse)
      conversation.value = addMessageToConversation(conversation.value, aiMessage)
      emitConversationUpdate()
    }

    isLoading.value = false
  }

  /**
   * Call the AI endpoint
   */
  async function callAIEndpoint(userInput: string): Promise<string> {
    if (!config.endpoint) {
      throw new Error('No endpoint configured. Set `endpoint` in AI analyst config.')
    }

    const dataSourceId = conversation.value.dataSourceId

    // Build system prompt using effective data sources
    // Pass allSchemas to enable JOINs with related tables
    const systemPrompt = buildSystemPrompt(
      effectiveDataSources.value,
      schemas.value,
      dataSourceId,
      allSchemas.value.length > 0 ? allSchemas.value : undefined,
    )

    // Get conversation messages for API
    const apiMessages = getMessagesForAPI(conversation.value)

    // Add system prompt and current user message
    const messages = [
      { role: 'user' as const, content: systemPrompt },
      { role: 'assistant' as const, content: 'I understand. I\'m ready to help you analyze the data.' },
      ...apiMessages.slice(0, -1), // Exclude the just-added user message
      { role: 'user' as const, content: userInput },
    ]

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'chat', messages }),
    })

    if (!response.ok) {
      throw new Error(`AI request failed: ${response.statusText}`)
    }

    const data: AIProxyResponse = await response.json()

    if (data.error) {
      throw new Error(data.error)
    }

    return data.content
  }

  /**
   * Execute a SQL query and update the specified message with results
   * @param sql The SQL query to execute
   * @param messageId Optional message ID to update with results (instead of adding new message)
   */
  async function executeQuery(sql: string, messageId?: string) {
    const dataSourceId = conversation.value.dataSourceId
    if (!dataSourceId)
      return

    const dataSource = effectiveDataSources.value.find(ds => ds.id === dataSourceId)
    if (!dataSource)
      return

    const startTime = Date.now()

    try {
      let data: { data?: Record<string, unknown>[], rowCount?: number, truncated?: boolean, error?: string, success?: boolean }

      // Use custom query executor if provided (demo mode)
      if (config.queryExecutor) {
        const result = await config.queryExecutor(sql, dataSource.table)
        data = {
          data: result.data,
          rowCount: result.rowCount,
          truncated: result.truncated,
          error: result.error,
          success: !result.error,
        }
      }
      // Use unified endpoint
      else if (config.endpoint) {
        const response = await fetch(config.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'query',
            sql,
            table: dataSource.table,
          }),
        })

        data = await response.json()
      }
      else {
        throw new Error('No query executor or endpoint configured')
      }

      const duration = Date.now() - startTime

      if (!data.success || data.error) {
        // Add error message
        const errorMessage = createAssistantMessage(
          `The query failed: ${data.error || 'Unknown error'}. Would you like me to try a different approach?`,
          { error: data.error, query: sql },
        )
        conversation.value = addMessageToConversation(conversation.value, errorMessage)
        emitConversationUpdate()

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
        lastLoadedData.value = data.data

        // Update the existing message with data, or add a new one if no messageId
        if (messageId) {
          // Find and update the existing message's metadata with the data
          const updatedMessages = conversation.value.messages.map((msg) => {
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
          conversation.value = {
            ...conversation.value,
            messages: updatedMessages,
            updatedAt: Date.now(),
          }
        }
        else {
          // Fallback: add a new message (shouldn't happen in normal flow)
          const truncatedNote = data.truncated
            ? ` (limited to ${config.maxRows || 10000} rows)`
            : ''
          const successMessage = createAssistantMessage(
            `Retrieved **${data.rowCount} rows**${truncatedNote}.`,
            { query: sql, rowCount: data.rowCount, data: data.data },
          )
          conversation.value = addMessageToConversation(conversation.value, successMessage)
        }
        emitConversationUpdate()

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

      const errorMessage = createAssistantMessage(
        `Failed to execute query: ${errorMsg}`,
        { error: errorMsg, query: sql },
      )
      conversation.value = addMessageToConversation(conversation.value, errorMessage)
      emitConversationUpdate()

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
  }

  /**
   * Load full data for the currently selected data source
   * Returns the full dataset (not limited) for displaying in the grid
   */
  async function loadFullData(): Promise<Record<string, unknown>[] | null> {
    const dataSourceId = conversation.value.dataSourceId
    if (!dataSourceId) {
      return null
    }

    const dataSource = effectiveDataSources.value.find(ds => ds.id === dataSourceId)
    if (!dataSource) {
      return null
    }

    // Use custom data source loader if provided
    if (config.dataSourceLoader) {
      try {
        const { data } = await config.dataSourceLoader(dataSourceId)
        if (data && data.length > 0) {
          return data
        }
      }
      catch (err) {
        console.warn('Failed to load full data:', err)
        onError?.({
          message: err instanceof Error ? err.message : 'Failed to load full data',
          type: 'network',
        })
      }
      return null
    }

    // Use query executor to get all data
    if (config.queryExecutor) {
      try {
        const result = await config.queryExecutor(
          `SELECT * FROM ${dataSource.table}`,
          dataSource.table,
        )
        if (result.data && result.data.length > 0) {
          return result.data
        }
      }
      catch (err) {
        console.warn('Failed to load full data via query:', err)
        onError?.({
          message: err instanceof Error ? err.message : 'Failed to load full data',
          type: 'network',
        })
      }
      return null
    }

    // Use endpoint query action
    if (config.endpoint) {
      try {
        const response = await fetch(config.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'query',
            sql: `SELECT * FROM ${dataSource.table}`,
            table: dataSource.table,
          }),
        })

        if (!response.ok) {
          throw new Error(`Failed to load data: ${response.statusText}`)
        }

        const data = await response.json()
        if (data.data && data.data.length > 0) {
          return data.data
        }
      }
      catch (err) {
        console.warn('Failed to load full data from endpoint:', err)
        onError?.({
          message: err instanceof Error ? err.message : 'Failed to load full data',
          type: 'network',
        })
      }
      return null
    }

    // Demo mode - get initial data
    if (config.demoMode) {
      const initialData = getInitialDemoData(dataSourceId)
      return initialData || null
    }

    return null
  }

  /**
   * Clear the conversation
   */
  function clearConversation() {
    conversation.value = createConversation(config.sessionId)
    error.value = null
    lastLoadedData.value = null
    emitConversationUpdate()
  }

  /**
   * Export conversation for persistence
   */
  function exportConversation(): AIConversation {
    return { ...conversation.value }
  }

  /**
   * Import a conversation
   */
  function importConversation(conv: AIConversation) {
    conversation.value = conv
    emitConversationUpdate()
  }

  /**
   * Emit conversation update event and persist to storage if enabled
   */
  function emitConversationUpdate() {
    saveToStorage(conversation.value)
    onConversationUpdate?.({ conversation: conversation.value })
  }

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
    /** Load full data for the currently selected data source */
    loadFullData,
  }
}
