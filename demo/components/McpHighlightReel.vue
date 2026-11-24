<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

interface SlideMeta {
  id: number
  shortLabel: string
  badge: string
  title: string
  subtitle: string
}

const SLIDE_DURATION_MS = 5000

const slides: SlideMeta[] = [
  {
    id: 0,
    shortLabel: 'IDE Widget',
    badge: 'Antigravity · Claude Desktop · Cursor',
    title: 'IDE Inline Widget',
    subtitle: 'Interactive charts, pivot tables, themes, and token savings render in 1 tool call — directly inside your agent chat.',
  },
  {
    id: 1,
    shortLabel: 'Terminal & TUI',
    badge: 'Claude Code · pi · OpenCode · Ghostty',
    title: 'Terminal Card & Ghostty TUI',
    subtitle: 'High-res Unicode Braille line charts and box-drawn sparkline pivot cards designed to look sharp right in your terminal.',
  },
  {
    id: 2,
    shortLabel: 'Live Companion',
    badge: '127.0.0.1 ● LIVE SSE Sync',
    title: 'Live Companion IDE',
    subtitle: 'Run CLI agents side-by-side with an auto-updating local browser Data IDE — double-click any pivot cell to drill through.',
  },
  {
    id: 3,
    shortLabel: 'Any Database',
    badge: 'BigQuery · Snowflake · MySQL · DuckDB · Postgres',
    title: 'Works With Any Database',
    subtitle: 'Pipe any SQL export or CSV/JSON straight into TinyPivot with zero raw rows entering LLM context — plus optional direct Postgres.',
  },
]

// Shared realistic sample dataset: Acme Revenue by Month ($k)
interface MonthRevenue {
  month: string
  quarter: 'Q1' | 'Q2'
  enterprise: number
  growth: number
  selfServe: number
  total: number
  deals: number
}

const acmeMonthly: MonthRevenue[] = [
  { month: 'Jan', quarter: 'Q1', enterprise: 22.4, growth: 12.6, selfServe: 5.8, total: 40.8, deals: 171 },
  { month: 'Feb', quarter: 'Q1', enterprise: 25.1, growth: 13.9, selfServe: 6.4, total: 45.4, deals: 188 },
  { month: 'Mar', quarter: 'Q1', enterprise: 27.8, growth: 15.3, selfServe: 7.1, total: 50.2, deals: 203 },
  { month: 'Apr', quarter: 'Q2', enterprise: 31.6, growth: 16.8, selfServe: 7.9, total: 56.3, deals: 219 },
  { month: 'May', quarter: 'Q2', enterprise: 34.9, growth: 18.7, selfServe: 8.6, total: 62.2, deals: 231 },
  { month: 'Jun', quarter: 'Q2', enterprise: 39.3, growth: 20.2, selfServe: 9.2, total: 68.7, deals: 240 },
]

// Reel playback state (SSR-safe: timers only start in onMounted)
const activeSlide = ref(0)
const isPaused = ref(false)
const isHovering = ref(false)
const progressPct = ref(0)

let tickTimer: ReturnType<typeof setInterval> | null = null
const TICK_MS = 50

function startAutoplay() {
  stopAutoplay()
  tickTimer = setInterval(() => {
    if (isPaused.value || isHovering.value)
      return
    const step = (TICK_MS / SLIDE_DURATION_MS) * 100
    if (progressPct.value + step >= 100) {
      progressPct.value = 0
      activeSlide.value = (activeSlide.value + 1) % slides.length
    }
    else {
      progressPct.value += step
    }
  }, TICK_MS)
}

function stopAutoplay() {
  if (tickTimer !== null) {
    clearInterval(tickTimer)
    tickTimer = null
  }
}

function selectSlide(idx: number) {
  activeSlide.value = idx
  progressPct.value = 0
  isPaused.value = true
}

function stepSlide(delta: number) {
  activeSlide.value = (activeSlide.value + delta + slides.length) % slides.length
  progressPct.value = 0
  isPaused.value = true
}

// Phones: tabs become a sideways-scrolling row (keep the active one visible) and the stage takes swipes.
const tabsEl = ref<HTMLElement | null>(null)
watch(activeSlide, (idx) => {
  const row = tabsEl.value
  const tab = row?.children[idx] as HTMLElement | undefined
  if (row && tab && row.scrollWidth > row.clientWidth)
    row.scrollTo({ left: tab.offsetLeft - row.offsetLeft - 12, behavior: 'smooth' })
})

const SWIPE_MIN_PX = 50
let touchStart: { x: number, y: number } | null = null

function onStageTouchStart(event: TouchEvent) {
  const target = event.target as Element
  // Leave horizontally scrollable content (code, wide tables) to scroll normally.
  touchStart = target.closest('pre, .widget-table-wrap, .browser-content') ? null : { x: event.touches[0].clientX, y: event.touches[0].clientY }
}

function onStageTouchEnd(event: TouchEvent) {
  if (!touchStart)
    return
  const dx = event.changedTouches[0].clientX - touchStart.x
  const dy = event.changedTouches[0].clientY - touchStart.y
  touchStart = null
  if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.5)
    stepSlide(dx < 0 ? 1 : -1)
}

function togglePlay() {
  isPaused.value = !isPaused.value
  if (!isPaused.value && progressPct.value >= 100)
    progressPct.value = 0
}

onMounted(() => {
  startAutoplay()
})

onUnmounted(() => {
  stopAutoplay()
})

// --- Slide 1: Interactive IDE Widget controls ---
type WidgetTab = 'chart' | 'pivot' | 'data'
type WidgetTheme = 'Code' | 'Phosphor' | 'Nord'
type SortMode = 'desc' | 'asc' | 'chrono'

const widgetTab = ref<WidgetTab>('chart')
const widgetTheme = ref<WidgetTheme>('Code')
const sortMode = ref<SortMode>('desc')
const hoveredMonth = ref<string | null>(null)

const themePalettes: Record<WidgetTheme, { enterprise: string, growth: string, selfServe: string }> = {
  Code: { enterprise: '#10b981', growth: '#3b82f6', selfServe: '#8b5cf6' },
  Phosphor: { enterprise: '#34d399', growth: '#22d3ee', selfServe: '#a3e635' },
  Nord: { enterprise: '#88c0d0', growth: '#81a1c1', selfServe: '#b48ead' },
}

const activePalette = computed(() => themePalettes[widgetTheme.value])

function cycleTheme() {
  const order: WidgetTheme[] = ['Code', 'Phosphor', 'Nord']
  widgetTheme.value = order[(order.indexOf(widgetTheme.value) + 1) % order.length]
  isPaused.value = true
}

function cycleSort() {
  const order: SortMode[] = ['desc', 'chrono', 'asc']
  sortMode.value = order[(order.indexOf(sortMode.value) + 1) % order.length]
  isPaused.value = true
}

const sortLabel = computed(() => {
  if (sortMode.value === 'desc')
    return '↓ Desc'
  if (sortMode.value === 'asc')
    return '↑ Asc'
  return '↔ Month'
})

const sortedMonthly = computed(() => {
  const copy = [...acmeMonthly]
  if (sortMode.value === 'desc')
    return copy.sort((a, b) => b.total - a.total)
  if (sortMode.value === 'asc')
    return copy.sort((a, b) => a.total - b.total)
  return copy
})

