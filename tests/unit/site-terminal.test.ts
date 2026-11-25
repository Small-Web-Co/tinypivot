import { describe, expect, it } from 'vitest'
import { tintTerminal } from '../../demo/site/terminal'

describe('tintTerminal', () => {
  it('leaves plain text bare', () => {
    expect(tintTerminal('Jan $40.8k')).toBe('Jan $40.8k')
  })

  it('wraps box-drawing runs as frame and block runs as marks', () => {
    expect(tintTerminal('┌──┐ ██▓ ok')).toBe('<span class="t-frame">┌──┐</span> <span class="t-mark">██▓</span> ok')
  })

  it('treats braille as chart marks', () => {
    expect(tintTerminal('⣀⡠')).toBe('<span class="t-mark">⣀⡠</span>')
  })

  it('escapes HTML in the text it passes through', () => {
    expect(tintTerminal('<b> & │')).toBe('&lt;b&gt; &amp; <span class="t-frame">│</span>')
  })

  it('returns an empty string for empty input', () => {
    expect(tintTerminal('')).toBe('')
  })
})
