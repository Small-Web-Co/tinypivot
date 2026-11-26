import { afterEach, describe, expect, it, vi } from 'vitest'
import { plans } from '../../demo/site/pricing'
import { isLicenseExpired, parseLicenseKey } from '../../packages/core/src/license'
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
    // What Claude Code may pass when the option is left empty.
    const placeholder = ['$', '{user_config.license_key}'].join('')
    vi.stubEnv('TINYPIVOT_LICENSE_KEY', '')
    vi.stubEnv('CLAUDE_PLUGIN_OPTION_LICENSE_KEY', placeholder)
    expect(resolveLicenseKey()).not.toBe(placeholder)
  })
})

describe('license key parsing, expiry & MCP pricing invariants', () => {
  it('parses valid key structure and detects expired dates while keeping 20991231 perpetual', () => {
    const parsed = parseLicenseKey('TP-MCPP-abc-def_123-20991231')
    expect(parsed).toEqual({
      typeCode: 'MCPP',
      signature: 'abc-def_123',
      expiry: '20991231',
      payload: 'TP-MCPP-20991231',
    })
    expect(parseLicenseKey('not-a-key')).toBeNull()
    expect(isLicenseExpired('20991231', new Date('2100-01-01T00:00:00Z'))).toBe(false)
    expect(isLicenseExpired('20250101', new Date('2026-01-01T00:00:00Z'))).toBe(true)
    expect(isLicenseExpired('20270101', new Date('2026-01-01T00:00:00Z'))).toBe(false)
  })

  it('offers Yearly and Lifetime MCP plans only (no monthly plans)', () => {
    const optionIds = plans.mcp.flatMap(p => p.options.map(o => o.id))
    expect(optionIds).toEqual(['free', 'mcp_pro_yearly', 'mcp_pro_lifetime', 'mcp_team_yearly'])
  })
})