const maxMonthTotal = 75 // clean chart ceiling ($75k)

const sampleRawRows = [
  { id: 'INV-4091', date: '2026-06-28', account: 'Globex Corp', tier: 'Enterprise', region: 'NA', amount: '$12,600' },
  { id: 'INV-4094', date: '2026-06-26', account: 'Initech', tier: 'Enterprise', region: 'EU', amount: '$9,900' },
  { id: 'INV-4098', date: '2026-06-24', account: 'Hooli', tier: 'Growth', region: 'NA', amount: '$5,200' },
  { id: 'INV-4102', date: '2026-06-21', account: 'Pied Piper', tier: 'Self-Serve', region: 'APAC', amount: '$1,620' },
  { id: 'INV-4105', date: '2026-06-19', account: 'Vandelay Industries', tier: 'Enterprise', region: 'NA', amount: '$8,300' },
]

// --- Slide 2: Deterministic Braille Line Chart + Sparkline Pivot Card ---
const BRAILLE_BITS: readonly (readonly number[])[] = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
]

interface BraillePlotRow {
  tick: string
  cells: string[]
}

function buildBraillePlotRows(): BraillePlotRow[] {
  const values = acmeMonthly.map(d => d.total)
  const chartCols = 36
  const chartRows = 6
  const pxW = chartCols * 2
  const pxH = chartRows * 4

  const grid: number[][] = Array.from({ length: chartRows }, () => Array.from<number>({ length: chartCols }).fill(0))
  const minVal = 38
  const maxVal = 72
  const span = maxVal - minVal

  const setPx = (x: number, y: number) => {
    const cx = Math.max(0, Math.min(pxW - 1, Math.round(x)))
    const cy = Math.max(0, Math.min(pxH - 1, Math.round(y)))
    grid[Math.floor(cy / 4)][Math.floor(cx / 2)] |= BRAILLE_BITS[cy % 4][cx % 2]
  }

  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * (pxW - 1),
    y: (pxH - 1) - ((v - minVal) / span) * (pxH - 1),
  }))

  for (let i = 0; i < pts.length; i++) {
    setPx(pts[i].x, pts[i].y)
    if (i > 0) {
      const a = pts[i - 1]
      const b = pts[i]
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 1.5))
      for (let s = 1; s < steps; s++) {
        const t = s / steps
        setPx(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)
      }
    }
  }

  const yTicks: Record<number, string> = { 0: '$72k', 3: '$52k', 5: '$38k' }
  return grid.map((rowMasks, r) => ({
    tick: yTicks[r] ?? '',
    cells: rowMasks.map(mask => (mask === 0 ? '' : String.fromCharCode(0x2800 + mask))),
  }))
}

const braillePlotRows = buildBraillePlotRows()

const termPivotRows = [
  { tier: 'Enterprise', q1: '$75.3k', q2: '$105.8k', total: '$181.1k', spark: '▁▂▄▅▇█' },
  { tier: 'Growth', q1: '$41.8k', q2: '$55.7k', total: '$97.5k', spark: '▁▂▄▅▇█' },
  { tier: 'Self-Serve', q1: '$19.3k', q2: '$25.7k', total: '$45.0k', spark: '▁▂▄▆██' },
]

// --- Slide 3: Live Companion IDE Drill-Through interaction ---
interface DrillCell {
  tier: string
  month: string
  value: string
  count: number
  rows: { invoice: string, customer: string, region: string, amount: string }[]
}

const drillCells: Record<string, DrillCell> = {
  'Enterprise-Jun': {
    tier: 'Enterprise',
    month: 'Jun',
    value: '$39.3k',
    count: 16,
    rows: [
      { invoice: 'INV-4091', customer: 'Globex Corp', region: 'NA', amount: '$12,600' },
      { invoice: 'INV-4094', customer: 'Initech', region: 'EU', amount: '$9,900' },
      { invoice: 'INV-4105', customer: 'Vandelay Industries', region: 'NA', amount: '$8,300' },
      { invoice: 'INV-4112', customer: 'Massive Dynamic', region: 'EU', amount: '$7,450' },
    ],
  },
  'Growth-May': {
    tier: 'Growth',
    month: 'May',
    value: '$18.7k',
    count: 29,
    rows: [
      { invoice: 'INV-3912', customer: 'Hooli', region: 'NA', amount: '$5,200' },
      { invoice: 'INV-3925', customer: 'Dunder Mifflin', region: 'EU', amount: '$4,350' },
      { invoice: 'INV-3940', customer: 'Wonka Labs', region: 'NA', amount: '$3,900' },
      { invoice: 'INV-3951', customer: 'Cyberdyne', region: 'APAC', amount: '$3,150' },
    ],
  },
  'Self-Serve-Jun': {
    tier: 'Self-Serve',
    month: 'Jun',
    value: '$9.2k',
    count: 81,
    rows: [
      { invoice: 'INV-4102', customer: 'Pied Piper', region: 'APAC', amount: '$1,620' },
      { invoice: 'INV-4108', customer: 'Tyrell Co', region: 'NA', amount: '$1,280' },
      { invoice: 'INV-4119', customer: 'Soylent', region: 'EU', amount: '$1,090' },
      { invoice: 'INV-4124', customer: 'Prestige Worldwide', region: 'NA', amount: '$960' },
    ],
  },
}

const activeDrillKey = ref<string>('Enterprise-Jun')
const showDrillModal = ref(true)

const activeDrill = computed(() => drillCells[activeDrillKey.value] ?? drillCells['Enterprise-Jun'])

function inspectDrillCell(key: string) {
  activeDrillKey.value = key
  showDrillModal.value = true
  isPaused.value = true
}

// --- Slide 4: Universal Database selector ---
type DbId = 'bigquery' | 'snowflake' | 'mysql' | 'duckdb' | 'postgres'

const selectedDb = ref<DbId>('bigquery')

const dbExamples: Record<DbId, { label: string, tag: string, mode: string, command: string }> = {
  bigquery: {
    label: 'BigQuery',
    tag: 'CSV pipe · Free & Pro',
    mode: 'CLI pipe / load_file',
    command: `bq query --format=csv --nouse_legacy_sql \\
  "SELECT month, tier, SUM(revenue) AS rev FROM acme.orders GROUP BY 1,2" \\
  | npx @smallwebco/tinypivot-mcp --open`,
  },
  snowflake: {
    label: 'Snowflake',
    tag: 'CSV pipe · Free & Pro',
    mode: 'CLI pipe / load_file',
    command: `snow sql --format csv \\
  -q "SELECT month, tier, revenue FROM prod.acme_revenue" \\
  | npx @smallwebco/tinypivot-mcp --open`,
  },
  mysql: {
    label: 'MySQL',
    tag: 'TSV pipe · Free & Pro',
    mode: 'CLI pipe / load_file',
    command: `mysql -h analytics.internal --batch \\
  -e "SELECT month, tier, revenue FROM acme_revenue" \\
  | npx @smallwebco/tinypivot-mcp --open`,
  },
  duckdb: {
    label: 'DuckDB',
    tag: 'Parquet / S3 · Free & Pro',
    mode: 'CLI pipe / load_file',
    command: `duckdb -csv -c \\
  "SELECT month, tier, revenue FROM 's3://acme/2026/*.parquet'" \\
  | npx @smallwebco/tinypivot-mcp --open`,
  },
  postgres: {
    label: 'Postgres',
    tag: 'Direct AST-safe SQL · Pro',
    mode: 'Direct query_postgres or psql pipe',
    command: `# Direct read-only MCP tool (Pro, AST-validated SELECT only):
query_postgres({ sql: "SELECT month, tier, revenue FROM acme_revenue" })

# Or pipe from psql on Free/Pro:
psql "$DATABASE_URL" --csv -c "SELECT * FROM acme_revenue" | npx @smallwebco/tinypivot-mcp`,
  },
}

