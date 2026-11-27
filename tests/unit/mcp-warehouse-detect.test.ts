import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseIni } from '../../packages/mcp/src/config-files'
import { runInitCommand } from '../../packages/mcp/src/init'
import { detectWarehouses } from '../../packages/mcp/src/warehouse-detect'

describe('finding warehouse sign-ins a person already has', () => {
  let home: string

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'tp-detect-'))
    vi.stubEnv('HOME', home)
    vi.stubEnv('USERPROFILE', home)
    vi.stubEnv('XDG_CONFIG_HOME', path.join(home, '.config'))
    for (const name of ['CLOUDSDK_CONFIG', 'GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CLOUD_PROJECT', 'SNOWFLAKE_HOME', 'SNOWFLAKE_DEFAULT_CONNECTION_NAME', 'DATABRICKS_CONFIG_FILE'])
      vi.stubEnv(name, '')
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    await fs.rm(home, { recursive: true, force: true })
  })

  async function write(rel: string, text: string) {
    const file = path.join(home, rel)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, text)
  }

  async function signInEverywhere() {
    await write('.config/gcloud/application_default_credentials.json', '{"type":"authorized_user"}')
    await write('.config/gcloud/active_config', 'work\n')
    await write('.config/gcloud/configurations/config_work', '[core]\nproject = acme-analytics\naccount = analyst@example.com\n')
    await write('.snowflake/connections.toml', '[default]\naccount = "acme-xy12345"\nuser = "ANALYST"\n')
    await write('.databrickscfg', '[DEFAULT]\nhost = https://acme.cloud.databricks.com\ntoken = dapi-test\n')
  }

  it('finds gcloud, Snowflake CLI and Databricks CLI sign-ins, pointing at them without secrets', async () => {
    await signInEverywhere()
    const found = detectWarehouses(process.env, home)
    expect(found.map(w => [w.id, w.env])).toEqual([
      ['bigquery', { TINYPIVOT_BIGQUERY_PROJECT: 'acme-analytics' }],
      ['snowflake', { TINYPIVOT_SNOWFLAKE_CONNECTION: 'default' }],
      ['databricks', { TINYPIVOT_DATABRICKS_PROFILE: 'DEFAULT' }],
    ])
    expect(JSON.stringify(found)).not.toContain('dapi-test')
  })

  it('finds nothing on a machine with no sign-ins, and ignores a gcloud project without credentials', async () => {
    expect(detectWarehouses(process.env, home)).toEqual([])
    await write('.config/gcloud/configurations/config_default', '[core]\nproject = acme\n')
    expect(detectWarehouses(process.env, home)).toEqual([])
  })

  it('init only reports what it found until --connect is passed', async () => {
    await signInEverywhere()
    await runInitCommand(['--targets=cursor', '--no-rules'])
    const cursor = JSON.parse(await fs.readFile(path.join(home, '.cursor', 'mcp.json'), 'utf8'))
    expect(cursor.mcpServers.tinypivot.env).toBeUndefined()
    expect(vi.mocked(console.log).mock.calls.flat().join('\n')).toContain('init --connect=bigquery,snowflake,databricks')
  })

  it('init --connect writes only the chosen pointers', async () => {
    await signInEverywhere()
    const summary = await runInitCommand(['--targets=cursor', '--no-rules', '--connect=bigquery,snowflake', '--json'])
    const cursor = JSON.parse(await fs.readFile(path.join(home, '.cursor', 'mcp.json'), 'utf8'))
    expect(cursor.mcpServers.tinypivot.env).toEqual({ TINYPIVOT_BIGQUERY_PROJECT: 'acme-analytics', TINYPIVOT_SNOWFLAKE_CONNECTION: 'default' })
    expect(summary?.warehouses?.connected).toEqual(['bigquery', 'snowflake'])
  })

  it('init rejects an unknown warehouse', async () => {
    const summary = await runInitCommand(['--connect=oracle', '--json'])
    expect(summary).toMatchObject({ ok: false, error: 'Unknown warehouse(s): oracle.' })
  })

  it('parses INI files with comments, quotes and keys before any section', () => {
    expect(parseIni('top = 1\n; note\n[client]\nuser = "reader"\n# x\npassword=secret\n')).toEqual({ '': { top: '1' }, 'client': { user: 'reader', password: 'secret' } })
  })
})
