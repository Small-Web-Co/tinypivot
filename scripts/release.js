#!/usr/bin/env node
/**
 * Release script for TinyPivot
 * Usage: node scripts/release.js [patch|minor|major] [--local]
 * Default: patch
 *
 * By default, npm publishing is handled by GitHub Actions when the tag is pushed.
 * Use --local flag to publish from your local machine (requires npm token).
 */

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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
  }
  catch {
    return null
  }
}

function getCommitsSinceTag(tag) {
  const range = tag ? `${tag}..HEAD` : 'HEAD'
  try {
    const log = runQuiet(`git log ${range} --pretty=format:"%s|%h|%an"`)
    if (!log)
      return []
    return log.split('\n').map((line) => {
      const [message, hash, author] = line.split('|')
      return { message, hash, author }
    })
  }
  catch {
    return []
  }
}

function getChangedFiles(tag) {
  const files = new Set()

  try {
    // Get committed changes since tag
    if (tag) {
      const committed = runQuiet(`git diff --name-only ${tag}..HEAD`)
      if (committed)
        committed.split('\n').forEach(f => f && files.add(f))
    }

    // Get staged changes (not yet committed)
    const staged = runQuiet('git diff --cached --name-only')
    if (staged)
      staged.split('\n').forEach(f => f && files.add(f))

    // Get unstaged changes in working directory
    const unstaged = runQuiet('git diff --name-only')
    if (unstaged)
      unstaged.split('\n').forEach(f => f && files.add(f))
  }
  catch {
    // Ignore errors
  }

  return Array.from(files)
}

function getDiffContent(tag) {
  const diffs = []

  try {
    // Get committed changes since tag
    if (tag) {
      const committed = runQuiet(`git diff ${tag}..HEAD`)
      if (committed)
        diffs.push(committed)
    }

    // Get staged changes
    const staged = runQuiet('git diff --cached')
    if (staged)
      diffs.push(staged)

    // Get unstaged changes
    const unstaged = runQuiet('git diff')
    if (unstaged)
      diffs.push(unstaged)
  }
  catch {
    // Ignore errors
  }

  return diffs.join('\n')
}

