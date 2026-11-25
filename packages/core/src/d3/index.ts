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
  const header = document.createElement('header')
  header.className = 'vpg-d3-header'
  const headline = document.createElement('h3')
  headline.className = 'vpg-d3-headline'
  const dek = document.createElement('p')
  dek.className = 'vpg-d3-dek'
  header.append(headline, dek)
  const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const notesEl = document.createElement('div')
  notesEl.className = 'vpg-d3-notes'
  container.append(header, svgNode, notesEl)
  const tooltip = createTooltip(container)
  const svg = select(svgNode)
  let spec = initial
  let generation = 0
  let hasDrawn = false

  /** Headline and dek above the chart, set in the theme's display face. */
  function renderHeader(story: ChartStory | null): void {
    header.hidden = !story
    if (!story)
      return
    headline.textContent = story.headline
    headline.style.fontFamily = spec.theme.fontDisplay
    headline.style.color = spec.theme.title
    dek.textContent = story.dek
    dek.style.color = spec.theme.muted
  }

  const storyFor = (next: D3ChartSpec): ChartStory | null =>
    next.config.options?.annotations === false ? null : buildChartStory(next.data, next.config)
  // Computed per spec, not per resize: it walks every row.
  let story = storyFor(spec)

  function render(): void {
    renderHeader(story)
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
    }
    hasDrawn = true
    writeDefs(ctx)
    const finish = (): void => {
      if (ctx.isStale())
        return
      notesEl.textContent = ctx.notes.join(' ')
      notesEl.hidden = ctx.notes.length === 0
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
      header.remove()
      svgNode.remove()
      notesEl.remove()
      container.querySelector('.vpg-d3-tooltip')?.remove()
      container.classList.remove('vpg-d3-chart')
    },
  }
}
