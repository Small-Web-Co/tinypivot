/**
 * Share Types for TinyPivot Studio
 * Defines types for sharing pages with external users
 */

/**
 * Access level for shared pages
 */
export type ShareAccessLevel = 'view' | 'interact' | 'duplicate'

/**
 * Share visibility options
 */
export type ShareVisibility = 'public' | 'unlisted' | 'password'

/**
 * Settings for how a page can be shared
 */
export interface PageShareSettings {
  /** Whether sharing is enabled for this page */
  enabled: boolean
  /** Access level for viewers */
  accessLevel: ShareAccessLevel
  /** Visibility setting */
  visibility: ShareVisibility
  /** Password (if visibility is 'password') */
  password?: string
  /** Allow embedding in iframes */
  allowEmbed: boolean
  /** Allow viewers to export data */
  allowExport: boolean
  /** Allow viewers to duplicate the page (requires 'duplicate' access) */
  allowDuplicate: boolean
  /** Show author information */
  showAuthor: boolean
  /** Custom branding */
  branding?: ShareBranding
  /** Expiration date for the share */
  expiresAt?: Date
  /** Maximum number of views (null for unlimited) */
  maxViews?: number | null
  /** Domains allowed to embed (empty for all) */
  allowedDomains?: string[]
}

/**
 * Custom branding for shared pages
 */
export interface ShareBranding {
  /** Custom logo URL */
  logoUrl?: string
  /** Custom favicon URL */
  faviconUrl?: string
  /** Hide TinyPivot branding */
  hideTinyPivotBranding?: boolean
  /** Custom footer text */
  footerText?: string
  /** Custom CSS */
  customCSS?: string
}

/**
 * A share link for a page
 */
export interface PageShare {
  /** Unique share token (used in URL) */
  token: string
  /** Page ID being shared */
  pageId: string
  /** Share settings */
  settings: PageShareSettings
  /** Number of times this share has been viewed */
  viewCount: number
  /** Timestamp when the share was created */
  createdAt: Date
  /** User ID who created the share */
  createdBy?: string
  /** Timestamp when the share was last accessed */
  lastAccessedAt?: Date
  /** Whether the share is currently active */
  active: boolean
  /** Reason for deactivation (if applicable) */
  deactivationReason?: 'expired' | 'max_views' | 'revoked' | 'page_deleted'
}

/**
 * Analytics for a shared page
 */
export interface ShareAnalytics {
  /** Share token */
  token: string
  /** Total view count */
  totalViews: number
  /** Unique visitor count (based on fingerprinting) */
  uniqueVisitors: number
  /** Views over time */
  viewsOverTime: Array<{
    date: string
    views: number
    uniqueVisitors: number
  }>
  /** Top referring domains */
  topReferrers: Array<{
    domain: string
    count: number
  }>
  /** Geographic distribution (country codes) */
  geoDistribution?: Array<{
    country: string
    count: number
  }>
  /** Device distribution */
  deviceDistribution?: {
    desktop: number
    mobile: number
    tablet: number
  }
}

/**
 * Generate a secure share token
 * Uses cryptographically secure random bytes
 */
export function generateShareToken(): string {
  // Check if crypto.randomUUID is available (modern browsers and Node.js)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    // Use UUID v4 without hyphens for cleaner URLs
    return crypto.randomUUID().replace(/-/g, '')
  }

  // Fallback for environments without crypto.randomUUID
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  // Final fallback (less secure, for testing only)
  return `${Date.now().toString(36)}${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`
}

/**
 * Validate a share token format
 */
export function isValidShareToken(token: string): boolean {
  // Token should be 32 hex characters (from UUID without hyphens)
  // or match our fallback format
  return /^[a-f0-9]{32}$/.test(token) || /^[a-z0-9]{20,}$/.test(token)
}

/**
 * Create default share settings
 */
export function createDefaultShareSettings(): PageShareSettings {
  return {
    enabled: true,
    accessLevel: 'view',
    visibility: 'unlisted',
    allowEmbed: false,
    allowExport: false,
    allowDuplicate: false,
    showAuthor: true,
  }
}

/**
 * Check if a share is currently valid (not expired, not over view limit)
 */
export function isShareValid(share: PageShare): boolean {
  if (!share.active) {
    return false
  }

  // Check expiration
  if (share.settings.expiresAt && new Date() > share.settings.expiresAt) {
    return false
  }

  // Check view limit
  if (share.settings.maxViews !== null && share.settings.maxViews !== undefined) {
    if (share.viewCount >= share.settings.maxViews) {
      return false
    }
  }

  return true
}
