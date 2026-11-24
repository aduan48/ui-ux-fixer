import type { Block, Page } from '../types'
import { VIEWPORT_HEIGHT } from './render'

export const FRAMES = [
  { label: 'Desktop', width: 1440 },
  { label: 'Tablet', width: 768 },
  { label: 'Mobile', width: 390 },
] as const

export const frameWidthOf = (page: Page) => page.frameWidth ?? FRAMES[0].width

/** A block's height in page px: set by hand, else as measured from its preview, else one viewport. */
export const heightFrom = (measured: Record<string, number>) => (b: Block) => b.height ?? measured[b.id] ?? VIEWPORT_HEIGHT

/** Flow layout: blocks wrap left to right like the old canvas; each row is as tall as its tallest block. */
export function flowPositions(blocks: Block[], frameWidth: number, heightOf: (b: Block) => number): Block[] {
  let x = 0, y = 0, rowHeight = 0
  return blocks.map(b => {
    const w = Math.min(b.w, frameWidth)
    if (x > 0 && x + w > frameWidth + 0.5) {
      y += rowHeight
      x = rowHeight = 0
    }
    const placed = { ...b, x, y, w }
    x += w
    rowHeight = Math.max(rowHeight, heightOf(b))
    return placed
  })
}

/** The page's blocks where they're drawn: computed while the page is `flow`, else as stored. */
export const placedBlocks = (page: Page, heightOf: (b: Block) => number) =>
  page.flow ? flowPositions(page.blocks, frameWidthOf(page), heightOf) : page.blocks

/** Bottom edge of the content, in page px. */
export const contentBottom = (blocks: Block[], heightOf: (b: Block) => number) =>
  Math.max(0, ...blocks.map(b => b.y + heightOf(b)))

/**
 * Rows top to bottom: a block joins the current row when it starts above that row's bottom edge.
 * shortcut: one level of rows, no columns or gaps; M4 replaces it with full layout inference.
 */
export function rowsOf(blocks: Block[], heightOf: (b: Block) => number): Block[][] {
  const rows: Block[][] = []
  let bottom = -Infinity
  for (const b of [...blocks].sort((a, c) => a.y - c.y || a.x - c.x)) {
    const end = b.y + heightOf(b)
    if (b.y >= bottom - 0.5) {
      rows.push([b])
      bottom = end
    } else {
      rows[rows.length - 1].push(b)
      bottom = Math.max(bottom, end)
    }
  }
  return rows.map(r => r.sort((a, c) => a.x - c.x))
}
