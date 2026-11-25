/**
 * Vitest Test Setup
 * Global setup for all unit/integration tests
 */

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi } from 'vitest'

// The MCP server saves every pull to history under XDG_DATA_HOME, and the chosen theme to
// preferences under XDG_CONFIG_HOME. Point both at throwaway folders so no test writes into the
// developer's real ones (a test that sets a theme would otherwise change theirs).
process.env.XDG_DATA_HOME = mkdtempSync(join(tmpdir(), 'tinypivot-test-data-'))
process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), 'tinypivot-test-config-'))
process.env.TINYPIVOT_TELEMETRY = '0'

// Mock console.warn to reduce noise in tests
vi.spyOn(console, 'warn').mockImplementation(() => {})
