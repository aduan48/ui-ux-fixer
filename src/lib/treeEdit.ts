import type { Offset, StaticNode } from '../types'

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
  const node = nodeAt(tree, from)
  if (!node) return tree
  const targetP = afterRemoval(split(from), split(target))
  const index = targetP.pop()! + (after ? 1 : 0)
  return update(removeNode(tree, from), targetP, children => [...children.slice(0, index), node, ...children.slice(index)])
}

/** Move the node at `from` to the end of the container at `parent` ("" = the block's root). */
export function moveInto(tree: StaticNode, from: string, parent: string): StaticNode {
  if (!from || (parent + '.').startsWith(from + '.')) return tree
  const node = nodeAt(tree, from)
  const container = nodeAt(tree, parent)
  if (!node || !container || !('children' in container)) return tree
  return update(removeNode(tree, from), afterRemoval(split(from), split(parent)), children => [...children, node])
}

const nodeAt = (tree: StaticNode, path: string) =>
  split(path).reduce<StaticNode | undefined>((n, i) => n && kids(n)[i], tree)

/** Where a path points once the node at `from` is removed: a removed earlier sibling on its way shifts it left. */
function afterRemoval(from: number[], path: number[]): number[] {
  const out = [...path]
  const depth = from.length - 1
  if (out.length > depth && from.slice(0, depth).every((v, i) => v === out[i]) && out[depth] > from[depth]) out[depth]--
  return out
}

/** Move a node one step among its siblings (-1 up, +1 down). */
export function nudgeNode(tree: StaticNode, path: string, dir: -1 | 1): StaticNode {
  const p = split(path)
  const parent = nodeAt(tree, p.slice(0, -1).join('.'))
  const i = p[p.length - 1]
  const j = i + dir
  if (!parent || j < 0 || j >= kids(parent).length) return tree
  return moveNode(tree, path, [...p.slice(0, -1), j].join('.'), dir > 0)
}

/** Set (or with undefined/0,0 clear) the free-form offset of the node at `path`. */
export function setOffset(tree: StaticNode, path: string, offset: Offset | undefined): StaticNode {
  const p = split(path)
  const clear = !offset || (offset.x === 0 && offset.y === 0)
  const apply = (n: StaticNode): StaticNode => {
    if (n.t !== 'el' && n.t !== 'comp') return n
    const { offset: _old, ...rest } = n
    return clear ? rest : { ...rest, offset: { x: Math.round(offset!.x), y: Math.round(offset!.y) } }
  }
  if (!p.length) return tree
  const i = p.pop()!
  return update(tree, p, children => children.map((c, j) => (j === i ? apply(c) : c)))
}

/** The same tree with every offset removed: its structure only. */
export function withoutOffsets(n: StaticNode): StaticNode {
  if (n.t !== 'el' && n.t !== 'comp' && n.t !== 'frag') return n
  const { offset: _o, ...rest } = n as StaticNode & { offset?: Offset }
  return { ...rest, children: n.children.map(withoutOffsets) } as StaticNode
}
