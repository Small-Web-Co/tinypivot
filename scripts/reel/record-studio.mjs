#!/usr/bin/env node
/**
 * Records a real pi session together with TinyPivot Studio, for the homepage reel.
 *
 *   node scripts/reel/record-studio.mjs <takes-dir> <take-name> --cwd <data-dir> --frames <out-dir>
 *     [--scenario <file>]            the story (default scenarios/studio-pi.json)
 *     [--keep-extension <path>]...   other pi extensions to keep loaded (a sandbox, say)
 *
 * The scenario's steps drive pi in the terminal; its `studio` block plays the user in the Studio:
 *   { "theme": "paper", "messages": ["…", "…"], "attachFirst": true, "check": true }
 * Each message goes in through the Studio's message box (the first with the current view attached
 * when `attachFirst`), and pi answers it in the trace; `check` presses Check this answer at the end.
 *
 * record.mjs runs pi in tmux with this build of TinyPivot and its pi extension, and types the
 * opening prompt. Meanwhile this script plays the user's side in the Studio in a browser:
 * it follows the trace, sends the agent's pivot back with a comment, then asks a follow-up
 * question; pi answers both in the trace. Every time the Studio changes it saves a screenshot with the time,
 * so convert.mjs can line the Studio up with the terminal. Nothing is staged: pi does the work.
 * Build first (`pnpm build && pnpm build:mcp`: the Studio bundles core from its build) and run under `with-secrets` so the server gets a Pro key.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright-core'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const MCP_DIR = join(ROOT, 'packages/mcp')
const PUBLIC_DIR = join(ROOT, 'demo/public')
const PORT = 47391
const STUDIO = `http://127.0.0.1:${PORT}`
const VIEWPORT = { width: 1280, height: 800 }
/** How long the trace must stay still, with pi idle, before the user acts. */
const QUIET_MS = 2500
const AGENT_TIMEOUT_MS = 6 * 60 * 1000
const MIN_FRAME_GAP_MS = 800

function readArgs(argv) {
  const [takesDir, takeName, ...rest] = argv
  const values = name => rest.flatMap((arg, i) => (arg === name ? [rest[i + 1]] : []))
  if (!takesDir || !takeName || !values('--cwd')[0] || !values('--frames')[0]) {
    console.error('Usage: node scripts/reel/record-studio.mjs <takes-dir> <take-name> --cwd <data-dir> --frames <out-dir> [--scenario <file>] [--keep-extension <path>]')
    process.exit(1)
  }
  return {
    takesDir: resolve(takesDir),
    takeName,
    cwd: resolve(values('--cwd')[0]),
    framesDir: resolve(values('--frames')[0]),
    keepExtensions: values('--keep-extension').map(path => resolve(path)),
    scenario: resolve(values('--scenario')[0] ?? join(ROOT, 'scripts/reel/scenarios/studio-pi.json')),
  }
}

const args = readArgs(process.argv.slice(2))
const story = JSON.parse(readFileSync(args.scenario, 'utf8')).studio ?? {}
const work = mkdtempSync(join(tmpdir(), 'tinypivot-studio-reel-'))
const doneFile = join(work, 'done')
const dataFolder = `${args.cwd}/`
const shownFolder = `~/${basename(args.cwd)}/`

/** This build's pi extension, and a project MCP config pointing pi at this build. */
async function prepare() {
  const { buildPiExtensionSource } = await import(pathToFileURL(join(MCP_DIR, 'dist/index.js')).href)
  const extension = join(work, 'tinypivot.ts')
  writeFileSync(extension, buildPiExtensionSource())
  const piDir = join(args.cwd, '.pi')
  mkdirSync(piDir, { recursive: true })
  const config = join(piDir, 'mcp.json')
  if (existsSync(config))
    throw new Error(`${config} exists; move it away first`)
  writeFileSync(config, `${JSON.stringify({
    mcpServers: {
      tinypivot: {
        command: process.execPath,
        args: [join(MCP_DIR, 'dist/cli.js')],
        env: {
          // pi fills this in from its own environment; the key is never written here.
          TINYPIVOT_LICENSE_KEY: ['$', '{TINYPIVOT_LICENSE_KEY}'].join(''),
          TINYPIVOT_PORT: String(PORT),
          TINYPIVOT_OPEN_STUDIO: '0',
          TINYPIVOT_THEME: story.theme ?? 'crt-amber',
          TINYPIVOT_TELEMETRY: '0',
          XDG_DATA_HOME: join(work, 'data'),
          XDG_CONFIG_HOME: join(work, 'config'),
        },
      },
    },
  }, null, 2)}\n`)
  return { extension, config }
}

function startRecorder(extension) {
  // --no-extensions also drops pi's built-in MCP support and codemode, so they are named again.
  const extensions = ['builtin:mcp', 'builtin:codemode', 'builtin:tool-search', ...args.keepExtensions, extension]
    .map(path => `--extension ${path}`)
    .join(' ')
  return spawn(process.execPath, [
    join(ROOT, 'scripts/reel/record.mjs'),
    args.scenario,
    join(args.takesDir, `${args.takeName}.jsonl`),
    '--cwd',
    args.cwd,
  ], { stdio: 'inherit', env: { ...process.env, REEL_DONE_FILE: doneFile, REEL_PI_EXTENSIONS: extensions } })
}

async function studioSnapshot() {
  try {
    const res = await fetch(`${STUDIO}/api/studio`)
    return res.ok ? await res.json() : undefined
  }
  catch {
    return undefined
  }
}

