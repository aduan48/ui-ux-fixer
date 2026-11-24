import type { BankItem, Frame, ScannedComponent, StaticNode } from '../types'
import { indexComponents, type ComponentIndex } from './render'

export interface CurrentPage {
  name: string
  blocks: BankItem[]
  route?: string
  /** The component that renders this page (route file or Route element). */
  componentId?: string
}

const ROUTER_SWITCH = new Set(['Routes', 'Switch'])
const isSlot = (n: StaticNode) =>
  (n.t === 'expr' && /(^|\.)children$/.test(n.v)) || (n.t === 'comp' && ROUTER_SWITCH.has(n.name))

const kids = (n: StaticNode) => ('children' in n ? n.children : []).filter(c => c.t !== 'text')

/**
 * The top-level sections of a tree, as [node, path] pairs. Walks down through single-child
 * wrappers (<html><body><main>, <Router>, <ThemeProvider>) so the sections are the meaningful
 * pieces, not one big div.
 */
function sections(tree: StaticNode, index: ComponentIndex): [StaticNode, string][] {
  const wrapper = (n: StaticNode) => n.t === 'el' || n.t === 'frag' || (n.t === 'comp' && !index.find(n) && !isSlot(n))
  let node = tree
  let path = ''
  const at = (child: StaticNode) => {
    const i = ('children' in node ? node.children : []).indexOf(child)
    return path ? `${path}.${i}` : String(i)
  }
  for (;;) {
    const real = kids(node)
    if (real.length !== 1 || !wrapper(real[0])) break
    path = at(real[0])
    node = real[0]
  }
  if ((node.t === 'comp' && index.find(node)) || !kids(node).length) return [[node, path]]
  return kids(node).map(c => [c, at(c)])
}

/**
 * One block per section: a known component becomes a component block, anything else an
 * element block. Each block remembers the wrappers it sat in (`frames`), so its preview keeps
 * the page's background, container width and fonts. `children` fills a layout's {children}
 * (or an App's <Routes>).
 */
function toBlocks(owner: ScannedComponent, index: ComponentIndex, outer: Frame[], children?: (frames: Frame[]) => BankItem[]): BankItem[] {
  if (!owner.tree) return []
  return sections(owner.tree, index).flatMap(([node, path]): BankItem[] => {
    const frames = path ? [...outer, { componentId: owner.id, path }] : outer
    const withFrames = frames.length ? { frames } : {}
    if (isSlot(node)) return children?.(frames) ?? []
    const target = node.t === 'comp' ? index.find(node) : undefined
    if (target) return [{ kind: 'component', componentId: target.id, ...(node.t === 'comp' && node.attrs && { props: node.attrs }), ...withFrames }]
    // A section with no path is the whole tree (a page that returns a single component).
    if (!path) return [{ kind: 'component', componentId: owner.id, ...withFrames }]
    if (node.t === 'expr') return []
    return [{ kind: 'element', componentId: owner.id, elementPath: path, ...withFrames }]
  })
}

/** <Route path="/x" element={<X/>} /> entries anywhere in a tree, in order. */
function routesIn(tree: StaticNode | undefined): { path: string; element: StaticNode }[] {
  const out: { path: string; element: StaticNode }[] = []
  const visit = (n: StaticNode) => {
    if (n.t === 'comp' && n.name === 'Route' && n.children[0]) out.push({ path: n.attrs?.path ?? '/', element: n.children[0] })
    if ('children' in n) n.children.forEach(visit)
  }
  if (tree) visit(tree)
  return out
}

const routeTitle = (name: string) => {
  const clean = name.replace(/^\//, '').replace(/[-_]/g, ' ')
  return !clean || name === 'App' ? 'Home' : clean[0].toUpperCase() + clean.slice(1)
}
const homeFirst = (a: CurrentPage, b: CurrentPage) => (a.name === 'Home' ? -1 : b.name === 'Home' ? 1 : a.name.localeCompare(b.name))

/**
 * What the imported site looks like today, as canvas pages:
 *  1. React Router: each <Route> becomes a page, inside the component that holds <Routes> (navbar, footer…)
 *  2. Next.js: routes wrapped in the root layout
 *  3. otherwise `App`, else one page per HTML file.
 */
export function buildCurrentPages(components: ScannedComponent[]): CurrentPage[] {
  const index = indexComponents(components)

  // 1. React Router
  const shell = components.find(c => c.framework === 'react' && routesIn(c.tree).length)
  if (shell) {
    const seen = new Set<string>()
    const pages: CurrentPage[] = []
    for (const route of routesIn(shell.tree)) {
      const target = route.element.t === 'comp' ? index.find(route.element) : undefined
      const key = target?.id ?? route.path
      if (seen.has(key) || route.path.includes('*') || route.path.includes(':')) continue // aliases, 404s, dynamic routes
      seen.add(key)
      const content = (frames: Frame[]): BankItem[] => (target ? toBlocks(target, index, frames) : [])
      pages.push({ name: routeTitle(route.path), route: route.path, componentId: target?.id, blocks: toBlocks(shell, index, [], content) })
    }
    if (pages.length) return pages.sort(homeFirst)
  }

  // 2. Next.js
  const layout = components.find(c => c.type === 'page' && c.name === '/ layout')
  const routes = components.filter(c => c.type === 'page' && !c.name.endsWith(' layout'))
  const app = components.find(c => c.name === 'App' && c.framework === 'react')
  const react = routes.length ? routes : app ? [app] : []
  if (react.length) {
    return react
      .map(page => ({
        name: routeTitle(page.name),
        ...(page.name.startsWith('/') && { route: page.name }),
        componentId: page.id,
        blocks: layout ? toBlocks(layout, index, [], frames => toBlocks(page, index, frames)) : toBlocks(page, index, []),
      }))
      .sort(homeFirst)
  }

  // 3. Plain HTML
  const htmlFiles = [...new Set(components.filter(c => c.framework === 'html').map(c => c.filePath))]
  return htmlFiles.map(file => ({
    name: /(^|\/)index\.html?$/.test(file) ? 'Home' : file.replace(/\.html?$/, ''),
    route: '/' + file.replace(/(^|\/)index\.html?$/, '').replace(/\.html?$/, ''),
    blocks: components.filter(c => c.filePath === file).map(c => ({ kind: 'component', componentId: c.id })),
  }))
}
