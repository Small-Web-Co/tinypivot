import type { Claim, StudioSnapshot } from '../src/studio-protocol'

/**
 * The Studio reads the trace as questions: each one starts with what the user asked and runs
 * through the steps that answered it, source to SQL to rows to the chart, ending with the answer.
 */

export type StudioStep = StudioSnapshot['steps'][number]

export type Stage = 'source' | 'transform' | 'view' | 'answer' | 'message'

export interface Run {
  id: string
  /** What the user asked, in their words; undefined when the agent did not pass it along. */
  prompt?: string
  /** Who asked: the user in the Studio or terminal, or nobody recorded. */
  askedIn: 'studio' | 'terminal' | 'unknown'
  at: string
  steps: StudioStep[]
}

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

/** A step that begins a new question: a Studio message, the user's own SQL, or a request the agent has not seen before. */
function opensRun(step: StudioStep, current: Run | undefined): boolean {
  if (!current)
    return true
  if (step.actor === 'user' && (step.tool === 'note' || step.tool === 'query'))
    return true
  return Boolean(step.ask && step.ask !== current.prompt)
}

function newRun(step: StudioStep): Run {
  if (step.actor === 'user' && step.tool === 'note')
    return { id: step.id, prompt: step.why, askedIn: 'studio', at: step.at, steps: [step] }
  if (step.actor === 'user' && step.tool === 'query')
    return { id: step.id, prompt: 'Your SQL', askedIn: 'studio', at: step.at, steps: [step] }
  return { id: step.id, prompt: step.ask, askedIn: step.ask ? 'terminal' : 'unknown', at: step.at, steps: [step] }
}

/** The trace as questions, oldest first. */
export function groupRuns(steps: StudioStep[]): Run[] {
  const runs: Run[] = []
  for (const step of steps) {
    const current = runs.at(-1)
    if (opensRun(step, current)) {
      runs.push(newRun(step))
      continue
    }
    current!.steps.push(step)
    if (!current!.prompt && step.ask) {
      current!.prompt = step.ask
      current!.askedIn = 'terminal'
    }
  }
  return runs
}

/** The run's last step that matches, e.g. its last SQL or its answer. */
export function lastStep(run: Run, matches: (step: StudioStep) => boolean): StudioStep | undefined {
  for (let i = run.steps.length - 1; i >= 0; i--) {
    if (matches(run.steps[i]))
      return run.steps[i]
  }
  return undefined
}

/** A run's title: the question, or the agent's first reason when nobody recorded the question. */
export function runTitle(run: Run): string {
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
