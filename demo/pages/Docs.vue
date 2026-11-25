<script setup lang="ts">
import CodeBlock from '../components/site/CodeBlock.vue'
import InstallBox from '../components/site/InstallBox.vue'
import SavingsCalculator from '../components/site/SavingsCalculator.vue'
import { harnesses, prompts, telemetryEnvVars, tools } from '../site/docs'
import { CACHED_REREAD_FACTOR, CARD_ECHO_TOKENS, OUTPUT_TOKENS_PER_REWRITE, TOKENS_PER_CELL, TOOL_REPLY_TOKENS } from '../site/savings'
import { useCopy } from '../site/useCopy'

const toc = [
  { id: 'quickstart', label: 'Quick start' },
  { id: 'setup', label: 'Setup by harness' },
  { id: 'prompts', label: 'Prompts' },
  { id: 'studio', label: 'Studio' },
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

        <section id="studio" class="docs-section">
          <h2 class="heading">
            TinyPivot Studio
          </h2>
          <p class="docs-text">
            In a terminal agent, the first TinyPivot step opens the Studio at <code>http://127.0.0.1:47317</code>.
            A Studio tab left open from an earlier session reconnects instead. Set <code>TINYPIVOT_OPEN_STUDIO=0</code> to open it yourself.
          </p>
          <ul class="docs-text studio-list">
            <li><strong>Trace.</strong> Each step, the agent's or yours, with its reason (the <code>why</code> the agent passes on every data tool), what it shows, and the SQL or file filter behind it. <em>Open</em> shows the data as it was right after that step.</li>
            <li><strong>SQL editor.</strong> Edit a step's SQL or write new SQL over local files and loaded tables, and run it with DuckDB, read-only. The result keeps the step's chart when its fields still exist.</li>
            <li><strong>Notes.</strong> Write what to check or change, optionally about one step. The agent receives your notes at the end of its next TinyPivot reply; <em>Copy as prompt</em> sends one at once.</li>
            <li><strong>History.</strong> Every table the agent pulled, kept on your machine for 30 days, reopened without running the query again.</li>
          </ul>
          <p class="docs-text">
            The Studio answers only this machine, on its own address, and accepts changes only from its own page.
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
            This calculator compares TinyPivot with pasting rows into chat. Against an agent that writes Python, our measured cost in Claude Code was about the same, so expect savings only where rows would otherwise go into the conversation.
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
