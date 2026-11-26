#!/usr/bin/env node
/**
 * Clean-room smoke test for the published `@smallwebco/tinypivot-mcp` npm tarball.
 *
 * Packs (or takes `--tarball=<path>`), installs into a throwaway directory with an empty HOME /
 * XDG_CONFIG_HOME / XDG_CACHE_HOME, and verifies CLI flags, `--json` output, exit codes, forged
 * license rejection, and live MCP stdio tool calls (plus optional cold DuckDB SQL with `--with-duckdb`).
 */
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const tarballArg = args.find(a => a.startsWith('--tarball='))?.slice('--tarball='.length)
const withDuckDb = args.includes('--with-duckdb')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tinypivot-smoke-'))
const packDir = path.join(tmpRoot, 'pack')
const installDir = path.join(tmpRoot, 'install')
const cleanHome = path.join(tmpRoot, 'home')

function cleanEnv(extra = {}) {
  return {
    PATH: process.env.PATH ?? '',
    HOME: cleanHome,
    USERPROFILE: cleanHome,
    XDG_CONFIG_HOME: path.join(cleanHome, '.config'),
    XDG_CACHE_HOME: path.join(cleanHome, '.cache'),
    APPDATA: path.join(cleanHome, 'AppData', 'Roaming'),
    TINYPIVOT_TELEMETRY: '0',
    TINYPIVOT_OPEN_STUDIO: '0',
    TINYPIVOT_NO_COMPANION: '1',
    NO_COLOR: '1',
    ...extra,
  }
}

function runBin(binPath, binArgs, { input, env } = {}) {
  try {
    const stdout = execFileSync(process.execPath, [binPath, ...binArgs], {
      cwd: installDir,
      env: cleanEnv(env),
      input,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30_000,
    })
    return { status: 0, stdout, stderr: '' }
  }
  catch (err) {
    return {
      status: typeof err.status === 'number' ? err.status : 1,
      stdout: typeof err.stdout === 'string' ? err.stdout : String(err.stdout ?? ''),
      stderr: typeof err.stderr === 'string' ? err.stderr : String(err.stderr ?? ''),
    }
  }
}

