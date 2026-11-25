/** Turns plain terminal text into HTML with box-drawing and block characters tinted separately. */

type Kind = 'plain' | 'frame' | 'mark'

function kindOf(codePoint: number): Kind {
  if (codePoint >= 0x2500 && codePoint <= 0x257F)
    return 'frame' // box drawing
  if ((codePoint >= 0x2580 && codePoint <= 0x259F) || (codePoint >= 0x2800 && codePoint <= 0x28FF))
    return 'mark' // block elements and braille
  return 'plain'
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }
const escapeHtml = (text: string) => text.replace(/[&<>]/g, char => ESCAPES[char])

/**
 * Wraps runs of frame characters in `<span class="t-frame">` and runs of chart
 * marks in `<span class="t-mark">`. All other text is HTML-escaped and left bare.
 */
export function tintTerminal(text: string): string {
  let html = ''
  let run = ''
  let runKind: Kind = 'plain'

  const flush = () => {
    if (!run)
      return
    const safe = escapeHtml(run)
    html += runKind === 'plain' ? safe : `<span class="t-${runKind}">${safe}</span>`
    run = ''
  }

  for (const char of text) {
    const kind = kindOf(char.codePointAt(0) ?? 0)
    if (kind !== runKind) {
      flush()
      runKind = kind
    }
    run += char
  }
  flush()
  return html
}
