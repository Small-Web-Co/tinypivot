import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import mcpPluginConfig from '../../packages/mcp/.mcp.json'
import { MCP_NPX_SPEC, runInitCommand, TINYPIVOT_CLAUDE_RULE_BLOCK, TINYPIVOT_PI_RULE_BLOCK } from '../../packages/mcp/src/init'
import { PI_ENTRY_EXTRAS } from '../../packages/mcp/src/pi-extension'
import { bumpMcpVersion, nextVersion } from '../../scripts/bump-mcp-version.mjs'
import { PLUGIN_FILES, syncPluginRepo } from '../../scripts/sync-plugin-repo.mjs'

describe('init writes configs that fetch the newest release', () => {
  let home: string

  // Every location init resolves must land in the throwaway home, on any OS and CI runner.
  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'tinypivot-init-'))
    vi.stubEnv('HOME', home)
    vi.stubEnv('USERPROFILE', home)
    vi.stubEnv('XDG_CONFIG_HOME', path.join(home, '.config'))
    vi.stubEnv('APPDATA', path.join(home, 'AppData', 'Roaming'))
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    await fs.rm(home, { recursive: true, force: true })
  })

  it('pins the npx spec to the latest dist-tag', () => {
    expect(MCP_NPX_SPEC).toBe('@smallwebco/tinypivot-mcp@latest')
  })

  it('writes the tagged spec for JSON, OpenCode and Codex harnesses', async () => {
    await runInitCommand(['--targets=cursor,opencode,codex', '--no-rules'])

    const cursor = JSON.parse(await fs.readFile(path.join(home, '.cursor', 'mcp.json'), 'utf8'))
    expect(cursor.mcpServers.tinypivot).toMatchObject({ command: 'npx', args: ['-y', MCP_NPX_SPEC] })

    const openCode = JSON.parse(await fs.readFile(path.join(home, '.config', 'opencode', 'opencode.json'), 'utf8'))
    expect(openCode.mcp.tinypivot.command).toEqual(['npx', '-y', MCP_NPX_SPEC])

    const codex = await fs.readFile(path.join(home, '.codex', 'config.toml'), 'utf8')
    expect(codex).toContain(`args = ["-y", "${MCP_NPX_SPEC}"]`)
  })

  it('installs the OpenCode Studio plugin next to the OpenCode config', async () => {
    const { buildOpenCodePluginSource } = await import('../../packages/mcp/src/opencode-plugin')
    await runInitCommand(['--targets=opencode', '--no-rules'])

    const plugin = await fs.readFile(path.join(home, '.config', 'opencode', 'plugins', 'tinypivot.js'), 'utf8')
    expect(plugin).toBe(buildOpenCodePluginSource())
    // Other harnesses' extensions are left alone.
    await expect(fs.access(path.join(home, '.pi', 'agent', 'extensions', 'tinypivot.ts'))).rejects.toThrow()
  })

  it('wires the Antigravity CLI separately from the Antigravity IDE', async () => {
    await fs.mkdir(path.join(home, '.gemini', 'antigravity-cli'), { recursive: true })

    await runInitCommand(['--no-rules'])

    const cli = JSON.parse(await fs.readFile(path.join(home, '.gemini', 'config', 'mcp_config.json'), 'utf8'))
    expect(cli.mcpServers.tinypivot).toMatchObject({ command: 'npx', args: ['-y', MCP_NPX_SPEC] })
    // The IDE was not detected, so its config is left alone.
    await expect(fs.access(path.join(home, '.gemini', 'antigravity', 'mcp_config.json'))).rejects.toThrow()
  })

  it('upgrades a config written by an older init', async () => {
    const configPath = path.join(home, '.cursor', 'mcp.json')
    await fs.mkdir(path.dirname(configPath), { recursive: true })
    await fs.writeFile(configPath, JSON.stringify({
      mcpServers: {
        tinypivot: { command: 'npx', args: ['-y', '@smallwebco/tinypivot-mcp'], env: { DATABASE_URL: 'postgres://example' } },
        other: { command: 'node', args: ['other.js'] },
      },
    }))

    await runInitCommand(['--targets=cursor', '--no-rules'])

    const { mcpServers } = JSON.parse(await fs.readFile(configPath, 'utf8'))
    expect(mcpServers.tinypivot.args).toEqual(['-y', MCP_NPX_SPEC])
    expect(mcpServers.tinypivot.env).toEqual({ DATABASE_URL: 'postgres://example' })
    expect(mcpServers.other).toEqual({ command: 'node', args: ['other.js'] })
  })

  it('declares TinyPivot\'s data tools to pi directly, keeping exposure the user chose', async () => {
    const configPath = path.join(home, '.pi', 'agent', 'mcp.json')
    await fs.mkdir(path.dirname(configPath), { recursive: true })
    await fs.writeFile(configPath, JSON.stringify({ mcpServers: { tinypivot: { command: 'npx', args: ['-y', MCP_NPX_SPEC], toolExposure: { query: 'hidden' } } } }))

    await runInitCommand(['--targets=pi', '--no-rules'])

    const { tinypivot } = JSON.parse(await fs.readFile(configPath, 'utf8')).mcpServers
    expect(tinypivot.description).toBe(PI_ENTRY_EXTRAS.description)
    expect(tinypivot.toolExposure).toEqual({ ...PI_ENTRY_EXTRAS.toolExposure, query: 'hidden' })
  })

  it('tells agents to show figures through TinyPivot, not Markdown tables', () => {
    expect(TINYPIVOT_CLAUDE_RULE_BLOCK).toMatch(/ranking.*instead of a Markdown table/)
    expect(TINYPIVOT_PI_RULE_BLOCK).toMatch(/ranking.*instead of a Markdown table/)
  })
})

