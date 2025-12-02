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

function getChangedFiles(tag) {
  const range = tag ? `${tag}..HEAD` : 'HEAD'
  try {
    const diff = runQuiet(`git diff --name-only ${range}`)
    if (!diff) return []
    return diff.split('\n').filter(f => f.length > 0)
  } catch {
    return []
  }
}

function getDiffContent(tag) {
  const range = tag ? `${tag}..HEAD` : 'HEAD'
  try {
    return runQuiet(`git diff ${range}`)
  } catch {
    return ''
  }
}

// Extract meaningful feature changes from the diff
function extractFeatures(diffContent) {
  const features = {
    newComponents: new Set(),
    newHooks: new Set(),
    newTypes: new Set(),
    newProps: new Set(),
    newCssClasses: new Set(),
    newExports: new Set(),
    uiChanges: new Set()
  }

  const lines = diffContent.split('\n')
  let currentFile = ''

  for (const line of lines) {
    // Track current file
    if (line.startsWith('+++ b/')) {
      currentFile = line.replace('+++ b/', '')
      continue
    }

    // Only look at added lines
    if (!line.startsWith('+') || line.startsWith('+++')) continue
    const added = line.slice(1).trim()

    // Skip empty lines, imports, comments
    if (!added || added.startsWith('import ') || added.startsWith('//') || added.startsWith('*')) continue

    // New React/Vue component definitions
    const componentMatch = added.match(/(?:export\s+)?(?:const|function)\s+([A-Z][a-zA-Z0-9]+)\s*[=:(]/)
    if (componentMatch && !componentMatch[1].match(/^(React|Vue|Props|Type|Interface)/)) {
      features.newComponents.add(componentMatch[1])
    }

    // New hooks (React) or composables (Vue)
    const hookMatch = added.match(/(?:export\s+)?(?:const|function)\s+(use[A-Z][a-zA-Z0-9]+)/)
    if (hookMatch) {
      features.newHooks.add(hookMatch[1])
    }

    // New TypeScript interfaces/types
    const typeMatch = added.match(/(?:export\s+)?(?:interface|type)\s+([A-Z][a-zA-Z0-9]+)/)
    if (typeMatch) {
      features.newTypes.add(typeMatch[1])
    }

    // New props in interfaces (looking for property definitions)
    const propMatch = added.match(/^\s*([a-z][a-zA-Z0-9]+)\??:\s*/)
    if (propMatch && currentFile.includes('types')) {
      features.newProps.add(propMatch[1])
    }

    // New CSS classes (significant ones, not utilities)
    const cssClassMatch = added.match(/\.([a-z][a-z0-9-]+(?:__[a-z0-9-]+)?)\s*\{/)
    if (cssClassMatch && cssClassMatch[1].length > 3) {
      features.newCssClasses.add(cssClassMatch[1])
    }

    // New exports
    const exportMatch = added.match(/export\s+\{\s*([^}]+)\s*\}/)
    if (exportMatch) {
      exportMatch[1].split(',').forEach(e => {
        const name = e.trim().split(' ')[0]
        if (name && name.length > 2) features.newExports.add(name)
      })
    }

    // UI-related changes (detecting specific patterns)
    if (added.includes('className=') || added.includes(':class=') || added.includes('class="')) {
      // Extract meaningful class names that indicate features
      const uiMatch = added.match(/(?:filter|modal|dropdown|tooltip|skeleton|grid|pivot|column|row|header|footer|toolbar)/i)
      if (uiMatch) {
        features.uiChanges.add(uiMatch[0].toLowerCase())
      }
    }
  }

  return features
}

// Generate human-readable feature summary
function generateFeatureSummary(features) {
  const summaries = []

  if (features.newComponents.size > 0) {
    const components = Array.from(features.newComponents).slice(0, 5)
    summaries.push(`Added components: ${components.join(', ')}${features.newComponents.size > 5 ? ` (+${features.newComponents.size - 5} more)` : ''}`)
  }

  if (features.newHooks.size > 0) {
    const hooks = Array.from(features.newHooks).slice(0, 5)
    summaries.push(`Added hooks/composables: ${hooks.join(', ')}`)
  }

  if (features.newTypes.size > 0) {
    const types = Array.from(features.newTypes).slice(0, 5)
    summaries.push(`New types: ${types.join(', ')}${features.newTypes.size > 5 ? ` (+${features.newTypes.size - 5} more)` : ''}`)
  }

  if (features.newProps.size > 0) {
    const props = Array.from(features.newProps).slice(0, 8)
    summaries.push(`New props/options: ${props.join(', ')}${features.newProps.size > 8 ? ` (+${features.newProps.size - 8} more)` : ''}`)
  }

  if (features.uiChanges.size > 0) {
    const ui = Array.from(features.uiChanges)
    summaries.push(`UI updates: ${ui.join(', ')}`)
  }

  if (features.newCssClasses.size > 3) {
    summaries.push(`Styling updates (${features.newCssClasses.size} new CSS rules)`)
  }

  return summaries
}

function analyzeFileChanges(files) {
  const changes = {
    core: { components: [], hooks: [], types: [], utils: [], other: [] },
    vue: { components: [], composables: [], styles: [], other: [] },
    react: { components: [], hooks: [], styles: [], other: [] },
    demo: [],
    config: [],
    docs: []
  }

  for (const file of files) {
    // Skip dist, node_modules, lock files
    if (file.includes('dist/') || file.includes('node_modules/') || file.includes('pnpm-lock')) continue
    
    if (file.startsWith('packages/core/')) {
      const name = file.replace('packages/core/', '')
      if (name.includes('types/')) changes.core.types.push(name)
      else if (name.includes('utils/')) changes.core.utils.push(name)
      else if (name.includes('pivot/')) changes.core.hooks.push(name)
      else changes.core.other.push(name)
    } else if (file.startsWith('packages/vue/')) {
      const name = file.replace('packages/vue/', '')
      if (name.includes('components/')) changes.vue.components.push(name)
      else if (name.includes('composables/')) changes.vue.composables.push(name)
      else if (name.includes('.css')) changes.vue.styles.push(name)
      else changes.vue.other.push(name)
    } else if (file.startsWith('packages/react/')) {
      const name = file.replace('packages/react/', '')
      if (name.includes('components/')) changes.react.components.push(name)
      else if (name.includes('hooks/')) changes.react.hooks.push(name)
      else if (name.includes('.css')) changes.react.styles.push(name)
      else changes.react.other.push(name)
    } else if (file.startsWith('demo/')) {
      changes.demo.push(file)
    } else if (file.endsWith('.md') || file.endsWith('.txt')) {
      changes.docs.push(file)
    } else if (file.includes('config') || file.endsWith('.json') || file.endsWith('.js') || file.endsWith('.ts')) {
      changes.config.push(file)
    }
  }

  return changes
}

function generateFileChangeSummary(changes) {
  const sections = []

  // Core changes
  const coreChanges = []
  if (changes.core.types.length) coreChanges.push(`Types (${changes.core.types.length} files)`)
  if (changes.core.hooks.length) coreChanges.push(`Pivot logic (${changes.core.hooks.length} files)`)
  if (changes.core.utils.length) coreChanges.push(`Utilities (${changes.core.utils.length} files)`)
  if (coreChanges.length) {
    sections.push(`- **Core**: ${coreChanges.join(', ')}`)
  }

  // Vue changes
  const vueChanges = []
  if (changes.vue.components.length) vueChanges.push(`${changes.vue.components.length} components`)
  if (changes.vue.composables.length) vueChanges.push(`${changes.vue.composables.length} composables`)
  if (changes.vue.styles.length) vueChanges.push(`styles`)
  if (vueChanges.length) {
    sections.push(`- **Vue**: ${vueChanges.join(', ')}`)
  }

  // React changes
  const reactChanges = []
  if (changes.react.components.length) reactChanges.push(`${changes.react.components.length} components`)
  if (changes.react.hooks.length) reactChanges.push(`${changes.react.hooks.length} hooks`)
  if (changes.react.styles.length) reactChanges.push(`styles`)
  if (reactChanges.length) {
    sections.push(`- **React**: ${reactChanges.join(', ')}`)
  }

  // Demo changes
  if (changes.demo.length) {
    sections.push(`- **Demo**: ${changes.demo.length} files updated`)
  }

  return sections.join('\n')
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
      // Include all other commits instead of skipping
      categories.other.push(commit)
    }
  }

  return categories
}

