import type { ChartThemePreset } from '@smallwebco/tinypivot-core'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHART_THEME_IDS } from '@smallwebco/tinypivot-core'
import { EXTENSION_HEADER } from './agent-bridge.js'
import { buildOpenCodePluginSource } from './opencode-plugin.js'
import { buildPiExtensionSource, PI_ENTRY_EXTRAS } from './pi-extension.js'
import { saveVisualThemePreference } from './store.js'

export const VALID_INIT_TARGETS = [
  'claude',
  'claude-desktop',
  'cursor',
  'opencode',
  'antigravity',
  'antigravity-cli',
  'pi',
  'codex',
] as const

const VALID_INIT_TARGET_SET = new Set<string>(VALID_INIT_TARGETS)

interface InitOptions {
  local: boolean
  all: boolean
  dryRun: boolean
  noRules: boolean
  json: boolean
  targets: Set<string> | null
  licenseKey?: string
  theme?: ChartThemePreset
}

export interface TargetResult {
  id: string
  label: string
  configPath: string
  status: 'updated' | 'skipped' | 'unchanged' | 'error'
  detail: string
}

export interface InitSummary {
  ok: boolean
  exitCode: number
  dryRun: boolean
  mode: 'local' | 'npx'
  spec: string
  configuredCount: number
  errorCount: number
  results: TargetResult[]
  error?: string
  hint?: string
  validTargets?: readonly string[]
  availableThemes?: readonly string[]
}

/**
 * What generated configs hand to npx. The @latest tag makes npx check the registry on every
 * start, so a new release reaches users without re-running init. A bare name reuses npx's cache.
 */
export const MCP_NPX_SPEC = '@smallwebco/tinypivot-mcp@latest'

const RULE_START = '<!-- tinypivot:start -->'
const RULE_END = '<!-- tinypivot:end -->'
const RULE_TEST_RE = /<!-- tinypivot(?:-mcp)?:start -->[\s\S]*?<!-- tinypivot(?:-mcp)?:end -->/
const RULE_REPLACE_RE = /<!-- tinypivot(?:-mcp)?:start -->[\s\S]*?<!-- tinypivot(?:-mcp)?:end -->/g

// The rule blocks are read on every request in every session, charting or not: keep them to the
// one behaviour the server's own instructions cannot guarantee, using TinyPivot at all.
const RULE_HEADING = '## Charts & pivot tables (TinyPivot MCP)'
const RULE_USE = 'Whenever an answer shows figures (a ranking, a breakdown by category, a comparison, a trend, a chart or a pivot), present them with the `tinypivot` MCP server instead of a Markdown table or a chart you draw yourself.'

export const TINYPIVOT_CLAUDE_RULE_BLOCK = `${RULE_START}
${RULE_HEADING}
${RULE_USE} In a terminal, show its \`text\` card verbatim with the Studio link.
${RULE_END}`

export const TINYPIVOT_PI_RULE_BLOCK = `${RULE_START}
${RULE_HEADING}
${RULE_USE} The TinyPivot pi extension already shows each card, so reply with the takeaways and the Studio link. \`/tinypivot-theme\` switches themes.
${RULE_END}`

export function upsertTinyPivotRuleBlock(existing: string, block = TINYPIVOT_CLAUDE_RULE_BLOCK): string {
  if (RULE_TEST_RE.test(existing)) {
    // Replace first occurrence and strip any accidental duplicates cleanly
    let replaced = false
    return existing.replace(RULE_REPLACE_RE, () => {
      if (replaced)
        return ''
      replaced = true
      return block
    }).replace(/\n{3,}/g, '\n\n')
  }
  const sep = existing.trim().length > 0 ? '\n\n' : ''
  return `${existing.trimEnd()}${sep}${block}\n`
}

function printHelp() {
  console.log(`
TinyPivot MCP — Multi-Harness Installer

Usage:
  npx @smallwebco/tinypivot-mcp@latest init [options]

Options:
  --local                 Wire this local build (node <path>/dist/cli.js) instead of npx
  --targets=<list>        Comma-separated harnesses to configure:
                          claude, claude-desktop, cursor, opencode, antigravity, antigravity-cli, pi, codex
  --all                   Configure all supported harnesses even if not yet detected
  --license=<key>         Write TINYPIVOT_LICENSE_KEY into each configured server env
  --theme=<id>            Set default visual theme (${CHART_THEME_IDS.join(', ')})
  --no-rules              Skip adding auto-use TinyPivot rules to CLAUDE.md / AGENTS.md
  --dry-run               Preview planned changes without writing files
  --json                  Print machine-readable JSON to stdout (no prompts, real exit codes)
  -h, --help              Show this help message

Privacy:
  Anonymous, zero-PII telemetry (event, tool name, row bucket, client name, OS) is
  enabled by default. Disable anytime with TINYPIVOT_TELEMETRY=0 or DO_NOT_TRACK=1.
`.trim())
}

