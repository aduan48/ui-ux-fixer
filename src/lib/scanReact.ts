import { parse } from '@babel/parser'
import type { ComponentType, ScannedComponent, SourceFile } from '../types'
import { guessType, splitWords, type ContentHints } from './guessType'

// Babel AST nodes, typed loosely: we only read a handful of fields, and Babel 7/8 differ in a few names.
type Node = { type: string; [key: string]: any }

const SKIP_FILE = /\.(test|spec|stories|story)\.[jt]sx?$|(^|\/)(__tests__|__mocks__)\//
const ROUTE_FILE = /(^|\/)app\/(.+\/)?(page|layout)\.[jt]sx?$|(^|\/)pages\/(?!api\/).+\.[jt]sx?$/
const GENERIC_ROUTE_NAMES = new Set(['Page', 'Layout', 'RootLayout', 'Home', 'Index', 'Default'])

/** Visit every node under `node`, depth first. Return false from `fn` to skip a subtree. */
function walk(node: unknown, fn: (n: Node) => boolean | void): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) return node.forEach(n => walk(n, fn))
  const n = node as Node
  if (typeof n.type === 'string' && fn(n) === false) return
  for (const key in n) {
    if (key !== 'loc' && key !== 'start' && key !== 'end' && key !== 'extra') walk(n[key], fn)
  }
}

const isFn = (n?: Node) =>
  !!n && ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ClassDeclaration', 'ClassExpression'].includes(n.type)

const typeArgs = (n: Node): Node[] => (n.typeArguments ?? n.typeParameters)?.params ?? []

const calleeName = (callee: Node): string | undefined =>
  callee.type === 'Identifier' ? callee.name : callee.type === 'MemberExpression' ? callee.property?.name : undefined

/**
 * Peel `memo(...)` / `forwardRef(...)` wrappers. Returns the inner function (or the
 * identifier it wraps) plus a props type given as a generic, e.g. `forwardRef<Ref, Props>`.
 */
function unwrap(n: Node | undefined): { target?: Node; propsType?: Node } {
  let propsType: Node | undefined
  while (n?.type === 'CallExpression' && ['memo', 'forwardRef'].includes(calleeName(n.callee) ?? '')) {
    const args = typeArgs(n)
    propsType ??= calleeName(n.callee) === 'forwardRef' ? args[1] : args[0]
    n = n.arguments[0]
  }
  return { target: n, propsType }
}

function contentHints(fn: Node): ContentHints {
  const tags = new Set<string>()
  let rootTag: string | undefined
  let rendersList = false
  walk(fn.body, n => {
    if (n.type === 'JSXOpeningElement' && n.name.type === 'JSXIdentifier') {
      rootTag ??= n.name.name // first element in source order is almost always the returned root
      if (/^[a-z]/.test(n.name.name)) tags.add(n.name.name)
    }
    if (n.type === 'CallExpression' && calleeName(n.callee) === 'map' && hasJsx(n.arguments)) rendersList = true
  })
  return { rootTag, tags, rendersList }
}

function hasJsx(node: unknown): boolean {
  let found = false
  walk(node, n => {
    if (n.type === 'JSXElement' || n.type === 'JSXFragment') found = true
    return !found
  })
  return found
}

/** Member names of a type literal, interface, intersection, or a reference to one in this file. */
function typeMembers(t: Node | undefined, types: Map<string, Node>, seen = new Set<string>()): string[] {
  if (!t) return []
  switch (t.type) {
    case 'TSTypeLiteral':
      return memberNames(t.members)
    case 'TSInterfaceBody':
      return memberNames(t.body)
    case 'TSIntersectionType':
      return t.types.flatMap((x: Node) => typeMembers(x, types, seen))
    case 'TSTypeReference': {
      const name = t.typeName?.name
      if (!name || seen.has(name)) return []
      seen.add(name)
      // Props<T> / Readonly<Props>: resolve the reference, or fall through to its first generic.
      return types.has(name) ? typeMembers(types.get(name), types, seen) : typeMembers(typeArgs(t)[0], types, seen)
    }
  }
  return []
}

const memberNames = (members: Node[]) =>
  members.filter(m => m.type === 'TSPropertySignature' && m.key?.type === 'Identifier').map(m => m.key.name as string)

function propsOf(fn: Node, extraType: Node | undefined, types: Map<string, Node>): string[] {
  let param = fn.params?.[0]
  if (param?.type === 'AssignmentPattern') param = param.left
  const names: string[] = []
  if (param?.type === 'ObjectPattern') {
    for (const p of param.properties) if (p.type === 'ObjectProperty' && p.key.type === 'Identifier') names.push(p.key.name)
  }
  names.push(...typeMembers(param?.typeAnnotation?.typeAnnotation, types), ...typeMembers(extraType, types))
  return [...new Set(names)]
}

