/**
 * Centralized Free vs. Pro capability map for TinyPivot MCP.
 *
 * Keeping every feature gate in one place makes the Free/Pro boundary 100% fungible —
 * moving any capability between tiers is a single-line change here.
 */

export type Tier = 'free' | 'pro'

export type FeatureKey
  = | 'unlimited_rows'
    | 'direct_warehouses'
    | 'audit_basic'
    | 'audit_deep'
    | 'sql_repair_hints'
    | 'profile_relational'
    | 'recursive_memory'
    | 'analyze_basic'
    | 'analyze_pro'
    | 'claim_gate'
    | 'white_label_export'

/**
 * Current Free vs. Pro split:
 * - Free includes unlimited local rows (always accurate, never truncated), direct read-only
 *   warehouse connections (BigQuery, Snowflake, Databricks, ClickHouse, MySQL, Postgres) with
 *   0-scan schema profiling + BM25 catalog search, core SQL guardrails (non-additive warnings,
 *   zero-row case hints, dialect SQL repair), `analyze` explain_change & basic ab_test,
 *   Studio IDE + Lineage, and offline HTML export (with a subtle TinyPivot footer).
 * - Pro unlocks the Trust Layer across both local files and warehouses: 1-call deep trap
 *   profiling, deep relational/statistical audits (join fan-out, partial-period, NULL exclusion,
 *   mixed currency, duplicate IDs, outliers), Recursive Data Memory, SRM + Holm-Bonferroni guards,
 *   controlled multivariate regression, right-censored cohorts, seasonal anomaly/change-point
 *   detection, closed-loop claim verification, 10 themes, and white-label HTML / Excel exports.
 */
export const FEATURE_TIERS: Record<FeatureKey, Tier> = {
  unlimited_rows: 'free',
  direct_warehouses: 'free',
  audit_basic: 'free',
  sql_repair_hints: 'free',
  analyze_basic: 'free',
  audit_deep: 'pro',
  profile_relational: 'pro',
  recursive_memory: 'pro',
  analyze_pro: 'pro',
  claim_gate: 'pro',
  white_label_export: 'pro',
}

export function hasFeature(isPro: boolean, feature: FeatureKey): boolean {
  return FEATURE_TIERS[feature] === 'free' || isPro
}
