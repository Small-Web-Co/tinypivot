<script setup lang="ts">
import CodeBlock from '../components/site/CodeBlock.vue'
import InstallBox from '../components/site/InstallBox.vue'
import SavingsCalculator from '../components/site/SavingsCalculator.vue'
import { edges, harnesses, prompts, telemetryEnvVars, tools } from '../site/docs'
import { CACHED_REREAD_FACTOR, CARD_ECHO_TOKENS, OUTPUT_TOKENS_PER_REWRITE, TOKENS_PER_CELL, TOOL_REPLY_TOKENS } from '../site/savings'
import { useCopy } from '../site/useCopy'

const toc = [
  { id: 'quickstart', label: 'Quick start' },
  { id: 'setup', label: 'Setup by harness' },
  { id: 'prompts', label: 'Prompts' },
  { id: 'why', label: 'Why TinyPivot' },
  { id: 'studio', label: 'Studio' },
  { id: 'checks', label: 'Checking answers' },
  { id: 'tools', label: 'Tools' },
  { id: 'savings', label: 'Token savings' },
  { id: 'privacy', label: 'Privacy' },
] as const

const { copiedKey, copy } = useCopy()
</script>

<template>
  <main class="docs">
    <div class="wrap docs-grid">
      <nav class="docs-toc" aria-label="On this page">
        <p class="label docs-toc-title">
          On this page
        </p>
        <a v-for="item in toc" :key="item.id" :href="`#${item.id}`" class="docs-toc-link">{{ item.label }}</a>
      </nav>

      <div class="docs-body">
        <header class="docs-head">
          <p class="label">
            Docs · MCP server
          </p>
          <h1 class="display">
            Set up TinyPivot <em>in a minute.</em>
          </h1>
          <p class="lede">
            One command configures every harness on your machine. Ask your agent to chart something and the result opens as an interactive chart and pivot.
          </p>
        </header>

        <section id="quickstart" class="docs-section">
          <h2 class="heading">
            Quick start
          </h2>
          <InstallBox source="docs" />
          <ol class="steps">
            <li>Run the command above.</li>
            <li>Restart your harness so it picks up the new MCP server.</li>
            <li>Ask: <q>Open TinyPivot and show me sample revenue by region.</q></li>
          </ol>
        </section>

        <section id="setup" class="docs-section">
          <h2 class="heading">
            Setup by harness
          </h2>
          <p class="docs-text">
            Prefer to edit config files yourself? Pick your harness.
          </p>
          <div class="accordion">
            <details v-for="(h, i) in harnesses" :key="h.id" class="acc" :open="i === 0">
              <summary class="acc-sum">
                <span class="acc-title">{{ h.label }}</span>
                <span class="acc-icon" aria-hidden="true">+</span>
              </summary>
              <div class="acc-body">
                <p class="docs-text">
                  {{ h.summary }}
                </p>
                <CodeBlock :code="h.code" :filename="h.filename" />
              </div>
            </details>
          </div>
        </section>

        <section id="prompts" class="docs-section">
          <h2 class="heading">
            Prompts to try
          </h2>
          <ul class="prompts">
            <li v-for="(prompt, i) in prompts" :key="prompt">
              <button type="button" class="prompt" @click="copy(`prompt-${i}`, prompt)">
                <span>{{ prompt }}</span>
                <span class="prompt-copy label">{{ copiedKey === `prompt-${i}` ? 'Copied' : 'Copy' }}</span>
              </button>
            </li>
          </ul>
        </section>

        <section id="why" class="docs-section">
          <h2 class="heading">
            Why TinyPivot, <em>not a chat artifact</em>
          </h2>
          <p class="docs-text">
            A chat app can draw a chart from a few rows you paste in. TinyPivot is for real files and real questions, in the agent you already use.
          </p>
          <dl class="tools ledger">
            <div v-for="edge in edges" :key="edge.title" class="tool">
              <dt>
                <strong>{{ edge.title }}</strong>
              </dt>
              <dd class="docs-text">
                {{ edge.body }}
              </dd>
            </div>
          </dl>
        </section>

        <section id="studio" class="docs-section">
          <h2 class="heading">
            TinyPivot Studio
          </h2>
          <p class="docs-text">
            In a terminal agent, the first TinyPivot step opens the Studio at <code>http://127.0.0.1:47317</code>.
            A Studio tab left open from an earlier session reconnects instead. Set <code>TINYPIVOT_OPEN_STUDIO=0</code> to open it yourself.
          </p>
          <ul class="docs-text studio-list">
            <li><strong>Questions.</strong> Each question you ask, with every step that answered it: the source, the SQL, the rows, the chart and the agent's answer. Each step carries the agent's reason (the <code>why</code> it passes on every data tool); <em>Rows</em> and <em>Chart</em> show the data as it was right after that step.</li>
            <li><strong>SQL workbench.</strong> Edit a step's SQL, or start from the SQL behind any loaded table, with completion for tables, columns and DuckDB functions. It runs read-only with DuckDB on your machine, and the result becomes your own step, keeping the step's chart when its fields still exist. SQL is laid out by <a href="https://sqlfluff.com" target="_blank" rel="noopener">SQLFluff</a> when it is installed (<code>uv tool install sqlfluff</code>), and by a built-in formatter otherwise.</li>
            <li><strong>Messages.</strong> Write what to check or change, drop in files or images, and attach the current view. In pi, in OpenCode (with the plugin <code>init</code> installs) and in Claude Code started with <code>--dangerously-load-development-channels server:tinypivot</code>, the message starts a turn at once and the answer comes back to the Studio. In other agents the message box says how to ask from the terminal instead.</li>
            <li><strong>Dashboard filters.</strong> Ask for a dashboard you can filter by some columns, and a filter bar appears above the grid, pivot and chart.</li>
            <li><strong>History.</strong> Every table the agent pulled, kept on your machine for 30 days, reopened without running the query again.</li>
            <li><strong>Your layout.</strong> The theme you pick applies to the Studio, the charts and the terminal cards, and is remembered. Drag the bar between the questions and the chart to resize them. <em>Stop</em> shuts the Studio down; it also stops after two idle minutes with no page open.</li>
          </ul>
          <p class="docs-text">
            The Studio answers only this machine, on its own address, and accepts changes only from its own page.
          </p>
        </section>

        <section id="checks" class="docs-section">
          <h2 class="heading">
            Checking answers
          </h2>
          <p class="docs-text">
            The agent writes the answer; TinyPivot checks it. Every check runs in DuckDB and the Studio on your machine, so it costs no tokens, and the agent cannot write or skip it.
          </p>
          <ul class="docs-text studio-list">
            <li><strong>Numbers in the answer.</strong> Each figure the agent quotes ($17.12M, 35.5%, +$7.93M) is looked up in the data the question used, at the precision the agent wrote it: 1.20M covers 1,195,000 to 1,205,000. A figure counts as found when it is a value, a total, a group total or a share of what the chart or pivot shows, or a gap or change between periods in a small summary table. Found figures are underlined in green; figures the data does not hold are marked.</li>
            <li><strong>Check this answer.</strong> Reruns every step of the question. A file load checks that the file is the one the agent read (same size and modification time); a SQL step runs its query again and compares the result, row by row regardless of order, with what the agent got.</li>
            <li><strong>Left alone on purpose.</strong> Years, dates, links, code, and small counts like "4 regions" are not checked. A growth rate the data cannot show directly is marked unchecked rather than wrong.</li>
          </ul>
          <p class="docs-text">
            What this does not prove yet: that the agent asked the right question of the data, such as comparing a full year with ten months. Next, each figure gets its own proof query, run against a snapshot of the data as it was, and the agent's SQL gets structural checks for problems like a filter on one side of a comparison only.
          </p>
        </section>

        <section id="tools" class="docs-section">
          <h2 class="heading">
            Tools
          </h2>
          <dl class="tools ledger">
            <div v-for="tool in tools" :key="tool.name" class="tool">
              <dt>
                <code class="tool-name">{{ tool.name }}</code>
                <span class="label">{{ tool.role }}</span>
              </dt>
              <dd class="docs-text">
                {{ tool.desc }}
              </dd>
            </div>
          </dl>
        </section>

        <section id="savings" class="docs-section">
          <h2 class="heading">
            Token savings, <em>with the caveats.</em>
          </h2>
          <p class="docs-text">
            This calculator compares TinyPivot with pasting rows into chat. Against an agent that writes Python, our measured cost in Claude Code was 10–15% lower, so most of the savings this calculator shows apply only where rows would otherwise go into the conversation.
            Move the sliders to match your own work. The model counts what you avoid sending: the raw rows, their re-reads on follow-ups, and the tables the model would otherwise rewrite.
          </p>
          <SavingsCalculator />
          <p class="method">
            Assumes ~{{ TOKENS_PER_CELL }} tokens per cell, cached re-reads billed at {{ CACHED_REREAD_FACTOR * 100 }}% of input price,
            and ~{{ OUTPUT_TOKENS_PER_REWRITE }} output tokens per rewritten table. With TinyPivot, every question is a tool call whose reply adds
            ~{{ TOOL_REPLY_TOKENS }} tokens (measured on a 2,000-row, 6-column file), and in a terminal the model reprints the card, ~{{ CARD_ECHO_TOKENS }} output tokens per answer.
            If you already aggregate down to a handful of rows in SQL before the model sees them, there is little or nothing to save.
          </p>
        </section>

        <section id="privacy" class="docs-section">
          <h2 class="heading">
            Privacy
          </h2>
          <p class="docs-text">
            Rows, column names, SQL and file paths never leave your machine. The MCP server sends a small anonymous usage ping (tool name, row-count bucket, harness name, OS and a random local ID).
            Turn it off with <code>{{ telemetryEnvVars[0] }}</code> or <code>{{ telemetryEnvVars[1] }}</code>.
          </p>
        </section>
      </div>
    </div>
  </main>
