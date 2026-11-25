// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(__dirname, '../..', path), 'utf8')
const designLayer = (css: string) => /\/\* @design-layer:start \*\/[\s\S]*\/\* @design-layer:end \*\//.exec(css)?.[0]

describe('library styles', () => {
  it('ship the same theme palettes in React and Vue', () => {
    expect(read('packages/vue/src/themes.css')).toBe(read('packages/react/src/themes.css'))
  })

  it('end with the same design layer in React and Vue', () => {
    const react = designLayer(read('packages/react/src/style.css'))
    expect(react).toBeDefined()
    expect(designLayer(read('packages/vue/src/style.css'))).toBe(react)
    // Last in the file, so it wins over the base rules.
    expect(read('packages/react/src/style.css').trimEnd().endsWith('/* @design-layer:end */')).toBe(true)
  })
})
