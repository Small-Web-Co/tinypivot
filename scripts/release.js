#!/usr/bin/env node
/**
 * Release script for TinyPivot
 * Usage: node scripts/release.js [patch|minor|major]
 * Default: patch
 */

import { readFileSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

const packagePaths = [
  join(rootDir, 'package.json'),
  join(rootDir, 'packages/core/package.json'),
  join(rootDir, 'packages/vue/package.json'),
  join(rootDir, 'packages/react/package.json'),
]

function bumpVersion(version, type) {
  const [major, minor, patch] = version.split('.').map(Number)
  switch (type) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
    default:
      return `${major}.${minor}.${patch + 1}`
  }
}

function run(cmd, options = {}) {
  console.log(`\n> ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd: rootDir, ...options })
}

async function main() {
  const bumpType = process.argv[2] || 'patch'
  
  if (!['patch', 'minor', 'major'].includes(bumpType)) {
    console.error('Usage: node scripts/release.js [patch|minor|major]')
    process.exit(1)
  }

  // Read current version from root package.json
  const rootPkg = JSON.parse(readFileSync(packagePaths[0], 'utf-8'))
  const currentVersion = rootPkg.version
  const newVersion = bumpVersion(currentVersion, bumpType)

  console.log(`\n📦 Releasing TinyPivot`)
  console.log(`   ${currentVersion} → ${newVersion} (${bumpType})\n`)

  // Update all package.json files
  for (const pkgPath of packagePaths) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    pkg.version = newVersion
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
    console.log(`   ✓ Updated ${pkgPath.replace(rootDir, '.')}`)
  }

  // Build
  console.log('\n🔨 Building packages...')
  run('pnpm build')

  // Git add and commit
  console.log('\n📝 Committing changes...')
  run('git add -A')
  run(`git commit -m "release: v${newVersion}"`)

  // Publish packages
  console.log('\n🚀 Publishing to npm...')
  run('pnpm release:core')
  run('pnpm release:vue')
  run('pnpm release:react')

  // Git tag and push
  console.log('\n🏷️  Tagging and pushing...')
  run(`git tag v${newVersion}`)
  run('git push')
  run('git push --tags')

  console.log(`\n✅ Successfully released v${newVersion}!\n`)
}

main().catch(err => {
  console.error('\n❌ Release failed:', err.message)
  process.exit(1)
})