function runMcpStdioSession(binPath, csvPath, { env = {}, queryDuckDb = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [binPath, '--no-companion'], {
      cwd: installDir,
      env: cleanEnv(env),
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stderr = ''
    let buffer = ''
    const pending = new Map()
    let nextId = 1

    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`MCP stdio smoke session timed out.\nstderr:\n${stderr}`))
    }, queryDuckDb ? 120_000 : 30_000)

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })

    child.stdout.on('data', (chunk) => {
      buffer += String(chunk)
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed)
          continue
        try {
          const msg = JSON.parse(trimmed)
          if (typeof msg.id === 'number' && pending.has(msg.id)) {
            const resolver = pending.get(msg.id)
            pending.delete(msg.id)
            resolver(msg)
          }
        }
        catch {
          // Ignore non-JSON lines if any
        }
      }
    })

    child.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    const sendRequest = (method, params = {}) => new Promise((res) => {
      const id = nextId++
      pending.set(id, res)
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
    })

    const sendNotification = (method, params = {}) => {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`)
    }

    ;(async () => {
      try {
        const initRes = await sendRequest('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'smoke-test', version: '1.0.0' },
        })
        assert.equal(initRes.result?.serverInfo?.name, 'tinypivot', 'serverInfo.name should be tinypivot')
        sendNotification('notifications/initialized', {})

        const toolsRes = await sendRequest('tools/list', {})
        const tools = toolsRes.result?.tools ?? []
        const byName = new Map(tools.map(t => [t.name, t]))
        for (const roTool of ['load_file', 'load_data', 'query', 'profile', 'list_datasets', 'configure_chart', 'configure_pivot']) {
          const tool = byName.get(roTool)
          assert.ok(tool, `Missing tool ${roTool}`)
          assert.equal(tool.annotations?.readOnlyHint, true, `${roTool} should expose readOnlyHint: true`)
        }

        const loadRes = await sendRequest('tools/call', {
          name: 'load_file',
          arguments: {
            filePath: csvPath,
            name: 'Smoke Sales',
            why: 'Clean-room smoke test load',
            ask: 'Revenue by region',
            chartConfig: {
              type: 'bar',
              xAxisField: 'region',
              yAxisField: 'revenue',
              aggregation: 'sum',
            },
          },
        })
        assert.ok(!loadRes.result?.isError, `load_file failed: ${JSON.stringify(loadRes)}`)
        const loadText = loadRes.result?.content?.[0]?.text ?? ''
        assert.ok(loadText.includes('Smoke Sales'), 'load_file reply should include dataset name')

        const errRes = await sendRequest('tools/call', {
          name: 'profile',
          arguments: { datasetId: 'does_not_exist' },
        })
        assert.equal(errRes.result?.isError, true, 'missing datasetId should set isError: true')
        const errText = errRes.result?.content?.[0]?.text ?? ''
        assert.ok(errText.includes('list_datasets'), `missing dataset error should include recovery hint, got: ${errText}`)

        if (queryDuckDb) {
          const sql = `SELECT region, SUM(revenue) AS total FROM '${csvPath.replace(/'/g, '\'\'')}' GROUP BY 1 ORDER BY total DESC`
          let queryRes = await sendRequest('tools/call', {
            name: 'query',
            arguments: { sql, name: 'DuckDB Smoke', why: 'Verify cold DuckDB download and SQL execution' },
          })
          // If first call returned downloading message, retry once
          if ((queryRes.result?.content?.[0]?.text ?? '').includes('DuckDB is downloading')) {
            await new Promise(r => setTimeout(r, 15_000))
            queryRes = await sendRequest('tools/call', {
              name: 'query',
              arguments: { sql, name: 'DuckDB Smoke', why: 'Retry after DuckDB download' },
            })
          }
          assert.ok(!queryRes.result?.isError, `DuckDB query failed: ${JSON.stringify(queryRes)}`)
          const queryText = queryRes.result?.content?.[0]?.text ?? ''
          assert.ok(queryText.includes('DuckDB Smoke'), `DuckDB query reply missing dataset name: ${queryText}`)
        }

        child.stdin.end()
        await new Promise(r => child.once('exit', r))
        clearTimeout(timeout)
        resolve({ stderr })
      }
      catch (err) {
        clearTimeout(timeout)
        child.kill('SIGKILL')
        reject(err)
      }
    })()
  })
}

