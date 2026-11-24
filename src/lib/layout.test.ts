import { describe, expect, it } from 'vitest'
import type { Block } from '../types'
import { contentBottom, flowPositions, rowsOf } from './layout'

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

describe('rowsOf', () => {
  it('groups the flow layout the way it wraps', () => {
    const blocks = [1440, 720, 720, 480, 480, 480, 1080, 720].map((w, i) => b(String(i), w))
    expect(rowsOf(flowPositions(blocks, 1440, heightOf), heightOf).map(r => r.length)).toEqual([1, 2, 3, 1, 1])
  })

  it('groups free positions by vertical overlap, left to right', () => {
    const rows = rowsOf([b('c', 600, { x: 700, y: 120 }), b('a', 1440, { y: 0 }), b('b', 600, { x: 0, y: 100 })], heightOf)
    expect(rows.map(r => r.map(x => x.id))).toEqual([['a'], ['b', 'c']])
  })
})
