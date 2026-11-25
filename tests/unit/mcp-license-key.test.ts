import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveLicenseKey } from '../../packages/mcp/src/server'

describe('resolveLicenseKey', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reads the Claude plugin option when TINYPIVOT_LICENSE_KEY is not set', () => {
    vi.stubEnv('TINYPIVOT_LICENSE_KEY', '')
    vi.stubEnv('CLAUDE_PLUGIN_OPTION_LICENSE_KEY', ' TP-MCPP-example ')
    expect(resolveLicenseKey()).toBe('TP-MCPP-example')
  })

  it('prefers TINYPIVOT_LICENSE_KEY, then an explicit key over both', () => {
    vi.stubEnv('TINYPIVOT_LICENSE_KEY', 'TP-MCPT-from-init')
    vi.stubEnv('CLAUDE_PLUGIN_OPTION_LICENSE_KEY', 'TP-MCPP-from-plugin')
    expect(resolveLicenseKey()).toBe('TP-MCPT-from-init')
    expect(resolveLicenseKey('TP-MCPP-explicit')).toBe('TP-MCPP-explicit')
  })

  it('treats an unexpanded plugin placeholder as no key', () => {
    vi.stubEnv('TINYPIVOT_LICENSE_KEY', '')
    vi.stubEnv('CLAUDE_PLUGIN_OPTION_LICENSE_KEY', '${user_config.license_key}')
    expect(resolveLicenseKey()).not.toBe('${user_config.license_key}')
  })
})
