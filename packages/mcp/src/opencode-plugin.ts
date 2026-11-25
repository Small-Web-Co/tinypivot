import { EXTENSION_HEADER } from './agent-bridge.js'

/**
 * Generates TinyPivot's OpenCode plugin (`~/.config/opencode/plugins/tinypivot.js`), installed by
 * `tinypivot-mcp init`. It connects the OpenCode session that uses TinyPivot to TinyPivot Studio:
 * a message the user sends from the Studio becomes a prompt in that session right away, and the
 * agent's answer goes back to the Studio. It does what the pi extension's Studio bridge does,
 * through OpenCode's plugin hooks and SDK client.
 *
 * Plain JavaScript with no imports, so OpenCode can load the file as it is.
 */
export function buildOpenCodePluginSource(): string {
  return `${EXTENSION_HEADER} — do not edit by hand.
// Connects this OpenCode session to TinyPivot Studio: messages sent from the Studio arrive here
// as prompts, and the agent's answer goes back to the Studio.

// The Studio link TinyPivot puts in its replies ("Studio: …" or a card's "Live: …").
const STUDIO_LINK = /(?:Studio|Live): (http:[/][/]127[.]0[.]0[.]1:[0-9]+)/;
const STUDIO_HEADERS = { "Content-Type": "application/json", "x-tinypivot": "1" };

// OpenCode treats every exported function as a plugin, so only the plugin is exported.

/** The text of the newest assistant message, from \`client.session.messages\`. */
function lastAssistantText(messages) {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.info?.role !== "assistant") continue;
    return (message.parts ?? [])
      .filter(part => part?.type === "text" && !part.synthetic && !part.ignored)
      .map(part => part.text ?? "")
      .join("\\n")
      .trim();
  }
  return "";
}

/** A tool's reply text: MCP tools hand over \`{ content: [{ type: "text", text }] }\`, built-in tools \`{ output }\`. */
function toolText(output) {
  if (typeof output?.output === "string") return output.output;
  if (!Array.isArray(output?.content)) return "";
  return output.content.map(part => (part?.type === "text" ? part.text ?? "" : "")).join("\\n");
}

export const TinyPivotStudio = async ({ client }) => {
  let studioUrl;
  let stream;
  /** The OpenCode session that called TinyPivot last: Studio messages go there. */
  let sessionID;
  /** Set while a turn that a Studio message started is running, so its answer goes back. */
  let awaiting = false;

  function post(route, body) {
    if (!studioUrl) return Promise.resolve();
    return fetch(studioUrl + route, { method: "POST", headers: STUDIO_HEADERS, body: JSON.stringify(body) }).catch(() => {});
  }

  async function deliver(text) {
    if (!sessionID) return;
    awaiting = true;
    try {
      await client.session.promptAsync({ path: { id: sessionID }, body: { parts: [{ type: "text", text }] } });
    } catch (error) {
      awaiting = false;
      console.error("[tinypivot] Could not send the Studio message to OpenCode:", error);
    }
  }

  function handleFrame(frame) {
    if (!frame.startsWith("event: message")) return;
    const data = frame.split("\\n").find(line => line.startsWith("data: "));
    if (!data) return;
    const message = JSON.parse(data.slice(6));
    if (typeof message?.text === "string") void deliver(message.text);
  }

  async function listen(url, signal) {
    let delay = 1000;
    while (!signal.aborted) {
      try {
        const res = await fetch(url + "/api/studio/agent-stream?agent=opencode", { headers: STUDIO_HEADERS, signal });
        if (!res.ok || !res.body) throw new Error("Studio stream " + res.status);
        delay = 1000;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let end = buffer.indexOf("\\n\\n");
          while (end >= 0) {
            handleFrame(buffer.slice(0, end));
            buffer = buffer.slice(end + 2);
            end = buffer.indexOf("\\n\\n");
          }
        }
      } catch {
        // The Studio restarted or closed; try again after a pause.
      }
      if (signal.aborted) return;
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 30000);
    }
  }

  /** Starts listening to the Studio named in a TinyPivot tool reply. */
  function noticeToolText(text) {
    const url = STUDIO_LINK.exec(text)?.[1];
    if (!url || url === studioUrl) return;
    stream?.abort();
    studioUrl = url;
    stream = new AbortController();
    void listen(url, stream.signal);
  }

  async function sendAnswer() {
    if (!awaiting || !sessionID) return;
    awaiting = false;
    try {
      const res = await client.session.messages({ path: { id: sessionID } });
      const text = lastAssistantText(res?.data);
      if (text) await post("/api/studio/reply", { text });
    } catch (error) {
      console.error("[tinypivot] Could not read OpenCode's answer for the Studio:", error);
    }
  }

  return {
    "tool.execute.after": async (input, output) => {
      if (!String(input?.tool ?? "").toLowerCase().includes("tinypivot")) return;
      sessionID = input.sessionID;
      noticeToolText(toolText(output));
    },
    event: async ({ event }) => {
      if (!sessionID || event?.properties?.sessionID !== sessionID) return;
      // Tells the Studio whether OpenCode is working, so it can show progress.
      if (event.type === "session.status") await post("/api/studio/agent-status", { busy: event.properties.status?.type === "busy" });
      if (event.type === "session.idle") {
        await post("/api/studio/agent-status", { busy: false });
        await sendAnswer();
      }
    },
  };
};
`
}
