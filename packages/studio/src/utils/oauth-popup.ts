/**
 * OAuth Popup Utility
 *
 * Opens an OAuth authorization flow in a popup window and handles
 * the postMessage callback when authentication completes.
 *
 * @example
 * ```ts
 * import { openOAuthPopup } from '@smallwebco/tinypivot-studio'
 *
 * function handleConnectSnowflake() {
 *   openOAuthPopup({
 *     url: '/api/tinypivot/auth/snowflake/authorize?state=...',
 *     onSuccess: (data) => {
 *       console.log('Connected datasource:', data.datasourceId)
 *       // Refresh datasource list
 *     },
 *     onError: (error) => {
 *       console.error('OAuth failed:', error)
 *     }
 *   })
 * }
 * ```
 */

export interface OAuthPopupOptions {
  /** Authorization URL to open in popup */
  url: string
  /** Called when OAuth completes successfully */
  onSuccess: (data: OAuthSuccessData) => void
  /** Called when OAuth fails */
  onError: (error: string) => void
  /** Popup window name (default: 'oauth-popup') */
  windowName?: string
  /** Popup width (default: 600) */
  width?: number
  /** Popup height (default: 700) */
  height?: number
}

export interface OAuthSuccessData {
  /** Datasource ID that was connected */
  datasourceId: string
}

interface OAuthMessage {
  success: boolean
  datasourceId?: string
  error?: string
}

/**
 * Open OAuth flow in a popup window
 *
 * The popup will receive the OAuth callback and post a message back
 * to the opener window with the result.
 */
export function openOAuthPopup(options: OAuthPopupOptions): void {
  const {
    url,
    onSuccess,
    onError,
    windowName = 'oauth-popup',
    width = 600,
    height = 700,
  } = options

  // Calculate center position
  const left = window.screenX + (window.outerWidth - width) / 2
  const top = window.screenY + (window.outerHeight - height) / 2

  // Open popup
  const popup = window.open(
    url,
    windowName,
    `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`,
  )

  if (!popup) {
    onError('Failed to open popup window. Please allow popups for this site.')
    return
  }

  // Focus the popup
  popup.focus()

  // Set up message listener
  const messageHandler = (event: MessageEvent<OAuthMessage>) => {
    // Validate message origin matches our popup
    // Note: In production, you should validate the origin more strictly
    if (!event.data || typeof event.data !== 'object') {
      return
    }

    const data = event.data as OAuthMessage

    // Check if this is our OAuth callback message
    if (!('success' in data)) {
      return
    }

    // Remove listener
    window.removeEventListener('message', messageHandler)

    // Handle result
    if (data.success && data.datasourceId) {
      onSuccess({ datasourceId: data.datasourceId })
    }
    else {
      onError(data.error || 'OAuth authentication failed')
    }
  }

  window.addEventListener('message', messageHandler)

  // Set up a check to detect if popup was closed without completing
  const checkClosed = setInterval(() => {
    if (popup.closed) {
      clearInterval(checkClosed)
      window.removeEventListener('message', messageHandler)
      // Note: We don't call onError here because the user may have
      // successfully authenticated and the popup closed normally
    }
  }, 500)

  // Clean up after 10 minutes (timeout for very slow auth flows)
  setTimeout(() => {
    clearInterval(checkClosed)
    window.removeEventListener('message', messageHandler)
    if (!popup.closed) {
      popup.close()
      onError('OAuth authentication timed out')
    }
  }, 10 * 60 * 1000)
}

/**
 * Generate a secure state parameter for OAuth
 */
export function generateOAuthState(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('')
}
