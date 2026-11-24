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

/** Keep blocks inside a (narrower) frame: clamp widths, then shift left so they don't stick out. */
export const fitToFrame = (blocks: Block[], frameWidth: number): Block[] =>
  blocks.map(b => {
    const w = Math.min(b.w, frameWidth)
    return { ...b, w, x: Math.max(0, Math.min(b.x, frameWidth - w)) }
  })

/** Bottom edge of the content, in page px. */
export const contentBottom = (blocks: Block[], heightOf: (b: Block) => number) =>
  Math.max(0, ...blocks.map(b => b.y + heightOf(b)))

/** A box in page px: a block, or the bounds of a group of blocks. */
export interface Box { x: number; y: number; w: number; h: number }

/**
 * The page as a layout tree (an XY cut): blocks stacked top to bottom split into bands by vertical
 * overlap; a band of several blocks splits into columns by horizontal overlap; and so on down.
 * Blocks that overlap on both axes can't be cut apart and become a `layered` group.
 * `gaps[i]` is the space between items i and i+1 (never negative: overlapping items share a band).
 */
export type Layout = Box & (
  | { kind: 'block'; block: Block }
  | { kind: 'stack' | 'row' | 'layered'; items: Layout[]; gaps: number[] }
)

export type Group = Extract<Layout, { items: Layout[] }>

const bounds = (items: Box[]): Box => {
  const x = Math.min(...items.map(i => i.x)), y = Math.min(...items.map(i => i.y))
  return { x, y, w: Math.max(...items.map(i => i.x + i.w)) - x, h: Math.max(...items.map(i => i.y + i.h)) - y }
}

/** Groups of items whose spans overlap along one axis, in order along it. */
function bands<T extends Box>(items: T[], axis: 'x' | 'y'): T[][] {
  const [start, size] = axis === 'y' ? (['y', 'h'] as const) : (['x', 'w'] as const)
  const groups: T[][] = []
  let end = -Infinity
  for (const it of [...items].sort((a, b) => a[start] - b[start])) {
    if (it[start] >= end - 0.5) {
      groups.push([it])
      end = it[start] + it[size]
    } else {
      groups[groups.length - 1].push(it)
      end = Math.max(end, it[start] + it[size])
    }
  }
  return groups
}

type Item = Box & { block: Block; z: number }

function cut(items: Item[], axis: 'x' | 'y', tried = false): Layout {
  const leaf = ({ x, y, w, h, block }: Item): Layout => ({ kind: 'block', x, y, w, h, block })
  if (items.length === 1) return leaf(items[0])
  const groups = bands(items, axis)
  if (groups.length === 1) {
    if (!tried) return cut(items, axis === 'y' ? 'x' : 'y', true)
    // Overlapping on both axes: bottom to top, in z-order.
    return { kind: 'layered', ...bounds(items), items: [...items].sort((a, b) => a.z - b.z).map(leaf), gaps: [] }
  }
  const nodes = groups.map(g => cut(g, axis === 'y' ? 'x' : 'y'))
  const gaps = nodes.slice(1).map((n, i) => (axis === 'y' ? n.y - (nodes[i].y + nodes[i].h) : n.x - (nodes[i].x + nodes[i].w)))
  return { kind: axis === 'y' ? 'stack' : 'row', ...bounds(nodes), items: nodes, gaps }
}

/** The layout tree of a page's placed blocks (`undefined` for an empty page). Always a `stack` at the top. */
export function inferLayout(blocks: Block[], heightOf: (b: Block) => number): Group | undefined {
  if (!blocks.length) return
  const items = blocks.map((b, z) => ({ x: b.x, y: b.y, w: b.w, h: heightOf(b), block: b, z }))
  const root = cut(items, 'y')
  return root.kind === 'stack' ? root : { kind: 'stack', ...bounds([root]), items: [root], gaps: [] }
}

export type Restack = 'forward' | 'backward' | 'front' | 'back'

/** Move the selected blocks in z-order (array order; last is on top), keeping their relative order. */
export function restack(blocks: Block[], ids: string[], dir: Restack): Block[] {
  const sel = (b: Block) => ids.includes(b.id)
  if (dir === 'front') return [...blocks.filter(b => !sel(b)), ...blocks.filter(sel)]
  if (dir === 'back') return [...blocks.filter(sel), ...blocks.filter(b => !sel(b))]
  const out = [...blocks]
  // Step each selected block past one unselected neighbour; walk from the side we move towards.
  const order = dir === 'forward' ? [...out.keys()].reverse() : [...out.keys()]
  const step = dir === 'forward' ? 1 : -1
  for (const i of order) {
    const j = i + step
    if (sel(out[i]) && out[j] && !sel(out[j])) [out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