type ParseArgsResult
  = | { kind: 'help' }
    | { kind: 'ok', opts: InitOptions }
    | { kind: 'error', json: boolean, error: string, hint?: string, validTargets?: readonly string[], availableThemes?: readonly string[] }

function parseArgs(args: string[]): ParseArgsResult {
  const opts: InitOptions = {
    local: false,
    all: false,
    dryRun: false,
    noRules: false,
    json: args.includes('--json'),
    targets: null,
  }

  for (const arg of args) {
    if (arg === '-h' || arg === '--help') {
      printHelp()
      return { kind: 'help' }
    }
    else if (arg === '--local') {
      opts.local = true
    }
    else if (arg === '--all') {
      opts.all = true
    }
    else if (arg === '--dry-run') {
      opts.dryRun = true
    }
    else if (arg === '--no-rules') {
      opts.noRules = true
    }
    else if (arg === '--json') {
      opts.json = true
    }
    else if (arg.startsWith('--targets=')) {
      const list = arg.slice('--targets='.length).split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      const unknown = list.filter(t => !VALID_INIT_TARGET_SET.has(t))
      if (unknown.length > 0) {
        return {
          kind: 'error',
          json: opts.json,
          error: `Unknown target(s): ${unknown.join(', ')}.`,
          hint: `Use one or more of: ${VALID_INIT_TARGETS.join(', ')}.`,
          validTargets: VALID_INIT_TARGETS,
        }
      }
      if (list.length === 0) {
        return {
          kind: 'error',
          json: opts.json,
          error: 'No targets provided for --targets.',
          hint: `Pass a comma-separated list from: ${VALID_INIT_TARGETS.join(', ')}.`,
          validTargets: VALID_INIT_TARGETS,
        }
      }
      opts.targets = new Set(list)
    }
    else if (arg.startsWith('--license=')) {
      opts.licenseKey = arg.slice('--license='.length).trim()
    }
    else if (arg.startsWith('--theme=')) {
      const candidate = arg.slice('--theme='.length).trim().toLowerCase()
      if ((CHART_THEME_IDS as readonly string[]).includes(candidate)) {
        opts.theme = candidate as ChartThemePreset
      }
      else {
        return {
          kind: 'error',
          json: opts.json,
          error: `Unknown theme "${candidate}".`,
          hint: `Available themes: ${CHART_THEME_IDS.join(', ')}.`,
          availableThemes: CHART_THEME_IDS,
        }
      }
    }
    else if (arg.startsWith('-')) {
      return {
        kind: 'error',
        json: opts.json,
        error: `Unknown option "${arg}".`,
        hint: 'Run "tinypivot-mcp init --help" to see supported options.',
      }
    }
  }

  return { kind: 'ok', opts }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  }
  catch {
    return false
  }
}

async function readJsonSafe(filePath: string): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      return parsed as Record<string, unknown>
  }
  catch {
    // File missing or empty — start from fresh object
  }
  return {}
}

async function writeJsonPretty(filePath: string, data: Record<string, unknown>, dryRun: boolean) {
  if (dryRun)
    return
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

function getClaudeDesktopConfigPath(): string {
  const home = os.homedir()
  if (process.platform === 'darwin')
    return path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
  if (process.platform === 'win32')
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json')
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'Claude', 'claude_desktop_config.json')
}

function buildStdioServerEntry(opts: InitOptions, cliPath: string) {
  const command = opts.local ? process.execPath : 'npx'
  const args = opts.local ? [cliPath] : ['-y', MCP_NPX_SPEC]
  const entry: Record<string, unknown> = { command, args }
  const env: Record<string, string> = {}
  if (opts.licenseKey)
    env.TINYPIVOT_LICENSE_KEY = opts.licenseKey
  if (opts.theme)
    env.TINYPIVOT_THEME = opts.theme
  if (Object.keys(env).length > 0)
    entry.env = env
  return entry
}