function selectDb(id: DbId) {
  selectedDb.value = id
  isPaused.value = true
}
</script>

<template>
  <div
    class="reel-shell"
    @mouseenter="isHovering = true"
    @mouseleave="isHovering = false"
  >
    <!-- Top Tab Switcher + Progress Bar -->
    <div class="reel-topbar">
      <div ref="tabsEl" class="reel-tabs" role="tablist" aria-label="TinyPivot MCP Highlight Reel">
        <button
          v-for="(slide, idx) in slides"
          :key="slide.id"
          type="button"
          role="tab"
          class="reel-tab"
          :class="{ active: activeSlide === idx }"
          :aria-selected="activeSlide === idx"
          @click="selectSlide(idx)"
        >
          <span class="reel-tab-num">0{{ idx + 1 }}</span>
          <span class="reel-tab-label">{{ slide.shortLabel }}</span>
          <span class="reel-tab-progress-track" aria-hidden="true">
            <span
              class="reel-tab-progress-fill"
              :style="{
                width: activeSlide === idx ? `${progressPct}%` : activeSlide > idx ? '100%' : '0%',
              }"
            />
          </span>
        </button>
      </div>

      <div class="reel-controls">
        <button
          type="button"
          class="reel-ctrl-btn"
          aria-label="Previous slide"
          title="Previous slide"
          @click="stepSlide(-1)"
        >
          ←
        </button>
        <button
          type="button"
          class="reel-ctrl-btn reel-play-btn"
          :aria-label="isPaused ? 'Resume auto-play' : 'Pause auto-play'"
          @click="togglePlay"
        >
          <span class="reel-play-dot" :class="{ paused: isPaused || isHovering }" />
          {{ isPaused ? 'Play' : isHovering ? 'Paused' : 'Auto' }}
        </button>
        <button
          type="button"
          class="reel-ctrl-btn"
          aria-label="Next slide"
          title="Next slide"
          @click="stepSlide(1)"
        >
          →
        </button>
      </div>
    </div>

    <!-- Active Slide Header -->
    <div class="reel-slide-meta">
      <div class="reel-slide-meta-left">
        <span class="reel-slide-badge">{{ slides[activeSlide].badge }}</span>
        <h3 class="reel-slide-title">
          {{ slides[activeSlide].title }}
        </h3>
      </div>
      <p class="reel-slide-sub">
        {{ slides[activeSlide].subtitle }}
      </p>
    </div>

    <!-- Stage -->
    <div class="reel-stage" @touchstart.passive="onStageTouchStart" @touchend="onStageTouchEnd">
      <!-- SLIDE 1: IDE INLINE WIDGET -->
      <div v-if="activeSlide === 0" class="slide-panel slide-ide">
        <div class="ide-chat-bar">
          <div class="ide-user-msg">
            <span class="ide-avatar ide-avatar-user">You</span>
            <span>Chart Acme monthly revenue from <code>./exports/acme_revenue.csv</code> stacked by tier.</span>
          </div>
          <div class="ide-tool-call">
            <span class="ide-tool-check">✓</span>
            <code>tinypivot.load_file</code>
            <span class="ide-tool-args">("acme_revenue.csv", chartConfig: { type: "stackedBar" })</span>
            <span class="ide-tool-stat">1,186 rows · 0 raw rows in LLM</span>
          </div>
        </div>

        <div class="ide-widget-card">
          <!-- Widget Toolbar -->
          <div class="widget-toolbar">
            <div class="widget-toolbar-left">
              <div class="widget-title-group">
                <span class="widget-dot" />
                <strong>Acme Revenue by Month</strong>
              </div>
              <div class="widget-mode-pills" role="tablist" aria-label="Widget view mode">
                <button
                  type="button"
                  :class="{ active: widgetTab === 'chart' }"
                  @click="widgetTab = 'chart'; isPaused = true"
                >
                  Chart
                </button>
                <button
                  type="button"
                  :class="{ active: widgetTab === 'pivot' }"
                  @click="widgetTab = 'pivot'; isPaused = true"
                >
                  Pivot
                </button>
                <button
                  type="button"
                  :class="{ active: widgetTab === 'data' }"
                  @click="widgetTab = 'data'; isPaused = true"
                >
                  Data
                </button>
              </div>
            </div>

            <div class="widget-toolbar-right">
              <button type="button" class="widget-pill" title="Cycle visual theme" @click="cycleTheme">
                {{ widgetTheme }} ▾
              </button>
              <button type="button" class="widget-pill" title="Cycle sort order" @click="cycleSort">
                {{ sortLabel }} ▾
              </button>
              <span class="widget-pill widget-pill-saved">
                <span class="saved-dot" />
                Saved 53k/$0.16
              </span>
            </div>
          </div>

          <!-- Chart View -->
          <div v-if="widgetTab === 'chart'" class="widget-chart-area">
            <div class="chart-legend-row">
              <span class="chart-legend-item">
                <span class="legend-swatch" :style="{ background: activePalette.enterprise }" />
                Enterprise ($181.1k)
              </span>
              <span class="chart-legend-item">
                <span class="legend-swatch" :style="{ background: activePalette.growth }" />
                Growth ($97.5k)
              </span>
              <span class="chart-legend-item">
                <span class="legend-swatch" :style="{ background: activePalette.selfServe }" />
                Self-Serve ($45.0k)
              </span>
              <span class="chart-total-badge">Total: $323.6k</span>
            </div>

            <div class="stacked-chart-plot">
              <div class="chart-y-axis">
                <span>$75k</span>
                <span>$50k</span>
                <span>$25k</span>
                <span>$0</span>
              </div>

              <div class="chart-bars-grid">
                <div
                  v-for="(item, i) in sortedMonthly"
                  :key="item.month"
                  class="bar-col"
                  :class="{ hovered: hoveredMonth === item.month }"
                  @mouseenter="hoveredMonth = item.month"
                  @mouseleave="hoveredMonth = null"
                >
                  <div class="bar-val-top">
                    ${{ item.total.toFixed(1) }}k
                  </div>
                  <div class="bar-stack-track">
                    <div
                      class="bar-stack"
                      :style="{
                        height: `${(item.total / maxMonthTotal) * 100}%`,
                        transitionDelay: `${i * 35}ms`,
                      }"
                    >
                      <div
                        class="bar-seg"
                        :style="{
                          height: `${(item.selfServe / item.total) * 100}%`,
                          background: activePalette.selfServe,
                        }"
                        :title="`Self-Serve: $${item.selfServe}k`"
                      />
                      <div
                        class="bar-seg"
                        :style="{
                          height: `${(item.growth / item.total) * 100}%`,
                          background: activePalette.growth,
                        }"
                        :title="`Growth: $${item.growth}k`"
                      />
                      <div
                        class="bar-seg"
                        :style="{
                          height: `${(item.enterprise / item.total) * 100}%`,
                          background: activePalette.enterprise,
                        }"
                        :title="`Enterprise: $${item.enterprise}k`"
                      />
                    </div>
                  </div>
                  <div class="bar-x-label">
                    {{ item.month }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Pivot View -->
          <div v-else-if="widgetTab === 'pivot'" class="widget-table-wrap">
            <table class="mini-table">
              <thead>
                <tr>
                  <th>Tier</th>
                  <th class="num">
                    Jan
                  </th>
                  <th class="num">
                    Feb
                  </th>
                  <th class="num">
                    Mar
                  </th>
                  <th class="num">
                    Apr
                  </th>
                  <th class="num">
                    May
                  </th>
                  <th class="num">
                    Jun
                  </th>
                  <th class="num">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><span class="tier-dot" :style="{ background: activePalette.enterprise }" />Enterprise</td>
                  <td class="num">
                    $22.4k
                  </td>
                  <td class="num">
                    $25.1k
                  </td>
                  <td class="num">
                    $27.8k
                  </td>
                  <td class="num">
                    $31.6k
                  </td>
                  <td class="num">
                    $34.9k
                  </td>
                  <td class="num">
                    $39.3k
                  </td>
                  <td class="num strong">
                    $181.1k
                  </td>
                </tr>
                <tr>
                  <td><span class="tier-dot" :style="{ background: activePalette.growth }" />Growth</td>
                  <td class="num">
                    $12.6k
                  </td>
                  <td class="num">
                    $13.9k
                  </td>
                  <td class="num">
                    $15.3k
                  </td>
                  <td class="num">
                    $16.8k
                  </td>
                  <td class="num">
                    $18.7k
                  </td>
                  <td class="num">
                    $20.2k
                  </td>
                  <td class="num strong">
                    $97.5k
                  </td>
                </tr>
                <tr>
                  <td><span class="tier-dot" :style="{ background: activePalette.selfServe }" />Self-Serve</td>
                  <td class="num">
                    $5.8k
                  </td>
                  <td class="num">
                    $6.4k
                  </td>
                  <td class="num">
                    $7.1k
                  </td>
                  <td class="num">
                    $7.9k
                  </td>
                  <td class="num">
                    $8.6k
                  </td>
                  <td class="num">
                    $9.2k
                  </td>
                  <td class="num strong">
                    $45.0k
                  </td>
                </tr>
                <tr class="total-row">
                  <td>Grand Total</td>
                  <td class="num">
                    $40.8k
                  </td>
                  <td class="num">
                    $45.4k
                  </td>
                  <td class="num">
                    $50.2k
                  </td>
                  <td class="num">
                    $56.3k
                  </td>
                  <td class="num">
                    $62.2k
                  </td>
                  <td class="num">
                    $68.7k
                  </td>
                  <td class="num strong">
                    $323.6k
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Data View -->
          <div v-else class="widget-table-wrap">
            <table class="mini-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Account</th>
                  <th>Tier</th>
                  <th>Region</th>
                  <th class="num">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in sampleRawRows" :key="r.id">
                  <td class="mono-cell">
                    {{ r.id }}
                  </td>
                  <td class="mono-cell">
                    {{ r.date }}
                  </td>
                  <td>{{ r.account }}</td>
                  <td>{{ r.tier }}</td>
                  <td>{{ r.region }}</td>
                  <td class="num strong">
                    {{ r.amount }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="widget-footer-bar">
            <span>Tip: click <strong>Chart / Pivot / Data</strong>, <strong>{{ widgetTheme }} ▾</strong>, or <strong>{{ sortLabel }} ▾</strong> above — local clicks cost $0 tokens.</span>
            <span class="widget-footer-brand">tiny-pivot.com</span>
          </div>
        </div>
      </div>

      <!-- SLIDE 2: TERMINAL CARD & GHOSTTY TUI -->
      <div v-else-if="activeSlide === 1" class="slide-panel slide-terminal">
        <div class="ghostty-window">
          <div class="ghostty-titlebar">
            <div class="window-dots">
              <span class="dot-red" />
              <span class="dot-yellow" />
              <span class="dot-green" />
            </div>
            <div class="ghostty-title">
              ghostty — claude · ~/acme-analytics
            </div>
            <div class="ghostty-tag">
              Unicode Braille + Sparklines
            </div>
          </div>

          <div class="ghostty-body">
            <div class="term-prompt-line">
              <span class="term-prompt-sym">❯</span>
              <span class="term-prompt-cmd">claude</span>
              <span class="term-prompt-arg">"Chart Acme monthly revenue and pivot Q1 vs Q2 by tier"</span>
            </div>
            <div class="term-meta-line">
              <span class="term-ok">●</span> tinypivot: loaded 1,186 rows locally · echoed shareable terminal cards · companion ready at <code>127.0.0.1:4319</code>
            </div>

            <div class="term-cards-grid">
              <!-- Framed Unicode Braille Line Chart Card -->
              <div class="tui-card tui-card-emerald">
                <div class="tui-card-top">
                  <span class="tui-edge-label">Acme Revenue</span>
                  <span class="tui-edge-badge">Total $323.6k</span>
                </div>

                <div class="tui-card-body">
                  <div class="tui-braille-chart">
                    <div
                      v-for="(row, rIdx) in braillePlotRows"
                      :key="rIdx"
                      class="tui-braille-row"
                    >
                      <span class="tui-y-tick">{{ row.tick }}</span>
                      <span class="tui-y-axis-tick" :class="{ major: Boolean(row.tick) }" />
                      <div class="tui-braille-cells">
                        <span
                          v-for="(cell, cIdx) in row.cells"
                          :key="cIdx"
                          class="tui-braille-cell"
                        >
                          {{ cell }}
                        </span>
                      </div>
                    </div>

                    <div class="tui-x-axis-row">
                      <span class="tui-y-tick" />
                      <span class="tui-x-corner" />
                      <div class="tui-x-line" />
                    </div>

                    <div class="tui-x-labels-row">
                      <span class="tui-y-tick" />
                      <span />
                      <div class="tui-x-labels">
                        <span>Jan</span>
                        <span>Mar</span>
                        <span>Jun</span>
                      </div>
                    </div>
                  </div>

                  <div class="tui-stats-line">
                    Peak: Jun ($68.7k) · Low: Jan ($40.8k) · Avg: $53.9k
                  </div>
                </div>

                <div class="tui-card-bottom">
                  <span class="tui-edge-brand">tiny-pivot.com</span>
                  <span class="tui-edge-meta">1,186 rows · Line</span>
                </div>
              </div>

              <!-- Framed Box-Drawn Sparkline Pivot Table Card -->
              <div class="tui-card tui-card-blue">
                <div class="tui-card-top">
                  <span class="tui-edge-label">Pivot · Tier × Quarter</span>
                  <span class="tui-edge-badge">Sum(revenue)</span>
                </div>

                <div class="tui-card-body tui-pivot-body">
                  <div class="tui-pivot-grid">
                    <div class="tui-pivot-row tui-pivot-head">
                      <span>Tier</span>
                      <span class="num">Q1</span>
                      <span class="num">Q2</span>
                      <span class="num">Total</span>
                      <span class="spark-col">Trend</span>
                    </div>

                    <div
                      v-for="r in termPivotRows"
                      :key="r.tier"
                      class="tui-pivot-row"
                    >
                      <span>{{ r.tier }}</span>
                      <span class="num">{{ r.q1 }}</span>
                      <span class="num">{{ r.q2 }}</span>
                      <span class="num">{{ r.total }}</span>
                      <span class="spark-col tui-spark">{{ r.spark }}</span>
                    </div>

                    <div class="tui-pivot-row tui-pivot-total">
                      <span>Total</span>
                      <span class="num">$136.4k</span>
                      <span class="num">$187.2k</span>
                      <span class="num">$323.6k</span>
                      <span class="spark-col tui-spark">▁▂▄▅▇█</span>
                    </div>
                  </div>
                </div>

                <div class="tui-card-bottom">
                  <span class="tui-edge-brand">tiny-pivot.com</span>
                  <span class="tui-edge-meta">0 raw rows in LLM</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- SLIDE 3: LIVE COMPANION IDE -->
      <div v-else-if="activeSlide === 2" class="slide-panel slide-companion">
        <div class="companion-split">
          <!-- Left: Terminal SSE stream -->
          <div class="companion-term">
            <div class="companion-bar">
              <span class="bar-label">Terminal · pi / Claude Code</span>
              <span class="sse-pill">SSE :4319</span>
            </div>
            <div class="companion-term-body">
              <div class="term-line">
                <span class="term-prompt-sym">$</span> npx @smallwebco/tinypivot-mcp --open
              </div>
              <div class="term-line term-dim">
                [mcp] Local Companion Data IDE listening
              </div>
              <div class="term-line term-emerald">
                ● LIVE → http://127.0.0.1:4319
              </div>
              <div class="term-divider" />
              <div class="term-log">
                <span class="log-ts">14:22:01</span>
                <span class="log-ev">load_file</span>
                <span>acme_revenue.csv (1,186 rows)</span>
              </div>
              <div class="term-log">
                <span class="log-ts">14:22:04</span>
                <span class="log-ev">sse_push</span>
                <span>Pivot updated → Tier × Month</span>
              </div>
              <div class="term-log term-log-active">
                <span class="log-ts">14:22:09</span>
                <span class="log-ev">drill_through</span>
                <span>{{ activeDrill.tier }} · {{ activeDrill.month }} ({{ activeDrill.count }} rows)</span>
              </div>
              <div class="term-hint-box">
                Click any highlighted pivot cell on the right to inspect underlying rows in real time.
              </div>
            </div>
          </div>

          <!-- Right: Localhost Browser Companion IDE -->
          <div class="companion-browser">
            <div class="browser-chrome">
              <div class="window-dots">
                <span class="dot-red" />
                <span class="dot-yellow" />
                <span class="dot-green" />
              </div>
              <div class="browser-url">
                <span>127.0.0.1:4319</span>
                <span class="live-badge">
                  <span class="live-pulse" />
                  LIVE
                </span>
              </div>
              <span class="browser-export-chip">.xlsx ready</span>
            </div>

            <div class="browser-content">
              <div class="browser-pivot-head">
                <strong>Acme Revenue — Interactive Pivot</strong>
                <span>Double-click any cell to drill through</span>
              </div>

              <table class="mini-table companion-table">
                <thead>
                  <tr>
                    <th>Tier</th>
                    <th class="num">
                      Apr
                    </th>
                    <th class="num">
                      May
                    </th>
                    <th class="num">
                      Jun
                    </th>
                    <th class="num">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Enterprise</td>
                    <td class="num">
                      $31.6k
                    </td>
                    <td class="num">
                      $34.9k
                    </td>
                    <td class="num">
                      <button
                        type="button"
                        class="drill-cell-btn"
                        :class="{ active: activeDrillKey === 'Enterprise-Jun' && showDrillModal }"
                        @click="inspectDrillCell('Enterprise-Jun')"
                      >
                        $39.3k
                      </button>
                    </td>
                    <td class="num strong">
                      $181.1k
                    </td>
                  </tr>
                  <tr>
                    <td>Growth</td>
                    <td class="num">
                      $16.8k
                    </td>
                    <td class="num">
                      <button
                        type="button"
                        class="drill-cell-btn"
                        :class="{ active: activeDrillKey === 'Growth-May' && showDrillModal }"
                        @click="inspectDrillCell('Growth-May')"
                      >
                        $18.7k
                      </button>
                    </td>
                    <td class="num">
                      $20.2k
                    </td>
                    <td class="num strong">
                      $97.5k
                    </td>
                  </tr>
                  <tr>
                    <td>Self-Serve</td>
                    <td class="num">
                      $7.9k
                    </td>
                    <td class="num">
                      $8.6k
                    </td>
                    <td class="num">
                      <button
                        type="button"
                        class="drill-cell-btn"
                        :class="{ active: activeDrillKey === 'Self-Serve-Jun' && showDrillModal }"
                        @click="inspectDrillCell('Self-Serve-Jun')"
                      >
                        $9.2k
                      </button>
                    </td>
                    <td class="num strong">
                      $45.0k
                    </td>
                  </tr>
                </tbody>
              </table>

              <!-- Drill-Through Modal Overlay -->
              <div v-if="showDrillModal" class="drill-modal">
                <div class="drill-modal-head">
                  <div>
                    <span class="drill-kicker">Drill-Through Preview</span>
                    <strong>{{ activeDrill.tier }} · {{ activeDrill.month }} — {{ activeDrill.value }} ({{ activeDrill.count }} rows)</strong>
                  </div>
                  <button
                    type="button"
                    class="drill-close"
                    aria-label="Close drill-through preview"
                    @click="showDrillModal = false; isPaused = true"
                  >
                    ✕
                  </button>
                </div>
                <table class="mini-table drill-table">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Customer</th>
                      <th>Region</th>
                      <th class="num">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="r in activeDrill.rows" :key="r.invoice">
                      <td class="mono-cell">
                        {{ r.invoice }}
                      </td>
                      <td>{{ r.customer }}</td>
                      <td>{{ r.region }}</td>
                      <td class="num strong">
                        {{ r.amount }}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div class="drill-modal-foot">
                  <span class="drill-foot-pill">Send Slice to Agent</span>
                  <span class="drill-foot-pill drill-foot-pill-emerald">Export .xlsx</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- SLIDE 4: WORKS WITH ANY DATABASE -->
      <div v-else class="slide-panel slide-db">
        <div class="db-selector-row" role="tablist" aria-label="Database examples">
          <button
            v-for="(db, id) in dbExamples"
            :key="id"
            type="button"
            role="tab"
            class="db-pill-btn"
            :class="{ active: selectedDb === id }"
            :aria-selected="selectedDb === id"
            @click="selectDb(id as DbId)"
          >
            {{ db.label }}
          </button>
        </div>

        <div class="db-cmd-card">
          <div class="db-cmd-head">
            <span class="db-cmd-title">{{ dbExamples[selectedDb].label }} → TinyPivot</span>
            <span class="db-cmd-tag">{{ dbExamples[selectedDb].tag }}</span>
          </div>
          <pre class="db-cmd-pre"><code>{{ dbExamples[selectedDb].command }}</code></pre>
        </div>

        <div class="db-arch-flow">
          <div class="arch-node">
            <div class="arch-node-kicker">
              1. Any Data Source
            </div>
            <strong>BigQuery · Snowflake · MySQL · DuckDB · Databricks · Postgres</strong>
            <span>SQL CLI pipe, CSV/JSON/TSV export, or optional direct <code>query_postgres</code></span>
          </div>

          <div class="arch-arrow" aria-hidden="true">
            →
          </div>

          <div class="arch-node arch-node-center">
            <div class="arch-node-kicker">
              2. Local TinyPivot MCP
            </div>
            <strong>1,186 raw rows stay local</strong>
            <span>Streams rows straight to the UI over local stdio / SSE — never uploaded</span>
          </div>

          <div class="arch-arrow" aria-hidden="true">
            →
          </div>

          <div class="arch-split-outputs">
            <div class="arch-out-card arch-out-llm">
              <span class="arch-out-badge">LLM Context</span>
              <strong>~200-token schema only</strong>
              <span>0 raw rows enter prompt context</span>
            </div>
            <div class="arch-out-card arch-out-ui">
              <span class="arch-out-badge arch-out-badge-ui">Interactive UI + TUI</span>
              <strong>100% deterministic math</strong>
              <span>Charts, pivots, drill-through &amp; .xlsx</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reel-shell {
  width: 100%;
  background: #0b0b0f;
  overflow: hidden;
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #e2e8f0;
}

/* Top Bar */
.reel-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(10, 10, 15, 0.92);
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
  flex-wrap: wrap;
}

.reel-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  flex: 1;
  min-width: 280px;
}

