import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * SQL formatting with SQLFluff, when this machine has it: `sqlfluff` on the PATH, or the copy uv
 * keeps in its cache (`uvx --offline`, so nothing is ever downloaded). TINYPIVOT_SQLFLUFF names
 * another executable, or `off`. Only layout and capitalisation rules run, so formatting never
 * changes what a query means. Without SQLFluff the Studio formats in the browser instead.
 */

export type SqlFormatter = (sql: string) => Promise<string | null>

/** DuckDB dialect, keywords in capitals, functions in lower case. */
const CONFIG = `[sqlfluff]
dialect = duckdb
max_line_length = 80

[sqlfluff:rules:capitalisation.keywords]
capitalisation_policy = upper

[sqlfluff:rules:capitalisation.functions]
extended_capitalisation_policy = lower
`
const RULES = 'layout,capitalisation'
const TIMEOUT_MS = 10_000
const MAX_CACHED = 500

interface Runner {
  command: string
  args: string[]
}

interface RunResult {
  code: number
  stdout: string
}

function runnersFor(setting: string | undefined): Runner[] {
  if (setting === 'off')
    return []
  if (setting)
    return [{ command: setting, args: [] }]
  return [{ command: 'sqlfluff', args: [] }, { command: 'uvx', args: ['--offline', 'sqlfluff'] }]
}

function run(runner: Runner, args: string[], input: string): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(runner.command, [...runner.args, ...args], { stdio: ['pipe', 'pipe', 'ignore'], timeout: TIMEOUT_MS })
    let stdout = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.on('error', () => resolve({ code: -1, stdout: '' }))
    child.on('close', code => resolve({ code: code ?? -1, stdout }))
    child.stdin.on('error', () => {})
    child.stdin.end(input)
  })
}

function configFile(): string {
  const file = path.join(os.tmpdir(), 'tinypivot-sqlfluff.cfg')
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== CONFIG)
    fs.writeFileSync(file, CONFIG)
  return file
}

/**
 * A formatter that finds SQLFluff once, formats one query at a time (each run takes about a
 * second), and remembers what it formatted. It resolves `null` when SQLFluff is missing or fails.
 */
export function sqlfluffFormatter(setting = process.env.TINYPIVOT_SQLFLUFF): SqlFormatter {
  let found: Promise<Runner | null> | undefined
  let queue: Promise<unknown> = Promise.resolve()
  const cache = new Map<string, string | null>()

  const sqlfluff = () => {
    found ??= (async () => {
      for (const runner of runnersFor(setting)) {
        const out = await run(runner, ['--version'], '')
        if (out.code === 0 && /sqlfluff/i.test(out.stdout))
          return runner
      }
      return null
    })()
    return found
  }

  const format = async (sql: string): Promise<string | null> => {
    const runner = await sqlfluff()
    if (!runner)
      return null
    const out = await run(runner, ['fix', '--config', configFile(), '--rules', RULES, '--nocolor', '-q', '-'], sql)
    // 1 means some layout could not be fixed; what it printed is still the formatted query.
    const text = out.stdout.trim()
    return (out.code === 0 || out.code === 1) && text ? text : null
  }

  return (sql) => {
    if (cache.has(sql))
      return Promise.resolve(cache.get(sql)!)
    const result = queue.then(() => format(sql))
    queue = result.catch(() => null)
    return result.then((text) => {
      if (cache.size >= MAX_CACHED)
        cache.delete(cache.keys().next().value!)
      cache.set(sql, text)
      return text
    }, () => null)
  }
}
