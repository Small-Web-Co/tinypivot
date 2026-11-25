#!/usr/bin/env node
/**
 * Converts raw takes from record.mjs into the compact recordings the site replays.
 *
 *   node scripts/reel/convert.mjs <manifest.json> --takes <dir> --out <dir> [--redactions <file>]
 *
 * For each manifest entry it trims the take, shortens the waits (thinking time is fast-forwarded,
 * long pauses are capped), stores only the rows that changed between frames, swaps this machine's
 * user name and any email address for stand-ins of the same length, and refuses to write anything
 * that still shows the user name, an email address or a license key.
 *
 * Manifest entry:
 *   { "id": "claude-code", "take": "claude-3.jsonl",
 *     "startWhen": "regex",            first frame to keep
 *     "startAfter": "regex",           or: start after the last frame showing this (a startup notice)
 *     "busyWhen": "regex",             frames matching this play `busySpeed` times faster
 *     "busySpeed": 4, "maxHold": 2500, "endHold": 3500,
 *     "captions": [{ "when": "regex", "title": "...", "body": "..." }] }
 *
 * Text swaps that are specific to the machine a take was recorded on (the working folder, a
 * provider label) live outside the repository, in the optional redactions file:
 *   { "claude-code": [["from", "to"], ...] }      `{home}` stands for the home folder
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { parseScreen, rowText, TERMINAL_THEME } from './ansi.mjs'

const DEFAULTS = { busySpeed: 4, maxHold: 2500, endHold: 3500, replace: [], captions: [] }
const LICENSE_KEY_RE = /TP-[A-Z]{3,5}-[A-Z0-9]{6,}/
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/gi
const USER_NAME = userInfo().username
/** Same length as the real name, so columns and box borders in the recording stay aligned. */
const USER_ALIAS = 'acme-analyst-workstation'.padEnd(USER_NAME.length, 'x').slice(0, USER_NAME.length)

function readArgs(argv) {
  const [manifestPath, ...rest] = argv
  const flag = name => rest[rest.indexOf(name) + 1]
  if (!manifestPath || !rest.includes('--takes') || !rest.includes('--out')) {
    console.error('Usage: node scripts/reel/convert.mjs <manifest.json> --takes <dir> --out <dir> [--redactions <file>]')
    process.exit(1)
  }
  const redactionsPath = rest.includes('--redactions') ? flag('--redactions') : null
  return { manifestPath, takesDir: flag('--takes'), outDir: flag('--out'), redactionsPath }
}