.reel-tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 11px 11px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(255, 255, 255, 0.025);
  color: #94a3b8;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  overflow: hidden;
  transition: border-color 0.2s, background 0.2s, color 0.2s;
}

.reel-tab:hover {
  color: #e2e8f0;
  border-color: rgba(148, 163, 184, 0.3);
}

.reel-tab.active {
  color: #f8fafc;
  background: rgba(16, 185, 129, 0.12);
  border-color: rgba(16, 185, 129, 0.45);
}

.reel-tab-num {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: #10b981;
  opacity: 0.85;
}

.reel-tab-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.reel-tab-progress-track {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2.5px;
  background: rgba(148, 163, 184, 0.12);
}

.reel-tab-progress-fill {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #10b981, #3b82f6, #8b5cf6);
  transition: width 60ms linear;
}

.reel-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.reel-ctrl-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(255, 255, 255, 0.04);
  color: #cbd5e1;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.reel-ctrl-btn:hover {
  background: rgba(255, 255, 255, 0.09);
  border-color: rgba(16, 185, 129, 0.4);
  color: #ffffff;
}

.reel-play-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #10b981;
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.8);
}

.reel-play-dot.paused {
  background: #f59e0b;
  box-shadow: none;
}

/* Slide Header */
.reel-slide-meta {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 22px 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  flex-wrap: wrap;
}

