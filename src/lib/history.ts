/** Typing changes closer together than this undo as one step. */
export const MERGE_MS = 500
const LIMIT = 100

/** Undo/redo stacks of snapshots. `record` is called with the state before each change. */
export function createHistory<T>() {
  let past: T[] = []
  let future: T[] = []
  let last = -Infinity
  return {
    /** `typing`: the change came from a text field, so it may merge with the previous keystrokes. */
    record(before: T, typing = false, now = Date.now()) {
      if (!typing || now - last > MERGE_MS) past = [...past.slice(-(LIMIT - 1)), before]
      last = typing ? now : -Infinity
      future = []
    },
    /** The snapshot to restore, or undefined when there's nothing to undo. */
    undo(current: T): T | undefined {
      const prev = past.pop()
      if (prev === undefined) return
      future.push(current)
      last = -Infinity // the next change starts a new step
      return prev
    },
    redo(current: T): T | undefined {
      const next = future.pop()
      if (next === undefined) return
      past.push(current)
      last = -Infinity
      return next
    },
    clear() {
      past = []
      future = []
      last = -Infinity
    },
  }
}
