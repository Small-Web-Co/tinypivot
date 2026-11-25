/**
 * Vitest Test Setup
 * Global setup for all unit/integration tests
 */

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi } from 'vitest'

// The MCP server saves every pull to history under XDG_DATA_HOME. Point it at a throwaway
// folder so no test writes into the developer's real data folder.
process.env.XDG_DATA_HOME = mkdtempSync(join(tmpdir(), 'tinypivot-test-data-'))
process.env.TINYPIVOT_TELEMETRY = '0'

// Mock console.warn to reduce noise in tests
vi.spyOn(console, 'warn').mockImplementation(() => {})
