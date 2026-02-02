import type { DatasourceConfig, StorageAdapter } from '@smallwebco/tinypivot-studio'
/**
 * React Context for TinyPivot Studio
 * Provides configuration and state to all Studio components
 */
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'

/**
 * Configuration options for the Studio provider
 */
export interface StudioConfig {
  /** User ID from your authentication system */
  userId?: string
  /** Storage adapter for persisting pages, widgets, and versions */
  storage?: StorageAdapter
  /** Datasource configuration for data fetching */
  datasource?: DatasourceConfig
  /** API endpoint for server-side operations (datasources, queries) */
  apiEndpoint?: string
  /** User key for credential encryption (required for server-side datasources) */
  userKey?: string
  /** AI Analyst configuration for AI-powered features */
  aiAnalyst?: {
    endpoint: string
    apiKey?: string
  }
  /** Cache configuration for improved performance */
  cache?: {
    enabled: boolean
    maxAge?: '1h' | '24h' | '1d' | '1w'
    storage?: 'indexeddb' | 'server'
  }
  /** Enable sample data mode for demos */
  sampleData?: boolean
}

/**
 * Context value exposed to consuming components
 */
export interface StudioContextValue {
  /** User ID from authentication system, or null if not provided */
  userId: string | null
  /** Storage adapter instance, or null if not provided */
  storage: StorageAdapter | null
  /** Datasource configuration, or null if not provided */
  datasource: DatasourceConfig | null
  /** API endpoint for server-side operations, or null if not provided */
  apiEndpoint: string | null
  /** User key for credential encryption, or null if not provided */
  userKey: string | null
  /** AI Analyst configuration, or null if not provided */
  aiAnalyst: { endpoint: string, apiKey?: string } | null
  /** Cache configuration, or null if not provided */
  cache: StudioConfig['cache'] | null
  /** Whether the studio is fully configured (has userId and datasource) */
  isConfigured: boolean
  /** Currently selected datasource ID for query execution */
  selectedDatasourceId: string | null
  /** Set the selected datasource */
  setSelectedDatasourceId: (id: string | null) => void
}

const StudioContext = createContext<StudioContextValue | null>(null)

/**
 * Props for the StudioProvider component
 */
export interface StudioProviderProps {
  /** Child components that will have access to the studio context */
  children: ReactNode
  /** Studio configuration options */
  config: StudioConfig
}

/**
 * Provider component that makes studio configuration available to all child components.
 */
export function StudioProvider({ children, config }: StudioProviderProps) {
  const [selectedDatasourceId, setSelectedDatasourceIdState] = useState<string | null>(null)

  const setSelectedDatasourceId = useCallback((id: string | null) => {
    setSelectedDatasourceIdState(id)
  }, [])

  const value = useMemo<StudioContextValue>(() => {
    return {
      userId: config.userId ?? null,
      storage: config.storage ?? null,
      datasource: config.datasource ?? null,
      apiEndpoint: config.apiEndpoint ?? null,
      userKey: config.userKey ?? null,
      aiAnalyst: config.aiAnalyst ?? null,
      cache: config.cache ?? null,
      isConfigured: Boolean(config.userId && config.datasource),
      selectedDatasourceId,
      setSelectedDatasourceId,
    }
  }, [config, selectedDatasourceId, setSelectedDatasourceId])

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>
}

/**
 * Hook to access the studio context.
 * Must be used within a StudioProvider.
 *
 * @throws Error if used outside of a StudioProvider
 */
export function useStudioContext(): StudioContextValue {
  const context = useContext(StudioContext)
  if (!context) {
    throw new Error('useStudioContext must be used within a StudioProvider')
  }
  return context
}
