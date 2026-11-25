/** Install commands shown in every InstallBox. Keep in sync with packages/mcp/README.md. */

export const MCP_PACKAGE = '@smallwebco/tinypivot-mcp'
/** npx re-resolves a tagged spec on every run; a bare name would reuse its cached copy. */
export const MCP_SPEC = `${MCP_PACKAGE}@latest`
export const INIT_COMMAND = `npx ${MCP_SPEC} init`

export interface InstallOption {
  id: string
  label: string
  lines: string[]
  note: string
}

export const installOptions: InstallOption[] = [
  {
    id: 'init',
    label: 'Any harness',
    lines: [INIT_COMMAND],
    note: 'Detects Claude Code, Claude Desktop, Cursor, Antigravity, OpenCode, Codex and pi.',
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    lines: [`claude mcp add tinypivot -- npx -y ${MCP_SPEC} --open`],
    note: 'Terminal charts plus a live Data IDE on localhost.',
  },
  {
    id: 'plugin',
    label: 'Plugin',
    lines: ['/plugin marketplace add Small-Web-Co/tinypivot', '/plugin install tinypivot@tinypivot'],
    note: 'Run inside Claude Code. Bundles the MCP server and a skill.',
  },
  {
    id: 'pi',
    label: 'pi',
    lines: [`${INIT_COMMAND} --targets=pi`],
    note: 'Writes the pi MCP config only.',
  },
  {
    id: 'cursor',
    label: 'Cursor',
    lines: [`${INIT_COMMAND} --targets=cursor`],
    note: 'Writes ~/.cursor/mcp.json only.',
  },
]
