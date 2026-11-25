import type { Run } from '../src/runs'
import type { Claim, StepCheck, StudioSnapshot } from '../src/studio-protocol'

/**
 * The Studio reads the trace as questions: each one starts with what the user asked and runs
 * through the steps that answered it, source to SQL to rows to the chart, ending with the answer.
 */

export type StudioStep = StudioSnapshot['steps'][number]
export type StudioRun = Run<StudioStep>

export type Stage = 'source' | 'transform' | 'view' | 'answer' | 'message'

const SOURCE_TOOLS = new Set(['load_file', 'load_data', 'query_postgres', 'history', 'profile'])
const VIEW_TOOLS = new Set(['configure_chart', 'configure_pivot'])

/** Where a step sits in the path from question to answer. */
export function stageOf(step: StudioStep): Stage {
  if (step.tool === 'reply')
    return 'answer'
  if (step.tool === 'note')
    return 'message'
  if (VIEW_TOOLS.has(step.tool))
    return 'view'
  return SOURCE_TOOLS.has(step.tool) ? 'source' : 'transform'
}

/** The run's last step that matches, e.g. its last SQL or its answer. */
export function lastStep(run: StudioRun, matches: (step: StudioStep) => boolean): StudioStep | undefined {
  for (let i = run.steps.length - 1; i >= 0; i--) {
    if (matches(run.steps[i]))
      return run.steps[i]
  }
  return undefined
}

/** A run's title: the question, or the agent's first reason when nobody recorded the question. */
export function runTitle(run: StudioRun): string {
  return run.prompt ?? run.steps.find(step => step.why)?.why ?? run.steps[0].datasetName ?? 'Agent steps'
}

/** How many of an answer's numbers the data backs: `4 of 5 numbers found in the data`. */
export function claimSummary(claims: Claim[]): { found: number, checked: number, text: string } {
  const checked = claims.filter(claim => claim.status !== 'unchecked').length
  const found = claims.filter(claim => claim.status === 'found').length
  return { found, checked, text: `${found} of ${checked} number${checked === 1 ? '' : 's'} found in the data` }
}

/** The answer split into plain text and the numbers it quotes, each with its check, in order. */
export function markClaims(text: string, claims: Claim[]): Array<string | Claim> {
  const parts: Array<string | Claim> = []
  let rest = text
  for (const claim of claims) {
    const at = rest.indexOf(claim.text)
    if (at < 0)
      continue
    parts.push(rest.slice(0, at), claim)
    rest = rest.slice(at + claim.text.length)
  }
  parts.push(rest)
  return parts.filter(part => part !== '')
}

/** One line of a question's check: what held, or what did not. */
export interface CheckLine {
  ok: boolean
  text: string
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

/** The sources and re-runs, rolled up: one line for each kind that was checked. */
function stepLines(results: StepCheck[]): CheckLine[] {
  const lines: CheckLine[] = []
  for (const kind of ['source', 'rerun'] as const) {
    const ofKind = results.filter(check => check.kind === kind)
    if (ofKind.length === 0)
      continue
    const failed = ofKind.filter(check => !check.ok)
    if (failed.length === 0)
      lines.push({ ok: true, text: kind === 'source' ? `Source ${ofKind.length === 1 ? 'file' : 'files'} unchanged` : `${plural(ofKind.length, 'step')} gave the same rows again` })
    else
      lines.push(...failed.map(check => ({ ok: false, text: check.detail })))
  }
  return lines
}

/** The answer's numbers against the data: how many it backs, and which it does not. */
function claimLine(run: StudioRun): CheckLine | undefined {
  const claims = lastStep(run, step => step.tool === 'reply')?.claims ?? []
  const { found, checked } = claimSummary(claims)
  if (checked === 0)
    return undefined
  const missing = claims.filter(claim => claim.status === 'not-found').map(claim => claim.text)
  return missing.length === 0
    ? { ok: true, text: checked === 1 ? 'The number in the answer was found in the data' : `All ${checked} numbers in the answer found in the data` }
    : { ok: false, text: `${found} of ${checked} numbers in the answer found in the data; not found: ${missing.join(', ')}` }
}

/** What checking a question showed, as a short report: sources, re-runs, then the answer's numbers. */
export function checkReport(run: StudioRun, checks: Record<string, StepCheck[]>): CheckLine[] {
  const lines = stepLines(run.steps.flatMap(step => checks[step.id] ?? []))
  const claims = claimLine(run)
  return claims ? [...lines, claims] : lines
}