async function waitFor(check, timeout, what) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const value = await check()
    if (value)
      return value
    await sleep(400)
  }
  throw new Error(`Timed out waiting for ${what}`)
}

/** Resolves once pi has finished its turn and the trace has stopped growing, with at least `minSteps` steps. */
async function waitForQuiet(minSteps) {
  let last = ''
  let since = Date.now()
  return waitFor(async () => {
    const snapshot = await studioSnapshot()
    const signature = `${snapshot?.steps.length}:${snapshot?.steps.at(-1)?.id}`
    if (signature !== last) {
      last = signature
      since = Date.now()
    }
    return snapshot && !snapshot.agent.busy && snapshot.steps.length >= minSteps && Date.now() - since > QUIET_MS && snapshot
  }, AGENT_TIMEOUT_MS, 'the agent to finish')
}

function createCamera(page) {
  const frames = []
  let lastAt = 0
  let busy = false
  const shoot = async () => {
    if (busy || Date.now() - lastAt < MIN_FRAME_GAP_MS)
      return
    busy = true
    try {
      await page.evaluate(([from, to]) => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (node.nodeValue.includes(from))
            node.nodeValue = node.nodeValue.split(from).join(to)
        }
      }, [dataFolder, shownFolder])
      const file = join(args.framesDir, `${String(frames.length + 1).padStart(2, '0')}.jpg`)
      const at = Date.now()
      await page.screenshot({ path: file, type: 'jpeg', quality: 80 })
      frames.push({ at, src: `/${relative(PUBLIC_DIR, file)}` })
      lastAt = at
    }
    finally {
      busy = false
    }
  }
  return { frames, shoot }
}

/** Shoots whenever the Studio's state changes, until stopped. */
function followStudio(camera) {
  let last = ''
  const state = { running: true }
  void (async () => {
    while (state.running) {
      const snapshot = await studioSnapshot()
      const signature = JSON.stringify([snapshot?.steps.length, snapshot?.agent.busy, snapshot?.agent.live])
      if (snapshot && signature !== last) {
        last = signature
        await sleep(700)
        await camera.shoot()
      }
      await sleep(400)
    }
  })()
  return () => {
    state.running = false
  }
}

const replies = snapshot => snapshot?.steps.filter(step => step.tool === 'reply').length ?? 0

/** Types a message in the Studio, sends it, and waits for pi's answer to land in the trace. */
async function sendMessage(page, camera, text, attach) {
  const before = replies(await studioSnapshot())
  if (attach)
    await page.getByRole('button', { name: /Attach the current view/ }).click()
  await page.locator('.tp-studio-note-input').pressSequentially(text, { delay: 18 })
  await camera.shoot()
  await page.keyboard.press('Enter')
  await waitFor(async () => replies(await studioSnapshot()) > before, AGENT_TIMEOUT_MS, `pi to answer "${text.slice(0, 40)}"`)
  await waitForQuiet(2)
  await sleep(1200)
  await camera.shoot()
}

/** The user's side of the story: each Studio message in turn, then a check of the last answer. */
async function playUser(page, camera) {
  await waitForQuiet(1)
  await sleep(1500)
  await camera.shoot()
  for (const [index, message] of (story.messages ?? []).entries())
    await sendMessage(page, camera, message, Boolean(story.attachFirst) && index === 0)
  if (story.check) {
    await page.getByRole('button', { name: /Check this answer/ }).last().click()
    await page.waitForSelector('.tp-run-report', { timeout: AGENT_TIMEOUT_MS })
    await sleep(800)
    await camera.shoot()
  }
}

if (await studioSnapshot())
  throw new Error(`Something already serves ${STUDIO}; stop it first, or the session's own Studio cannot start`)
mkdirSync(args.framesDir, { recursive: true })
mkdirSync(args.takesDir, { recursive: true })
const { extension, config } = await prepare()
const recorder = startRecorder(extension)
const recorderExit = new Promise(resolve => recorder.on('exit', resolve))
let browser
let failure
try {
  // Only this session's Studio knows it is talking to pi.
  await waitFor(async () => (await studioSnapshot())?.agent.name === 'pi', AGENT_TIMEOUT_MS, 'the session\'s Studio to connect to pi')
  browser = await chromium.launch({ channel: 'chrome' })
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 })
  await page.goto(STUDIO, { waitUntil: 'domcontentloaded' })
  // A large dataset keeps the page busy for a while after its first paint; start once it has settled.
  await page.waitForFunction(() => document.querySelector('.tp-run') && !document.body.textContent.includes('Add a Values'), null, { timeout: 30_000 }).catch(() => {})
  const camera = createCamera(page)
  const stopFollowing = followStudio(camera)
  await playUser(page, camera)
  stopFollowing()
  writeFileSync(join(args.takesDir, `${args.takeName}.studio.json`), `${JSON.stringify(camera.frames, null, 2)}\n`)
  console.log(`saved ${camera.frames.length} Studio frames`)
}
catch (error) {
  failure = error
}
finally {
  writeFileSync(doneFile, 'done')
  await browser?.close()
  await recorderExit
  rmSync(config, { force: true })
  if (readdirSync(dirname(config)).length === 0)
    rmSync(dirname(config), { recursive: true })
  rmSync(work, { recursive: true, force: true })
}
if (failure) {
  console.error(failure)
  process.exit(1)
}