.reel-slide-meta-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.reel-slide-badge {
  display: inline-block;
  width: fit-content;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  font-weight: 500;
  color: #34d399;
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 999px;
  padding: 2px 10px;
}

.reel-slide-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #f8fafc;
  letter-spacing: -0.015em;
}

.reel-slide-sub {
  margin: 0;
  max-width: 540px;
  font-size: 13.5px;
  line-height: 1.5;
  color: #94a3b8;
}

/* Stage */
.reel-stage {
  padding: 20px 22px 22px;
  min-height: 410px;
  background:
    radial-gradient(ellipse 70% 50% at 20% 0%, rgba(16, 185, 129, 0.08), transparent 60%),
    radial-gradient(ellipse 60% 50% at 85% 100%, rgba(59, 130, 246, 0.08), transparent 60%),
    #0a0a0f;
}

.slide-panel {
  animation: reelFadeIn 240ms ease-out;
}

@keyframes reelFadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* --- SLIDE 1: IDE WIDGET --- */
.ide-chat-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}

.ide-user-msg {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(148, 163, 184, 0.14);
  font-size: 13px;
  color: #e2e8f0;
  flex-wrap: wrap;
}

.ide-user-msg code {
  color: #34d399;
  font-size: 12px;
}

.ide-avatar {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 6px;
}

