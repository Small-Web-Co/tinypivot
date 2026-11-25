import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import mcpPluginConfig from '../../packages/mcp/.mcp.json'
import { MCP_NPX_SPEC, runInitCommand } from '../../packages/mcp/src/init'

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

  it('ships the same spec in the Claude Code plugin config', () => {
    expect(mcpPluginConfig.mcpServers.tinypivot.args).toEqual(['-y', MCP_NPX_SPEC])
  })
})
