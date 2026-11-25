import { CHART_THEME_IDS, TERMINAL_PALETTES } from '@smallwebco/tinypivot-core'

/**
 * Generates a self-contained pi coding-agent extension (`~/.pi/agent/extensions/tinypivot.ts`)
 * installed automatically by `tinypivot-mcp init`.
 *
 * Capabilities:
 * - Intercepts TinyPivot MCP tool outputs (including nested codemode calls) on `tool_execution_end`
 *   and renders framed charts & pivot tables directly in pi's TUI in full 24-bit ANSI truecolor
 *   using TinyPivot's unified theme palettes (zero extra LLM context tokens).
 * - Connects pi to TinyPivot Studio: Studio messages start a turn here, and the agent's answer
 *   goes back to the Studio.
 * - Registers `/tinypivot-theme [theme-id]` inside pi for instant interactive theme switching
 *   persisted to `~/.config/tinypivot/preferences.json` and synced to the live Studio.
 */
export function buildPiExtensionSource(): string {
  const palettesJson = JSON.stringify(TERMINAL_PALETTES, null, 2)
  const themeOrderJson = JSON.stringify(CHART_THEME_IDS)

  return `// Auto-installed by @smallwebco/tinypivot-mcp init — do not edit by hand.
// Renders TinyPivot charts & pivot tables in full 24-bit truecolor inside pi
// and adds the /tinypivot-theme slash command.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type RGB = [number, number, number];
interface Palette {
  label: string;
  accent: RGB;
  accent2: RGB;
  series: RGB[];
  muted: RGB;
  border: RGB;
  text: RGB;
}

const THEME_ORDER: string[] = ${themeOrderJson};
const PALETTES: Record<string, Palette> = ${palettesJson};

const RESET = "\\x1b[0m";
const BOLD = "\\x1b[1m";
const fg = (rgb: RGB, s: string) => \`\\x1b[38;2;\${rgb[0]};\${rgb[1]};\${rgb[2]}m\${s}\${RESET}\`;
const fgBold = (rgb: RGB, s: string) => \`\${BOLD}\\x1b[38;2;\${rgb[0]};\${rgb[1]};\${rgb[2]}m\${s}\${RESET}\`;

function getConfigDir(): string {
  return path.join(process.env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), ".config"), "tinypivot");
}

function getPreferencesPath(): string {
  return path.join(getConfigDir(), "preferences.json");
}

function getCompanionSessionPath(): string {
  return path.join(getConfigDir(), "companion.json");
}

function readActiveThemeId(): string {
  const envTheme = process.env.TINYPIVOT_THEME?.trim().toLowerCase();
  if (envTheme && envTheme in PALETTES) return envTheme;
  try {
    const raw = fs.readFileSync(getPreferencesPath(), "utf8");
    const parsed = JSON.parse(raw) as { visualTheme?: string };
    const saved = parsed.visualTheme?.trim().toLowerCase();
    if (saved && saved in PALETTES) return saved;
  } catch {
    // Default to code
  }
  return "code";
}

function saveThemePreference(themeId: string): void {
  const prefPath = getPreferencesPath();
  fs.mkdirSync(path.dirname(prefPath), { recursive: true });
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(fs.readFileSync(prefPath, "utf8")) as Record<string, unknown>;
  } catch {}
  fs.writeFileSync(prefPath, \`\${JSON.stringify({ ...existing, visualTheme: themeId }, null, 2)}\\n\`, "utf8");
}

async function syncCompanionTheme(themeId: string): Promise<void> {
  try {
    const raw = fs.readFileSync(getCompanionSessionPath(), "utf8");
    const parsed = JSON.parse(raw) as { url?: string };
    if (!parsed.url) return;
    await fetch(\`\${parsed.url}/api/theme\`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tinypivot": "1" },
      body: JSON.stringify({ theme: themeId }),
    });
  } catch {
    // Companion server may not be running
  }
}

function extractTinyPivotCards(text: string): string[] {
  const cards: string[] = [];
  const fenceRe = /\`\`\`text\\n([\\s\\S]*?)\\n\`\`\`/g;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) {
    const body = m[1].trim();
    if (body.startsWith("╭─") && body.includes("╰")) {
      cards.push(body);
    }
  }
  return cards;
}

function colorizeSegments(text: string, pal: Palette): string {
  // Colorize stacked bar glyphs █▓▒░ with distinct series colors, or sub-blocks/Braille/sparklines with accent
  return text.replace(/([█▓▒░]+)|([▏▎▍▌▋▊▉]+)|([\\u2800-\\u28ff]+)|([▁▂▃▄▅▆▇█]+)/g, (match, stacked, sub, braille, spark) => {
    if (stacked) {
      let out = "";
      for (const ch of stacked) {
        const idx = ch === "█" ? 0 : ch === "▓" ? 1 : ch === "▒" ? 2 : 3;
        out += fg(pal.series[idx % pal.series.length], ch);
      }
      return out;
    }
    if (sub) return fg(pal.accent, sub);
    if (braille) return fg(pal.accent, braille);
    if (spark) return fg(pal.accent, spark);
    return match;
  });
}

// Makes the Studio address in a card clickable, as an OSC 8 terminal hyperlink.
const CARD_LINK = /http:[/][/]127[.]0[.]0[.]1:[0-9]+/;
function hyperlink(text: string): string {
  return text.replace(CARD_LINK, url => "\\x1b]8;;" + url + "\\x1b\\\\" + url + "\\x1b]8;;\\x1b\\\\");
}

function colorizeCardLine(line: string, pal: Palette): string {
  if (line.startsWith("╭─")) {
    const withBadge = line.replace(/^(╭─ )(.+?)( ─+ )(.+?)( ─╮)$/, (_m, a, b, c, d, e) =>
      \`\${fg(pal.border, a)}\${fgBold(pal.text, b)}\${fg(pal.border, c)}\${fg(pal.accent, d)}\${fg(pal.border, e)}\`,
    );
    if (withBadge !== line) return withBadge;
    return line.replace(/^(╭─ )(.+?)( ─+╮)$/, (_m, a, b, c) =>
      \`\${fg(pal.border, a)}\${fgBold(pal.text, b)}\${fg(pal.border, c)}\`,
    );
  }
  if (line.startsWith("├─") || line.startsWith("╰")) {
    return line.replace(/([╭╮╰╯├┤┬┴┼─]+)|([^╭╮╰╯├┤┬┴┼─]+)/g, (m, border, label) => {
      if (border) return fg(pal.border, border);
      return fg(pal.muted, label);
    });
  }
  if (!line.startsWith("│") || !line.endsWith("│")) {
    return fg(pal.text, line);
  }

  const inner = line.slice(1, -1);
  const edge = fg(pal.border, "│");

  if (inner.includes("↗ Live:")) {
    return \`\${edge}\${fgBold(pal.accent, hyperlink(inner))}\${edge}\`;
  }
  if (inner.includes("▲ ") && (inner.includes("Peak:") || inner.includes("peak:"))) {
    return \`\${edge}\${fg(pal.muted, inner)}\${edge}\`;
  }
  if (inner.includes("━━ ") || inner.includes("┄┄ ")) {
    const coloredLegend = inner
      .replace(/(━━ [^ ]+(?: \\([^)]+\\))?)/g, m => fg(pal.series[0], m))
      .replace(/(┄┄ [^ ]+(?: \\([^)]+\\))?)/g, m => fg(pal.series[1] ?? pal.accent2, m))
      .replace(/(·· [^ ]+(?: \\([^)]+\\))?)/g, m => fg(pal.series[2] ?? pal.muted, m));
    return \`\${edge}\${coloredLegend}\${edge}\`;
  }
  if (inner.includes("└") && inner.includes("─")) {
    return \`\${edge}\${fg(pal.border, inner)}\${edge}\`;
  }

  // Colorize inner vertical rules, chart bars, Braille plots, and sparklines
  const styledInner = inner
    .split("│")
    .map((part) => {
      if (part.includes("┤")) {
        const i = part.indexOf("┤");
        return \`\${fg(pal.muted, part.slice(0, i))}\${fg(pal.border, "┤")}\${colorizeSegments(part.slice(i + 1), pal)}\`;
      }
      return colorizeSegments(part, pal);
    })
    .join(fg(pal.border, "│"));

  return \`\${edge}\${styledInner}\${edge}\`;
}

function renderColoredCard(rawCard: string, themeId: string): string[] {
  const pal = PALETTES[themeId] ?? PALETTES.code;
  return rawCard.split("\\n").map(line => colorizeCardLine(line, pal));
}

function extractResultText(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content
    .map(part => (part && typeof part === "object" && "text" in part ? String((part as { text?: unknown }).text ?? "") : ""))
    .join("\\n");
}

function isTinyPivotTool(toolName: string): boolean {
  return toolName.toLowerCase().includes("tinypivot");
}

interface TinyPivotCardEntryData {
  cards: string[];
  themeId: string;
  /** The same cards in full colour from the Studio, where it could provide them. */
  coloured?: Array<string | null>;
}

// TinyPivot Studio bridge: messages the user sends from the Studio arrive here, go into this
// session as a turn, and the agent's final answer goes back to the Studio.
// The Studio link TinyPivot puts in its replies ("Studio: …" or a card's "Live: …").
const STUDIO_LINK = /(?:Studio|Live): (http:[/][/]127[.]0[.]0[.]1:[0-9]+)/;
const STUDIO_HEADERS = { "Content-Type": "application/json", "x-tinypivot": "1" };

function lastAssistantText(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as { role?: string; content?: unknown };
    if (message?.role !== "assistant") continue;
    if (typeof message.content === "string") return message.content.trim();
    if (!Array.isArray(message.content)) return "";
    return message.content
      .map(part => (part && typeof part === "object" && (part as { type?: string }).type === "text" ? String((part as { text?: unknown }).text ?? "") : ""))
      .join("\\n")
      .trim();
  }
  return "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createStudioBridge(pi: any) {
  let studioUrl: string | undefined;
  let stream: AbortController | undefined;
  /** Set while a turn that a Studio message started is running, so its answer goes back. */
  let awaiting = false;

  function handleFrame(frame: string): void {
    if (!frame.startsWith("event: message")) return;
    const data = frame.split("\\n").find(line => line.startsWith("data: "));
    if (!data) return;
    const message = JSON.parse(data.slice(6)) as { text: string };
    awaiting = true;
    pi.sendMessage(
      { customType: "tinypivot-studio", content: message.text, display: true },
      { triggerTurn: true, deliverAs: "steer" },
    );
  }

  async function listen(url: string, signal: AbortSignal): Promise<void> {
    let delay = 1000;
    while (!signal.aborted) {
      try {
        const res = await fetch(url + "/api/studio/agent-stream?agent=pi", { headers: STUDIO_HEADERS, signal });
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

  return {
    /** Starts listening to the Studio named in a TinyPivot tool reply. */
    noticeToolText(text: string): void {
      const url = STUDIO_LINK.exec(text)?.[1];
      if (!url || url === studioUrl) return;
      stream?.abort();
      studioUrl = url;
      stream = new AbortController();
      void listen(url, stream.signal);
      void this.status(true);
    },
    /** Tells the Studio whether pi is working, so it can show progress. */
    async status(busy: boolean): Promise<void> {
      if (!studioUrl) return;
      await fetch(studioUrl + "/api/studio/agent-status", { method: "POST", headers: STUDIO_HEADERS, body: JSON.stringify({ busy }) }).catch(() => {});
    },
    async onAgentEnd(messages: unknown): Promise<void> {
      if (!awaiting || !studioUrl) return;
      awaiting = false;
      const text = lastAssistantText(messages);
      if (!text) return;
      await fetch(studioUrl + "/api/studio/reply", { method: "POST", headers: STUDIO_HEADERS, body: JSON.stringify({ text }) }).catch(() => {});
    },
    /** Each card in full colour from the Studio (lines in each series' colour), or null. */
    async colouredCards(cards: string[]): Promise<Array<string | null>> {
      if (!studioUrl) return cards.map(() => null);
      const url = studioUrl;
      return Promise.all(cards.map(async (card) => {
        const title = /╭─ (.+?) ─/.exec(card)?.[1];
        if (!title) return null;
        try {
          const res = await fetch(url + "/api/studio/card?title=" + encodeURIComponent(title), { signal: AbortSignal.timeout(1500) });
          return res.ok ? ((await res.json()) as { ansi?: string }).ansi ?? null : null;
        } catch {
          return null;
        }
      }));
    },
    stop(): void {
      stream?.abort();
      stream = undefined;
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function (pi: any) {
  const studio = createStudioBridge(pi);
  pi.on("agent_start", () => studio.status(true));
  pi.on("agent_end", (event: { messages?: unknown }) => studio.onAgentEnd(event?.messages));
  pi.on("agent_settled", () => studio.status(false));
  pi.on("session_shutdown", () => studio.stop());
  if (typeof pi.registerEntryRenderer === "function") {
    pi.registerEntryRenderer("tinypivot-card", (entry: { data?: TinyPivotCardEntryData }) => {
      const data = entry?.data;
      if (!data?.cards?.length) return undefined;
      return {
        render(_width: number): string[] {
          const themeId = data.themeId || readActiveThemeId();
          const out: string[] = [""];
          data.cards.forEach((card, i) => {
            const coloured = data.coloured?.[i];
            const lines = coloured ? coloured.split("\\n").map(hyperlink) : renderColoredCard(card, themeId);
            out.push(...lines.map(l => \`  \${l}\`));
            out.push("");
          });
          return out;
        },
        invalidate() {},
      };
    });
  }

  pi.on("tool_execution_end", async (event: { toolName?: string; result?: unknown; isError?: boolean }, ctx: { hasUI?: boolean }) => {
    if (event?.isError) return;
    const text = extractResultText(event.result);
    if (!text) return;
    // TinyPivot calls made through codemode arrive under another tool's name, so look at the text.
    studio.noticeToolText(text);
    const fromTinyPivot = isTinyPivotTool(event?.toolName ?? "") || event?.toolName === "codemode";
    if (!fromTinyPivot || ctx?.hasUI === false) return;
    const cards = extractTinyPivotCards(text);
    if (cards.length === 0) return;

    const themeId = readActiveThemeId();
    const coloured = await studio.colouredCards(cards);
    if (typeof pi.appendEntry === "function") {
      pi.appendEntry("tinypivot-card", { cards, themeId, coloured });
    }
  });

  if (typeof pi.registerCommand === "function") {
    pi.registerCommand("tinypivot-theme", {
      description: "Switch TinyPivot visual theme (all 10 palettes, synced with Studio)",
      handler: async (args: string, ctx: { ui?: { select?: (t: string, o: string[]) => Promise<string | undefined>; notify?: (m: string, t?: string) => void } }) => {
        const active = readActiveThemeId();
        let chosen = args?.trim().toLowerCase();

        if (!chosen || !(chosen in PALETTES)) {
          if (!ctx?.ui?.select) {
            ctx?.ui?.notify?.(\`Active TinyPivot theme: \${active}. Available: \${THEME_ORDER.join(", ")}\`, "info");
            return;
          }
          const options = THEME_ORDER.map(id => {
            const p = PALETTES[id];
            const mark = id === active ? "● " : "  ";
            return \`\${mark}\${id.padEnd(11)} \${p.label}\`;
          });
          const picked = await ctx.ui.select("TinyPivot Visual Theme", options);
          if (!picked) return;
          chosen = picked.replace(/^[● ]+/, "").trim().split(/\\s+/)[0];
        }

        if (!chosen || !(chosen in PALETTES)) return;
        saveThemePreference(chosen);
        await syncCompanionTheme(chosen);
        ctx?.ui?.notify?.(\`TinyPivot theme set to \${PALETTES[chosen].label} (\${chosen})\`, "info");
      },
    });
  }
}
`
}
