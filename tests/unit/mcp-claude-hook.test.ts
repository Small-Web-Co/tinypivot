// @vitest-environment node
import { describe, expect, it } from 'vitest'
// @ts-expect-error The hook is plain JavaScript run by Claude Code; it has no type declarations.
import { answerFromTranscript } from '../../packages/mcp/hooks/studio-answer.mjs'

const line = (entry: unknown) => JSON.stringify(entry)
const user = (text: string) => line({ type: 'user', message: { role: 'user', content: text } })
const toolUse = (name: string) => line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name, input: {} }] } })
const toolResult = (text: string) => line({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text }] }] } })
const reply = (text: string) => line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } })

describe('the Claude Code hook that sends answers to the Studio', () => {
  it('sends the final reply of a turn that used TinyPivot to the Studio named in its results', () => {
    const transcript = [
      user('chart revenue'),
      toolUse('mcp__plugin_tinypivot_tinypivot__load_file'),
      toolResult('Loaded.\n↗ Live: http://127.0.0.1:47317/s/abc'),
      reply('Revenue peaked in May at 5.83M.'),
    ]
    expect(answerFromTranscript(transcript)).toEqual({ studio: 'http://127.0.0.1:47317', text: 'Revenue peaked in May at 5.83M.' })
  })

  it('looks only at the last turn, and leaves turns without TinyPivot or answered through the channel alone', () => {
    const earlier = [user('chart revenue'), toolUse('mcp__tinypivot__load_file'), toolResult('Studio: http://127.0.0.1:47317'), reply('Done.')]
    expect(answerFromTranscript([...earlier, user('thanks'), reply('You are welcome.')])).toBeNull()
    expect(answerFromTranscript([user('why?'), toolUse('mcp__tinypivot__query'), toolResult('Studio: http://127.0.0.1:47317'), toolUse('mcp__tinypivot__studio_reply'), reply('Answered.')])).toBeNull()
    expect(answerFromTranscript(['not json', user('hi'), reply('Hello.')])).toBeNull()
  })
})
