import { describe, expect, it } from 'vitest'
import { FILL_SNAP_PX, heightToFill, snapToFill } from '../../packages/core/src/layout'

describe('heightToFill', () => {
  it('reaches from the grid top to the container bottom', () => {
    expect(heightToFill({ top: 120, containerBottom: 900.6 })).toBe(780)
    expect(heightToFill({ top: 900, containerBottom: 800 })).toBe(0)
  })
})

describe('snapToFill', () => {
  it('snaps a drag that ends close to the container bottom, and leaves others alone', () => {
    expect(snapToFill(760, 780)).toEqual({ height: 780, filled: true })
    expect(snapToFill(780 + FILL_SNAP_PX + 1, 780)).toEqual({ height: 780 + FILL_SNAP_PX + 1, filled: false })
    expect(snapToFill(500, 780)).toEqual({ height: 500, filled: false })
  })
})
