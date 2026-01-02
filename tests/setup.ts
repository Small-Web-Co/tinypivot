/**
 * Vitest Test Setup
 * Global setup for all unit/integration tests
 */

import { vi } from 'vitest'

// Mock console.warn to reduce noise in tests
vi.spyOn(console, 'warn').mockImplementation(() => {})
