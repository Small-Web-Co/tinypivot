import type { DatasourceConfig, StorageAdapter } from '@smallwebco/tinypivot-studio'
/**
 * React Context for TinyPivot Studio
 * Provides configuration and state to all Studio components
 */
import { createContext, type ReactNode, useContext, useMemo } from 'react'

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
  /** AI Analyst configuration, or null if not provided */
  aiAnalyst: { endpoint: string, apiKey?: string } | null
  /** Cache configuration, or null if not provided */
  cache: StudioConfig['cache'] | null
  /** Whether the studio is fully configured (has userId and datasource) */
  isConfigured: boolean
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
 *
 * @example
 * ```tsx
 * import { StudioProvider } from '@smallwebco/tinypivot-studio-react'
 *
 * function App() {
 *   return (
 *     <StudioProvider config={{
 *       userId: user.id,
 *       storage: indexedDbAdapter,
 *       datasource: { id: 'main', name: 'Main DB', type: 'postgres', ... }
 *     }}>
 *       <YourApp />
 *     </StudioProvider>
 *   )
 * }
 * ```
 */
export function StudioProvider({ children, config }: StudioProviderProps) {
  const value = useMemo<StudioContextValue>(() => {
    return {
      userId: config.userId ?? null,
      storage: config.storage ?? null,
      datasource: config.datasource ?? null,
      aiAnalyst: config.aiAnalyst ?? null,
      cache: config.cache ?? null,
      isConfigured: Boolean(config.userId && config.datasource),
    }
  }, [config])

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>
}

/**
 * Hook to access the studio context.
 * Must be used within a StudioProvider.
 *
 * @throws Error if used outside of a StudioProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { userId, storage, isConfigured } = useStudioContext()
 *
 *   if (!isConfigured) {
 *     return <SetupWizard />
 *   }
 *
 *   return <Dashboard />
 * }
 * ```
 */
export function useStudioContext(): StudioContextValue {
  const context = useContext(StudioContext)
  if (!context) {
    throw new Error('useStudioContext must be used within a StudioProvider')
  }
  return context
}
