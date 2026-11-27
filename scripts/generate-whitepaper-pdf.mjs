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

function renderColumnChart(items, refLine, groups, showStackLegend = false) {
  const cols = items.length
  return `
    <div class="col-wrap">
      <div class="col-legend mono">
        ${showStackLegend
          ? `<span><i class="sw" style="background:#c7c0b1;"></i> Same-Model Vanilla Base</span>
             <span><i class="sw" style="background:#1d7a4f;"></i> TinyPivot Pro Lift (Stacked on Base)</span>
             <span><i class="sw" style="background:#33312d;"></i> Heavy Published Leaders</span>`
          : `<span><i class="sw" style="background:#1d7a4f;"></i> TinyPivot Pro (Lightweight MCP)</span>
             <span><i class="sw" style="background:#c7c0b1;"></i> Official ReACT Baseline</span>
             <span><i class="sw" style="background:#33312d;"></i> Heavy Benchmark Agents</span>`}
        ${refLine ? `<span><i class="sw-dash"></i> ${esc(refLine.label)}</span>` : ''}
      </div>
      ${groups
        ? `<div class="group-bar mono" style="grid-template-columns:repeat(${cols}, 1fr);">
            ${groups.map(g => `<span class="group-pill" style="grid-column:span ${g.span};">${esc(g.label)}</span>`).join('')}
           </div>`
        : ''}
      <div class="col-plot-wrap">
        <div class="grid-line" style="bottom:100%;"><span class="y-tick mono">100%</span></div>
        <div class="grid-line" style="bottom:50%;"><span class="y-tick mono">50%</span></div>
        ${refLine ? `<div class="ref-line" style="bottom:${refLine.pct}%;"><span class="ref-axis mono">${refLine.pct.toFixed(1)}%</span></div>` : ''}
        <div class="col-bars-row" style="grid-template-columns:repeat(${cols}, 1fr);">
          ${items.map((item, idx) => {
            const color = item.kind === 'tinypivot' ? '#1d7a4f' : item.kind === 'baseline' ? '#c7c0b1' : '#33312d'
            const bg = item.kind === 'tinypivot' ? 'background:#edf6f0;' : ''
            const split = idx === 3 ? 'border-left:1px dashed #c9c3b6;' : ''
            const valStyle = item.kind === 'tinypivot' ? 'color:#145a39;font-weight:700;' : 'color:#222;font-weight:600;'
            const badgeStyle = item.kind === 'tinypivot' ? 'border-color:#1d7a4f;background:#dff0e6;color:#145a39;' : ''
            const barHtml = item.baseScore !== undefined
              ? `<div class="vcol-bar vcol-stacked" style="height:${item.score}%;">
                   <div class="stack-lift" style="height:${Math.max(5, ((item.score - item.baseScore) / item.score) * 100)}%;"></div>
                   <div class="stack-base" style="height:${(item.baseScore / item.score) * 100}%;"><span class="stack-base-lbl mono">${item.baseScore.toFixed(1)}%</span></div>
                 </div>`
              : `<div class="vcol-bar" style="height:${item.score}%;background:${color};"></div>`
            return `
              <div class="vcol-bar-cell" style="${bg}${split}">
                <div class="vcol-head" style="bottom:calc(${item.score}% + 3px);">
                  ${item.badge ? `<span class="vcol-badge mono" style="${badgeStyle}">${esc(item.badge)}</span>` : ''}
                  <span class="vcol-val mono" style="${valStyle}">${item.score.toFixed(1)}%</span>
                </div>
                ${barHtml}
              </div>`
          }).join('')}
        </div>
      </div>
      <div class="col-labels-row" style="grid-template-columns:repeat(${cols}, 1fr);">
        ${items.map((item, idx) => {
          const bg = item.kind === 'tinypivot' ? 'background:#edf6f0;' : ''
          const split = idx === 3 ? 'border-left:1px dashed #c9c3b6;' : ''
          return `
            <div class="vcol-foot" style="${bg}${split}">
              <div class="vcol-name">${esc(item.shortLabel || item.label)}</div>
              <div class="vcol-mod mono">${esc(item.shortModel || item.model)}</div>
              ${item.easyScore != null
                ? `<div class="vcol-sub mono">Easy ${item.easyScore.toFixed(1)}%</div>`
                : item.instrumentation
                  ? `<div class="vcol-sub mono" style="${item.kind === 'tinypivot' ? 'color:#145a39;' : 'color:#5b554a;'}">${esc(item.instrumentation)}</div>`
                  : ''}
            </div>`
        }).join('')}
      </div>
    </div>`
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
  .col-wrap { padding: 7px 10px 8px 34px; }
  .col-legend { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 6.3pt; color: #5b554a; margin: 0 0 5px -24px; }
  .col-legend span { display: inline-flex; align-items: center; gap: 4px; }
  .group-bar { display: grid; gap: 5px; margin-bottom: 4px; font-size: 5.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #5b554a; }
  .group-pill { background: #f5f2ea; border-bottom: 1px solid #c9c3b6; padding: 2px 4px; text-align: center; }
  .sw { display: inline-block; width: 8px; height: 8px; border: 1px solid #161513; }
  .sw-dash { display: inline-block; width: 12px; height: 0; border-top: 1.5px dashed #c44a1d; }
  .col-plot-wrap { position: relative; height: 128px; margin-top: 28px; border-bottom: 1.2px solid #161513; }
  .grid-line { position: absolute; left: 0; right: 0; border-top: 1px dashed rgba(0,0,0,0.14); }
  .y-tick { position: absolute; left: -28px; top: -5px; font-size: 5.5pt; color: #7a7366; }
  .ref-line { position: absolute; left: 0; right: 0; border-top: 1.2px dashed #c44a1d; z-index: 2; }
  .ref-axis { position: absolute; left: -30px; top: -5px; color: #b03d14; font-size: 5.5pt; font-weight: 700; }
  .col-bars-row, .col-labels-row { position: relative; z-index: 3; display: grid; gap: 5px; }
  .col-bars-row { height: 100%; align-items: end; }
  .vcol-bar-cell { position: relative; height: 100%; display: flex; align-items: flex-end; justify-content: center; }
  .vcol-head { position: absolute; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 1px; z-index: 4; }
  .vcol-badge { font-size: 5.2pt; font-weight: 700; padding: 0 3px; border: 1px solid #c9c3b6; background: #f5f2ea; color: #5b554a; white-space: nowrap; }
  .vcol-val { font-size: 6.7pt; white-space: nowrap; }
  .vcol-bar { width: 62%; max-width: 46px; min-height: 3px; border: 1px solid #161513; border-bottom: 0; }
  .vcol-stacked { display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden; }
  .stack-lift { width: 100%; min-height: 3px; background: #1d7a4f; border-bottom: 1px solid #161513; }
  .stack-base { width: 100%; background: #c7c0b1; display: flex; align-items: center; justify-content: center; }
  .stack-base-lbl { font-size: 5.4pt; font-weight: 600; color: #3a362e; }
  .vcol-foot { padding: 4px 2px 3px; text-align: center; }
  .vcol-name { font-size: 6.7pt; font-weight: 700; line-height: 1.15; color: #161513; }
  .vcol-mod { font-size: 5.5pt; line-height: 1.15; color: #5b554a; margin-top: 1px; }
  .vcol-sub { font-size: 5.2pt; color: #145a39; margin-top: 1px; }
  .weight-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 6px 0 8px; }
  .weight-box { border: 1px solid #c9c3b6; padding: 6px 8px; font-size: 7.3pt; line-height: 1.38; }
  .weight-us { border-left: 3.5px solid #1d7a4f; background: #edf6f0; }
  .weight-them { border-left: 3.5px solid #33312d; background: #f5f2ea; }
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
      and delivers consistent same-model lifts across all 3 models on MIT KramaBench (<strong>72.5% → 75.2%</strong> across 372 runs; Haiku +6.1 pts, Biomedical <code>.xlsx</code> +22.2 pts &amp; 2.14× faster; local DeepSeek V4.1 +1.1 pts &amp; +10.7 pts above #2 TalkTask on the same model family).
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
      <p>Independent third-party datasets we did not author: controlled 3-model same-model A/B on 62 multi-file KramaBench tasks (372 runs across Sonnet 5.5, Haiku 5.5 &amp; local DeepSeek V4.1) plus 3 live 450-task blind Adyen DABstep leaderboard submissions.</p>
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

  <div class="weight-grid">
    <div class="weight-box weight-us">
      <strong class="mono" style="color:#145a39;font-size:6.3pt;">TINYPIVOT MCP (v0.8.5) · LIGHTWEIGHT DROP-IN TOOL</strong><br/>
      Single local MCP (&lt; 2,500 Free schema tokens): DuckDB SQL + smart <code>.xlsx</code> + 1-call profiling. Zero Jupyter, zero VLM judges, zero multi-agent loops, zero benchmark prompts.
    </div>
    <div class="weight-box weight-them">
      <strong class="mono" style="font-size:6.3pt;">LEADERBOARD SYSTEMS · HEAVY RESEARCH INSTRUMENTATION</strong><br/>
      RADAR, TalkTask, smolagents DR, NVIDIA KGMON &amp; Google DS-STAR use multi-agent planner/verifier loops, persistent Jupyter sandboxes, VLM checks, or benchmark-tuned workflows.
    </div>
  </div>

  <div class="lb-box">
    <div class="lb-head mono">EXTERNAL 01 · MIT KRAMABENCH (ICLR 2026) — STACKED SAME-MODEL LIFT VS. HEAVY LEADERS · https://kramabench.org/</div>
    ${renderColumnChart(
      wp.kramaLeaderboardBars,
      { pct: 71.2, label: 'Published #1 RADAR · 71.2%' },
      [{ label: 'Claude Family · Like-for-Like', span: 3 }, { label: 'DeepSeek-V4 Family · Like-for-Like', span: 3 }],
      true,
    )}
  </div>

  <div class="lb-box">
    <div class="lb-head mono">EXTERNAL 02 · OFFICIAL 450-TASK BLIND ADYEN DABSTEP (HARD ACCURACY %) · huggingface.co/spaces/adyen/DABstep</div>
    ${renderColumnChart(
      wp.dabstepLeaderboardBars,
      { pct: 19.8, label: 'Adyen ReACT Baseline · 19.8%' },
      [{ label: 'Lightweight TinyPivot MCP', span: 3 }, { label: 'Baseline & Heavy Benchmark Agents', span: 4 }],
      false,
    )}
  </div>
  <p class="footnote">
    <strong>Honest attribution:</strong> On <code>adyen/DABstep</code>, Sonnet 5.5’s 97.2% Easy / 68.8% Hard score is strongly driven by base-model reasoning paired with TinyPivot’s DuckDB workflow (our 10-task Dev A/B showed 90% parity on Sonnet, 80% parity on Opus, and +10 pts on Haiku, 60% → 70%). Our controlled same-model Internal Suite (91% → 100%) and 3-model MIT KramaBench A/B (72.5% → 75.2%, Haiku +6.1 pts, local DeepSeek +1.1 pts &amp; +10.7 pts above #2 TalkTask) isolate TinyPivot’s direct lift.
  </p>

  <div class="page-break"></div>
  <h2>4. Track C — Direct Warehouse Connections (${wp.WAREHOUSE_STUDY.totalRuns + wp.WAREHOUSE_LOCAL_STUDY.totalRuns} Runs Across 4 Models)</h2>
  <p>
    ${wp.WAREHOUSE_STUDY.questions} questions over fake Acme tables in BigQuery (2.7 million orders), each hiding a trap, run ${wp.WAREHOUSE_STUDY.reps} times per setup on
    ${esc(wp.warehouseResults.map(r => r.model).join(' and '))} (${wp.WAREHOUSE_STUDY.totalRuns} Claude Code runs, $${wp.WAREHOUSE_STUDY.totalCost.toFixed(2)} cold-cache API spend)
    and on small local models ${esc(wp.warehouseLocalResults.map(r => r.model.split(' (')[0]).join(' and '))} (${wp.WAREHOUSE_LOCAL_STUDY.totalRuns} local runs, 8-turn cap), on ${wp.WAREHOUSE_STUDY.date}.
  </p>
  <h3>Cloud Models (Claude Code)</h3>
  <table>
    <thead><tr><th>Model</th>${wp.warehouseArms.map(a => `<th>${esc(a.name)}</th>`).join('')}</tr></thead>
    <tbody>
      ${wp.warehouseResults.map(r => `<tr><td>${esc(r.model)}</td>${wp.warehouseArms.map((a) => {
        const cell = r.arms[a.id]
        return `<td class="mono">${cell.correct}/${wp.WAREHOUSE_STUDY.runsPerArm} correct · ${cell.avgSec.toFixed(1)}s · $${cell.cost.toFixed(2)}</td>`
      }).join('')}</tr>`).join('')}
    </tbody>
  </table>
  <h3>Small Local Models (8-Turn Cap)</h3>
  <table>
    <thead><tr><th>Model</th>${wp.warehouseLocalArms.map(a => `<th>${esc(a.name)}</th>`).join('')}</tr></thead>
    <tbody>
      ${wp.warehouseLocalResults.map(r => `<tr><td>${esc(r.model)}</td>${wp.warehouseLocalArms.map((a) => {
        const cell = r.arms[a.id]
        return `<td class="mono">${cell.correct}/${wp.WAREHOUSE_LOCAL_STUDY.runsPerArm} correct · ${cell.avgSec.toFixed(1)}s · ${cell.avgTurns.toFixed(1)}t · est. $${cell.estCost.toFixed(4)}</td>`
      }).join('')}</tr>`).join('')}
    </tbody>
  </table>
  <p class="footnote">Time is the average per question; Claude cost is cold-cache API spend for all ${wp.WAREHOUSE_STUDY.runsPerArm} runs in a cell; local models run at $0 with API-equivalent token estimates shown.
    ${wp.warehouseArms.map(a => `<strong>${esc(a.name)}:</strong> ${esc(a.body)}`).join(' ')}</p>
  <ul>
    ${wp.warehouseFindings.map(f => `<li>${esc(f)}</li>`).join('')}
  </ul>

  <div class="page-break"></div>
  <h2>5. Lightweight Neuro-Symbolic Architecture (&lt; 2,500 Free Schema Tokens)</h2>
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

  <h2>6. Unlimited Local Rows on Free &amp; 10-Second Setup</h2>
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

  <h2>Appendix C — Direct Warehouse Questions and Their Traps</h2>
  <div class="appendix-grid">
    ${wp.warehouseTasks.map(t => `
      <div class="task-card">
        <div class="task-title mono">${esc(t.id)} · ${esc(t.title)}</div>
        <div class="task-q">“${esc(t.prompt)}”</div>
        <div class="mono" style="color:#145a39;">Trap: ${esc(t.trap)}</div>
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
