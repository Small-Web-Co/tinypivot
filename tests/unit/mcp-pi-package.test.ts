// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildPiExtensionSource, PI_ENTRY_EXTRAS } from '../../packages/mcp/src/pi-extension'

/** Loads the packaged extension as if it sat at <package>/<build dir>/pi/tinypivot.ts. */
async function loadPackagedExtension(packageDir: string, home: string) {
  const js = ts.transpileModule(buildPiExtensionSource({ packaged: true }), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  const file = path.join(packageDir, 'out', 'pi', 'tinypivot.mjs')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, js)
  const extension = (await import(pathToFileURL(file).href)).default as (pi: unknown) => void
  // The extension looks for init's copy under the home directory when it runs.
  vi.stubEnv('HOME', home)
  vi.stubEnv('USERPROFILE', home)
  return extension
}

function fakePi() {
  const servers = new Map<string, Record<string, unknown>>()
  const commands: string[] = []
  return {
    servers,
    commands,
    api: {
      on: () => {},
      registerMcpServer: (name: string, config: Record<string, unknown>) => servers.set(name, config),
      registerCommand: (name: string) => commands.push(name),
    },
  }
}

describe('pi package', () => {
  let home: string

  beforeEach(() => {
    home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tinypivot-pi-package-')))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    fs.rmSync(home, { recursive: true, force: true })
  })

  it('starts the server from the installed package, with TinyPivot\'s data tools declared directly', async () => {
    const extension = await loadPackagedExtension(path.join(home, 'pkg'), home)
    const pi = fakePi()
    extension(pi.api)
    expect(pi.servers.get('tinypivot')).toEqual({ command: 'node', args: [path.join(home, 'pkg', 'out', 'cli.js')], ...PI_ENTRY_EXTRAS })
    expect(pi.commands).toContain('tinypivot-theme')
  })

  it('stays out of the way when init has installed its own copy', async () => {
    fs.mkdirSync(path.join(home, '.pi', 'agent', 'extensions'), { recursive: true })
    fs.writeFileSync(path.join(home, '.pi', 'agent', 'extensions', 'tinypivot.ts'), '')
    const extension = await loadPackagedExtension(path.join(home, 'pkg2'), home)
    const pi = fakePi()
    extension(pi.api)
    expect(pi.servers.size).toBe(0)
    expect(pi.commands).toEqual([])
  })

  it('leaves the copy init installs unchanged', () => {
    expect(buildPiExtensionSource()).not.toContain('registerMcpServer')
  })

  it('declares the extension and skill for pi and the gallery keyword', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../packages/mcp/package.json'), 'utf8'))
    expect(pkg.keywords).toContain('pi-package')
    expect(pkg.pi).toEqual({ extensions: ['./dist/pi/tinypivot.ts'], skills: ['./skills'] })
  })
})
