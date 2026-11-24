import { expect, it } from 'vitest'
import { createHistory, MERGE_MS } from './history'

it('undoes and redoes one step per change', () => {
  const h = createHistory<string>()
  h.record('a')
  h.record('b') // state went a → b → c, two quick canvas actions: two steps
  expect(h.undo('c')).toBe('b')
  expect(h.undo('b')).toBe('a')
  expect(h.undo('a')).toBeUndefined()
  expect(h.redo('a')).toBe('b')
  expect(h.redo('b')).toBe('c')
  expect(h.redo('c')).toBeUndefined()
})

it('merges a quick burst into one step, and a new change drops the redo stack', () => {
  const h = createHistory<string>()
  h.record('a', true, 0)
  h.record('ab', true, MERGE_MS / 2) // typing "abc"
  expect(h.undo('abc')).toBe('a')
  h.record('a') // a new edit after undoing
  expect(h.redo('x')).toBeUndefined()
})

it('clears', () => {
  const h = createHistory<number>()
  h.record(1)
  h.clear()
  expect(h.undo(2)).toBeUndefined()
})
