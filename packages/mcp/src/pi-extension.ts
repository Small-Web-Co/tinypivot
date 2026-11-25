import { CHART_THEME_IDS, TERMINAL_PALETTES } from '@smallwebco/tinypivot-core'

/**
 * Generates a self-contained pi coding-agent extension (`~/.pi/agent/extensions/tinypivot.ts`)
 * installed automatically by `tinypivot-mcp init`.
 *
 * Capabilities:
 * - Intercepts TinyPivot MCP tool outputs (including nested codemode calls) on `tool_execution_end`
 *   and renders framed charts & pivot tables directly in pi's TUI in full 24-bit ANSI truecolor
 *   using TinyPivot's unified theme palettes (zero extra LLM context tokens).
 * - Registers `/tinypivot-theme [theme-id]` inside pi for instant interactive theme switching
 *   persisted to `~/.config/tinypivot/preferences.json` and synced to the live Companion IDE.
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
      headers: { "Content-Type": "application/json" },
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
    return \`\${edge}\${fgBold(pal.accent, inner)}\${edge}\`;
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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function (pi: any) {
  if (typeof pi.registerEntryRenderer === "function") {
    pi.registerEntryRenderer("tinypivot-card", (entry: { data?: TinyPivotCardEntryData }) => {
      const data = entry?.data;
      if (!data?.cards?.length) return undefined;
      return {
        render(_width: number): string[] {
          const themeId = data.themeId || readActiveThemeId();
          const out: string[] = [""];
          for (const card of data.cards) {
            out.push(...renderColoredCard(card, themeId).map(l => \`  \${l}\`));
            out.push("");
          }
          return out;
        },
        invalidate() {},
      };
    });
  }

  pi.on("tool_execution_end", (event: { toolName?: string; result?: unknown; isError?: boolean }, ctx: { hasUI?: boolean }) => {
    if (ctx?.hasUI === false || event?.isError) return;
    if (!event?.toolName || !isTinyPivotTool(event.toolName)) return;

    const text = extractResultText(event.result);
    if (!text) return;
    const cards = extractTinyPivotCards(text);
    if (cards.length === 0) return;

    const themeId = readActiveThemeId();
    if (typeof pi.appendEntry === "function") {
      pi.appendEntry("tinypivot-card", { cards, themeId });
    }
  });

  if (typeof pi.registerCommand === "function") {
    pi.registerCommand("tinypivot-theme", {
      description: "Switch TinyPivot visual theme (all 10 palettes, synced with Companion IDE)",
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
