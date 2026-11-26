/**
 * Centralized Free vs. Pro capability map for TinyPivot MCP.
 *
 * Keeping every feature gate in one place makes the Free/Pro boundary 100% fungible —
 * moving any capability between tiers is a single-line change here.
 */

export type Tier = 'free' | 'pro'

export type FeatureKey
  = | 'unlimited_rows'
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
 * - Free includes unlimited local rows (always accurate, never truncated), core SQL guardrails
 *   (non-additive warnings, zero-row case hints, SQL repair), `analyze` explain_change & basic
 *   ab_test, Studio IDE + Lineage, and offline HTML export (with a subtle TinyPivot footer).
 * - Pro unlocks enterprise-grade relational/statistical protection (join fan-out & chasm-trap
 *   audits, partial-period & outlier audits, Turn-1 relational profiler, Recursive Data Memory,
 *   SRM + Holm-Bonferroni guards, controlled multivariate regression, right-censored cohorts,
 *   seasonal anomaly/change-point detection, closed-loop claim verification, and white-label export).
 */
export const FEATURE_TIERS: Record<FeatureKey, Tier> = {
  unlimited_rows: 'free',
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
