import type { Block, GridPosition } from '@smallwebco/tinypivot-studio'

const MIN_WIDTH = 2 // Minimum 2 columns
const MIN_HEIGHT = 2 // Minimum 2 rows

interface CollisionResult {
  canResize: boolean
  neighborAdjustments: Array<{
    blockId: string
    newPosition: GridPosition
  }>
}

export function findHorizontalNeighbor(
  blocks: Block[],
  resizingBlockId: string,
  direction: 'left' | 'right',
): Block | null {
  const resizingBlock = blocks.find(b => b.id === resizingBlockId)
  if (!resizingBlock?.gridPosition)
    return null

  const { x, y, w, h } = resizingBlock.gridPosition

  return blocks.find((b) => {
    if (b.id === resizingBlockId || !b.gridPosition)
      return false
    const pos = b.gridPosition
    const yOverlap = pos.y < y + h && pos.y + pos.h > y
    if (!yOverlap)
      return false

    if (direction === 'right') {
      return pos.x === x + w
    }
    else {
      return pos.x + pos.w === x
    }
  }) || null
}

export function calculateResizeWithCollision(
  blocks: Block[],
  resizingBlockId: string,
  newWidth: number,
  direction: 'left' | 'right',
): CollisionResult {
  const resizingBlock = blocks.find(b => b.id === resizingBlockId)
  if (!resizingBlock?.gridPosition) {
    return { canResize: true, neighborAdjustments: [] }
  }

  const currentPos = resizingBlock.gridPosition
  const widthDelta = newWidth - currentPos.w

  if (widthDelta <= 0) {
    return { canResize: true, neighborAdjustments: [] }
  }

  const neighbor = findHorizontalNeighbor(blocks, resizingBlockId, direction)

  if (!neighbor?.gridPosition) {
    if (direction === 'right' && currentPos.x + newWidth > 12) {
      return { canResize: false, neighborAdjustments: [] }
    }
    return { canResize: true, neighborAdjustments: [] }
  }

  const neighborPos = neighbor.gridPosition
  const neighborNewWidth = neighborPos.w - widthDelta

  if (neighborNewWidth < MIN_WIDTH) {
    const allowedDelta = neighborPos.w - MIN_WIDTH
    if (allowedDelta <= 0) {
      return { canResize: false, neighborAdjustments: [] }
    }

    return {
      canResize: true,
      neighborAdjustments: [{
        blockId: neighbor.id,
        newPosition: {
          ...neighborPos,
          x: direction === 'right' ? neighborPos.x + allowedDelta : neighborPos.x,
          w: MIN_WIDTH,
        },
      }],
    }
  }

  return {
    canResize: true,
    neighborAdjustments: [{
      blockId: neighbor.id,
      newPosition: {
        ...neighborPos,
        x: direction === 'right' ? neighborPos.x + widthDelta : neighborPos.x,
        w: neighborNewWidth,
      },
    }],
  }
}

export { MIN_HEIGHT, MIN_WIDTH }
export type { CollisionResult }
