/**
 * Shared drawing context for the D3 charts: the SVG root, theme-driven fills
 * (colour, 1-bit patterns, CRT glow), a tooltip and small text helpers.
 */
import type { Selection } from 'd3-selection'
import type { D3ChartTheme } from '../chart/d3-theme'
import type { ChartStory } from '../chart/story'
import type { ChartPatternStyle } from '../theme'
import type { ChartConfig } from '../types'
import { formatChartValue, mixColor } from '../chart/d3-theme'
import { formatFieldLabel } from '../chart/index'
import { commonLabelPrefix } from '../chart/story'

export type Svg = Selection<SVGSVGElement, unknown, null, undefined>
export type Group = Selection<SVGGElement, unknown, null, undefined>

export interface DrawContext {
  svg: Svg
  width: number
  height: number
  theme: D3ChartTheme
  config: ChartConfig
  data: Record<string, unknown>[]
  /** Animate entering marks (already false under prefers-reduced-motion) */
  animate: boolean
  /** Unique prefix for ids inside this chart's SVG */
  uid: string
  tooltip: Tooltip
  /** Short notes shown under the chart (unmatched regions, truncation) */
  notes: string[]
  /** True once a newer draw has started; async drawers stop when it flips */
  isStale: () => boolean
  /** Computed takeaway; `null` when annotations are off */
  story: ChartStory | null
}

/** Whether a label is one the story calls out. */
export function isCallout(ctx: DrawContext, label: string): boolean {
  return ctx.story?.callouts.includes(label) ?? false
}

/** Label shortener that drops a prefix every label shares ("Acme "); tooltips keep full names. */
export function labelTrimmer(labels: string[]): (label: string) => string {
  const prefix = commonLabelPrefix(labels)
  return prefix ? label => (label.startsWith(prefix) ? label.slice(prefix.length) : label) : label => label
}

/**
 * Annotation text with a surface-coloured halo so it reads over marks and
 * gridlines, the way newspaper graphics label directly on the chart.
 */
export function haloText(parent: Group, ctx: DrawContext, x: number, y: number, text: string, opts: { anchor?: 'start' | 'middle' | 'end', size?: number, weight?: number, mono?: boolean, color?: string } = {}): void {
  styleText(parent.append('text'), ctx, { size: opts.size ?? 11, weight: opts.weight ?? 600, mono: opts.mono, color: opts.color ?? ctx.theme.ink })
    .attr('x', x)
    .attr('y', y)
    .attr('text-anchor', opts.anchor ?? 'start')
    .attr('dominant-baseline', 'central')
    .attr('stroke', ctx.theme.surface)
    .attr('stroke-width', 3.5)
    .attr('stroke-linejoin', 'round')
    .attr('paint-order', 'stroke')
    .attr('pointer-events', 'none')
    .text(text)
}

export const TRANSITION_MS = 520

// ---------------------------------------------------------------------------
// Fills
// ---------------------------------------------------------------------------

const PATTERN_MARKUP: Record<ChartPatternStyle, (ink: string) => string> = {
  verticalLines: ink => `<path d="M3 0V6" stroke="${ink}" stroke-width="1.5"/>`,
  horizontalLines: ink => `<path d="M0 3H6" stroke="${ink}" stroke-width="1.5"/>`,
  slantedLines: ink => `<path d="M-1 7L7 -1M-1 1L1 -1M5 7L7 5" stroke="${ink}" stroke-width="1.4"/>`,
  squares: ink => `<rect x="1" y="1" width="3" height="3" fill="${ink}"/>`,
  circles: ink => `<circle cx="3" cy="3" r="1.4" fill="${ink}"/>`,
}

/** Increasing ink density for classed (sequential) fills on the 1-bit look. */
const DENSITY_MARKUP: Array<(ink: string) => string> = [
  ink => `<circle cx="3" cy="3" r="0.8" fill="${ink}"/>`,
  ink => `<circle cx="1.5" cy="1.5" r="1" fill="${ink}"/><circle cx="4.5" cy="4.5" r="1" fill="${ink}"/>`,
  ink => `<path d="M-1 7L7 -1M-1 1L1 -1M5 7L7 5" stroke="${ink}" stroke-width="1.6"/>`,
  ink => `<path d="M-1 7L7 -1M-1 1L1 -1M5 7L7 5M-1 -1L7 7" stroke="${ink}" stroke-width="1.6"/>`,
  ink => `<rect width="6" height="6" fill="${ink}"/>`,
]

function patternTile(id: string, surface: string, inner: string): string {
  return `<pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="${surface}"/>${inner}</pattern>`
}

/** Write <defs> for patterns and glow. Call once per draw, before marks. */
export function writeDefs(ctx: DrawContext): void {
  const { theme, uid } = ctx
  const parts: string[] = []
  if (theme.fillMode === 'pattern') {
    theme.patternStyles.forEach((style, i) => parts.push(patternTile(`${uid}-p${i}`, theme.surface, PATTERN_MARKUP[style](theme.ink))))
    DENSITY_MARKUP.forEach((markup, i) => parts.push(patternTile(`${uid}-d${i}`, theme.surface, markup(theme.ink))))
  }
  if (theme.glow) {
    const slope = Math.min(1, theme.glow.opacity * 3)
    parts.push(`<filter id="${uid}-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceGraphic" stdDeviation="${theme.glow.blur / 2}" result="b"/><feComponentTransfer in="b" result="g"><feFuncA type="linear" slope="${slope}"/></feComponentTransfer><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`)
  }
  ctx.svg.append('defs').html(parts.join(''))
}