.ide-avatar-user {
  background: rgba(59, 130, 246, 0.2);
  color: #93c5fd;
  border: 1px solid rgba(59, 130, 246, 0.35);
}

.ide-tool-call {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-radius: 8px;
  background: rgba(16, 185, 129, 0.07);
  border: 1px solid rgba(16, 185, 129, 0.24);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12px;
  flex-wrap: wrap;
}

.ide-tool-check {
  color: #10b981;
  font-weight: 700;
}

.ide-tool-call code {
  color: #f8fafc;
  font-weight: 600;
}

.ide-tool-args {
  color: #94a3b8;
}

.ide-tool-stat {
  margin-left: auto;
  color: #6ee7b7;
  font-size: 11.5px;
}

.ide-widget-card {
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: #0f1320;
  overflow: hidden;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
}

.widget-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
  flex-wrap: wrap;
}

.widget-toolbar-left,
.widget-toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.widget-title-group {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13.5px;
  color: #f8fafc;
}

.widget-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: linear-gradient(135deg, #10b981, #3b82f6);
}

.widget-mode-pills {
  display: inline-flex;
  padding: 2px;
  border-radius: 8px;
  background: rgba(10, 10, 15, 0.85);
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.widget-mode-pills button {
  padding: 4px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #94a3b8;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.widget-mode-pills button.active {
  background: #10b981;
  color: #052e16;
}

.widget-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 7px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(15, 23, 42, 0.85);
  color: #cbd5e1;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.widget-pill:hover {
  border-color: rgba(16, 185, 129, 0.5);
  color: #ffffff;
}

.widget-pill-saved {
  cursor: default;
  background: rgba(16, 185, 129, 0.14);
  border-color: rgba(16, 185, 129, 0.4);
  color: #6ee7b7;
}

.saved-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #10b981;
}

.widget-chart-area {
  padding: 16px 18px 14px;
}

.chart-legend-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 14px;
  font-size: 12px;
  color: #cbd5e1;
  flex-wrap: wrap;
}

.chart-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.legend-swatch {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}

.chart-total-badge {
  margin-left: auto;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12px;
  font-weight: 600;
  color: #f8fafc;
}

.stacked-chart-plot {
  display: grid;
  grid-template-columns: 42px 1fr;
  gap: 10px;
  align-items: stretch;
  height: 196px;
}

.chart-y-axis {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 16px 0 22px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  color: #64748b;
  text-align: right;
}

.chart-bars-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
  padding: 0 6px;
  background:
    repeating-linear-gradient(
      to bottom,
      rgba(148, 163, 184, 0.08) 0,
      rgba(148, 163, 184, 0.08) 1px,
      transparent 1px,
      transparent 25%
    );
  border-left: 1px solid rgba(148, 163, 184, 0.16);
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
}

.bar-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
}

.bar-val-top {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  color: #cbd5e1;
  height: 18px;
  line-height: 18px;
}

.bar-stack-track {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0 6px;
}

.bar-stack {
  width: 100%;
  max-width: 48px;
  display: flex;
  flex-direction: column;
  border-radius: 6px 6px 2px 2px;
  overflow: hidden;
  transition: height 340ms cubic-bezier(0.22, 1, 0.36, 1), transform 160ms ease;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
}