describe('plugin manifests for each agent marketplace', () => {
  const read = async (file: string) => JSON.parse(await fs.readFile(path.join(__dirname, '../..', file), 'utf8'))

  it('start the same npx spec in every harness but Claude Code', async () => {
    // Cursor (mcp.json), Antigravity (mcp_config.json), Gemini CLI.
    for (const file of ['packages/mcp/mcp.json', 'packages/mcp/mcp_config.json', 'gemini-extension.json']) {
      const { tinypivot } = (await read(file)).mcpServers
      expect({ file, command: tinypivot.command, args: tinypivot.args }).toEqual({ file, command: 'npx', args: ['-y', MCP_NPX_SPEC] })
    }
  })

  it('carry the MCP package license', async () => {
    const { license } = await read('packages/mcp/package.json')
    for (const file of ['packages/mcp/.claude-plugin/plugin.json', 'packages/mcp/.cursor-plugin/plugin.json', 'packages/mcp/.codex-plugin/plugin.json', 'packages/mcp/plugin.json'])
      expect({ file, license: (await read(file)).license }).toEqual({ file, license })
    expect((await read('.claude-plugin/marketplace.json')).plugins[0].license).toBe(license)
  })

  // Claude's plugin directory rejects an unpinned npx launcher, so the Claude plugin starts the
  // exact release it was listed with; scripts/bump-mcp-version.mjs moves the pin with each release.
  it('pin the Claude Code plugin to the package version', async () => {
    const { version } = await read('packages/mcp/package.json')
    expect(mcpPluginConfig.mcpServers.tinypivot).toMatchObject({ command: 'npx', args: ['-y', `@smallwebco/tinypivot-mcp@${version}`] })
  })

  // The directory only accepts a user option handed over as CLAUDE_PLUGIN_OPTION_<KEY>.
  it('hand the Claude plugin\'s license_key option to the server under the directory\'s name', async () => {
    const plugin = await read('packages/mcp/.claude-plugin/plugin.json')
    expect(plugin.userConfig.license_key).toMatchObject({ type: 'string', sensitive: true })
    expect(mcpPluginConfig.mcpServers.tinypivot.env).toEqual({ CLAUDE_PLUGIN_OPTION_LICENSE_KEY: ['$', '{user_config.license_key}'].join('') })
  })

  it('carry the MCP package version, so a release updates every listing', async () => {
    const { version } = await read('packages/mcp/package.json')
    const versions = {
      'claude plugin': (await read('packages/mcp/.claude-plugin/plugin.json')).version,
      'claude marketplace': (await read('.claude-plugin/marketplace.json')).plugins[0].version,
      'cursor plugin': (await read('packages/mcp/.cursor-plugin/plugin.json')).version,
      'codex plugin': (await read('packages/mcp/.codex-plugin/plugin.json')).version,
      'antigravity plugin': (await read('packages/mcp/plugin.json')).version,
      'gemini extension': (await read('gemini-extension.json')).version,
      'mcp registry': (await read('packages/mcp/server.json')).version,
    }
    expect(versions).toEqual(Object.fromEntries(Object.keys(versions).map(key => [key, version])))
  })

  it('declare the Studio channel on the server the plugin starts', async () => {
    const plugin = await read('packages/mcp/.claude-plugin/plugin.json')
    expect(plugin.channels).toEqual([{ server: 'tinypivot', displayName: 'TinyPivot Studio' }])
    expect(Object.keys(mcpPluginConfig.mcpServers)).toContain(plugin.channels[0].server)
  })
})