/** Fill for series `i`: palette colour, or solid ink then patterns on the 1-bit look. */
export function seriesFill(ctx: DrawContext, i: number): string {
  const { theme } = ctx
  if (theme.fillMode === 'pattern')
    return i === 0 ? theme.ink : `url(#${ctx.uid}-p${(i - 1) % theme.patternStyles.length})`
  return theme.palette[i % theme.palette.length]
}

/** Fill for class `step` (0..4) of a sequential scale. */
export function sequentialFill(ctx: DrawContext, step: number): string {
  const clamped = Math.max(0, Math.min(4, step))
  return ctx.theme.fillMode === 'pattern' ? `url(#${ctx.uid}-d${clamped})` : ctx.theme.sequential[clamped]
}

/** Apply the CRT glow to a group of marks when the theme has one. */
export function applyGlow(ctx: DrawContext, group: Group): Group {
  if (ctx.theme.glow)
    group.attr('filter', `url(#${ctx.uid}-glow)`)
  return group
}

/** Relative luminance (0 dark … 1 light) of a hex colour; patterns count as mid-grey. */
function luminance(color: string): number {
  const hex = color.replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(hex))
    return 0.5
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Ink or surface, whichever reads better on `fill`. Pattern fills get a surface-backed label. */
export function labelColorOn(ctx: DrawContext, fill: string): string {
  const { ink, surface } = ctx.theme
  if (fill.startsWith('url('))
    return ink
  const l = luminance(fill)
  return Math.abs(l - luminance(ink)) >= Math.abs(l - luminance(surface)) ? ink : surface
}

/** A lighter or darker step of `color` toward the surface, for nested marks. */
export function shade(ctx: DrawContext, color: string, t: number): string {
  return color.startsWith('url(') ? color : mixColor(color, ctx.theme.surface, t)
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** Rough width of a label in px; good enough for layout decisions. */
export function textWidth(text: string, fontSize = 11): number {
  return text.length * fontSize * 0.6
}

export function truncate(text: string, maxPx: number, fontSize = 11): string {
  const maxChars = Math.floor(maxPx / (fontSize * 0.6))
  if (text.length <= maxChars)
    return text
  return maxChars <= 1 ? '' : `${text.slice(0, maxChars - 1)}…`
}

/** Base text styling for a selection of <text> elements. */
export function styleText<T extends Selection<any, any, any, any>>(sel: T, ctx: DrawContext, opts: { mono?: boolean, size?: number, color?: string, weight?: number } = {}): T {
  sel
    .attr('font-family', opts.mono ? ctx.theme.fontMono : ctx.theme.fontLabel)
    .attr('font-size', opts.size ?? 11)
    .attr('fill', opts.color ?? ctx.theme.muted)
  if (opts.weight)
    sel.attr('font-weight', opts.weight)
  return sel
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

export interface Tooltip {
  show: (event: PointerEvent | FocusEvent, title: string, lines: string[]) => void
  hide: () => void
}

/** A themed tooltip inside the chart container; text only, never HTML from data. */
export function createTooltip(container: HTMLElement): Tooltip {
  const el = document.createElement('div')
  el.className = 'vpg-d3-tooltip'
  el.setAttribute('role', 'status')
  el.hidden = true
  container.appendChild(el)
  return {
    show(event, title, lines) {
      el.replaceChildren()
      const head = document.createElement('strong')
      head.textContent = title
      el.appendChild(head)
      for (const line of lines) {
        const row = document.createElement('div')
        row.textContent = line
        el.appendChild(row)
      }
      el.hidden = false
      const box = container.getBoundingClientRect()
      const point = 'clientX' in event
        ? { x: event.clientX, y: event.clientY }
        : (() => {
            const r = (event.target as Element).getBoundingClientRect()
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
          })()
      const x = Math.min(point.x - box.left + 14, box.width - el.offsetWidth - 4)
      const y = Math.min(point.y - box.top + 14, box.height - el.offsetHeight - 4)
      el.style.transform = `translate(${Math.max(4, x)}px, ${Math.max(4, y)}px)`
    },
    hide() {
      el.hidden = true
    },
  }
}

/**
 * Wire pointer and keyboard focus on marks to the tooltip. With `keyOf`, the
 * focused mark's group stays lit and every other mark fades back.
 */
export function bindTooltip<D>(
  sel: Selection<any, D, any, any>,
  ctx: DrawContext,
  content: (d: D) => { title: string, lines: string[] },
  keyOf?: (d: D) => string,
): void {
  const focus = (d: D | null): void => {
    if (!keyOf)
      return
    ctx.svg.classed('vpg-d3-focus', d !== null)
    const key = d === null ? null : keyOf(d)
    sel.classed('vpg-d3-on', (m: D) => key !== null && keyOf(m) === key)
  }
  sel
    .attr('tabindex', 0)
    .attr('role', 'img')
    .attr('aria-label', (d: D) => {
      const { title, lines } = content(d)
      return [title, ...lines].join(', ')
    })
    .on('pointermove focus', (event: PointerEvent | FocusEvent, d: D) => {
      const { title, lines } = content(d)
      ctx.tooltip.show(event, title, lines)
      focus(d)
    })
    .on('pointerleave blur', () => {
      ctx.tooltip.hide()
      focus(null)
    })
}

/** A value formatted with the chart's number format options. */
export function formatValue(ctx: DrawContext, value: number): string {
  const options = ctx.config.options ?? {}
  return formatChartValue(value, options.valueFormat, options.decimals)
}

/** Measure label for tooltips: "Revenue (sum)". */
export function measureLabel(field: ChartConfig['yAxis']): string {
  if (!field)
    return 'Value'
  const name = field.label || formatFieldLabel(field.field)
  return field.aggregation ? `${name} (${field.aggregation})` : name
}
