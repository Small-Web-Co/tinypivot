/**
 * The frame around a D3 chart, in the house style of a report exhibit:
 *
 *   KICKER (what is measured)
 *   Action title (the takeaway, or the user's own title)
 *   Dek (how to read it) · key, when a stack needs one
 *   [chart]
 *   Source · how the numbers were computed · notes about what was left out
 *
 * Plain HTML, so it copies cleanly into a deck and wraps like text.
 */
import type { D3ChartTheme } from '../chart/d3-theme'
import type { ChartStory } from '../chart/story'
import type { KeyEntry } from './context'

export interface ChartChrome {
  header: HTMLElement
  footer: HTMLElement
  renderHeader: (story: ChartStory | null, theme: D3ChartTheme, variant?: ChartVariant) => void
  renderKey: (entries: KeyEntry[], theme: D3ChartTheme) => void
  renderFooter: (parts: FooterParts, theme: D3ChartTheme) => void
}

export type ChartVariant = 'editorial' | 'deck'

export interface FooterParts {
  story: ChartStory | null
  source?: string
  footnote?: string
  /** Rows behind the chart, for the default deck source line */
  rows: number
  notes: string[]
  variant?: ChartVariant
}

/**
 * Footer text. Editorial: "Source: X · how it was computed", then notes.
 * Deck: "Note: footnote (or how it was computed)" then "Source: X; N rows",
 * the order consulting exhibits use; notes about left-out data follow.
 */
export function footerLines({ story, source, notes, footnote, rows, variant = 'editorial' }: FooterParts): string[] {
  const method = story?.footnote ?? ''
  const rowText = `${rows.toLocaleString('en-US')} rows`
  if (variant === 'deck') {
    return [
      `Note: ${footnote || method}`.replace(/^Note: $/, ''),
      `Source: ${source ? `${source}; ${rowText}` : rowText}`,
      ...notes,
    ].filter(Boolean)
  }
  return [
    [source ? `Source: ${source}` : '', method, rowText].filter(Boolean).join(' · '),
    footnote ? `Note: ${footnote}` : '',
    ...notes,
  ].filter(Boolean)
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  return node
}

/** A swatch for the key; pattern fills (1-bit) become a hatched box, as CSS cannot use SVG patterns. */
function swatch(entry: KeyEntry, theme: D3ChartTheme): HTMLElement {
  const box = el('span', 'vpg-d3-swatch')
  if (entry.fill.startsWith('url(')) {
    box.style.background = `repeating-linear-gradient(45deg, ${theme.ink} 0 1.5px, ${theme.surface} 1.5px 4px)`
    box.style.border = `1px solid ${theme.ink}`
  }
  else {
    box.style.background = entry.fill
  }
  return box
}

export function createChrome(): ChartChrome {
  const header = el('header', 'vpg-d3-header')
  const kicker = el('p', 'vpg-d3-kicker')
  const headline = el('h3', 'vpg-d3-headline')
  const dek = el('p', 'vpg-d3-dek')
  const key = el('p', 'vpg-d3-key')
  header.append(kicker, headline, dek, key)
  const footer = el('footer', 'vpg-d3-footer')

  return {
    header,
    footer,
    renderHeader(story, theme, variant = 'editorial') {
      header.hidden = !story
      header.dataset.variant = variant
      if (!story)
        return
      kicker.textContent = story.kicker
      kicker.style.color = theme.muted
      headline.textContent = story.headline
      // Decks set the action title in the theme's working face; editorial pages use the display face.
      headline.style.fontFamily = variant === 'deck' ? theme.fontLabel : theme.fontDisplay
      headline.style.color = theme.title
      dek.textContent = story.dek
      dek.style.color = theme.muted
      dek.hidden = variant === 'deck'
    },
    renderKey(entries, theme) {
      key.replaceChildren()
      key.hidden = entries.length === 0
      for (const entry of entries) {
        const item = el('span', 'vpg-d3-key-item')
        item.style.color = theme.ink
        item.append(swatch(entry, theme), document.createTextNode(entry.label))
        key.appendChild(item)
      }
    },
    renderFooter({ story, source, notes, footnote, rows, variant = 'editorial' }, theme) {
      const lines = footerLines({ story, source, notes, footnote, rows, variant })
      footer.replaceChildren(...lines.map((text) => {
        const line = el('p', 'vpg-d3-footnote')
        line.textContent = text
        return line
      }))
      footer.hidden = lines.length === 0
      footer.style.color = theme.muted
      // The theme's small type: monospace on the terminal and ledger looks, its label face elsewhere.
      footer.style.fontFamily = theme.fontLabel
    },
  }
}
