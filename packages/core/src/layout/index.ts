/**
 * Sizing a grid to the space it sits in: filling its container, and snapping a dragged bottom
 * edge to the container's bottom when it comes close. Shared by the React and Vue grids.
 */

/** How close, in pixels, a dragged bottom edge must come to the container's bottom to snap to it. */
export const FILL_SNAP_PX = 36

/** Geometry the calculation needs, so it can be tested without a browser layout engine. */
export interface FillGeometry {
  /** Top of the grid, in viewport pixels. */
  top: number
  /** Bottom of the container's content box, in viewport pixels. */
  containerBottom: number
}

/** Height that takes the grid from its top down to the bottom of its container's content. */
export function heightToFill({ top, containerBottom }: FillGeometry): number {
  return Math.max(0, Math.floor(containerBottom - top))
}

/** A dragged height, or the fill height when the drag ends close to it. */
export function snapToFill(height: number, fill: number, snap = FILL_SNAP_PX): { height: number, filled: boolean } {
  return Math.abs(fill - height) <= snap ? { height: fill, filled: true } : { height, filled: false }
}

/** Measures an element against its parent's content box. */
export function measureFill(element: HTMLElement): FillGeometry | null {
  const parent = element.parentElement
  if (!parent || typeof window === 'undefined')
    return null
  const style = window.getComputedStyle(parent)
  const inset = (Number.parseFloat(style.paddingBottom) || 0) + (Number.parseFloat(style.borderBottomWidth) || 0)
  return {
    top: element.getBoundingClientRect().top,
    containerBottom: parent.getBoundingClientRect().bottom - inset,
  }
}
