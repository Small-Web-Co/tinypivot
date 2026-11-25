import { describe, expect, it } from 'vitest'
import { clampStudioWidth, MIN_STUDIO_WIDTH } from '../../packages/mcp/app/StudioResizer'

describe('resizing the Studio', () => {
  it('keeps both the Studio and the grid usable', () => {
    expect(clampStudioWidth(520.4, 1440)).toBe(520)
    expect(clampStudioWidth(40, 1440)).toBe(MIN_STUDIO_WIDTH)
    // Dragged almost to the right edge, the grid keeps its minimum.
    expect(clampStudioWidth(1400, 1440)).toBe(1080)
  })
})
