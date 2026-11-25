import type { StudioNote } from './studio-protocol.js'

/**
 * How the Studio reaches the user's own agent. Each harness offers something different:
 * pi's extension and Claude Code's channels put a message into the live conversation, MCP sampling
 * answers with the agent's model outside it, and every other agent gets Studio messages with its
 * next TinyPivot reply. The bridge keeps whichever ways are connected and waits for answers.
 */

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface AgentConnector {
  /** Shown to the user, e.g. "pi" or "Claude Code channel". */
  name: string
  /** Puts a message into the agent's conversation now. Returns false when it could not. */
  push?: (note: StudioNote, text: string) => boolean
  /** Answers with the agent's own model, outside the conversation (MCP sampling). */
  complete?: (turns: ChatTurn[]) => Promise<string>
}

export class AgentBridge {
  private readonly connectors = new Set<AgentConnector>()
  private readonly waiters = new Map<string, (text: string) => void>()

  constructor(private readonly onChange: () => void) {}

  /** Adds a way to reach the agent; the returned function removes it. */
  connect(connector: AgentConnector): () => void {
    this.connectors.add(connector)
    this.onChange()
    return () => {
      if (this.connectors.delete(connector))
        this.onChange()
    }
  }

  /** Names of the ways that reach the agent right now. */
  live(): string[] {
    return [...this.connectors].map(connector => connector.name)
  }

  /** Delivers into the conversation through the first connector that can. */
  push(note: StudioNote, text: string): string | undefined {
    for (const connector of this.connectors) {
      if (connector.push?.(note, text))
        return connector.name
    }
    return undefined
  }

  completer(): AgentConnector['complete'] {
    return [...this.connectors].find(connector => connector.complete)?.complete
  }

  /** Resolves with the agent's answer to `id`, or undefined after `ms`. */
  waitForReply(id: string, ms: number): Promise<string | undefined> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiters.delete(id)
        resolve(undefined)
      }, ms)
      timer.unref?.()
      this.waiters.set(id, (text) => {
        clearTimeout(timer)
        this.waiters.delete(id)
        resolve(text)
      })
    })
  }

  /** Hands an answer to whoever waits for `re`, or to the oldest waiter when `re` is unknown. */
  answer(text: string, re?: string): boolean {
    const waiter = (re && this.waiters.get(re)) || this.waiters.values().next().value
    waiter?.(text)
    return Boolean(waiter)
  }
}
