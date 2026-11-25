#!/usr/bin/env node
/**
 * Claude Code Stop hook from the TinyPivot plugin: when Claude finishes a reply in a turn that
 * used TinyPivot, it sends that reply to the conversation's TinyPivot Studio, so the Studio shows
 * the answer under the question and checks the numbers it quotes against the data.
 *
 * It only reads: the turn from the transcript Claude Code names, and the Studio link TinyPivot put
 * in that turn's tool results. It tells Claude nothing and never blocks; any failure is silent.
 * A turn that already answered through the Studio channel (studio_reply) is left alone.
 */

import { readFileSync } from 'node:fs'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const STUDIO_LINK = /(?:Studio|Live): (http:\/\/127\.0\.0\.1:\d+)/g
const TINYPIVOT_TOOL = /^mcp__(?:plugin_tinypivot_)?tinypivot__/
const POST_TIMEOUT_MS = 2000

function textOf(content) {
  if (typeof content === 'string')
    return content
  if (!Array.isArray(content))
    return ''
  return content.map(part => (part?.type === 'text' ? part.text ?? '' : '')).join('\n')
}

/** The entries of the last turn: everything after the user's last typed message. */
function lastTurn(entries) {
  for (let i = entries.length - 1; i >= 0; i--) {
    const message = entries[i]?.message
    const typed = entries[i]?.type === 'user' && (typeof message?.content === 'string' || (Array.isArray(message?.content) && message.content.some(part => part?.type === 'text')))
    if (typed)
      return entries.slice(i + 1)
  }
  return entries
}

/**
 * What to send to the Studio for a transcript, or null: the turn's final reply and the Studio
 * named in its TinyPivot tool results, when the turn used TinyPivot and did not reply through
 * the Studio channel already.
 */
export function answerFromTranscript(lines) {
  const entries = lines.flatMap((line) => {
    try {
      return [JSON.parse(line)]
    }
    catch {
      return []
    }
  })
  const turn = lastTurn(entries)
  const parts = turn.flatMap(entry => (Array.isArray(entry?.message?.content) ? entry.message.content : []))
  const tools = parts.filter(part => part?.type === 'tool_use').map(part => String(part.name ?? ''))
  if (!tools.some(name => TINYPIVOT_TOOL.test(name)) || tools.some(name => name.endsWith('studio_reply')))
    return null
  const studio = parts
    .filter(part => part?.type === 'tool_result')
    .flatMap(part => [...textOf(part.content).matchAll(STUDIO_LINK)].map(match => match[1]))
    .at(-1)
  const finalReply = [...turn].reverse().find(entry => entry?.type === 'assistant' && textOf(entry.message?.content).trim())
  const text = finalReply ? textOf(finalReply.message.content).trim() : ''
  return studio && text ? { studio, text } : null
}

async function main() {
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}')
  if (!input.transcript_path)
    return
  const answer = answerFromTranscript(readFileSync(input.transcript_path, 'utf8').split('\n'))
  if (!answer)
    return
  await fetch(`${answer.studio}/api/studio/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tinypivot': '1' },
    body: JSON.stringify({ text: answer.text }),
    signal: AbortSignal.timeout(POST_TIMEOUT_MS),
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  main().catch(() => {}).finally(() => process.exit(0))