async function main() {
  try {
    fs.mkdirSync(packDir, { recursive: true })
    fs.mkdirSync(installDir, { recursive: true })
    fs.mkdirSync(cleanHome, { recursive: true })

    let tarballPath = tarballArg ? path.resolve(tarballArg) : ''
    if (!tarballPath) {
      execFileSync('pnpm', ['--filter', '@smallwebco/tinypivot-mcp', 'pack', '--pack-destination', packDir], {
        cwd: repoRoot,
        stdio: 'inherit',
      })
      const tgz = fs.readdirSync(packDir).find(f => f.endsWith('.tgz'))
      assert.ok(tgz, 'pnpm pack did not produce a .tgz file')
      tarballPath = path.join(packDir, tgz)
    }

    fs.writeFileSync(path.join(installDir, 'package.json'), '{"name":"smoke-consumer","private":true}\n')
    execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
      'install',
      '--no-save',
      '--no-audit',
      '--no-fund',
      tarballPath,
    ], {
      cwd: installDir,
      env: cleanEnv(),
      stdio: 'inherit',
    })

    const binPath = path.join(installDir, 'node_modules', '@smallwebco', 'tinypivot-mcp', 'dist', 'cli.js')
    assert.ok(fs.existsSync(binPath), `Installed CLI binary missing at ${binPath}`)

    // 1. --help
    const help = runBin(binPath, ['--help'])
    assert.equal(help.status, 0, `--help failed: ${help.stderr}`)
    assert.ok(help.stdout.includes('--json'), '--help should document --json')

    // 2. init --all --dry-run --json
    const initDry = runBin(binPath, ['init', '--all', '--dry-run', '--json'])
    assert.equal(initDry.status, 0, `init --all --dry-run --json failed: ${initDry.stdout} ${initDry.stderr}`)
    const initDryJson = JSON.parse(initDry.stdout)
    assert.equal(initDryJson.ok, true)
    assert.equal(initDryJson.dryRun, true)
    assert.ok(initDryJson.configuredCount >= 8)

    // 3. init --targets=claude --json writes config + rules in clean HOME
    const initClaude = runBin(binPath, ['init', '--targets=claude', '--json'])
    assert.equal(initClaude.status, 0, `init --targets=claude --json failed: ${initClaude.stdout}`)
    const initClaudeJson = JSON.parse(initClaude.stdout)
    assert.equal(initClaudeJson.ok, true)
    assert.ok(fs.existsSync(path.join(cleanHome, '.claude.json')), '.claude.json should be created')
    assert.ok(fs.existsSync(path.join(cleanHome, '.claude', 'CLAUDE.md')), 'CLAUDE.md should be created')

    // 4. init fails loudly with exit code 1 on unknown target
    const initBad = runBin(binPath, ['init', '--targets=nonexistent', '--json'])
    assert.equal(initBad.status, 1, 'unknown target should exit 1')
    const initBadJson = JSON.parse(initBad.stdout)
    assert.equal(initBadJson.ok, false)
    assert.ok(Array.isArray(initBadJson.validTargets), 'error JSON should include validTargets')

    // 5. theme list --json never prompts and returns active theme
    const themeList = runBin(binPath, ['theme', 'list', '--json'])
    assert.equal(themeList.status, 0, `theme list --json failed: ${themeList.stdout}`)
    const themeJson = JSON.parse(themeList.stdout)
    assert.equal(themeJson.ok, true)
    assert.equal(themeJson.active, 'code')
    assert.ok(themeJson.themes.length >= 10)

    // 6. Piped CSV with --json (plus forged license stays Free tier!)
    const csvSample = 'region,revenue\nNorth,100\nSouth,200\n'
    const piped = runBin(binPath, ['--json', '--name=SmokePipe'], {
      input: csvSample,
      env: { TINYPIVOT_LICENSE_KEY: 'TP-MCPP-forged-20991231' },
    })
    assert.equal(piped.status, 0, `piped --json failed: ${piped.stderr}`)
    const pipedJson = JSON.parse(piped.stdout)
    assert.equal(pipedJson.ok, true)
    assert.equal(pipedJson.tier, 'free', 'forged TP-MCPP key must NOT unlock Pro tier')
    assert.equal(pipedJson.dataset.rowCount, 2)
    assert.ok(pipedJson.chart.card.includes('SmokePipe'))

    // 7. Live MCP stdio JSON-RPC round-trip (with forged key rejection check + optional DuckDB)
    const csvPath = path.join(tmpRoot, 'smoke.csv')
    fs.writeFileSync(csvPath, csvSample, 'utf8')
    const session = await runMcpStdioSession(binPath, csvPath, {
      env: { TINYPIVOT_LICENSE_KEY: 'TP-MCPP-forged-20991231' },
      queryDuckDb: withDuckDb,
    })
    assert.ok(
      session.stderr.includes('failed signature verification'),
      `forged license should log signature verification warning on stderr, got:\n${session.stderr}`,
    )

    console.log(`✓ Clean-room MCP smoke test passed${withDuckDb ? ' (including cold DuckDB SQL)' : ''}.`)
  }
  finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error('✗ Clean-room MCP smoke test failed:', err)
  process.exit(1)
})
