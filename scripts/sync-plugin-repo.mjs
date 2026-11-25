#!/usr/bin/env node
/**
 * Copies TinyPivot's agent plugin files from packages/mcp into a checkout of the plugin repository
 * (github.com/Small-Web-Co/tinypivot-plugin), where the plugin sits at the repository root.
 *
 * The plugin directories won't list a plugin from this monorepo: Claude's flags the workspace's
 * package-manager settings (pnpm-workspace.yaml) for any plugin folder inside it. packages/mcp stays
 * the source; the mcp-v* tag workflow (publish-mcp.yml) runs this and pushes the result.
 *
 * Gemini CLI stays in this repository (gemini-extension.json at the root): its keychain setting
 * reaches the server through a ${TINYPIVOT_LICENSE_KEY} mapping, which Claude's directory reads
 * as a credential leaving the machine when both live in one repository.
 *
 * Usage: node scripts/sync-plugin-repo.mjs <path to the tinypivot-plugin checkout>
 */

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/** Files copied as they are, from packages/mcp to the same path in the plugin repository. */
export const PLUGIN_FILES = [
  '.claude-plugin/plugin.json',
  '.mcp.json',
  '.cursor-plugin/plugin.json',
  'mcp.json',
  '.codex-plugin/plugin.json',
  'plugin.json',
  'mcp_config.json',
  'skills/tinypivot/SKILL.md',
  'assets/icon.png',
  'LICENSE.md',
]

/** Marketplace files from the monorepo root, pointed at the plugin repository's root instead. */
const MARKETPLACES = {
  '.claude-plugin/marketplace.json': (json) => { json.plugins[0].source = './' },
  '.agents/plugins/marketplace.json': (json) => { json.plugins[0].source.path = './' },
}

function copy(from, to) {
  mkdirSync(dirname(to), { recursive: true })
  cpSync(from, to)
}

export function syncPluginRepo(monorepo, target) {
  if (!existsSync(target))
    throw new Error(`No plugin repository checkout at ${target}`)

  for (const file of PLUGIN_FILES)
    copy(join(monorepo, 'packages/mcp', file), join(target, file))

  for (const [file, repoint] of Object.entries(MARKETPLACES)) {
    const json = JSON.parse(readFileSync(join(monorepo, file), 'utf8'))
    repoint(json)
    mkdirSync(dirname(join(target, file)), { recursive: true })
    writeFileSync(join(target, file), `${JSON.stringify(json, null, 2)}\n`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) {
    console.error('Usage: node scripts/sync-plugin-repo.mjs <path to the tinypivot-plugin checkout>')
    process.exit(1)
  }
  syncPluginRepo(join(dirname(fileURLToPath(import.meta.url)), '..'), resolve(process.argv[2]))
  console.log(`Plugin files copied to ${process.argv[2]}. Commit and push there.`)
}
