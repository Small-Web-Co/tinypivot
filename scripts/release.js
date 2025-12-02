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

function runQuiet(cmd) {
  return execSync(cmd, { cwd: rootDir, encoding: 'utf-8' }).trim()
}

function getLatestTag() {
  try {
    return runQuiet('git describe --tags --abbrev=0')
  } catch {
    return null
  }
}

function getCommitsSinceTag(tag) {
  const range = tag ? `${tag}..HEAD` : 'HEAD'
  try {
    const log = runQuiet(`git log ${range} --pretty=format:"%s|%h|%an"`)
    if (!log) return []
    return log.split('\n').map(line => {
      const [message, hash, author] = line.split('|')
      return { message, hash, author }
    })
  } catch {
    return []
  }
}

function categorizeCommits(commits) {
  const categories = {
    features: [],
    fixes: [],
    docs: [],
    refactor: [],
    style: [],
    perf: [],
    chore: [],
    other: []
  }

  for (const commit of commits) {
    const msg = commit.message.toLowerCase()
    
    // Skip release commits
    if (msg.startsWith('release:')) continue
    
    if (msg.startsWith('feat') || msg.includes('add ') || msg.includes('new ')) {
      categories.features.push(commit)
    } else if (msg.startsWith('fix') || msg.includes('fix ') || msg.includes('bug')) {
      categories.fixes.push(commit)
    } else if (msg.startsWith('docs') || msg.includes('readme') || msg.includes('documentation')) {
      categories.docs.push(commit)
    } else if (msg.startsWith('refactor') || msg.includes('refactor')) {
      categories.refactor.push(commit)
    } else if (msg.startsWith('style') || msg.includes('style') || msg.includes('css')) {
      categories.style.push(commit)
    } else if (msg.startsWith('perf') || msg.includes('performance') || msg.includes('optimize')) {
      categories.perf.push(commit)
    } else if (msg.startsWith('chore') || msg.includes('build') || msg.includes('ci')) {
      categories.chore.push(commit)
    } else {
      categories.other.push(commit)
    }
  }

  return categories
}

function generateChangelog(categories, previousTag, newVersion) {
  const sections = []
  
  const categoryTitles = {
    features: '✨ Features',
    fixes: '🐛 Bug Fixes',
    perf: '⚡ Performance',
    refactor: '♻️ Refactoring',
    style: '💅 Styling',
    docs: '📚 Documentation',
    chore: '🔧 Maintenance',
    other: '📝 Other Changes'
  }

  for (const [key, title] of Object.entries(categoryTitles)) {
    const commits = categories[key]
    if (commits.length > 0) {
      sections.push(`### ${title}\n`)
      for (const commit of commits) {
        sections.push(`- ${commit.message} (\`${commit.hash}\`)`)
      }
      sections.push('')
    }
  }

  if (sections.length === 0) {
    sections.push('- Minor updates and improvements')
  }

  const compareUrl = previousTag 
    ? `**Full Changelog**: https://github.com/Small-Web-Co/tinypivot/compare/${previousTag}...v${newVersion}`
    : `**First Release**: v${newVersion}`

  return `## What's Changed\n\n${sections.join('\n')}\n${compareUrl}`
}

function createGitHubRelease(version, changelog) {
  console.log('\n🎉 Creating GitHub release...')
  
  // Escape the changelog for shell
  const escapedChangelog = changelog.replace(/"/g, '\\"').replace(/`/g, '\\`')
  
  try {
    // Check if gh CLI is installed
    runQuiet('which gh')
    
    // Create the release
    run(`gh release create v${version} --title "v${version}" --notes "${escapedChangelog}"`)
    console.log('   ✓ GitHub release created')
  } catch (error) {
    console.log('\n⚠️  Could not create GitHub release automatically.')
    console.log('   Please install GitHub CLI (gh) or create the release manually:')
    console.log(`   https://github.com/Small-Web-Co/tinypivot/releases/new?tag=v${version}`)
    console.log('\n📋 Changelog to copy:\n')
    console.log(changelog)
  }
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

  // Get commits for changelog before making release commit
  const previousTag = getLatestTag()
  console.log(`📝 Generating changelog since ${previousTag || 'beginning'}...`)
  const commits = getCommitsSinceTag(previousTag)
  const categories = categorizeCommits(commits)
  const changelog = generateChangelog(categories, previousTag, newVersion)

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

  // Create GitHub release with changelog
  createGitHubRelease(newVersion, changelog)

  console.log(`\n✅ Successfully released v${newVersion}!\n`)
}

main().catch(err => {
  console.error('\n❌ Release failed:', err.message)
  process.exit(1)
})
