/**
 * Convenience hook for accessing studio configuration
 */
import { useStudioContext } from '../context'

/**
 * Convenience hook for accessing common studio configuration values.
 * This is a simplified wrapper around useStudioContext for common use cases.
 *
 * @example
 * ```tsx
 * function MyWidget() {
 *   const { userId, datasource, isConfigured } = useStudio()
 *
 *   if (!isConfigured) {
 *     return <div>Please configure the studio</div>
 *   }
 *
 *   return <DataVisualization datasource={datasource} />
 * }
 * ```
 */
export function useStudio() {
  const context = useStudioContext()

  return {
    userId: context.userId,
    storage: context.storage,
    datasource: context.datasource,
    aiAnalyst: context.aiAnalyst,
    isConfigured: context.isConfigured,
  }
}
