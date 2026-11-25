/**
 * TinyPivot D3 charts — `@smallwebco/tinypivot-core/d3`.
 *
 * A framework-agnostic renderer for the D3 chart types (see `isD3ChartType`).
 * React and Vue import this module lazily, so D3 and the map data stay out of
 * the main bundle until someone picks one of these charts.
 */
import type { D3ChartTheme } from '../chart/d3-theme'
import type { ChartStory } from '../chart/story'
import type { ChartConfig, ChartType } from '../types'
import type { DrawContext } from './context'
import { select } from 'd3-selection'
import { buildChartStory } from '../chart/story'
import { drawBullet } from './bullet'
import { drawChoropleth } from './choropleth'
import { createChrome } from './chrome'
import { createTooltip, writeDefs } from './context'
import { drawSunburst, drawTreemap } from './hierarchy'
import { drawRadialArea, drawRadialBar } from './radial'
import { drawSlope } from './slope'
import 'd3-transition'

export { loadMapShapes } from './choropleth'

export interface D3ChartSpec {
  config: ChartConfig
  data: Record<string, unknown>[]
  theme: D3ChartTheme
  /** Animate entering marks; ignored when the user prefers reduced motion */
  animate?: boolean
}

export interface D3ChartStatus {
  /** Plain-language notes about what the chart left out (unmatched regions, truncation) */
  notes: string[]
}

export interface D3ChartHandle {
  update: (spec: D3ChartSpec) => void
  destroy: () => void
}

type Drawer = (ctx: DrawContext) => void | Promise<void>

const DRAWERS: Partial<Record<ChartType, Drawer>> = {
  bullet: drawBullet,
  choropleth: drawChoropleth,
  radialBar: drawRadialBar,
  radialArea: drawRadialArea,
  treemap: drawTreemap,
  sunburst: drawSunburst,
  slope: drawSlope,
}

/** Whether `mountD3Chart` can draw this type. */
export function canDrawWithD3(type: ChartType): boolean {
  return type in DRAWERS
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

let instanceCount = 0

/**
 * Draw a D3 chart into `container` and keep it sized to it. Returns a handle to
 * redraw with new data or theme, and to clean up.
 */
export function mountD3Chart(container: HTMLElement, initial: D3ChartSpec, onStatus?: (status: D3ChartStatus) => void): D3ChartHandle {
  const uid = `vpg-d3-${++instanceCount}`
  container.classList.add('vpg-d3-chart')
  const chrome = createChrome()
  const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  container.append(chrome.header, svgNode, chrome.footer)
  const tooltip = createTooltip(container)
  const svg = select(svgNode)
  let spec = initial
  let generation = 0
  let hasDrawn = false

  const storyFor = (next: D3ChartSpec): ChartStory | null =>
    next.config.options?.annotations === false ? null : buildChartStory(next.data, next.config)
  // Computed per spec, not per resize: it walks every row.
  let story = storyFor(spec)

  function render(): void {
    chrome.renderHeader(story, spec.theme, spec.config.options?.variant)
    const width = svgNode.clientWidth || container.clientWidth
    const height = svgNode.clientHeight || container.clientHeight
    // A hidden or collapsed container keeps the last drawing; the resize observer redraws when it opens.
    if (width <= 0 || height <= 0)
      return
    const current = ++generation
    svg.selectAll('*').remove()
    tooltip.hide()
    svg.attr('viewBox', `0 0 ${width} ${height}`)
      .attr('role', 'img')
      .attr('aria-label', spec.config.options?.title || `${spec.config.type} chart`)
    const ctx: DrawContext = {
      svg,
      width,
      height,
      theme: spec.theme,
      config: spec.config,
      data: spec.data,
      // Only the first draw animates; resizes and theme switches redraw in place.
      animate: !hasDrawn && (spec.animate ?? true) && !prefersReducedMotion(),
      uid,
      tooltip,
      notes: [],
      isStale: () => current !== generation,
      story,
      key: [],
    }
    hasDrawn = true
    writeDefs(ctx)
    const finish = (): void => {
      if (ctx.isStale())
        return
      chrome.renderKey(ctx.key, spec.theme)
      const options = spec.config.options ?? {}
      chrome.renderFooter({ story, source: options.source, footnote: options.footnote, rows: spec.data.length, notes: ctx.notes, variant: options.variant }, spec.theme)
      onStatus?.({ notes: ctx.notes })
    }
    const drawer = DRAWERS[spec.config.type]
    if (!drawer) {
      ctx.notes.push(`"${spec.config.type}" is not a D3 chart type.`)
      finish()
      return
    }
    Promise.resolve(drawer(ctx)).then(finish, (error: unknown) => {
      ctx.notes.push(`Could not draw this chart: ${error instanceof Error ? error.message : String(error)}`)
      finish()
    })
  }

  let frame = 0
  const observer = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => {
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(render)
      })
    : null
  observer?.observe(container)
  render()

  return {
    update(next) {
      const typeChanged = next.config.type !== spec.config.type
      spec = next
      story = storyFor(next)
      if (typeChanged)
        hasDrawn = false
      render()
    },
    destroy() {
      generation++
      cancelAnimationFrame(frame)
      observer?.disconnect()
      chrome.header.remove()
      svgNode.remove()
      chrome.footer.remove()
      container.querySelector('.vpg-d3-tooltip')?.remove()
      container.classList.remove('vpg-d3-chart')
    },
  }
}
