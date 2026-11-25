import { execFileSync } from 'node:child_process'
import process from 'node:process'

/**
 * Claude Code channels let an MCP server put a message into a live Claude Code session. They are
 * a research preview: the user starts Claude Code with
 * `--dangerously-load-development-channels server:tinypivot` (or `--channels`), and Claude Code
 * gives the server no way to ask whether that happened. So TinyPivot reads the command line of
 * the processes that started it. `TINYPIVOT_CLAUDE_CHANNEL=1` or `0` decides instead.
 */

export const CHANNEL_NOTIFICATION = 'notifications/claude/channel'
const CHANNEL_FLAGS = ['--channels', '--dangerously-load-development-channels']
const ANCESTORS_TO_CHECK = 5

/** True when a Claude Code command line names this server in its channel flags. */
export function commandEnablesChannel(command: string, serverName: string): boolean {
  if (!/\bclaude\b/.test(command) || !CHANNEL_FLAGS.some(flag => command.includes(flag)))
    return false
  return new RegExp(`(?:server:)?${serverName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(command)
}

/** Parent pid and command line of a process, from `ps`. */
function processInfo(pid: number): { ppid: number, command: string } | undefined {
  try {
    const out = execFileSync('ps', ['-o', 'ppid=,command=', '-p', String(pid)], { encoding: 'utf8', timeout: 2000 }).trim()
    const match = /^(\d+)\s+(.*)$/s.exec(out)
    return match ? { ppid: Number(match[1]), command: match[2] } : undefined
  }
  catch {
    return undefined
  }
}

export function claudeChannelEnabled(serverName = 'tinypivot', env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.TINYPIVOT_CLAUDE_CHANNEL === '1')
    return true
  if (env.TINYPIVOT_CLAUDE_CHANNEL === '0' || process.platform === 'win32')
    return false
  let pid = process.ppid
  for (let i = 0; i < ANCESTORS_TO_CHECK && pid > 1; i++) {
    const info = processInfo(pid)
    if (!info)
      return false
    if (commandEnablesChannel(info.command, serverName))
      return true
    pid = info.ppid
  }
  return false
}
