import { describe, expect, it } from 'vitest'
import type { Block } from '../types'
import { contentBottom, fitToFrame, flowPositions, inferLayout, restack, type Group, type Layout } from './layout'

const b = (id: string, w: number, extra: Partial<Block> = {}) => ({ id, kind: 'placeholder', placeholder: 'text', x: 0, y: 0, w, notes: '', ...extra }) as Block
const heights: Record<string, number> = { a: 100, b: 300, c: 200, d: 50 }
const heightOf = (x: Block) => heights[x.id] ?? 80

describe('flowPositions', () => {
  it('wraps blocks into rows as tall as their tallest block', () => {
    const placed = flowPositions([b('a', 1440), b('b', 720), b('c', 720), b('d', 1440)], 1440, heightOf)
    expect(placed.map(p => [p.x, p.y, p.w])).toEqual([[0, 0, 1440], [0, 100, 720], [720, 100, 720], [0, 400, 1440]])
    expect(contentBottom(placed, heightOf)).toBe(450)
  })

  it('clamps blocks wider than the frame, so desktop pages stack on mobile', () => {
    expect(flowPositions([b('b', 720), b('c', 720)], 390, heightOf).map(p => [p.x, p.y, p.w])).toEqual([[0, 0, 390], [0, 300, 390]])
  })
})

describe('inferLayout', () => {
  /** Compact shape: block ids, rows as [..], stacks as {..}, layered as <..>. */
  const shape = (l: Layout): string =>
    l.kind === 'block' ? l.block.id
    : l.kind === 'row' ? `[${l.items.map(shape).join(' ')}]`
    : l.kind === 'stack' ? `{${l.items.map(shape).join(' ')}}`
    : `<${l.items.map(shape).join(' ')}>`

  it('reads the flow layout as sections and rows, with gaps', () => {
    const blocks = [1440, 720, 720, 480, 480, 480].map((w, i) => b(String(i), w))
    const layout = inferLayout(flowPositions(blocks, 1440, heightOf), heightOf)!
    expect(shape(layout)).toBe('{0 [1 2] [3 4 5]}')
    expect(layout.gaps).toEqual([0, 0])
  })

  it('finds columns that are themselves stacks, and measures gaps between them', () => {
    const layout = inferLayout([
      b('a', 1440, { y: 0 }), // h 100
      b('d', 400, { x: 0, y: 140 }), // h 50
      b('x', 400, { x: 0, y: 214 }), // h 80
      b('c', 600, { x: 432, y: 140 }), // h 200
    ], heightOf)!
    expect(shape(layout)).toBe('{a [{d x} c]}')
    expect(layout.gaps).toEqual([40])
    const row = layout.items[1] as Group
    expect(row.gaps).toEqual([32])
    expect((row.items[0] as Group).gaps).toEqual([24])
  })

  it('keeps blocks that overlap on both axes together, bottom to top in z-order', () => {
    expect(shape(inferLayout([b('b', 800, { x: 100, y: 50 }), b('a', 1440)], heightOf)!)).toBe('{<b a>}')
  })
})

describe('restack', () => {
  const ids = (bs: Block[]) => bs.map(x => x.id).join('')
  const list = ['a', 'b', 'c', 'd', 'e'].map(id => b(id, 100))
  it('steps selected blocks one place, keeping their order', () => {
    expect(ids(restack(list, ['b', 'c'], 'forward'))).toBe('adbce')
    expect(ids(restack(list, ['b', 'd'], 'backward'))).toBe('badce')
    expect(ids(restack(list, ['e'], 'forward'))).toBe('abcde')
  })
  it('sends to front or back', () => {
    expect(ids(restack(list, ['d', 'a'], 'front'))).toBe('bcead')
    expect(ids(restack(list, ['d', 'b'], 'back'))).toBe('bdace')
  })
})

it('fits positioned blocks into a narrower frame', () => {
  const fitted = fitToFrame([b('a', 1440, { x: 0 }), b('b', 300, { x: 1000 }), b('c', 200, { x: 100 })], 390)
  expect(fitted.map(x => [x.x, x.w])).toEqual([[0, 390], [90, 300], [100, 200]])
})
