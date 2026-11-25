import React, { useCallback, useEffect, useState } from 'react'

/**
 * The bar between the Studio's questions and the grid: drag it (or focus it and use the arrow
 * keys) to give either side more room; double-click puts it back. The width is remembered on this
 * machine, so the Studio opens the way the user left it.
 */

const STORAGE_KEY = 'tinypivot-studio-width'
export const MIN_STUDIO_WIDTH = 260
/** The grid always keeps at least this much room. */
const MIN_GRID_WIDTH = 360
const KEY_STEP = 24

/** A width that leaves both sides usable in a window this wide. */
export function clampStudioWidth(width: number, windowWidth: number): number {
  return Math.round(Math.max(MIN_STUDIO_WIDTH, Math.min(width, windowWidth - MIN_GRID_WIDTH)))
}

function savedWidth(): number | null {
  try {
    const value = Number(window.localStorage.getItem(STORAGE_KEY))
    return Number.isFinite(value) && value > 0 ? value : null
  }
  catch {
    return null
  }
}

/** The Studio's width in pixels, or null for the default that follows the window. */
export function useStudioWidth(): [number | null, (width: number | null) => void] {
  const [width, setWidth] = useState<number | null>(() => savedWidth())
  const update = useCallback((next: number | null) => {
    setWidth(next)
    try {
      if (next === null)
        window.localStorage.removeItem(STORAGE_KEY)
      else
        window.localStorage.setItem(STORAGE_KEY, String(next))
    }
    catch {}
  }, [])
  return [width, update]
}

interface StudioResizerProps {
  /** The Studio's current width in pixels, as laid out. */
  current: () => number
  onResize: (width: number | null) => void
}

export function StudioResizer({ current, onResize }: StudioResizerProps) {
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!dragging)
      return
    const move = (event: PointerEvent) => onResize(clampStudioWidth(event.clientX, window.innerWidth))
    const stop = () => setDragging(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    document.body.classList.add('tp-resizing')
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      document.body.classList.remove('tp-resizing')
    }
  }, [dragging, onResize])

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = event.key === 'ArrowLeft' ? -KEY_STEP : event.key === 'ArrowRight' ? KEY_STEP : 0
    if (!step)
      return
    event.preventDefault()
    onResize(clampStudioWidth(current() + step, window.innerWidth))
  }

  return (
    <div
      className={`tp-studio-resizer ${dragging ? 'is-dragging' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the Studio"
      aria-valuenow={Math.round(current())}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
      onPointerDown={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDoubleClick={() => onResize(null)}
      onKeyDown={onKeyDown}
    />
  )
}
