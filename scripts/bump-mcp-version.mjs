#!/usr/bin/env node
/**
 * Sets the @smallwebco/tinypivot-mcp version everywhere a release has to carry it: the package,
 * the MCP Registry entry, every agent plugin manifest, the server's own version strings, and the
 * exact npx version the Claude plugin starts (Claude's directory rejects an unpinned npx launcher).
 * Files are edited in place, so their formatting is kept.
 *
 * Usage: node scripts/bump-mcp-version.mjs <patch|minor|major|x.y.z>
 * Then commit and push the tag `mcp-v<version>` (see .github/workflows/publish-mcp.yml).
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/**
 * Each file and the pattern of its version string, with groups around the version. A global
 * pattern (/g) marks a file where every match carries the MCP version.
 */
const TARGETS = {
  'packages/mcp/package.json': /("version": ")[^"]+(")/,
  'packages/mcp/server.json': /("version": ")[^"]+(")/g,
  'packages/mcp/.claude-plugin/plugin.json': /("version": ")[^"]+(")/,
  'packages/mcp/.cursor-plugin/plugin.json': /("version": ")[^"]+(")/,
  'packages/mcp/.codex-plugin/plugin.json': /("version": ")[^"]+(")/,
  'packages/mcp/plugin.json': /("version": ")[^"]+(")/,
  'gemini-extension.json': /("version": ")[^"]+(")/,
  '.claude-plugin/marketplace.json': /("version": ")[^"]+(")/g,
  'packages/mcp/.mcp.json': /("@smallwebco\/tinypivot-mcp@)[^"]+(")/,
  'packages/mcp/src/server.ts': /(name: 'tinypivot',\s*version: ')[^']+(')/,
  'packages/mcp/src/telemetry.ts': /(const PACKAGE_VERSION = ')[^']+(')/,
}

export function nextVersion(current, bump) {
  if (/^\d+\.\d+\.\d+$/.test(bump))
    return bump
  const [major, minor, patch] = current.split('.').map(Number)
  if (bump === 'major')
    return `${major + 1}.0.0`
  if (bump === 'minor')
    return `${major}.${minor + 1}.0`
  if (bump === 'patch')
    return `${major}.${minor}.${patch + 1}`
  throw new Error(`Expected patch, minor, major or x.y.z, got "${bump}"`)
}

export function bumpMcpVersion(rootDir, bump) {
  const current = JSON.parse(readFileSync(join(rootDir, 'packages/mcp/package.json'), 'utf8')).version
  const version = nextVersion(current, bump)

  // Check every file before writing any, so a missing version string leaves nothing half-bumped.
  const updates = Object.entries(TARGETS).map(([file, pattern]) => {
    const path = join(rootDir, file)
    const text = readFileSync(path, 'utf8')
    if (!text.match(pattern))
      throw new Error(`No version string matching ${pattern} in ${file}`)
    return [path, text.replace(pattern, `$1${version}$2`)]
  })
  for (const [path, text] of updates)
    writeFileSync(path, text)

  return version
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
  const version = bumpMcpVersion(rootDir, process.argv[2] ?? 'patch')
  console.log(`TinyPivot MCP is now ${version}. Commit, then push the tag mcp-v${version}.`)
}
