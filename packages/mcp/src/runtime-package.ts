import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

/**
 * Large or rarely used packages (DuckDB's native binary, warehouse client libraries) are not
 * dependencies of TinyPivot. Each one is installed once, the first time a feature needs it, into a
 * cache that survives TinyPivot updates, so only the people who use that feature download it.
 */

const INSTALL_TIMEOUT_MS = 5 * 60 * 1000

export interface RuntimePackage {
  /** npm package name, e.g. `@duckdb/node-api`. */
  name: string
  /** Exact version to install, so every machine runs what was tested. */
  version: string
  /** Cache folder name under ~/.cache/tinypivot, e.g. `duckdb-2.0.1`. */
  cacheName: string
  /** What the download is for, in the one log line printed while it installs. */
  purpose: string
}

export function runtimePackageDir(pkg: RuntimePackage): string {
  const base = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache')
  return path.join(base, 'tinypivot', pkg.cacheName)
}

function requireFrom<T>(dir: string, name: string): T | undefined {
  try {
    return createRequire(path.join(dir, 'package.json'))(name) as T
  }
  catch {
    return undefined
  }
}

function installInto(dir: string, pkg: RuntimePackage): Promise<void> {
  fs.mkdirSync(dir, { recursive: true })
  // A package.json here stops npm from walking up and installing into a parent project.
  fs.writeFileSync(path.join(dir, 'package.json'), '{ "private": true }\n')
  const isWindows = process.platform === 'win32'
  return new Promise((resolve, reject) => {
    const child = spawn(isWindows ? 'npm.cmd' : 'npm', [
      'install',
      '--prefix',
      dir,
      '--no-save',
      '--no-audit',
      '--no-fund',
      '--loglevel=error',
      `${pkg.name}@${pkg.version}`,
    ], { stdio: ['ignore', 'ignore', 'pipe'], shell: isWindows, timeout: INSTALL_TIMEOUT_MS })
    let stderr = ''
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', reject)
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`npm install failed (${code}): ${stderr.trim().slice(0, 300)}`))))
  })
}

const loading = new Map<string, Promise<unknown>>()

/** The package's module: from TinyPivot's own install if present, else from the cache, installing it once. */
export function loadRuntimePackage<T>(pkg: RuntimePackage): Promise<T> {
  const key = `${pkg.name}@${pkg.version}`
  const existing = loading.get(key)
  if (existing)
    return existing as Promise<T>
  const load = (async () => {
    try {
      // A variable specifier keeps the bundler from trying to bundle the package.
      const specifier = pkg.name
      return await import(specifier) as T
    }
    catch {}
    const dir = runtimePackageDir(pkg)
    const cached = requireFrom<T>(dir, pkg.name)
    if (cached)
      return cached
    console.error(`[tinypivot-mcp] Downloading ${pkg.name} ${pkg.version} once into ${dir} for ${pkg.purpose}...`)
    await installInto(dir, pkg)
    const installed = requireFrom<T>(dir, pkg.name)
    if (!installed)
      throw new Error(`${pkg.name} installed into ${dir} but could not be loaded.`)
    return installed
  })()
  loading.set(key, load)
  // A failed download can be retried on the next call.
  load.catch(() => loading.delete(key))
  return load
}