</template>

<style scoped>
.docs {
  padding: 24px 0 64px;
}

.docs-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
}

.docs-toc {
  position: sticky;
  top: 60px;
  z-index: 5;
  display: flex;
  gap: 6px;
  margin: 0 calc(var(--gutter) * -1);
  padding: 10px var(--gutter);
  overflow-x: auto;
  scrollbar-width: none;
  background: var(--paper);
  border-bottom: var(--line);
}

.docs-toc::-webkit-scrollbar {
  display: none;
}

.docs-toc-title {
  display: none;
}

.docs-toc-link {
  flex: none;
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0 12px;
  border: var(--line);
  background: var(--paper);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  text-decoration: none;
  white-space: nowrap;
  color: var(--ink-muted);
}

.docs-toc-link:hover {
  color: var(--ink);
  border-color: var(--ink);
}

.docs-body {
  display: grid;
  gap: 56px;
  min-width: 0;
}

.docs-head {
  display: grid;
  gap: 16px;
}

.docs-section {
  display: grid;
  gap: 18px;
  scroll-margin-top: 130px;
}

.docs-text {
  color: var(--ink-muted);
}

.docs-text code,
.method code {
  font-size: 0.85em;
}

.studio-list {
  display: grid;
  gap: 8px;
  padding-left: 1.1em;
}

