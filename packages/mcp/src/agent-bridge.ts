import type { StudioNote } from './studio-protocol.js'

/**
 * How the Studio reaches the user's own agent live. pi's extension and Claude Code's channels
 * put a message straight into the conversation; every other agent gets Studio messages with its
 * next TinyPivot reply. The bridge keeps whichever ways are connected right now.
 */

export interface AgentConnector {
  /** Shown to the user, e.g. "pi" or "Claude Code channel". */
  name: string
  /** Puts a message into the agent's conversation now. Returns false when it could not. */
  push: (note: StudioNote, text: string) => boolean
}

export class AgentBridge {
  private readonly connectors = new Set<AgentConnector>()

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

  /** Delivers into the conversation through the first connector that takes it. */
  push(note: StudioNote, text: string): string | undefined {
    for (const connector of this.connectors) {
      if (connector.push(note, text))
        return connector.name
    }
    return undefined
  }
}
