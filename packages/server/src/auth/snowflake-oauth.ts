/**
 * Snowflake OAuth Authentication
 *
 * Implements OAuth 2.0 flow for Snowflake Browser SSO authentication.
 *
 * Prerequisites:
 * 1. Enable OAuth in Snowflake account
 * 2. Create OAuth integration: CREATE SECURITY INTEGRATION ...
 * 3. Register redirect URI: https://your-app.com/api/tinypivot/auth/snowflake/callback
 *
 * @example
 * ```ts
 * const oauth = createSnowflakeOAuth({
 *   account: 'xy12345.us-east-1',
 *   clientId: 'my-client-id',
 *   clientSecret: 'my-client-secret',
 *   redirectUri: 'https://app.example.com/api/tinypivot/auth/snowflake/callback'
 * })
 *
 * // Generate auth URL for popup
 * const url = oauth.getAuthorizationUrl('state-token')
 *
 * // Exchange code for tokens after callback
 * const tokens = await oauth.exchangeCodeForTokens(code)
 * ```
 */

export interface SnowflakeOAuthConfig {
  /** Snowflake account identifier (e.g., 'xy12345.us-east-1') */
  account: string
  /** OAuth client ID from Snowflake security integration */
  clientId: string
  /** OAuth client secret from Snowflake security integration */
  clientSecret: string
  /** Redirect URI registered in Snowflake (must match exactly) */
  redirectUri: string
  /** OAuth scopes (default: 'session:role:PUBLIC' or your role) */
  scopes?: string[]
}

export interface TokenResponse {
  /** Access token for API calls */
  accessToken: string
  /** Refresh token for getting new access tokens */
  refreshToken: string
  /** Token type (usually 'Bearer') */
  tokenType: string
  /** Seconds until access token expires */
  expiresIn: number
  /** Granted scopes */
  scope: string
  /** Calculated expiration date */
  expiresAt: Date
}

export interface SnowflakeOAuth {
  /** Generate authorization URL for user redirect */
  getAuthorizationUrl: (state: string) => string

  /** Exchange authorization code for tokens */
  exchangeCodeForTokens: (code: string) => Promise<TokenResponse>

  /** Refresh access token using refresh token */
  refreshAccessToken: (refreshToken: string) => Promise<TokenResponse>

  /** Create HTML callback page that posts message to parent window */
  createCallbackHtml: (result: { success: boolean, datasourceId?: string, error?: string }) => string
}

/**
 * Build Snowflake OAuth URL base
 */
function getOAuthBaseUrl(account: string): string {
  // Account can be just identifier or full URL
  // e.g., 'xy12345' or 'xy12345.us-east-1' or 'xy12345.us-east-1.aws'
  const accountBase = account.split('.')[0]
  const region = account.includes('.') ? account.substring(account.indexOf('.') + 1) : 'us-west-2'

  return `https://${accountBase}.${region}.snowflakecomputing.com`
}

/**
 * Create Snowflake OAuth helper
 */
export function createSnowflakeOAuth(config: SnowflakeOAuthConfig): SnowflakeOAuth {
  const { account, clientId, clientSecret, redirectUri, scopes = ['session:role:PUBLIC'] } = config

  const baseUrl = getOAuthBaseUrl(account)

  return {
    getAuthorizationUrl(state: string): string {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: scopes.join(' '),
        state,
      })

      return `${baseUrl}/oauth/authorize?${params.toString()}`
    },

    async exchangeCodeForTokens(code: string): Promise<TokenResponse> {
      const tokenUrl = `${baseUrl}/oauth/token-request`

      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      })

      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`,
        },
        body: body.toString(),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Token exchange failed: ${response.status} ${errorText}`)
      }

      const data = await response.json() as {
        access_token: string
        refresh_token: string
        token_type: string
        expires_in: number
        scope: string
      }

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        tokenType: data.token_type,
        expiresIn: data.expires_in,
        scope: data.scope,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
      }
    },

    async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
      const tokenUrl = `${baseUrl}/oauth/token-request`

      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      })

      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`,
        },
        body: body.toString(),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Token refresh failed: ${response.status} ${errorText}`)
      }

      const data = await response.json() as {
        access_token: string
        refresh_token: string
        token_type: string
        expires_in: number
        scope: string
      }

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        tokenType: data.token_type,
        expiresIn: data.expires_in,
        scope: data.scope,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
      }
    },

    createCallbackHtml(result: { success: boolean, datasourceId?: string, error?: string }): string {
      // HTML page that posts message to parent window and closes itself
      const messageData = JSON.stringify(result)

      return `<!DOCTYPE html>
<html>
<head>
  <title>Snowflake Authentication</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: #f5f5f5;
    }
    .message {
      text-align: center;
      padding: 40px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .success { color: #22c55e; }
    .error { color: #ef4444; }
    p { color: #666; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="message">
    ${result.success
        ? '<h2 class="success">✓ Connected</h2><p>You can close this window.</p>'
        : `<h2 class="error">✗ Connection Failed</h2><p>${escapeHtml(result.error || 'Unknown error')}</p>`
    }
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage(${messageData}, '*');
      setTimeout(() => window.close(), 2000);
    }
  </script>
</body>
</html>`
    },
  }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Generate a secure random state parameter
 */
export function generateOAuthState(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Create OAuth callback request handler
 *
 * @example
 * ```ts
 * // Next.js App Router
 * import { createSnowflakeCallbackHandler } from '@smallwebco/tinypivot-server'
 *
 * export const GET = createSnowflakeCallbackHandler({
 *   oauthConfig: { ... },
 *   onSuccess: async ({ tokens, state }) => {
 *     // Store tokens, update datasource
 *     return { datasourceId: 'ds-123' }
 *   },
 *   onError: async (error) => {
 *     console.error('OAuth failed:', error)
 *   }
 * })
 * ```
 */
export interface CallbackHandlerOptions {
  /** OAuth configuration */
  oauthConfig: SnowflakeOAuthConfig
  /** Called on successful token exchange */
  onSuccess: (data: { tokens: TokenResponse, state: string }) => Promise<{ datasourceId: string }>
  /** Called on error */
  onError?: (error: Error) => Promise<void>
}

export function createSnowflakeCallbackHandler(options: CallbackHandlerOptions): (req: Request) => Promise<Response> {
  const { oauthConfig, onSuccess, onError } = options
  const oauth = createSnowflakeOAuth(oauthConfig)

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const error = url.searchParams.get('error')
    const errorDescription = url.searchParams.get('error_description')

    // Handle OAuth error response
    if (error) {
      const errorMessage = errorDescription || error
      await onError?.(new Error(errorMessage))

      return new Response(oauth.createCallbackHtml({ success: false, error: errorMessage }), {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    }

    // Validate required params
    if (!code || !state) {
      const errorMessage = 'Missing code or state parameter'
      await onError?.(new Error(errorMessage))

      return new Response(oauth.createCallbackHtml({ success: false, error: errorMessage }), {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    }

    try {
      // Exchange code for tokens
      const tokens = await oauth.exchangeCodeForTokens(code)

      // Call success handler to store tokens
      const result = await onSuccess({ tokens, state })

      return new Response(oauth.createCallbackHtml({ success: true, datasourceId: result.datasourceId }), {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    }
    catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      await onError?.(err instanceof Error ? err : new Error(errorMessage))

      return new Response(oauth.createCallbackHtml({ success: false, error: errorMessage }), {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    }
  }
}