describe('bump-mcp-version', () => {
  const repo = path.join(__dirname, '../..')
  const files = [
    'packages/mcp/package.json',
    'packages/mcp/server.json',
    'packages/mcp/.claude-plugin/plugin.json',
    'packages/mcp/.cursor-plugin/plugin.json',
    'packages/mcp/.codex-plugin/plugin.json',
    'packages/mcp/plugin.json',
    'packages/mcp/.mcp.json',
    'packages/mcp/src/server.ts',
    'packages/mcp/src/telemetry.ts',
    'gemini-extension.json',
    '.claude-plugin/marketplace.json',
  ]
  let root: string

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'tinypivot-bump-'))
    for (const file of files) {
      await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true })
      await fs.copyFile(path.join(repo, file), path.join(root, file))
    }
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('computes the next version from a bump type or takes an exact one', () => {
    expect(nextVersion('0.6.0', 'patch')).toBe('0.6.1')
    expect(nextVersion('0.6.3', 'minor')).toBe('0.7.0')
    expect(nextVersion('0.6.3', 'major')).toBe('1.0.0')
    expect(nextVersion('0.6.3', '2.1.0')).toBe('2.1.0')
    expect(() => nextVersion('0.6.3', 'latest')).toThrow()
  })

  it('moves every manifest, the server strings and the Claude plugin pin together', async () => {
    const { version } = JSON.parse(await fs.readFile(path.join(repo, 'packages/mcp/package.json'), 'utf8'))
    expect(bumpMcpVersion(root, '9.8.7')).toBe('9.8.7')
    const read = async (file: string) => fs.readFile(path.join(root, file), 'utf8')
    for (const file of files.filter(f => f.endsWith('.json'))) {
      const original = await fs.readFile(path.join(repo, file), 'utf8')
      expect({ file, text: await read(file) }).toEqual({ file, text: original.replaceAll(version, '9.8.7') })
    }
    expect(JSON.parse(await read('packages/mcp/.mcp.json')).mcpServers.tinypivot.args).toEqual(['-y', '@smallwebco/tinypivot-mcp@9.8.7'])
    expect(await read('packages/mcp/src/server.ts')).toMatch(/name: 'tinypivot',\s*version: '9\.8\.7'/)
    expect(await read('packages/mcp/src/telemetry.ts')).toContain(`const PACKAGE_VERSION = '9.8.7'`)
  })
})

describe('sync-plugin-repo', () => {
  const repo = path.join(__dirname, '../..')
  let target: string

  beforeEach(async () => {
    target = await fs.mkdtemp(path.join(os.tmpdir(), 'tinypivot-plugin-repo-'))
  })

  afterEach(async () => {
    await fs.rm(target, { recursive: true, force: true })
  })

  it('copies every plugin file from packages/mcp unchanged', async () => {
    syncPluginRepo(repo, target)
    for (const file of PLUGIN_FILES) {
      const [copied, source] = await Promise.all([fs.readFile(path.join(target, file)), fs.readFile(path.join(repo, 'packages/mcp', file))])
      expect({ file, same: copied.equals(source) }).toEqual({ file, same: true })
    }
  })

  it('points the marketplaces at the plugin repository root and leaves Gemini out', async () => {
    syncPluginRepo(repo, target)
    const read = async (file: string) => JSON.parse(await fs.readFile(path.join(target, file), 'utf8'))
    expect((await read('.claude-plugin/marketplace.json')).plugins[0].source).toBe('./')
    expect((await read('.agents/plugins/marketplace.json')).plugins[0].source.path).toBe('./')
    await expect(fs.access(path.join(target, 'gemini-extension.json'))).rejects.toThrow()
  })

  it('refuses a target that does not exist', () => {
    expect(() => syncPluginRepo(repo, path.join(target, 'missing'))).toThrow(/No plugin repository checkout/)
  })
})

describe('refreshAgentExtension', () => {
  let dir: string
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tinypivot-agentext-'))
  })
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it.each(['pi', 'opencode'] as const)('updates TinyPivot\'s own older %s extension and leaves everything else alone', async (agent) => {
    const { AGENT_EXTENSIONS, refreshAgentExtension } = await import('../../packages/mcp/src/init')
    const file = path.join(dir, 'tinypivot.ts')

    expect(await refreshAgentExtension(agent, file)).toBe('absent')
    await expect(fs.access(file)).rejects.toThrow()

    await fs.writeFile(file, '// Auto-installed by @smallwebco/tinypivot-mcp init — do not edit by hand.\n// an older version\n')
    expect(await refreshAgentExtension(agent, file)).toBe('updated')
    expect(await fs.readFile(file, 'utf8')).toBe(AGENT_EXTENSIONS[agent].build())
    expect(await refreshAgentExtension(agent, file)).toBe('current')

    await fs.writeFile(file, '// my own extension\n')
    expect(await refreshAgentExtension(agent, file)).toBe('custom')
    expect(await fs.readFile(file, 'utf8')).toBe('// my own extension\n')
  })
})
