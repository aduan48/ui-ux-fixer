import type { StaticNode } from '../types'

// Paths are child-index paths ("0.2.1") over `children`, the same ones nodeAt() reads.
// Every edit returns a new tree; the input is never mutated.

const split = (path: string) => (path ? path.split('.').map(Number) : [])
const kids = (n: StaticNode) => ('children' in n ? n.children : [])

function update(tree: StaticNode, path: number[], fn: (children: StaticNode[]) => StaticNode[]): StaticNode {
  if (!('children' in tree)) return tree
  if (!path.length) return { ...tree, children: fn(tree.children) }
  const [i, ...rest] = path
  return { ...tree, children: tree.children.map((c, j) => (j === i ? update(c, rest, fn) : c)) }
}

export function removeNode(tree: StaticNode, path: string): StaticNode {
  const p = split(path)
  const i = p.pop()!
  return update(tree, p, children => children.filter((_, j) => j !== i))
}

/**
 * Move the node at `from` to just before (or after) the node at `target`, possibly in a
 * different parent. Refuses to move a node into itself or onto its own descendants.
 */
export function moveNode(tree: StaticNode, from: string, target: string, after: boolean): StaticNode {
  if (!from || from === target || (target + '.').startsWith(from + '.')) return tree
  const fromP = split(from)
  const node = fromP.reduce<StaticNode | undefined>((n, i) => n && kids(n)[i], tree)
  if (!node) return tree

  // Where the target sits once `from` is removed: an earlier sibling on the target's path shifts it left.
  const targetP = split(target)
  const fromParent = fromP.slice(0, -1)
  const fromIndex = fromP[fromP.length - 1]
  const depth = fromParent.length
  if (targetP.length > depth && fromParent.every((v, i) => v === targetP[i]) && targetP[depth] > fromIndex) targetP[depth]--

  const index = targetP.pop()! + (after ? 1 : 0)
  return update(removeNode(tree, from), targetP, children => [...children.slice(0, index), node, ...children.slice(index)])
}

/** Move a node one step among its siblings (-1 up, +1 down). */
export function nudgeNode(tree: StaticNode, path: string, dir: -1 | 1): StaticNode {
  const p = split(path)
  const parent = p.slice(0, -1).reduce<StaticNode | undefined>((n, i) => n && kids(n)[i], tree)
  const i = p[p.length - 1]
  const j = i + dir
  if (!parent || j < 0 || j >= kids(parent).length) return tree
  return moveNode(tree, path, [...p.slice(0, -1), j].join('.'), dir > 0)
}