.bar-col.hovered .bar-stack {
  transform: translateY(-2px);
  filter: brightness(1.12);
}

.bar-seg {
  width: 100%;
  transition: background-color 220ms ease;
}

.bar-x-label {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11.5px;
  color: #94a3b8;
  height: 22px;
  line-height: 22px;
}

.widget-table-wrap {
  padding: 12px 14px;
  overflow-x: auto;
}

.mini-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

.mini-table th,
.mini-table td {
  padding: 7px 9px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  text-align: left;
  white-space: nowrap;
}

.mini-table th {
  color: #94a3b8;
  font-weight: 600;
  font-size: 11.5px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.mini-table td.num,
.mini-table th.num {
  text-align: right;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
}

.mini-table td.strong {
  color: #f8fafc;
  font-weight: 700;
}

.mini-table tr.total-row td {
  border-top: 1px solid rgba(16, 185, 129, 0.35);
  border-bottom: none;
  color: #6ee7b7;
  font-weight: 700;
}

.mono-cell {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  color: #93c5fd;
}

.tier-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  margin-right: 7px;
}

.widget-footer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 14px;
  font-size: 11.5px;
  color: #64748b;
  background: rgba(10, 10, 15, 0.6);
  border-top: 1px solid rgba(148, 163, 184, 0.1);
  flex-wrap: wrap;
}

.widget-footer-bar strong {
  color: #94a3b8;
}

.widget-footer-brand {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  color: #10b981;
}

/* --- SLIDE 2: GHOSTTY TERMINAL --- */
.ghostty-window {
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: #0b0d14;
  overflow: hidden;
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.55);
}

.ghostty-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.035);
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}

.window-dots {
  display: flex;
  align-items: center;
  gap: 6px;
}

.window-dots span {
  width: 10px;
  height: 10px;
  border-radius: 999px;
}

.dot-red {
  background: #ef4444;
}

.dot-yellow {
  background: #f59e0b;
}

.dot-green {
  background: #10b981;
}

.ghostty-title {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12px;
  color: #94a3b8;
}

.ghostty-tag {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  color: #34d399;
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 6px;
  padding: 2px 8px;
}

.ghostty-body {
  padding: 14px 16px 16px;
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
}

.term-prompt-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.term-prompt-sym {
  color: #10b981;
  font-weight: 700;
}

.term-prompt-cmd {
  color: #93c5fd;
  font-weight: 600;
}

.term-prompt-arg {
  color: #e2e8f0;
}

.term-meta-line {
  font-size: 11.5px;
  color: #94a3b8;
  margin-bottom: 14px;
}

.term-meta-line code {
  color: #34d399;
}

.term-ok {
  color: #10b981;
}

.term-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 14px;
  align-items: stretch;
  padding: 6px 0;
}

.tui-card {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border-radius: 9px;
  background: #0b0d14;
  border: 1px solid rgba(52, 211, 153, 0.45);
  padding: 16px 14px 14px;
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.45;
}

.tui-card-emerald {
  color: #6ee7b7;
  border-color: rgba(52, 211, 153, 0.45);
}

.tui-card-blue {
  color: #bfdbfe;
  border-color: rgba(96, 165, 250, 0.45);
}

.tui-card-top,
.tui-card-bottom {
  position: absolute;
  left: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  pointer-events: none;
}

.tui-card-top {
  top: -8px;
}

.tui-card-bottom {
  bottom: -8px;
}

.tui-edge-label,
.tui-edge-badge,
.tui-edge-brand,
.tui-edge-meta {
  background: #0b0d14;
  padding: 0 6px;
  font-size: 10.5px;
  line-height: 1.2;
  white-space: nowrap;
}

.tui-edge-label {
  font-weight: 600;
}

.tui-edge-brand {
  color: #34d399;
  opacity: 0.9;
}

.tui-card-blue .tui-edge-brand {
  color: #93c5fd;
}

.tui-edge-meta {
  color: #94a3b8;
}

.tui-card-body {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 10px;
  flex: 1;
}

.tui-braille-chart {
  display: flex;
  flex-direction: column;
}

.tui-braille-row,
.tui-x-axis-row,
.tui-x-labels-row {
  display: grid;
  grid-template-columns: 36px 8px 1fr;
  align-items: center;
}

.tui-y-tick {
  text-align: right;
  font-size: 10.5px;
  color: #6ee7b7;
  opacity: 0.85;
  padding-right: 4px;
}

.tui-y-axis-tick {
  position: relative;
  height: 17px;
  border-right: 1px solid rgba(110, 231, 183, 0.55);
}

.tui-y-axis-tick.major::after {
  content: '';
  position: absolute;
  right: 0;
  top: 50%;
  width: 4px;
  height: 1px;
  background: rgba(110, 231, 183, 0.65);
}

.tui-braille-cells {
  display: grid;
  grid-template-columns: repeat(36, minmax(0, 1fr));
  align-items: center;
  height: 17px;
  padding-left: 4px;
}

.tui-braille-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 17px;
  line-height: 1;
  font-size: 12px;
  color: #34d399;
}

.tui-x-axis-row {
  height: 6px;
}

.tui-x-corner {
  height: 6px;
  border-right: 1px solid rgba(110, 231, 183, 0.55);
}

.tui-x-line {
  height: 6px;
  border-bottom: 1px solid rgba(110, 231, 183, 0.55);
}

.tui-x-labels {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 2px 0 4px;
  font-size: 10.5px;
  color: #6ee7b7;
  opacity: 0.85;
}

.tui-stats-line {
  font-size: 10.5px;
  color: #a7f3d0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tui-pivot-body {
  justify-content: center;
}

.tui-pivot-grid {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.tui-pivot-row {
  display: grid;
  grid-template-columns: minmax(82px, 1.25fr) repeat(3, minmax(56px, 0.9fr)) minmax(58px, 0.85fr);
  align-items: center;
}

.tui-pivot-row > span {
  padding: 5px 7px;
  border-right: 1px solid rgba(147, 197, 253, 0.22);
  white-space: nowrap;
}

.tui-pivot-row > span:first-child {
  padding-left: 2px;
}

.tui-pivot-row > span:last-child {
  border-right: none;
  padding-right: 2px;
}

.tui-pivot-row .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.tui-pivot-row .spark-col {
  text-align: center;
}

.tui-spark {
  color: #60a5fa;
  letter-spacing: 0.5px;
}

.tui-pivot-head {
  color: #93c5fd;
  font-weight: 600;
  border-bottom: 1px solid rgba(147, 197, 253, 0.35);
}

.tui-pivot-total {
  color: #e0f2fe;
  font-weight: 700;
  border-top: 1px solid rgba(147, 197, 253, 0.35);
}

/* --- SLIDE 3: LIVE COMPANION IDE --- */
.companion-split {
  display: grid;
  grid-template-columns: minmax(250px, 0.85fr) minmax(320px, 1.35fr);
  gap: 14px;
  align-items: stretch;
}

.companion-term,
.companion-browser {
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: #0d101b;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.companion-bar,
.browser-chrome {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 12px;
  background: rgba(255, 255, 255, 0.035);
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}

.bar-label {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11.5px;
  color: #94a3b8;
}

.sse-pill {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10.5px;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
}

.companion-term-body {
  padding: 12px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11.5px;
  line-height: 1.6;
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1;
}

.term-dim {
  color: #64748b;
}

.term-emerald {
  color: #34d399;
  font-weight: 600;
}

.term-divider {
  height: 1px;
  background: rgba(148, 163, 184, 0.14);
  margin: 6px 0;
}

.term-log {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 5px 7px;
  border-radius: 6px;
  color: #94a3b8;
}

.term-log-active {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #e2e8f0;
}

.log-ts {
  color: #64748b;
}

.log-ev {
  color: #60a5fa;
  font-weight: 600;
}

.term-hint-box {
  margin-top: auto;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.25);
  color: #bfdbfe;
  font-family: 'Space Grotesk', sans-serif;
  font-size: 12px;
  line-height: 1.4;
}

.browser-url {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 3px 10px;
  border-radius: 6px;
  background: rgba(10, 10, 15, 0.85);
  border: 1px solid rgba(148, 163, 184, 0.18);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11.5px;
  color: #e2e8f0;
}

.live-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #34d399;
  font-weight: 700;
  font-size: 10.5px;
}

