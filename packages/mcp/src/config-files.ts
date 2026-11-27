import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse as parseToml } from 'smol-toml'

/**
 * Readers for the config files database tools already keep on people's machines (gcloud, the
 * Snowflake CLI, the Databricks CLI, the MySQL client), so TinyPivot can reuse a sign-in someone
 * already has instead of asking for another one. Secrets are read where they live, never copied.
 */

export type IniFile = Record<string, Record<string, string>>

/** Parses an INI file: `[section]` headers, `key = value` lines, `;` and `#` comments. Keys before any section go under ''. */
export function parseIni(text: string): IniFile {
  const out: IniFile = {}
  let section = ''
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith(';') || line.startsWith('#'))
      continue
    const header = line.match(/^\[(.+)\]$/)
    if (header) {
      section = header[1].trim()
      continue
    }
    const eq = line.indexOf('=')
    const key = (eq === -1 ? line : line.slice(0, eq)).trim()
    const value = eq === -1 ? '' : line.slice(eq + 1).trim().replace(/^(["'])(.*)\1$/, '$2')
    ;(out[section] ??= {})[key] = value
  }
  return out
}

/** The file's text, or undefined when it does not exist or cannot be read. */
export function readTextFile(file: string): string | undefined {
  try {
    return fs.readFileSync(file, 'utf8')
  }
  catch {
    return undefined
  }
}

export function readIniFile(file: string): IniFile | undefined {
  const text = readTextFile(file)
  return text === undefined ? undefined : parseIni(text)
}

export function readTomlFile(file: string): Record<string, unknown> | undefined {
  const text = readTextFile(file)
  return text === undefined ? undefined : parseToml(text) as Record<string, unknown>
}

/** `~/…` expanded to the home folder. */
export function expandHome(file: string, home = os.homedir()): string {
  return file === '~' || file.startsWith('~/') ? path.join(home, file.slice(1)) : file
}

/** The first of `files` that exists. */
export function firstExisting(files: string[]): string | undefined {
  return files.find(file => fs.existsSync(file))
}

/* gcloud */

/** The project of gcloud's active configuration, when gcloud has application default credentials to use with it. */
export function detectGcloudProject(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): string | undefined {
  const configDir = env.CLOUDSDK_CONFIG || path.join(home, '.config', 'gcloud')
  const credentials = env.GOOGLE_APPLICATION_CREDENTIALS || path.join(configDir, 'application_default_credentials.json')
  if (!fs.existsSync(credentials))
    return undefined
  if (env.GOOGLE_CLOUD_PROJECT)
    return env.GOOGLE_CLOUD_PROJECT
  const active = readTextFile(path.join(configDir, 'active_config'))?.trim() || 'default'
  return readIniFile(path.join(configDir, 'configurations', `config_${active}`))?.core?.project || undefined
}

/* Snowflake: the connections.toml shared by the Snowflake CLI, the Python connector and Snowflake's MCP server. */

export function snowflakeHomeDirs(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): string[] {
  return [
    ...(env.SNOWFLAKE_HOME ? [env.SNOWFLAKE_HOME] : []),
    path.join(home, '.snowflake'),
    ...(process.platform === 'darwin' ? [path.join(home, 'Library', 'Application Support', 'snowflake')] : []),
    path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'snowflake'),
  ]
}

export interface SnowflakeConnectionFile {
  file: string
  /** The connection to use when none is named: config.toml's default, else `default`. */
  defaultName: string
  connections: Record<string, Record<string, unknown>>
}

export function readSnowflakeConnections(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): SnowflakeConnectionFile | undefined {
  for (const dir of snowflakeHomeDirs(env, home)) {
    const file = path.join(dir, 'connections.toml')
    const connections = readTomlFile(file)
    if (!connections)
      continue
    const config = readTomlFile(path.join(dir, 'config.toml'))
    const fromConfig = typeof config?.default_connection_name === 'string' ? config.default_connection_name : undefined
    const defaultName = env.SNOWFLAKE_DEFAULT_CONNECTION_NAME || fromConfig || 'default'
    const tables = Object.fromEntries(Object.entries(connections).filter(([, v]) => typeof v === 'object' && v !== null)) as Record<string, Record<string, unknown>>
    return { file, defaultName, connections: tables }
  }
  return undefined
}

/* Databricks: the profiles the Databricks CLI and SDKs read. */

export function databricksConfigFile(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): string {
  return env.DATABRICKS_CONFIG_FILE || path.join(home, '.databrickscfg')
}

/* MySQL: the client option file. */

export function mysqlOptionFile(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): string {
  return env.MYSQL_OPTION_FILE || path.join(home, '.my.cnf')
}