.studio-list strong {
  color: var(--ink);
}

.steps {
  display: grid;
  gap: 10px;
  padding-left: 1.4em;
}

.steps li::marker {
  font-family: var(--font-mono);
  color: var(--accent);
}

.accordion {
  border-top: var(--line);
}

.acc {
  border-bottom: var(--line);
}

.acc-sum {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 56px;
  cursor: pointer;
  list-style: none;
}

.acc-sum::-webkit-details-marker {
  display: none;
}

.acc-title {
  font-size: 1.1rem;
}

.acc-icon {
  font-family: var(--font-mono);
  font-size: 1.2rem;
  color: var(--accent);
  transition: transform 0.2s;
}

.acc[open] .acc-icon {
  transform: rotate(45deg);
}

.acc-body {
  display: grid;
  gap: 14px;
  padding-bottom: 20px;
}

.prompts {
  display: grid;
  gap: 8px;
  list-style: none;
}

.prompt {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: start;
  gap: 16px;
  width: 100%;
  padding: 14px 16px;
  border: var(--line);
  background: var(--paper-raised);
  color: var(--ink);
  font: inherit;
  font-size: 1rem;
  text-align: left;
  cursor: pointer;
}

.prompt:hover {
  border-color: var(--ink);
}

.prompt-copy {
  padding-top: 3px;
}

.tools {
  display: grid;
  border-top: var(--line);
}

.tool {
  display: grid;
  gap: 6px;
  padding: 16px 12px;
  border-bottom: 1px solid var(--rule);
}

.tool dt {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
}

.tool-name {
  font-size: 0.95rem;
  font-weight: 500;
}

.method {
  font-family: var(--font-mono);
  font-size: 0.74rem;
  line-height: 1.7;
  color: var(--ink-faint);
}

@media (min-width: 1024px) {
  .docs {
    padding-top: 64px;
  }

  .docs-grid {
    grid-template-columns: 180px minmax(0, 1fr);
    gap: 64px;
  }

  .docs-toc {
    top: 96px;
    align-self: start;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    overflow: visible;
    background: none;
    border: 0;
  }

  .docs-toc-title {
    display: block;
    margin-bottom: 8px;
  }

  .docs-toc-link {
    min-height: 32px;
    padding: 0;
    border: 0;
  }

  .docs-body {
    max-width: 760px;
  }

  .tool {
    grid-template-columns: 240px 1fr;
    gap: 24px;
  }

  .tool dt {
    flex-direction: column;
  }
}
</style>