function readTake(path) {
  const [meta, ...frames] = readFileSync(path, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  return { meta, frames }
}

/**
 * A harness sometimes cuts a long path short ("/Users/bva..."), leaving part of the user name.
 * This matches the home folder with the name cut anywhere after its first three letters.
 */
const HOME_PARENT = homedir().slice(0, homedir().length - USER_NAME.length)
const CUT_NAME_RE = new RegExp(
  `${HOME_PARENT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(${
    Array.from({ length: Math.max(0, USER_NAME.length - 3) }, (_, i) => USER_NAME.slice(0, USER_NAME.length - 1 - i)).join('|')
  })(?![\\w-])`,
  'g',
)

/**
 * Emails in a raw screen. Colour escapes are matched first and left alone, so an address that
 * directly follows one is not mistaken for part of it (an escape ends in a letter).
 */

const EMAIL_IN_SCREEN_RE = new RegExp(`(\\x1B\\[[0-9;:]*m)|${EMAIL_RE.source}`, 'gi')

/** An address of the same length, so a banner that shows the signed-in account keeps its layout. */
function maskEmail(email) {
  return 'analyst@acme.example'.padEnd(email.length, ' ').slice(0, email.length)
}

/** Manifest swaps run first; `{home}` in one stands for this machine's home folder. */
function applyReplacements(screen, replacements) {
  const swaps = [...replacements.map(([from, to]) => [from.replace('{home}', homedir()), to]), [USER_NAME, USER_ALIAS]]
  return swaps
    .reduce((text, [from, to]) => text.split(from).join(to), screen)
    .replace(CUT_NAME_RE, (_, cut) => `${HOME_PARENT}${USER_ALIAS.slice(0, cut.length)}`)
    .replace(EMAIL_IN_SCREEN_RE, (match, escape) => (escape ? match : maskEmail(match)))
}

/** Parses every frame into exactly `rows` rows and keeps its plain text for pattern checks. */
function parseFrames(frames, rows, replacements) {
  return frames.map((frame) => {
    const parsed = parseScreen(applyReplacements(frame.screen, replacements)).slice(0, rows)
    while (parsed.length < rows)
      parsed.push([])
    return { t: frame.t, rows: parsed, text: parsed.map(rowText).join('\n') }
  })
}

/** How long each frame stays up once thinking is fast-forwarded and long pauses are capped. */
function frameHolds(frames, options) {
  const busy = options.busyWhen ? new RegExp(options.busyWhen) : null
  return frames.map((frame, index) => {
    const next = frames[index + 1]
    if (!next)
      return options.endHold
    const real = next.t - frame.t
    const hold = busy?.test(frame.text) ? real / options.busySpeed : real
    return Math.round(Math.min(hold, options.maxHold))
  })
}

/** Where the recording starts: at `startWhen`, or just past the last frame showing `startAfter`. */
function firstFrameToKeep(frames, options) {
  if (options.startAfter) {
    const regex = new RegExp(options.startAfter)
    return frames.findLastIndex(frame => regex.test(frame.text)) + 1
  }
  if (!options.startWhen)
    return 0
  const start = frames.findIndex(frame => new RegExp(options.startWhen).test(frame.text))
  if (start < 0)
    throw new Error(`${options.id}: nothing matched startWhen /${options.startWhen}/`)
  return start
}

function createStyleTable() {
  const keys = new Map([['{}', 0]])
  const styles = [{}]
  return {
    styles,
    idFor(style) {
      const key = JSON.stringify(style, Object.keys(style).sort())
      if (!keys.has(key)) {
        keys.set(key, styles.length)
        styles.push(style)
      }
      return keys.get(key)
    },
  }
}

/** Joins neighbouring runs that share a style and drops trailing unstyled spaces. */
function compactRow(runs, table) {
  const compact = []
  for (const [text, style] of runs) {
    const id = table.idFor(style)
    const last = compact.at(-1)
    if (last && last[1] === id)
      last[0] += text
    else
      compact.push([text, id])
  }
  const tail = compact.at(-1)
  if (tail && tail[1] === 0) {
    tail[0] = tail[0].trimEnd()
    if (!tail[0])
      compact.pop()
  }
  return compact
}

/** Each output frame lists only the rows that differ from the frame before it. */
function diffFrames(frames, holds, table) {
  let previous = []
  let clock = 0
  const output = frames.map((frame, index) => {
    const rows = frame.rows.map(runs => compactRow(runs, table))
    const serialized = rows.map(row => JSON.stringify(row))
    const changed = []
    serialized.forEach((row, rowIndex) => {
      if (row !== previous[rowIndex])
        changed.push([rowIndex, rows[rowIndex]])
    })
    previous = serialized
    const entry = { t: clock, rows: changed }
    clock += holds[index]
    return entry
  })
  return { frames: output, duration: clock }
}

function placeCaptions(captions, frames, times) {
  return captions.map(({ when, title, body }) => {
    const regex = new RegExp(when)
    const index = frames.findIndex(frame => regex.test(frame.text))
    if (index < 0)
      throw new Error(`Caption "${title}" never matched /${when}/`)
    return { t: times[index], title, body }
  })
}

function assertNothingPrivate(id, frames) {
  for (const frame of frames) {
    const leak = (frame.text.includes(USER_NAME) && USER_NAME)
      || frame.text.match(CUT_NAME_RE)?.[0]
      || frame.text.match(LICENSE_KEY_RE)?.[0]
      || frame.text.match(EMAIL_RE)?.find(email => !email.startsWith('analyst@acme'))
    if (leak)
      throw new Error(`${id}: a frame still shows "${leak.slice(0, 12)}…". Add a "replace" entry for it.`)
  }
}

function convert(entry, takesDir) {
  const options = { ...DEFAULTS, ...entry }
  const { meta, frames: rawFrames } = readTake(join(takesDir, options.take))
  let frames = parseFrames(rawFrames, meta.rows, options.replace)
  frames = frames.slice(firstFrameToKeep(frames, options))
  assertNothingPrivate(options.id, frames)

  const table = createStyleTable()
  const { frames: output, duration } = diffFrames(frames, frameHolds(frames, options), table)
  return {
    id: options.id,
    cols: meta.cols,
    rows: meta.rows,
    duration,
    theme: { fg: TERMINAL_THEME.fg, bg: TERMINAL_THEME.bg },
    styles: table.styles,
    frames: output,
    captions: placeCaptions(options.captions, frames, output.map(frame => frame.t)),
    transcript: frames.at(-1).text.replace(/[ \t]+$/gm, '').trim(),
  }
}

const { manifestPath, takesDir, outDir, redactionsPath } = readArgs(process.argv.slice(2))
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const redactions = redactionsPath ? JSON.parse(readFileSync(redactionsPath, 'utf8')) : {}
mkdirSync(outDir, { recursive: true })

for (const entry of manifest.recordings) {
  const recording = convert({ ...entry, replace: redactions[entry.id] ?? [] }, takesDir)
  const json = JSON.stringify(recording)
  writeFileSync(join(outDir, `${entry.id}.json`), json)
  console.log(`${entry.id}: ${recording.frames.length} frames, ${(recording.duration / 1000).toFixed(1)}s, ${(json.length / 1024).toFixed(0)} KB`)
}
