#!/usr/bin/env node
/**
 * Records a real terminal session for the homepage highlight reel.
 *
 *   node scripts/reel/record.mjs <scenario.json> <output.jsonl> [--cwd <dir>]
 *
 * The harness named in the scenario runs inside a private tmux server. The script types the
 * scenario's prompts into it key by key and saves the screen, colours included, every time it
 * changes. Nothing is simulated: what gets replayed on the site is what the harness printed.
 *
 * Scenario shape:
 *   { "command": "claude ...", "cols": 100, "rows": 30, "steps": [
 *       { "wait": "regex", "timeout": 60000 },   wait until the screen matches
 *       { "type": "text" },                       type like a person
 *       { "key": "Enter" },                       press a named tmux key
 *       { "idle": 2500, "timeout": 120000 },      wait until the screen stops changing
 *       { "sleep": 800 },
 *       { "untilFile": "$ENV_VAR", "timeout": 600000 } ] }  record until another script creates that file
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'

/** One tmux server per run, so several sessions can be recorded at the same time. */
const SOCKET = `tinypivot-reel-${process.pid}`
const SESSION = 'reel'
const POLL_MS = 70
const TMUX_CONFIG = [
  'set -g default-terminal "tmux-256color"',
  'set -ga terminal-features ",*:RGB"',
  'set -g status off',
  'set -g escape-time 0',
  'set -g extended-keys on',
  'set -g extended-keys-format csi-u',
].join('\n')

const [scenarioPath, outputPath, ...flags] = process.argv.slice(2)
if (!scenarioPath || !outputPath) {
  console.error('Usage: node scripts/reel/record.mjs <scenario.json> <output.jsonl> [--cwd <dir>]')
  process.exit(1)
}
const cwdFlag = flags.indexOf('--cwd')
const cwd = resolve(cwdFlag >= 0 ? flags[cwdFlag + 1] : process.cwd())
const scenario = JSON.parse(readFileSync(scenarioPath, 'utf8'))
const { cols = 100, rows = 30 } = scenario

const configPath = join(mkdtempSync(join(tmpdir(), 'tinypivot-reel-')), 'tmux.conf')
writeFileSync(configPath, `${TMUX_CONFIG}\n`)

function tmux(...args) {
  return execFileSync('tmux', ['-L', SOCKET, '-f', configPath, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function readScreen() {
  return tmux('capture-pane', '-e', '-p', '-t', SESSION).replace(/\n$/, '')
}

const startedAt = Date.now()
const frames = []
let lastScreen = null
let lastChangeAt = startedAt

/** Saves the screen if it changed since the last look and returns its plain text. */
function sample() {
  const screen = readScreen()
  if (screen !== lastScreen) {
    lastScreen = screen
    lastChangeAt = Date.now()
    frames.push({ t: lastChangeAt - startedAt, screen })
  }
  // eslint-disable-next-line no-control-regex
  return screen.replace(/\x1B\[[0-9;:]*m/g, '')
}

async function watchFor(ms) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    sample()
    await sleep(POLL_MS)
  }
}

async function waitForMatch(pattern, timeout) {
  const regex = new RegExp(pattern)
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (regex.test(sample()))
      return
    await sleep(POLL_MS)
  }
  throw new Error(`Timed out after ${timeout}ms waiting for /${pattern}/`)
}

async function waitForIdle(quietMs, timeout) {
  const deadline = Date.now() + timeout
  lastChangeAt = Date.now()
  while (Date.now() < deadline) {
    sample()
    if (Date.now() - lastChangeAt >= quietMs)
      return
    await sleep(POLL_MS)
  }
  throw new Error(`Screen never went quiet for ${quietMs}ms within ${timeout}ms`)
}

/** Keeps recording until a file appears: how a script driving the other side of a session says it is done. */
async function waitForFile(path, timeout) {
  const file = path.replace(/^\$(\w+)$/, (_, name) => process.env[name] ?? '')
  if (!file)
    throw new Error(`untilFile names ${path}, which is not set`)
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    sample()
    if (existsSync(file))
      return
    await sleep(POLL_MS)
  }
  throw new Error(`Timed out after ${timeout}ms waiting for ${file}`)
}

/** Types with uneven gaps and a longer pause after spaces, so it reads as a person typing. */
async function typeText(text) {
  for (const char of text) {
    tmux('send-keys', '-t', SESSION, '-l', char)
    await watchFor(char === ' ' ? 70 + Math.random() * 60 : 28 + Math.random() * 52)
  }
}

async function runStep(step) {
  if (step.wait)
    return waitForMatch(step.wait, step.timeout ?? 60000)
  if (step.type)
    return typeText(step.type)
  if (step.key) {
    tmux('send-keys', '-t', SESSION, step.key)
    return watchFor(150)
  }
  if (step.idle)
    return waitForIdle(step.idle, step.timeout ?? 120000)
  if (step.sleep)
    return watchFor(step.sleep)
  if (step.untilFile)
    return waitForFile(step.untilFile, step.timeout ?? 600000)
  throw new Error(`Unknown step: ${JSON.stringify(step)}`)
}

function closeSession() {
  try {
    tmux('kill-server')
  }
  catch {
    // No server to stop: the harness already exited and took it down.
  }
}

tmux('new-session', '-d', '-s', SESSION, '-x', String(cols), '-y', String(rows), '-c', cwd, '-e', 'COLORTERM=truecolor', scenario.command)

let failure = null
try {
  for (const [index, step] of scenario.steps.entries()) {
    console.log(`step ${index + 1}/${scenario.steps.length}: ${JSON.stringify(step)}`)
    await runStep(step)
  }
  sample()
}
catch (error) {
  failure = error
}
finally {
  closeSession()
}

const meta = { cols, rows, command: scenario.command, recordedAt: new Date(startedAt).toISOString() }
writeFileSync(outputPath, `${[meta, ...frames].map(line => JSON.stringify(line)).join('\n')}\n`)
console.log(`wrote ${outputPath}: ${frames.length} frames, ${((Date.now() - startedAt) / 1000).toFixed(1)}s`)
if (failure) {
  console.error(failure.message)
  process.exit(1)
}