.live-pulse {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #10b981;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.25);
}

.browser-export-chip {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10.5px;
  color: #cbd5e1;
  padding: 2px 7px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
}

.browser-content {
  position: relative;
  padding: 12px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}

.browser-pivot-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.browser-pivot-head strong {
  font-size: 13px;
  color: #f8fafc;
}

.browser-pivot-head span {
  font-size: 11.5px;
  color: #64748b;
}

.drill-cell-btn {
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid rgba(16, 185, 129, 0.45);
  background: rgba(16, 185, 129, 0.14);
  color: #6ee7b7;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, transform 0.15s;
}

.drill-cell-btn:hover,
.drill-cell-btn.active {
  background: #10b981;
  color: #052e16;
  transform: scale(1.03);
}

.drill-modal {
  border-radius: 10px;
  border: 1px solid rgba(59, 130, 246, 0.45);
  background: rgba(10, 14, 26, 0.96);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.55);
  overflow: hidden;
}

.drill-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 11px;
  background: rgba(59, 130, 246, 0.12);
  border-bottom: 1px solid rgba(59, 130, 246, 0.25);
}

.drill-kicker {
  display: block;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #93c5fd;
}

.drill-modal-head strong {
  font-size: 12.5px;
  color: #f8fafc;
}

.drill-close {
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  font-size: 13px;
  padding: 2px 6px;
}

.drill-close:hover {
  color: #ffffff;
}

.drill-table th,
.drill-table td {
  padding: 5px 10px;
  font-size: 11.5px;
}

.drill-modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 7px 10px;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
}

.drill-foot-pill {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 6px;
  background: rgba(148, 163, 184, 0.14);
  color: #cbd5e1;
}

.drill-foot-pill-emerald {
  background: rgba(16, 185, 129, 0.18);
  color: #6ee7b7;
}

/* --- SLIDE 4: ANY DATABASE --- */
.db-selector-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.db-pill-btn {
  padding: 7px 14px;
  border-radius: 9px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(255, 255, 255, 0.035);
  color: #94a3b8;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.db-pill-btn:hover {
  color: #f8fafc;
  border-color: rgba(16, 185, 129, 0.35);
}

.db-pill-btn.active {
  background: linear-gradient(135deg, #10b981, #059669);
  border-color: #10b981;
  color: #ffffff;
}

.db-cmd-card {
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: #0d101b;
  overflow: hidden;
  margin-bottom: 16px;
}

.db-cmd-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 14px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
  font-size: 12.5px;
}

.db-cmd-title {
  font-weight: 600;
  color: #f8fafc;
}

.db-cmd-tag {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  color: #34d399;
}

.db-cmd-pre {
  margin: 0;
  padding: 14px;
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 1.55;
  color: #a7f3d0;
  overflow-x: auto;
}

.db-arch-flow {
  display: grid;
  grid-template-columns: 1fr auto 1fr auto 1.1fr;
  gap: 10px;
  align-items: center;
}

.arch-node {
  padding: 14px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(148, 163, 184, 0.18);
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.arch-node-center {
  border-color: rgba(16, 185, 129, 0.45);
  background: rgba(16, 185, 129, 0.08);
}

.arch-node-kicker {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #34d399;
}

.arch-node strong {
  font-size: 13.5px;
  color: #f8fafc;
}

.arch-node span {
  font-size: 12px;
  line-height: 1.45;
  color: #94a3b8;
}

.arch-node code {
  color: #7dd3fc;
}

.arch-arrow {
  font-size: 18px;
  font-weight: 700;
  color: #10b981;
  text-align: center;
}

.arch-split-outputs {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.arch-out-card {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.85);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.arch-out-llm {
  border-color: rgba(139, 92, 246, 0.35);
}

.arch-out-ui {
  border-color: rgba(59, 130, 246, 0.4);
}

.arch-out-badge {
  width: fit-content;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(139, 92, 246, 0.18);
  color: #c4b5fd;
}

.arch-out-badge-ui {
  background: rgba(59, 130, 246, 0.2);
  color: #93c5fd;
}

.arch-out-card strong {
  font-size: 12.5px;
  color: #f8fafc;
}

.arch-out-card span:last-child {
  font-size: 11.5px;
  color: #94a3b8;
}

/* Responsive */
@media (max-width: 860px) {
  .reel-tabs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .companion-split,
  .db-arch-flow {
    grid-template-columns: 1fr;
  }

  .arch-arrow {
    transform: rotate(90deg);
  }

  .term-cards-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 540px) {
  .reel-stage {
    padding: 14px;
  }

  .stacked-chart-plot {
    grid-template-columns: 34px 1fr;
  }

  .chart-bars-grid {
    gap: 6px;
  }
}
@media (max-width: 640px) {
  .reel-topbar {
    flex-wrap: nowrap;
    padding: 10px 0 10px 12px;
  }

  .reel-tabs {
    display: flex;
    min-width: 0;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
    padding-right: 12px;
  }

  .reel-tabs::-webkit-scrollbar {
    display: none;
  }

  .reel-tab {
    flex: none;
    min-height: 40px;
  }

  .reel-controls,
  .reel-slide-sub,
  .bar-val-top {
    display: none;
  }

  .reel-slide-meta {
    padding: 14px 14px 12px;
  }

  .reel-slide-title {
    font-size: 17px;
  }

  .reel-stage {
    min-height: 0;
  }

  .ghostty-tag {
    display: none;
  }

  .ghostty-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .term-cards-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .tui-card {
    min-width: 0;
    padding: 12px 10px;
  }

  .tui-braille-cell {
    font-size: 10px;
  }

  .tui-pivot-row {
    grid-template-columns: minmax(64px, 1.2fr) repeat(3, minmax(0, 1fr)) 40px;
    font-size: 11px;
  }

  .tui-pivot-row > span {
    padding: 4px 3px;
  }

  .companion-split {
    grid-template-columns: minmax(0, 1fr);
  }

  .browser-content {
    overflow-x: auto;
  }

  .companion-table {
    font-size: 11px;
  }

  .companion-table th,
  .companion-table td {
    padding: 6px 5px;
  }
}
</style>
