/**
 * ID Generation Utilities
 * Functions for generating unique identifiers
 */

/**
 * Generate a unique ID using timestamp and random characters
 * @param prefix - Optional prefix for the ID
 * @returns A unique string identifier
 */
export function generateId(prefix?: string): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 9)
  const id = `${timestamp}-${random}`
  return prefix ? `${prefix}_${id}` : id
}

/**
 * Generate a UUID v4 format identifier
 * Uses crypto.randomUUID when available, otherwise falls back to manual generation
 * @returns A UUID v4 string (e.g., "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx")
 */
export function generateUUID(): string {
  // Use crypto.randomUUID if available (Node.js 19+, modern browsers)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  // Fallback to manual UUID v4 generation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
