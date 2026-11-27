#!/usr/bin/env node
/**
 * Generates the official publication-grade PDF white paper at:
 *   demo/public/TinyPivot-Trust-Layer-Whitepaper.pdf
 *
 * Uses Playwright Chromium to render crisp editorial Paper-theme typography, vector bar visuals,
 * full internal + external benchmark tables, and the complete 18-task + external sample appendix.
 */
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const require = createRequire(path.join(ROOT, 'package.json'))
const { chromium } = require('playwright-core')

// Transpile and load demo/site/whitepaper.ts directly so the PDF always stays 100% in sync with the site.
const wpTs = fs.readFileSync(path.join(ROOT, 'demo/site/whitepaper.ts'), 'utf8')
const { outputText } = ts.transpileModule(wpTs, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
})
const tmpModPath = path.join(ROOT, 'node_modules/.cache/whitepaper-pdf-data.mjs')
fs.mkdirSync(path.dirname(tmpModPath), { recursive: true })
fs.writeFileSync(tmpModPath, outputText)
const wp = await import(`file://${tmpModPath}?t=${Date.now()}`)

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function renderBars(items, suffix = '%') {
  return items.map((item) => {
    const color = item.kind === 'tinypivot' ? '#1d7a4f' : item.kind === 'baseline' ? '#9e9788' : '#2e2c28'
    const bg = item.kind === 'tinypivot' ? 'background:#edf6f0;' : ''
    const valColor = item.kind === 'tinypivot' ? 'color:#145a39;font-weight:700;' : 'color:#222;font-weight:600;'
    return `
      <div class="lb-row" style="${bg}">
        <div class="lb-left">
          <div class="lb-name">${esc(item.label)} <span class="lb-mod">${esc(item.model)}</span></div>
          <div class="lb-note">${esc(item.note)}</div>
        </div>
        <div class="lb-right">
          <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, item.score)}%;background:${color};"></div></div>
          <div class="lb-val"><span style="${valColor}">${item.score.toFixed(1)}${suffix}</span>${item.secondary ? ` <span class="lb-sec">· ${esc(item.secondary)}</span>` : ''}</div>
        </div>
      </div>`
  }).join('')
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>The Trust Layer for AI Data Analysis — TinyPivot Technical White Paper</title>
<style>
  @page { size: Letter; margin: 0.62in 0.65in 0.68in 0.65in; }
  * { box-sizing: border-box; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    color: #161513;
    background: #fff;
    font-size: 9.6pt;
    line-height: 1.48;
    margin: 0;
  }
  .mono { font-family: ui-monospace, 'SFMono-Regular', Menlo, Monaco, Consolas, monospace; }
  .masthead {
    border: 1.5px solid #161513;
    background: #f5f2ea;
    padding: 20px 22px 18px;
    margin-bottom: 18px;
  }
  .kicker {
    font-size: 7.4pt;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: #145a39;
    font-weight: 700;
    margin: 0 0 6px;
  }
  h1 {
    font-size: 22pt;
    line-height: 1.1;
    margin: 0 0 10px;
    font-weight: 700;
    letter-spacing: -0.015em;
  }
  .meta-line {
    font-size: 7.8pt;
    color: #555046;
    margin: 0 0 12px;
  }
  .abstract {
    border-top: 1px solid #cbc5b7;
    padding-top: 10px;
    font-size: 9.5pt;
    color: #252320;
    margin: 0 0 14px;
  }
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }
  .kpi {
    border: 1px solid #161513;
    background: #fff;
    padding: 8px 9px;
  }
  .kpi-val {
    font-size: 11.5pt;
    font-weight: 700;
    color: #145a39;
    display: block;
    margin-bottom: 3px;
  }
  .kpi-lbl {
    font-size: 7.3pt;
    line-height: 1.32;
    color: #4b463d;
  }
  h2 {
    font-size: 13pt;
    margin: 18px 0 6px;
    padding-bottom: 4px;
    border-bottom: 1.5px solid #161513;
    page-break-after: avoid;
  }
  h3 {
    font-size: 10pt;
    margin: 12px 0 5px;
    page-break-after: avoid;
  }
  p { margin: 0 0 8px; }
  .track-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin: 10px 0 14px;
  }
  .track-card {
    border: 1px solid #161513;
    background: #f8f6f0;
    padding: 10px 12px;
  }
  .badge {
    display: inline-block;
    border: 1px solid #161513;
    background: #fff;
    padding: 1px 5px;
    font-size: 6.7pt;
    font-weight: 700;
    letter-spacing: 0.06em;
    margin-bottom: 4px;
  }
  .spotlight {
    border: 1px solid #161513;
    border-left: 4px solid #1d7a4f;
    background: #edf6f0;
    padding: 9px 12px;
    margin: 10px 0 12px;
    font-size: 9pt;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0 10px;
    font-size: 7.8pt;
  }
  th, td {
    border: 1px solid #c9c3b6;
    padding: 5.5px 7px;
    text-align: left;
    vertical-align: top;
  }
  thead th {
    background: #f0ece2;
    font-family: ui-monospace, Menlo, monospace;
    font-size: 7pt;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .col-pro { background: #edf6f0; font-weight: 600; }
  tfoot td {
    background: #f5f2ea;
    font-weight: 700;
    border-top: 1.5px solid #161513;
  }
  .sub { display: block; font-size: 6.9pt; color: #5b554a; font-weight: 400; margin-top: 2px; }
  .footnote {
    font-size: 7.2pt;
    color: #555046;
    line-height: 1.4;
    margin-top: 4px;
  }
  .lb-box {
    border: 1px solid #161513;
    margin: 8px 0 12px;
    page-break-inside: avoid;
  }
  .lb-head {
    background: #f0ece2;
    border-bottom: 1px solid #161513;
    padding: 7px 10px;
    font-size: 8pt;
    font-weight: 700;
  }
  .lb-row {
    display: grid;
    grid-template-columns: 1.05fr 1.15fr;
    gap: 10px;
    padding: 6px 10px;
    border-bottom: 1px solid #e2ddd0;
    align-items: center;
  }
  .lb-row:last-child { border-bottom: 0; }
  .lb-name { font-size: 8pt; font-weight: 700; color: #161513; }
  .lb-mod { font-family: ui-monospace, Menlo, monospace; font-size: 6.8pt; font-weight: 400; color: #5b554a; }
  .lb-note { font-size: 6.9pt; color: #5b554a; margin-top: 1px; }
  .bar-track { height: 9px; background: #ece8de; border: 1px solid #cbc5b7; }
  .bar-fill { height: 100%; }
  .lb-val { font-family: ui-monospace, Menlo, monospace; font-size: 7pt; margin-top: 2px; }
  .lb-sec { color: #5b554a; }
  .pillars {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin: 8px 0 12px;
  }
  .pillar {
    border: 1px solid #c9c3b6;
    background: #faf8f3;
    padding: 9px 11px;
    page-break-inside: avoid;
  }
  .pillar-n { font-size: 7pt; color: #145a39; font-weight: 700; }
  .pillar h4 { margin: 2px 0 4px; font-size: 9.2pt; }
  .pillar p { margin: 0; font-size: 8.2pt; color: #3a362f; }
  .page-break { page-break-before: always; }
  .appendix-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 7px;
    margin-top: 8px;
  }
  .task-card {
    border: 1px solid #d2ccc0;
    background: #faf8f3;
    padding: 6px 8px;
    font-size: 7.3pt;
    line-height: 1.35;
    page-break-inside: avoid;
  }
  .task-title { font-weight: 700; color: #161513; margin-bottom: 2px; }
  .task-q { color: #2b2925; font-style: italic; margin-bottom: 2px; }
  .task-g { color: #145a39; }
</style>
</head>
<body>
  <div class="masthead">
    <p class="kicker mono">SMALL WEB, LLC · TECHNICAL WHITE PAPER · ${esc(wp.TRUST_BENCH_DATE)}</p>
    <h1>The Trust Layer for AI Data Analysis</h1>
    <p class="meta-line mono">TinyPivot MCP (@smallwebco/tinypivot-mcp) · https://tiny-pivot.com/whitepaper · Zero Heavy Tooling · &lt; 2,500 Free Schema Tokens</p>
    <p class="abstract">
      <strong>Abstract —</strong> Large language models write fluent SQL and Python, yet routinely fail silently on production data:
      multiplying totals 2.25× on many-to-many joins, dropping 40% of NULL rows on <code>!=</code>, shipping broken A/B splits, or burning
      dozens of turns wrestling with multi-sheet Excel workbooks. We evaluate <strong>TinyPivot MCP</strong> — a 100% local, zero-bloat DuckDB
      verification and analytics server — across two strictly separated tracks: (A) an <strong>Internal Controlled Suite</strong> of 18 unhinted
      BI, Relational, and Hard Data Science tasks across 5 local and frontier models (270 runs), and (B) <strong>External Public Benchmarks</strong>
      comprising a controlled same-model A/B on <strong>MIT KramaBench (ICLR 2026)</strong> and three live 450-task blind leaderboard submissions
      on <strong>Adyen / Hugging Face <code>adyen/DABstep</code></strong>. TinyPivot lifts internal accuracy monotonically from
      <strong>91% → 93% Free → 100% Pro</strong> (2.1× faster Hard Data Science; Thinking Machines <code>Inkling 2 Mini</code> +22 pts &amp; −50% output tokens)
      and delivers real same-model lifts on MIT KramaBench (<strong>77.3% → 80.9%</strong>; Haiku +6.1 pts, Biomedical <code>.xlsx</code> +22.2 pts &amp; 2.14× faster).
    </p>
    <div class="kpi-grid">
      ${wp.whitepaperHeroStats.map(s => `<div class="kpi"><span class="kpi-val mono">${esc(s.value)}</span><span class="kpi-lbl">${esc(s.label)}</span></div>`).join('')}
    </div>
  </div>

  <h2>1. Problem Statement &amp; Honest Evaluation Process</h2>
  <p>
    Syntax errors are harmless — an agent fixes them in one retry. The real barrier to trusting AI analytics in executive reviews is
    <strong>silent analytical failure</strong>: queries that execute cleanly in 12 ms while returning confident, plausible, wrong numbers.
    To prove TinyPivot adds genuine reliability rather than hiding behind a strong frontier model, we separate our benchmarks into two tracks:
  </p>
  <div class="track-grid">
    <div class="track-card">
      <div class="badge mono">TRACK A · INTERNAL CONTROLLED SUITE</div>
      <h3>18 Unhinted BI, Relational &amp; Hard DS Tasks</h3>
      <p>Zero hints in any prompt across 5 models × 3 arms (270 runs): Thinking Machines <code>Inkling 2 Mini</code>, DGX Spark <code>DeepSeek V4.1</code>, <code>Claude Haiku 5.5</code>, <code>Sonnet 5.5</code>, and <code>Opus 5.5</code>.</p>
    </div>
    <div class="track-card">
      <div class="badge mono">TRACK B · EXTERNAL PUBLIC BENCHMARKS</div>
      <h3>MIT KramaBench (ICLR 2026) &amp; Adyen DABstep</h3>
      <p>Independent third-party datasets we did not author: controlled same-model A/B on 62 multi-file KramaBench tasks (248+ runs) plus 3 live 450-task blind Adyen DABstep leaderboard submissions.</p>
    </div>
  </div>

  <div class="page-break"></div>
  <h2>2. Track A — Internal Controlled Suite (270 Runs)</h2>
  <div class="spotlight">
    <strong class="mono" style="color:#145a39;">STANDOUT LOCAL BOOST · THINKING MACHINES INKLING 2 MINI (MAC LOCAL, $0 CLOUD SPEND):</strong>
    TinyPivot Pro lifted Mac-local <strong>Thinking Machines Inkling 2 Mini</strong> by <strong>+22.2 pts</strong> (78% → 83% Free → 100% Pro, matching Opus 5.5),
    cut latency <strong>−44%</strong> (46.1s → 26.0s; 3.8× faster on Hard DS), and halved output tokens (<strong>−50%</strong>), while local Recursive Data Memory
    cut repeat schema inquiry tokens a further <strong>−47%</strong> (6 → 3 turns).
  </div>

  <table>
    <thead>
      <tr>
        <th>Model &amp; Hardware</th>
        <th>Baseline</th>
        <th>TinyPivot Free</th>
        <th class="col-pro">TinyPivot Pro</th>
        <th>Baseline → Pro Impact</th>
      </tr>
    </thead>
    <tbody>
      ${wp.trustBenchRows.map(r => `
        <tr>
          <td><strong>${esc(r.model)}</strong><span class="sub">${esc(r.hardware)} · vs ${esc(r.baselineLabel)}</span></td>
          <td><strong>${esc(r.baselineScore)} (${r.baselinePct}%)</strong><span class="sub">${esc(r.baselineMeta)}</span></td>
          <td><strong>${esc(r.freeScore)} (${r.freePct}%)</strong><span class="sub">${esc(r.freeMeta)}</span></td>
          <td class="col-pro"><strong>${esc(r.proScore)} (${r.proPct}%)</strong><span class="sub">${esc(r.proMeta)}</span></td>
          <td>${esc(r.impact.accuracy)} · ${esc(r.impact.speed)}<span class="sub">${esc(r.impact.tokens)} · ${esc(r.impact.cost)}</span></td>
        </tr>`).join('')}
    </tbody>
    <tfoot>
      <tr>
        <td>Combined (${wp.TRUST_BENCH_TOTALS.totalModelTasks} model-tasks/arm)</td>
        <td>${wp.TRUST_BENCH_TOTALS.baselinePassed}/${wp.TRUST_BENCH_TOTALS.totalModelTasks} (${wp.TRUST_BENCH_TOTALS.baselinePct}%)</td>
        <td>${wp.TRUST_BENCH_TOTALS.freePassed}/${wp.TRUST_BENCH_TOTALS.totalModelTasks} (${wp.TRUST_BENCH_TOTALS.freePct}%)</td>
        <td class="col-pro">${wp.TRUST_BENCH_TOTALS.proPassed}/${wp.TRUST_BENCH_TOTALS.totalModelTasks} (${wp.TRUST_BENCH_TOTALS.proPct}%)</td>
        <td>+9 pts overall · −25% faster avg (${wp.TRUST_BENCH_TOTALS.baselineAvgSec}s → ${wp.TRUST_BENCH_TOTALS.proAvgSec}s) · 2.1× faster Hard DS</td>
      </tr>
    </tfoot>
  </table>
  <p class="footnote">
    *Cloud API-equiv: Claude 5.5 arms ran via local Claude Code subscription ($0 extra spend) with costs calculated at published Anthropic API token rates (warm-session caching on Sonnet/Opus).
    †Imputed local API pricing: local models ran at $0 marginal cost; API-equiv USD imputed at 2026 DeepSeek-Flash Peak ($0.30/$0.006/$1.20) for DeepSeek V4.1 and GPT-4o-mini tier ($0.15/$0.075/$0.60) for Inkling 2 Mini.
  </p>

  <div class="page-break"></div>
  <h2>3. Track B — External Public Benchmarks &amp; Leaderboard Rankings</h2>
  <p>
    To separate base-model strength from TinyPivot’s direct lift, we plot our TinyPivot Pro runs (green), same-model Vanilla baselines (sand),
    and published leaderboard leaders (charcoal) side-by-side.
  </p>

  <div class="lb-box">
    <div class="lb-head mono">EXTERNAL 01 · MIT KRAMABENCH (ICLR 2026) — 4 MULTI-FILE DATA LAKES (62 TASKS) · https://kramabench.org/</div>
    ${renderBars(wp.kramaLeaderboardBars, '%')}
  </div>

  <div class="lb-box">
    <div class="lb-head mono">EXTERNAL 02 · OFFICIAL 450-TASK BLIND ADYEN DABSTEP LEADERBOARD (HARD ACCURACY %) · huggingface.co/spaces/adyen/DABstep</div>
    ${renderBars(wp.dabstepLeaderboardBars, '% Hard')}
  </div>
  <p class="footnote">
    <strong>Honest attribution:</strong> On <code>adyen/DABstep</code>, Sonnet 5.5’s 97.2% Easy / 68.8% Hard score is strongly driven by base-model reasoning paired with TinyPivot’s DuckDB workflow (our 10-task Dev A/B showed 90% parity on Sonnet, 80% parity on Opus, and +10 pts on Haiku, 60% → 70%). Our controlled same-model Internal Suite (91% → 100%) and MIT KramaBench A/B (77.3% → 80.9%, Haiku +6.1 pts) isolate TinyPivot’s direct lift.
  </p>

  <div class="page-break"></div>
  <h2>4. Lightweight Neuro-Symbolic Architecture (&lt; 2,500 Free Schema Tokens)</h2>
  <p>
    TinyPivot stays fast, local, and dependency-light by pairing LLM reasoning with deterministic DuckDB &amp; TypeScript
    verification — zero Jupyter servers, zero VLM judges, and raw rows never leave your machine.
  </p>
  <div class="pillars">
    ${wp.architecturePillars.map(p => `
      <div class="pillar">
        <div class="pillar-n mono">${esc(p.n)}</div>
        <h4>${esc(p.title)}</h4>
        <p>${esc(p.body)}</p>
      </div>`).join('')}
  </div>

  <h2>5. Unlimited Local Rows on Free &amp; 10-Second Setup</h2>
  <div class="track-grid">
    <div class="track-card">
      <div class="badge mono">TINYPIVOT MCP FREE · $0 (NO SIGNUP)</div>
      <h3>Unlimited Local Rows + Studio Lineage</h3>
      <p>Unlimited local rows (CSV, TSV, JSON, Parquet, smart <code>.xlsx</code> header/notes reading), 1-call folder profiling with partitioned file-series collapsing, DuckDB SQL, Studio IDE + Proof-of-Work Lineage, headless <code>--no-studio</code> mode, offline HTML export, basic SQL guardrails, and <code>analyze(explain_change, ab_test)</code>.</p>
    </div>
    <div class="track-card">
      <div class="badge mono">TINYPIVOT MCP PRO · $149/YR OR $399 LIFETIME</div>
      <h3>Full Enterprise Trust &amp; Data Science Engine</h3>
      <p>Deep relational &amp; statistical audits (join fan-out, chasm traps, partial trailing periods, silent NULL drops, extreme outliers), full <code>analyze</code> shelf (SRM + Holm-Bonferroni, controlled OLS, right-censored cohorts, seasonal change-points), cross-file join keys, Recursive Data Memory (−47% tokens), 10 themes, white-label HTML/<code>.xlsx</code> export, and read-only PostgreSQL.</p>
    </div>
  </div>
  <div class="spotlight" style="margin-top:6px;">
    <strong class="mono" style="color:#145a39;">1-COMMAND MULTI-HARNESS INSTALL (CLAUDE CODE, CLAUDE DESKTOP, CURSOR, ANTIGRAVITY, CODEX, OPENCODE, PI):</strong><br/>
    <span class="mono" style="font-size:8.6pt;">npx @smallwebco/tinypivot-mcp@latest init</span> &nbsp;·&nbsp; <span class="mono" style="font-size:8pt;color:#4b463d;">https://tiny-pivot.com/docs · https://tiny-pivot.com/pricing</span>
  </div>

  <div class="page-break"></div>
  <h2>Appendix A — All 18 Internal Controlled Benchmark Tasks (Exact Prompts)</h2>
  <div class="appendix-grid">
    ${wp.internalTestCatalog.map(t => `
      <div class="task-card">
        <div class="task-title">${esc(t.title)} <span class="mono" style="color:#5b554a;font-weight:400;">(${esc(t.category)})</span></div>
        <div class="task-q">“${esc(t.prompt)}”</div>
        <div><strong>Trap:</strong> ${esc(t.trap)}</div>
        <div class="task-g"><strong>Guard:</strong> ${esc(t.guardrail)}</div>
      </div>`).join('')}
  </div>

  <div class="page-break"></div>
  <h2>Appendix B — Representative External Benchmark Questions</h2>
  <h3>MIT KramaBench (ICLR 2026) — Sample Multi-File Data-Lake Questions (github.com/mitdbg/Kramabench)</h3>
  <div class="appendix-grid">
    ${wp.kramaSampleTasks.map(t => `
      <div class="task-card">
        <div class="task-title mono">${esc(t.id)} · ${esc(t.tag)}</div>
        <div class="task-q">“${esc(t.prompt)}”</div>
        <div class="mono" style="color:#145a39;">Expected: ${esc(t.expected)}</div>
      </div>`).join('')}
  </div>

  <h3>Adyen / Hugging Face <code>adyen/DABstep</code> — All 10 Official Labeled Dev Questions</h3>
  <div class="appendix-grid">
    ${wp.dabstepSampleTasks.map(t => `
      <div class="task-card">
        <div class="task-title mono">${esc(t.id)} · ${esc(t.tag)}</div>
        <div class="task-q">“${esc(t.prompt)}”</div>
        <div class="mono" style="color:#145a39;">Expected: ${esc(t.expected)}</div>
      </div>`).join('')}
  </div>
</body>
</html>`

const outPdf = path.join(ROOT, 'demo/public/TinyPivot-Trust-Layer-Whitepaper.pdf')
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
try {
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'load' })
  await page.pdf({
    path: outPdf,
    format: 'Letter',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: `<div style="font-family:ui-monospace,Menlo,monospace;font-size:7px;color:#666;width:100%;padding:0 0.65in;display:flex;justify-content:space-between;"><span>TINYPIVOT TRUST LAYER · TECHNICAL WHITE PAPER</span><span>https://tiny-pivot.com/whitepaper</span></div>`,
    footerTemplate: `<div style="font-family:ui-monospace,Menlo,monospace;font-size:7px;color:#666;width:100%;padding:0 0.65in;display:flex;justify-content:space-between;"><span>Small Web, LLC · Reproducible Local &amp; External Benchmarks (${wp.TRUST_BENCH_DATE})</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
    margin: { top: '0.62in', bottom: '0.68in', left: '0.65in', right: '0.65in' },
  })
  const stat = fs.statSync(outPdf)
  console.log(`Generated ${outPdf} (${Math.round(stat.size / 1024)} KB)`)
}
finally {
  await browser.close()
}