function generateChangelog(categories, fileChanges, featureSummary, previousTag, newVersion) {
  const sections = []
  
  // Add feature summary at the top if we have meaningful features detected
  if (featureSummary.length > 0) {
    sections.push('### 🚀 Highlights\n')
    for (const summary of featureSummary) {
      sections.push(`- ${summary}`)
    }
    sections.push('')
  }

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

  // Add commit-based changes
  let hasCommitChanges = false
  for (const [key, title] of Object.entries(categoryTitles)) {
    const commits = categories[key]
    if (commits.length > 0) {
      hasCommitChanges = true
      sections.push(`### ${title}\n`)
      for (const commit of commits) {
        sections.push(`- ${commit.message} (\`${commit.hash}\`)`)
      }
      sections.push('')
    }
  }

  // If no commit changes and no feature summary, show file-based summary
  const fileSummary = generateFileChangeSummary(fileChanges)
  if (!hasCommitChanges && featureSummary.length === 0 && fileSummary) {
    sections.push('### 📦 Package Updates\n')
    sections.push(fileSummary)
    sections.push('')
  } else if (fileSummary && featureSummary.length === 0) {
    // Also add file summary if we have commits but no feature highlights
    sections.push('### 📦 Files Changed\n')
    sections.push(fileSummary)
    sections.push('')
  }

  // Fallback if still nothing
  if (sections.length === 0) {
    sections.push('- Internal improvements and maintenance')
    sections.push('')
  }

  const compareUrl = previousTag 
    ? `**Full Changelog**: https://github.com/Small-Web-Co/tinypivot/compare/${previousTag}...v${newVersion}`
    : `**First Release**: v${newVersion}`

  return `## What's Changed\n\n${sections.join('\n')}\n${compareUrl}`
}

