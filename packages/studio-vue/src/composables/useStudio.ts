import type { DatasourceConfig, StorageAdapter } from '@smallwebco/tinypivot-studio'
/**
 * Vue Composables for TinyPivot Studio
 * Provides configuration context using Vue's provide/inject API
 */
import type { ComputedRef, InjectionKey } from 'vue'
import { computed, inject, provide } from 'vue'

/**
 * Configuration options for TinyPivot Studio
 */
export interface StudioConfig {
  /** User ID from your auth system */
  userId?: string
  /** Storage adapter for persisting pages and widgets */
  storage?: StorageAdapter
  /** Data source configuration */
  datasource?: DatasourceConfig
  /** AI Analyst configuration */
  aiAnalyst?: {
    endpoint: string
    apiKey?: string
  }
  /** Cache configuration */
  cache?: {
    enabled: boolean
    maxAge?: '1h' | '24h' | '1d' | '1w'
    storage?: 'indexeddb' | 'server'
  }
  /** Enable sample data mode for demos */
  sampleData?: boolean
}

/**
 * Studio context provided by provideStudio
 */
export interface StudioContext {
  /** Current user ID */
  userId: ComputedRef<string | null>
  /** Storage adapter for persistence */
  storage: StorageAdapter | null
  /** Data source configuration */
  datasource: ComputedRef<DatasourceConfig | null>
  /** AI Analyst configuration */
  aiAnalyst: ComputedRef<{ endpoint: string, apiKey?: string } | null>
  /** Cache configuration */
  cache: ComputedRef<StudioConfig['cache'] | null>
  /** Whether the studio is fully configured */
  isConfigured: ComputedRef<boolean>
}

/** Injection key for the studio context */
const StudioKey: InjectionKey<StudioContext> = Symbol('TinyPivotStudio')

/**
 * Provide studio configuration to child components
 * Call this in the root component setup
 *
 * @example
 * ```vue
 * <script setup>
 * import { provideStudio } from '@smallwebco/tinypivot-studio-vue'
 *
 * provideStudio({
 *   userId: 'user-123',
 *   datasource: { ... }
 * })
 * </script>
 * ```
 */
export function provideStudio(config: StudioConfig): StudioContext {
  const context: StudioContext = {
    userId: computed(() => config.userId ?? null),
    storage: config.storage ?? null,
    datasource: computed(() => config.datasource ?? null),
    aiAnalyst: computed(() => config.aiAnalyst ?? null),
    cache: computed(() => config.cache ?? null),
    isConfigured: computed(() => Boolean(config.userId && config.datasource)),
  }

  provide(StudioKey, context)
  return context
}

/**
 * Access the studio context in a child component
 * Must be called within a component wrapped by TinyPivotStudio
 *
 * @example
 * ```vue
 * <script setup>
 * import { useStudio } from '@smallwebco/tinypivot-studio-vue'
 *
 * const { userId, storage, isConfigured } = useStudio()
 * </script>
 * ```
 */
export function useStudio(): StudioContext {
  const context = inject(StudioKey)
  if (!context) {
    throw new Error('useStudio must be used within a TinyPivotStudio component or after provideStudio() is called')
  }
  return context
}
