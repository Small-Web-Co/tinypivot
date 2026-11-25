import type { TraceStep } from './studio-protocol.js'

/**
 * The trace as questions: each one starts with what the user asked and runs through the steps
 * that answered it. The Studio shows them this way, and an answer is checked against its own.
 */

export interface Run<S extends TraceStep = TraceStep> {
  id: string
  /** What the user asked, in their words; undefined when the agent did not pass it along. */
  prompt?: string
  /** Who asked: the user in the Studio or terminal, or nobody recorded. */
  askedIn: 'studio' | 'terminal' | 'unknown'
  at: string
  steps: S[]
}

/** A step that begins a new question: a Studio message, the user's own SQL, or a request the agent has not seen before. */
function opensRun<S extends TraceStep>(step: S, current: Run<S> | undefined): boolean {
  if (!current)
    return true
  if (step.actor === 'user' && (step.tool === 'note' || step.tool === 'query'))
    return true
  return Boolean(step.ask && step.ask !== current.prompt)
}

function newRun<S extends TraceStep>(step: S): Run<S> {
  if (step.actor === 'user' && step.tool === 'note')
    return { id: step.id, prompt: step.why, askedIn: 'studio', at: step.at, steps: [step] }
  if (step.actor === 'user' && step.tool === 'query')
    return { id: step.id, prompt: 'Your SQL', askedIn: 'studio', at: step.at, steps: [step] }
  return { id: step.id, prompt: step.ask, askedIn: step.ask ? 'terminal' : 'unknown', at: step.at, steps: [step] }
}

/** The trace as questions, oldest first. */
export function groupRuns<S extends TraceStep>(steps: S[]): Array<Run<S>> {
  const runs: Array<Run<S>> = []
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
