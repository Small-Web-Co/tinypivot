import type { WarehouseConnector } from './warehouse.js'
import os from 'node:os'
import { databricksConfigFile, detectGcloudProject, readIniFile, readSnowflakeConnections } from './config-files.js'

/**
 * Warehouse sign-ins a person already has on this machine, found by `init` so it can offer to
 * connect them. Each one is switched on with a pointer (a project id, a connection or profile name),
 * never by copying a secret into the agent's config.
 */
export interface DetectedWarehouse {
  id: WarehouseConnector['id']
  label: string
  /** Where the sign-in was found, in a few words. */
  found: string
  /** Settings that point TinyPivot at it. */
  env: Record<string, string>
}

function detectBigQuery(env: NodeJS.ProcessEnv, home: string): DetectedWarehouse | undefined {
  const project = detectGcloudProject(env, home)
  return project
    ? { id: 'bigquery', label: 'BigQuery', found: `project ${project}, signed in with gcloud`, env: { TINYPIVOT_BIGQUERY_PROJECT: project } }
    : undefined
}

function detectSnowflake(env: NodeJS.ProcessEnv, home: string): DetectedWarehouse | undefined {
  const file = readSnowflakeConnections(env, home)
  const name = file && (file.connections[file.defaultName] ? file.defaultName : Object.keys(file.connections)[0])
  return name
    ? { id: 'snowflake', label: 'Snowflake', found: `connection "${name}" in ${file!.file}`, env: { TINYPIVOT_SNOWFLAKE_CONNECTION: name } }
    : undefined
}

function detectDatabricks(env: NodeJS.ProcessEnv, home: string): DetectedWarehouse | undefined {
  const file = databricksConfigFile(env, home)
  const profiles = readIniFile(file) ?? {}
  const name = profiles.DEFAULT?.host ? 'DEFAULT' : Object.keys(profiles).find(p => profiles[p].host)
  return name
    ? { id: 'databricks', label: 'Databricks', found: `profile "${name}" in ${file}`, env: { TINYPIVOT_DATABRICKS_PROFILE: name } }
    : undefined
}

export function detectWarehouses(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): DetectedWarehouse[] {
  return [detectBigQuery, detectSnowflake, detectDatabricks].flatMap((detect) => {
    try {
      const found = detect(env, home)
      return found ? [found] : []
    }
    catch {
      // An unreadable config file means nothing to offer, not a failed install.
      return []
    }
  })
}

export const CONNECTABLE_WAREHOUSES = ['bigquery', 'snowflake', 'databricks'] as const