// Extract meaningful feature changes from the diff
function extractFeatures(diffContent, changedFiles) {
  const features = {
    newComponents: new Set(),
    newHooks: new Set(),
    newTypes: new Set(),
    newProps: new Set(),
    newCssClasses: new Set(),
    newExports: new Set(),
    uiChanges: new Set(),
  }

  // Detect new components from NEW files (most reliable method)
  for (const file of changedFiles) {
    // New Vue component files
    if (file.includes('components/') && file.endsWith('.vue')) {
      const componentName = file.split('/').pop().replace('.vue', '')
      if (componentName && /^[A-Z]/.test(componentName)) {
        features.newComponents.add(componentName)
      }
    }
    // New React component files
    if (file.includes('components/') && file.endsWith('.tsx')) {
      const componentName = file.split('/').pop().replace('.tsx', '')
      if (componentName && /^[A-Z]/.test(componentName) && componentName !== 'index') {
        features.newComponents.add(componentName)
      }
    }
    // New hooks/composables
    if ((file.includes('hooks/') || file.includes('composables/')) && (file.endsWith('.ts') || file.endsWith('.tsx'))) {
      const hookName = file.split('/').pop().replace(/\.(ts|tsx)$/, '')
      if (hookName && hookName.startsWith('use')) {
        features.newHooks.add(hookName)
      }
    }
  }

  const lines = diffContent.split('\n')
  let currentFile = ''
  let _isNewFile = false

  for (const line of lines) {
    // Track current file and if it's new
    if (line.startsWith('diff --git')) {
      _isNewFile = false
    }
    if (line.startsWith('new file mode')) {
      _isNewFile = true
    }
    if (line.startsWith('+++ b/')) {
      currentFile = line.replace('+++ b/', '')
      continue
    }

    // Only look at added lines
    if (!line.startsWith('+') || line.startsWith('+++'))
      continue
    const added = line.slice(1).trim()

    // Skip empty lines, imports, comments
    if (!added || added.startsWith('import ') || added.startsWith('//') || added.startsWith('*'))
      continue

    // React component definitions (export function ComponentName)
    const componentMatch = added.match(/export\s+(?:default\s+)?function\s+([A-Z][a-zA-Z0-9]+)/)
    if (componentMatch && !componentMatch[1].match(/^(React|Vue|Props|Type|Interface)/)) {
      features.newComponents.add(componentMatch[1])
    }

    // React arrow function components (export const ComponentName = )
    const arrowComponentMatch = added.match(/export\s+(?:default\s+)?const\s+([A-Z][a-zA-Z0-9]+)\s*[=:]/)
    if (arrowComponentMatch && !arrowComponentMatch[1].match(/^(React|Vue|Props|Type|Interface)/)) {
      features.newComponents.add(arrowComponentMatch[1])
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

    // Props in type files or component interfaces
    const isTypeFile = currentFile.includes('types') || currentFile.includes('Props')
    const propMatch = added.match(/^\s*([a-z][a-zA-Z0-9]+)\??:\s*(?:string|number|boolean|any|\[|\{|Record|Array)/)
    if (propMatch && isTypeFile) {
      features.newProps.add(propMatch[1])
    }

    // Vue defineProps - extract prop names
    if (added.includes('defineProps<{') || (currentFile.endsWith('.vue') && added.match(/^\s+[a-z][a-zA-Z0-9]+\??:/))) {
      const vuePropMatch = added.match(/^\s+([a-z][a-zA-Z0-9]+)\??:/)
      if (vuePropMatch) {
        features.newProps.add(vuePropMatch[1])
      }
    }

    // New CSS classes (significant ones, not utilities)
    const cssClassMatch = added.match(/\.([a-z][a-z0-9-]+(?:__[a-z0-9-]+)?)\s*\{/)
    if (cssClassMatch && cssClassMatch[1].length > 3) {
      features.newCssClasses.add(cssClassMatch[1])
    }

    // New exports from index files
    const exportMatch = added.match(/export\s+\{\s*([^}]+)\s*\}/)
    if (exportMatch) {
      exportMatch[1].split(',').forEach((e) => {
        const name = e.trim().split(' ')[0]
        if (name && name.length > 2 && /^[A-Z]/.test(name)) {
          features.newComponents.add(name)
        }
      })
    }

    // UI-related changes (detecting specific patterns)
    if (added.includes('className=') || added.includes(':class=') || added.includes('class="')) {
      const uiMatch = added.match(/filter|modal|dropdown|tooltip|skeleton|grid|pivot|column|row|header|footer|toolbar/i)
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
    scripts: [],
    config: [],
    docs: [],
    other: [],
  }

  for (const file of files) {
    // Skip dist, node_modules, lock files
    if (file.includes('dist/') || file.includes('node_modules/') || file.includes('pnpm-lock'))
      continue

    if (file.startsWith('packages/core/src/')) {
      const name = file.replace('packages/core/src/', '')
      if (name.includes('types/'))
        changes.core.types.push(name)
      else if (name.includes('utils/'))
        changes.core.utils.push(name)
      else if (name.includes('pivot/'))
        changes.core.hooks.push(name)
      else changes.core.other.push(name)
    }
    else if (file.startsWith('packages/vue/src/')) {
      const name = file.replace('packages/vue/src/', '')
      if (name.includes('components/'))
        changes.vue.components.push(name)
      else if (name.includes('composables/'))
        changes.vue.composables.push(name)
      else if (name.includes('.css'))
        changes.vue.styles.push(name)
      else changes.vue.other.push(name)
    }
    else if (file.startsWith('packages/react/src/')) {
      const name = file.replace('packages/react/src/', '')
      if (name.includes('components/'))
        changes.react.components.push(name)
      else if (name.includes('hooks/'))
        changes.react.hooks.push(name)
      else if (name.includes('.css'))
        changes.react.styles.push(name)
      else changes.react.other.push(name)
    }
    else if (file.startsWith('demo/')) {
      changes.demo.push(file)
    }
    else if (file.startsWith('scripts/')) {
      changes.scripts.push(file)
    }
    else if (file.endsWith('.md') || file.endsWith('.txt')) {
      changes.docs.push(file)
    }
    else if (file.includes('config') || file.endsWith('.json')) {
      changes.config.push(file)
    }
    else {
      changes.other.push(file)
    }
  }

  return changes
}

function generateFileChangeSummary(changes) {
  const sections = []

  // Core changes
  const coreChanges = []
  if (changes.core.types.length)
    coreChanges.push(`Types (${changes.core.types.length} files)`)
  if (changes.core.hooks.length)
    coreChanges.push(`Pivot logic (${changes.core.hooks.length} files)`)
  if (changes.core.utils.length)
    coreChanges.push(`Utilities (${changes.core.utils.length} files)`)
  if (changes.core.other.length)
    coreChanges.push(`Other (${changes.core.other.length} files)`)
  if (coreChanges.length) {
    sections.push(`- **Core**: ${coreChanges.join(', ')}`)
  }

  // Vue changes
  const vueChanges = []
  if (changes.vue.components.length)
    vueChanges.push(`${changes.vue.components.length} components`)
  if (changes.vue.composables.length)
    vueChanges.push(`${changes.vue.composables.length} composables`)
  if (changes.vue.styles.length)
    vueChanges.push(`styles`)
  if (changes.vue.other.length)
    vueChanges.push(`${changes.vue.other.length} other`)
  if (vueChanges.length) {
    sections.push(`- **Vue**: ${vueChanges.join(', ')}`)
  }

  // React changes
  const reactChanges = []
  if (changes.react.components.length)
    reactChanges.push(`${changes.react.components.length} components`)
  if (changes.react.hooks.length)
    reactChanges.push(`${changes.react.hooks.length} hooks`)
  if (changes.react.styles.length)
    reactChanges.push(`styles`)
  if (changes.react.other.length)
    reactChanges.push(`${changes.react.other.length} other`)
  if (reactChanges.length) {
    sections.push(`- **React**: ${reactChanges.join(', ')}`)
  }

  // Demo changes
  if (changes.demo.length) {
    sections.push(`- **Demo**: ${changes.demo.length} files updated`)
  }

  // Scripts changes
  if (changes.scripts.length) {
    const scriptNames = changes.scripts.map(f => f.replace('scripts/', '')).join(', ')
    sections.push(`- **Scripts**: ${scriptNames}`)
  }

  // Config changes
  if (changes.config.length) {
    const configNames = changes.config.slice(0, 5).join(', ')
    const extra = changes.config.length > 5 ? ` (+${changes.config.length - 5} more)` : ''
    sections.push(`- **Config**: ${configNames}${extra}`)
  }

  // Docs changes
  if (changes.docs.length) {
    sections.push(`- **Docs**: ${changes.docs.length} files`)
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
    other: [],
  }

  for (const commit of commits) {
    const msg = commit.message.toLowerCase()

    // Skip release commits
    if (msg.startsWith('release:'))
      continue

    if (msg.startsWith('feat') || msg.includes('add ') || msg.includes('new ')) {
      categories.features.push(commit)
    }
    else if (msg.startsWith('fix') || msg.includes('fix ') || msg.includes('bug')) {
      categories.fixes.push(commit)
    }
    else if (msg.startsWith('docs') || msg.includes('readme') || msg.includes('documentation')) {
      categories.docs.push(commit)
    }
    else if (msg.startsWith('refactor') || msg.includes('refactor')) {
      categories.refactor.push(commit)
    }
    else if (msg.startsWith('style') || msg.includes('style') || msg.includes('css')) {
      categories.style.push(commit)
    }
    else if (msg.startsWith('perf') || msg.includes('performance') || msg.includes('optimize')) {
      categories.perf.push(commit)
    }
    else if (msg.startsWith('chore') || msg.includes('build') || msg.includes('ci')) {
      categories.chore.push(commit)
    }
    else {
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
    other: '📝 Other Changes',
  }

  // Add commit-based changes
  let _hasCommitChanges = false
  for (const [key, title] of Object.entries(categoryTitles)) {
    const commits = categories[key]
    if (commits.length > 0) {
      _hasCommitChanges = true
      sections.push(`### ${title}\n`)
      for (const commit of commits) {
        sections.push(`- ${commit.message} (\`${commit.hash}\`)`)
      }
      sections.push('')
    }
  }

  // Always show file-based summary if we have any file changes
  const fileSummary = generateFileChangeSummary(fileChanges)
  if (fileSummary) {
    sections.push('### 📦 Files Changed\n')
    sections.push(fileSummary)
    sections.push('')
  }

  // Fallback only if absolutely nothing was detected
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
  }
  catch {
    // Clean up temp file on error too
    try { execSync(`rm -f "${tempFile}"`, { cwd: rootDir }) }
    catch {}

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
  const nonReleaseCommits = commits.filter(c => !c.message.toLowerCase().startsWith('release:'))
  console.log(`   Found ${commits.length} commits (${nonReleaseCommits.length} non-release)`)

  const categories = categorizeCommits(commits)

  const changedFiles = getChangedFiles(previousTag)
  const sourceFiles = changedFiles.filter(f => !f.includes('dist/') && !f.includes('node_modules/') && !f.includes('pnpm-lock'))
  console.log(`   Found ${changedFiles.length} changed files (${sourceFiles.length} source files)`)

  if (sourceFiles.length > 0 && sourceFiles.length <= 20) {
    console.log(`   Files: ${sourceFiles.join(', ')}`)
  }

  const fileChanges = analyzeFileChanges(changedFiles)

  // Analyze diff for feature extraction
  console.log('🔍 Analyzing code changes...')
  const diffContent = getDiffContent(previousTag)
  console.log(`   Diff size: ${diffContent.length} characters`)

  const features = extractFeatures(diffContent, changedFiles)
  const featureSummary = generateFeatureSummary(features)

  if (featureSummary.length > 0) {
    console.log(`   Detected features:`)
    featureSummary.forEach(s => console.log(`     - ${s}`))
  }
  else {
    console.log(`   No specific features detected from diff`)
  }

  const changelog = generateChangelog(categories, fileChanges, featureSummary, previousTag, newVersion)

  console.log('\n📋 Changelog preview:')
  console.log('─'.repeat(50))
  console.log(changelog)
  console.log('─'.repeat(50))

  // Run quality checks before release
  console.log('\n🔍 Running quality checks...')
  console.log('   Running lint...')
  run('pnpm lint')
  console.log('   Running tests...')
  run('pnpm test:unit')
  console.log('   ✓ All quality checks passed')

  // Update all package.json files
  for (const pkgPath of packagePaths) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    pkg.version = newVersion
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
    console.log(`   ✓ Updated ${pkgPath.replace(rootDir, '.')}`)
  }

  // Build
  console.log('\n🔨 Building packages...')
  run('pnpm build')

  // Git add and commit
  console.log('\n📝 Committing changes...')
  run('git add -A')
  run(`git commit -m "release: v${newVersion}"`)

  // Check if --local flag is passed to publish locally
  const publishLocal = process.argv.includes('--local')

  if (publishLocal) {
    // Publish packages locally (requires npm token configured)
    console.log('\n🚀 Publishing to npm locally...')
    run('pnpm release:core')
    run('pnpm release:vue')
    run('pnpm release:react')
  }
  else {
    console.log('\n📦 Skipping local npm publish - GitHub Actions will publish when tag is pushed')
  }

  // Git tag and push
  console.log('\n🏷️  Tagging and pushing...')
  run(`git tag v${newVersion}`)
  run('git push')
  run('git push --tags')

  // Create GitHub release with changelog
  createGitHubRelease(newVersion, changelog)

  console.log(`\n✅ Successfully released v${newVersion}!\n`)
}

main().catch((err) => {
  console.error('\n❌ Release failed:', err.message)
  process.exit(1)
})