function createGitHubRelease(version, changelog) {
  console.log('\n🎉 Creating GitHub release...')
  
  // Write changelog to temp file to avoid shell escaping issues
  const tempFile = join(rootDir, '.release-notes.tmp')
  writeFileSync(tempFile, changelog)
  
  try {
    // Check if gh CLI is installed
    runQuiet('which gh')
    
    // Create the release using file input
    run(`gh release create v${version} --title "v${version}" --notes-file "${tempFile}"`)
    console.log('   ✓ GitHub release created')
    
    // Clean up temp file
    execSync(`rm -f "${tempFile}"`, { cwd: rootDir })
  } catch (error) {
    // Clean up temp file on error too
    try { execSync(`rm -f "${tempFile}"`, { cwd: rootDir }) } catch {}
    
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

  // Get commits and file changes for changelog before making release commit
  const previousTag = getLatestTag()
  console.log(`📝 Generating changelog since ${previousTag || 'beginning'}...`)
  
  const commits = getCommitsSinceTag(previousTag)
  const categories = categorizeCommits(commits)
  
  const changedFiles = getChangedFiles(previousTag)
  const fileChanges = analyzeFileChanges(changedFiles)
  
  // Analyze diff for feature extraction
  console.log('🔍 Analyzing code changes...')
  const diffContent = getDiffContent(previousTag)
  const features = extractFeatures(diffContent)
  const featureSummary = generateFeatureSummary(features)
  
  const changelog = generateChangelog(categories, fileChanges, featureSummary, previousTag, newVersion)
  
  console.log('\n📋 Changelog preview:')
  console.log('─'.repeat(50))
  console.log(changelog)
  console.log('─'.repeat(50))

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