async function upsertStandardMcpJson(
  id: string,
  label: string,
  configPath: string,
  detectDir: string,
  opts: InitOptions,
  cliPath: string,
  extras: { description?: string, toolExposure?: Record<string, string> } = {},
): Promise<TargetResult> {
  const explicit = opts.targets?.has(id) ?? false
  const shouldInclude = opts.targets ? explicit : (opts.all || await exists(configPath) || await exists(detectDir))
  if (!shouldInclude) {
    return { id, label, configPath, status: 'skipped', detail: 'not detected' }
  }

  try {
    const json = await readJsonSafe(configPath)
    const mcpServers = (json.mcpServers && typeof json.mcpServers === 'object' && !Array.isArray(json.mcpServers))
      ? { ...(json.mcpServers as Record<string, unknown>) }
      : {}
    const nextEntry: Record<string, unknown> = { ...buildStdioServerEntry(opts, cliPath) }
    // Preserve existing env vars (such as DATABASE_URL or TINYPIVOT_LICENSE_KEY) if already set
    const existing = mcpServers.tinypivot as Record<string, unknown> | undefined
    if (extras.description)
      nextEntry.description = extras.description
    if (extras.toolExposure) {
      // Exposure the user chose for a tool stays.
      const chosen = existing?.toolExposure && typeof existing.toolExposure === 'object' ? existing.toolExposure as Record<string, string> : {}
      nextEntry.toolExposure = { ...extras.toolExposure, ...chosen }
    }
    if (existing?.env && typeof existing.env === 'object' && !Array.isArray(existing.env)) {
      nextEntry.env = {
        ...(existing.env as Record<string, unknown>),
        ...((nextEntry.env as Record<string, unknown> | undefined) ?? {}),
      }
    }

    const before = JSON.stringify(mcpServers.tinypivot)
    const after = JSON.stringify(nextEntry)
    if (before === after) {
      return { id, label, configPath, status: 'unchanged', detail: 'already up to date' }
    }

    mcpServers.tinypivot = nextEntry
    json.mcpServers = mcpServers
    await writeJsonPretty(configPath, json, opts.dryRun)
    return {
      id,
      label,
      configPath,
      status: 'updated',
      detail: opts.dryRun ? 'would register tinypivot' : 'registered tinypivot',
    }
  }
  catch (err) {
    return {
      id,
      label,
      configPath,
      status: 'error',
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

async function upsertOpenCodeJson(opts: InitOptions, cliPath: string): Promise<TargetResult> {
  const id = 'opencode'
  const label = 'OpenCode'
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
  const configDir = path.join(xdg, 'opencode')
  const configPath = path.join(configDir, 'opencode.json')
  const explicit = opts.targets?.has(id) ?? false
  const shouldInclude = opts.targets ? explicit : (opts.all || await exists(configPath) || await exists(configDir))
  if (!shouldInclude) {
    return { id, label, configPath, status: 'skipped', detail: 'not detected' }
  }

  try {
    const json = await readJsonSafe(configPath)
    const mcp = (json.mcp && typeof json.mcp === 'object' && !Array.isArray(json.mcp))
      ? { ...(json.mcp as Record<string, unknown>) }
      : {}
    const command = opts.local ? [process.execPath, cliPath] : ['npx', '-y', MCP_NPX_SPEC]
    const nextEntry: Record<string, unknown> = {
      type: 'local',
      command,
      enabled: true,
    }
    const existing = mcp.tinypivot as Record<string, unknown> | undefined
    if (existing?.environment && typeof existing.environment === 'object' && !Array.isArray(existing.environment)) {
      nextEntry.environment = { ...(existing.environment as Record<string, unknown>) }
    }
    if (opts.licenseKey || opts.theme) {
      nextEntry.environment = {
        ...((nextEntry.environment as Record<string, unknown> | undefined) ?? {}),
        ...(opts.licenseKey ? { TINYPIVOT_LICENSE_KEY: opts.licenseKey } : {}),
        ...(opts.theme ? { TINYPIVOT_THEME: opts.theme } : {}),
      }
    }

    if (JSON.stringify(mcp.tinypivot) === JSON.stringify(nextEntry)) {
      return { id, label, configPath, status: 'unchanged', detail: 'already up to date' }
    }

    mcp.tinypivot = nextEntry
    json.mcp = mcp
    await writeJsonPretty(configPath, json, opts.dryRun)
    return {
      id,
      label,
      configPath,
      status: 'updated',
      detail: opts.dryRun ? 'would register tinypivot' : 'registered tinypivot',
    }
  }
  catch (err) {
    return {
      id,
      label,
      configPath,
      status: 'error',
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

async function upsertCodexToml(opts: InitOptions, cliPath: string): Promise<TargetResult> {
  const id = 'codex'
  const label = 'Codex CLI'
  const codexDir = path.join(os.homedir(), '.codex')
  const configPath = path.join(codexDir, 'config.toml')
  const explicit = opts.targets?.has(id) ?? false
  const shouldInclude = opts.targets ? explicit : (opts.all || await exists(configPath) || await exists(codexDir))
  if (!shouldInclude) {
    return { id, label, configPath, status: 'skipped', detail: 'not detected' }
  }

  try {
    const existing = await exists(configPath) ? await fs.readFile(configPath, 'utf8') : ''
    const command = opts.local ? process.execPath : 'npx'
    const args = opts.local ? [cliPath] : ['-y', MCP_NPX_SPEC]
    const argsToml = args.map(a => JSON.stringify(a)).join(', ')
    const codexEnvEntries: string[] = []
    if (opts.licenseKey)
      codexEnvEntries.push(`TINYPIVOT_LICENSE_KEY = ${JSON.stringify(opts.licenseKey)}`)
    if (opts.theme)
      codexEnvEntries.push(`TINYPIVOT_THEME = ${JSON.stringify(opts.theme)}`)
    const envLines = codexEnvEntries.length > 0
      ? `\n[mcp_servers.tinypivot.env]\n${codexEnvEntries.join('\n')}\n`
      : ''
    const block = `# tinypivot-mcp:start\n[mcp_servers.tinypivot]\ncommand = ${JSON.stringify(command)}\nargs = [${argsToml}]\n${envLines}# tinypivot-mcp:end\n`

    let next: string
    const markerRe = /# tinypivot-mcp:start[\s\S]*?# tinypivot-mcp:end\n?/
    if (markerRe.test(existing)) {
      next = existing.replace(markerRe, block)
    }
    else if (/\[mcp_servers\.tinypivot\]/.test(existing)) {
      return { id, label, configPath, status: 'unchanged', detail: 'existing [mcp_servers.tinypivot] section kept' }
    }
    else {
      const sep = existing.length > 0 && !existing.endsWith('\n') ? '\n\n' : (existing.length > 0 ? '\n' : '')
      next = `${existing}${sep}${block}`
    }

    if (next === existing) {
      return { id, label, configPath, status: 'unchanged', detail: 'already up to date' }
    }

    if (!opts.dryRun) {
      await fs.mkdir(codexDir, { recursive: true })
      await fs.writeFile(configPath, next, 'utf8')
    }
    return {
      id,
      label,
      configPath,
      status: 'updated',
      detail: opts.dryRun ? 'would register [mcp_servers.tinypivot]' : 'registered [mcp_servers.tinypivot]',
    }
  }
  catch (err) {
    return {
      id,
      label,
      configPath,
      status: 'error',
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

async function upsertRuleFile(
  targetId: string,
  ruleId: string,
  label: string,
  detectDir: string,
  ruleFilePath: string,
  opts: InitOptions,
  ruleBlock = TINYPIVOT_CLAUDE_RULE_BLOCK,
): Promise<TargetResult | null> {
  if (opts.noRules)
    return null
  const targeting = opts.targets ? opts.targets.has(targetId) : true
  if (!targeting)
    return null
  const explicit = opts.targets?.has(targetId) ?? false
  if (!opts.all && !explicit && !await exists(detectDir))
    return null

  try {
    const existing = await exists(ruleFilePath) ? await fs.readFile(ruleFilePath, 'utf8') : ''
    const next = upsertTinyPivotRuleBlock(existing, ruleBlock)

    if (next === existing) {
      return { id: ruleId, label, configPath: ruleFilePath, status: 'unchanged', detail: 'default-chart rule already present' }
    }
    if (!opts.dryRun) {
      await fs.mkdir(path.dirname(ruleFilePath), { recursive: true })
      await fs.writeFile(ruleFilePath, next, 'utf8')
    }
    return {
      id: ruleId,
      label,
      configPath: ruleFilePath,
      status: 'updated',
      detail: opts.dryRun ? 'would add default-chart TinyPivot rule' : 'added default-chart TinyPivot rule',
    }
  }
  catch (err) {
    return {
      id: ruleId,
      label,
      configPath: ruleFilePath,
      status: 'error',
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

/** The agent extensions init writes: each connects its agent to TinyPivot Studio. */
export const AGENT_EXTENSIONS = {
  pi: {
    label: 'pi Studio & UI',
    path: (home = os.homedir()) => path.join(home, '.pi', 'agent', 'extensions', 'tinypivot.ts'),
    detectDir: (home = os.homedir()) => path.join(home, '.pi'),
    build: buildPiExtensionSource,
    installs: 'Studio messages, 24-bit cards & /tinypivot-theme',
  },
  opencode: {
    label: 'OpenCode Studio',
    path: (home = os.homedir()) => path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'opencode', 'plugins', 'tinypivot.js'),
    detectDir: (home = os.homedir()) => path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'opencode'),
    build: buildOpenCodePluginSource,
    installs: 'live Studio messages plugin',
  },
} as const

export type AgentExtension = keyof typeof AGENT_EXTENSIONS

/**
 * Brings an installed TinyPivot agent extension up to this version, so the Studio can reach the
 * agent without the user re-running init. Only TinyPivot's own file is touched, and only when it
 * carries the header init writes; a missing file is left missing. Agents load extensions when a
 * session starts, so an update takes effect in the next one.
 */
export async function refreshAgentExtension(
  agent: AgentExtension,
  filePath: string = AGENT_EXTENSIONS[agent].path(),
): Promise<'current' | 'updated' | 'absent' | 'custom'> {
  const existing = await exists(filePath) ? await fs.readFile(filePath, 'utf8') : null
  if (existing === null)
    return 'absent'
  if (!existing.startsWith(EXTENSION_HEADER))
    return 'custom'
  const next = AGENT_EXTENSIONS[agent].build()
  if (existing === next)
    return 'current'
  await fs.writeFile(filePath, next, 'utf8')
  return 'updated'
}

async function upsertAgentExtension(agent: AgentExtension, opts: InitOptions): Promise<TargetResult | null> {
  const spec = AGENT_EXTENSIONS[agent]
  const explicit = opts.targets?.has(agent) ?? false
  if (opts.targets && !explicit)
    return null
  const home = os.homedir()
  const filePath = spec.path(home)
  if (!opts.all && !explicit && !await exists(spec.detectDir(home)))
    return null

  const result = (status: TargetResult['status'], detail: string): TargetResult =>
    ({ id: `${agent}-extension`, label: spec.label, configPath: filePath, status, detail })
  try {
    const next = spec.build()
    const existing = await exists(filePath) ? await fs.readFile(filePath, 'utf8') : ''
    if (existing === next)
      return result('unchanged', `${spec.installs} already installed`)
    if (!opts.dryRun) {
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, next, 'utf8')
    }
    return result('updated', `${opts.dryRun ? 'would install' : 'installed'} ${spec.installs}`)
  }
  catch (err) {
    return result('error', err instanceof Error ? err.message : String(err))
  }
}

async function upsertAllAgentRules(opts: InitOptions): Promise<TargetResult[]> {
  const home = os.homedir()
  const xdg = process.env.XDG_CONFIG_HOME || path.join(home, '.config')
  const candidates = await Promise.all([
    upsertRuleFile('claude', 'claude-rules', 'Claude Code Rules', path.join(home, '.claude'), path.join(home, '.claude', 'CLAUDE.md'), opts),
    upsertRuleFile('pi', 'pi-rules', 'pi Rules', path.join(home, '.pi'), path.join(home, '.pi', 'agent', 'AGENTS.md'), opts, TINYPIVOT_PI_RULE_BLOCK),
    upsertAgentExtension('pi', opts),
    upsertRuleFile('codex', 'codex-rules', 'Codex Rules', path.join(home, '.codex'), path.join(home, '.codex', 'AGENTS.md'), opts),
    upsertRuleFile('opencode', 'opencode-rules', 'OpenCode Rules', path.join(xdg, 'opencode'), path.join(xdg, 'opencode', 'AGENTS.md'), opts),
    upsertAgentExtension('opencode', opts),
  ])
  return candidates.filter((r): r is TargetResult => r !== null)
}

export async function runInitCommand(args: string[]): Promise<InitSummary | null> {
  const parsed = parseArgs(args)
  if (parsed.kind === 'help')
    return null

  const cliPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'cli.js')

  if (parsed.kind === 'error') {
    const summary: InitSummary = {
      ok: false,
      exitCode: 1,
      dryRun: false,
      mode: 'npx',
      spec: MCP_NPX_SPEC,
      configuredCount: 0,
      errorCount: 1,
      results: [],
      error: parsed.error,
      hint: parsed.hint,
      ...(parsed.validTargets ? { validTargets: parsed.validTargets } : {}),
      ...(parsed.availableThemes ? { availableThemes: parsed.availableThemes } : {}),
    }
    if (parsed.json) {
      console.log(JSON.stringify(summary, null, 2))
    }
    else {
      console.error(`${parsed.error}${parsed.hint ? ` ${parsed.hint}` : ''}`)
    }
    return summary
  }

  const opts = parsed.opts
  const home = os.homedir()
  const mode = opts.local ? 'local' as const : 'npx' as const
  const spec = opts.local ? cliPath : MCP_NPX_SPEC

  if (!opts.json) {
    console.log(`\nTinyPivot MCP Installer (${opts.local ? `local: ${cliPath}` : `npx ${MCP_NPX_SPEC}`})${opts.dryRun ? ' [DRY RUN]' : ''}\n`)
  }

  const results: TargetResult[] = [
    await upsertStandardMcpJson(
      'claude',
      'Claude Code',
      path.join(home, '.claude.json'),
      path.join(home, '.claude'),
      opts,
      cliPath,
    ),
    await upsertStandardMcpJson(
      'claude-desktop',
      'Claude Desktop',
      getClaudeDesktopConfigPath(),
      path.dirname(getClaudeDesktopConfigPath()),
      opts,
      cliPath,
    ),
    await upsertStandardMcpJson(
      'cursor',
      'Cursor',
      path.join(home, '.cursor', 'mcp.json'),
      path.join(home, '.cursor'),
      opts,
      cliPath,
    ),
    await upsertStandardMcpJson(
      'antigravity',
      'Antigravity',
      path.join(home, '.gemini', 'antigravity', 'mcp_config.json'),
      path.join(home, '.gemini', 'antigravity'),
      opts,
      cliPath,
    ),
    // The Antigravity CLI (`agy`) keeps its own MCP list, separate from the IDE's.
    await upsertStandardMcpJson(
      'antigravity-cli',
      'Antigravity CLI',
      path.join(home, '.gemini', 'config', 'mcp_config.json'),
      path.join(home, '.gemini', 'antigravity-cli'),
      opts,
      cliPath,
    ),
    await upsertStandardMcpJson(
      'pi',
      'pi',
      path.join(home, '.pi', 'agent', 'mcp.json'),
      path.join(home, '.pi'),
      opts,
      cliPath,
      PI_ENTRY_EXTRAS,
    ),
    await upsertOpenCodeJson(opts, cliPath),
    await upsertCodexToml(opts, cliPath),
  ]

  if (opts.theme && !opts.dryRun) {
    saveVisualThemePreference(opts.theme)
  }

  const ruleResults = await upsertAllAgentRules(opts)
  results.push(...ruleResults)

  const configuredCount = results.filter(r => r.status === 'updated' || r.status === 'unchanged').length
  const errorCount = results.filter(r => r.status === 'error').length
  const ok = errorCount === 0 && configuredCount > 0
  const hint = configuredCount === 0
    ? 'No supported AI harness configs were detected. Re-run with --all or --targets=claude,cursor,opencode.'
    : undefined

  const summary: InitSummary = {
    ok,
    exitCode: ok ? 0 : 1,
    dryRun: opts.dryRun,
    mode,
    spec,
    configuredCount,
    errorCount,
    results,
    ...(hint ? { hint } : {}),
  }

  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2))
    return summary
  }

  const iconFor: Record<TargetResult['status'], string> = {
    updated: '✓',
    unchanged: '·',
    skipped: '-',
    error: '✗',
  }

  for (const r of results) {
    if (r.status === 'skipped' && !opts.targets)
      continue
    console.log(`  ${iconFor[r.status]} ${r.label.padEnd(18)} ${r.detail} (${r.configPath})`)
  }

  if (configuredCount === 0) {
    console.log(`\n  ${hint}`)
  }
  else {
    console.log('\nNext steps:')
    console.log('  1. Restart your AI client(s) so the tinypivot MCP server loads.')
    console.log('  2. Try asking: "Open TinyPivot" or "Chart revenue by region from sales.csv".')
    console.log('  3. Free tier includes unlimited local rows, charts, SQL, smart .xlsx, Studio + lineage, and basic stats.')
    console.log('     Upgrade to Pro for deep SQL trap guards (join fan-out, partial periods, NULL drops, outliers), full Data Science shelf, Recursive Data Memory, white-label HTML/.xlsx, Postgres & 10 themes: https://tiny-pivot.com/pricing')
  }
  console.log('')
  return summary
}
