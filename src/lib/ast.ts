// Babel AST nodes, typed loosely: we only read a handful of fields, and Babel 7/8 differ in a few names.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Node = { type: string; start?: number; end?: number; [key: string]: any }

/** Visit every node under `node`, depth first. Return false from `fn` to skip a subtree. */
export function walk(node: unknown, fn: (n: Node) => boolean | void): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) return node.forEach(n => walk(n, fn))
  const n = node as Node
  if (typeof n.type === 'string' && fn(n) === false) return
  for (const key in n) {
    if (key !== 'loc' && key !== 'start' && key !== 'end' && key !== 'extra') walk(n[key], fn)
  }
}

export const isFnLike = (n?: Node) =>
  !!n && ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ClassDeclaration', 'ClassExpression', 'ObjectMethod', 'ClassMethod'].includes(n.type)

export function hasJsx(node: unknown): boolean {
  let found = false
  walk(node, n => {
    if (n.type === 'JSXElement' || n.type === 'JSXFragment') found = true
    return !found
  })
  return found
}