/** `components/hero/index.tsx` → Hero, `contact-form.jsx` → ContactForm. */
function nameFromPath(path: string) {
  const parts = path.split('/')
  let base = parts.pop()!.replace(/\.[^.]+$/, '')
  if (base === 'index' && parts.length) base = parts.pop()!
  return base.split(/[-_.\s]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join('')
}

/** `app/(marketing)/about/page.tsx` → /about, `pages/blog/[slug].tsx` → /blog/[slug], plus " layout" for layouts. */
function routeName(path: string) {
  const app = path.match(/(?:^|\/)app\/(?:(.+)\/)?(page|layout)\.[jt]sx?$/)
  if (app) {
    const route = '/' + (app[1] ?? '').split('/').filter(s => s && !s.startsWith('(')).join('/')
    return app[2] === 'layout' ? `${route} layout` : route
  }
  const route = path.replace(/^.*?pages\//, '').replace(/\.[jt]sx?$/, '').replace(/(^|\/)index$/, '')
  return '/' + route
}

export function scanReactFile(file: SourceFile): ScannedComponent[] {
  if (SKIP_FILE.test(file.path)) return []
  const ast = parse(file.content, {
    sourceType: 'module',
    plugins: /\.tsx?$/.test(file.path) ? ['typescript', 'jsx'] : ['jsx'],
    errorRecovery: true,
  }) as unknown as Node
  const body: Node[] = ast.program.body

  // Pass 1: everything declared at top level, so exports by name can be resolved.
  const locals = new Map<string, { fn?: Node; propsType?: Node }>()
  const types = new Map<string, Node>()
  const declare = (d: Node | undefined) => {
    if (!d) return
    if ((d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') && d.id) locals.set(d.id.name, { fn: d })
    if (d.type === 'VariableDeclaration') {
      for (const v of d.declarations) {
        if (v.id.type !== 'Identifier') continue
        const { target, propsType } = unwrap(v.init)
        // `const Card: React.FC<Props> = ...`
        const annotated = v.id.typeAnnotation?.typeAnnotation
        locals.set(v.id.name, { fn: target, propsType: propsType ?? (annotated ? typeArgs(annotated)[0] : undefined) })
      }
    }
    if (d.type === 'TSInterfaceDeclaration') types.set(d.id.name, d.body)
    if (d.type === 'TSTypeAliasDeclaration') types.set(d.id.name, d.typeAnnotation)
  }
  for (const s of body) declare(s.type.startsWith('Export') ? s.declaration : s)

  // Pass 2: collect what is exported, as [name, function, props type].
  const exported: [string, Node | undefined, Node | undefined][] = []
  const fromLocal = (exportName: string, localName: string) => {
    const l = locals.get(localName)
    // `const Button = forwardRef(Inner)`: follow one more hop to the inner function.
    const fn = l?.fn?.type === 'Identifier' ? locals.get(l.fn.name)?.fn : l?.fn
    exported.push([exportName, fn, l?.propsType])
  }
  for (const s of body) {
    if (s.type === 'ExportNamedDeclaration' && !s.source) {
      const d = s.declaration
      if (d?.id) fromLocal(d.id.name, d.id.name)
      if (d?.type === 'VariableDeclaration') for (const v of d.declarations) if (v.id.type === 'Identifier') fromLocal(v.id.name, v.id.name)
      for (const sp of s.specifiers ?? []) if (sp.local) fromLocal(sp.exported.name ?? sp.exported.value, sp.local.name)
    }
    if (s.type === 'ExportDefaultDeclaration') {
      const d = s.declaration
      if (d.type === 'Identifier') fromLocal(d.name, d.name)
      else {
        const { target, propsType } = unwrap(d)
        if (target?.type === 'Identifier') fromLocal(target.name, target.name)
        else exported.push([target?.id?.name ?? d.id?.name ?? nameFromPath(file.path), target, propsType])
      }
    }
  }

  const isRoute = ROUTE_FILE.test(file.path)
  const out = new Map<string, ScannedComponent>()
  for (const [name, fn, propsType] of exported) {
    if (!/^[A-Z]/.test(name) || !isFn(fn) || !hasJsx(fn!.body)) continue
    const displayName = isRoute && GENERIC_ROUTE_NAMES.has(name) ? routeName(file.path) : name
    const type: ComponentType = isRoute ? 'page' : guessType(splitWords(name), contentHints(fn!))
    const id = `${file.path}#${displayName}`
    out.set(id, {
      id,
      name: displayName,
      filePath: file.path,
      props: fn!.type.startsWith('Class') ? [] : propsOf(fn!, propsType, types),
      type,
      framework: 'react',
    })
  }
  return [...out.values()]
}
