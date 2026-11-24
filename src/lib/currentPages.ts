import type { BankItem, Frame, ScannedComponent, StaticNode } from '../types'

export interface CurrentPage {
  name: string
  blocks: BankItem[]
}

const kids = (n: StaticNode) => ('children' in n ? n.children : []).filter(c => c.t !== 'text')

/**
 * The top-level sections of a tree, as [node, path] pairs. Walks down through single-child
 * wrappers (<html><body><main>) so the sections are the meaningful pieces, not one big div.
 */
function sections(tree: StaticNode): [StaticNode, string][] {
  let node = tree
  let path = ''
  for (;;) {
    const all = 'children' in node ? node.children : []
    const real = kids(node)
    if (real.length !== 1 || (real[0].t !== 'el' && real[0].t !== 'frag')) break
    const i = all.indexOf(real[0])
    path = path ? `${path}.${i}` : String(i)
    node = real[0]
  }
  if (node.t === 'comp' || !kids(node).length) return [[node, path]]
  const all = 'children' in node ? node.children : []
  return kids(node).map(c => {
    const i = all.indexOf(c)
    return [c, path ? `${path}.${i}` : String(i)]
  })
}

/**
 * One block per section: a known component becomes a component block, anything else an
 * element block. Each block remembers the wrappers it sat in (`frames`), so its preview keeps
 * the page's background, container width and fonts. `children` fills a layout's {children}.
 */
function toBlocks(
  owner: ScannedComponent,
  byName: Map<string, ScannedComponent>,
  outer: Frame[],
  children?: (frames: Frame[]) => BankItem[],
): BankItem[] {
  if (!owner.tree) return []
  return sections(owner.tree).flatMap(([node, path]): BankItem[] => {
    const frames = path ? [...outer, { componentId: owner.id, path }] : outer
    const withFrames = frames.length ? { frames } : {}
    if (node.t === 'expr' && /(^|\.)children$/.test(node.v)) return children?.(frames) ?? []
    if (node.t === 'comp' && byName.has(node.name))
      return [{ kind: 'component', componentId: byName.get(node.name)!.id, ...(node.attrs && { props: node.attrs }), ...withFrames }]
    // A section with no path is the whole tree (a page that returns a single component).
    if (!path) return [{ kind: 'component', componentId: owner.id, ...withFrames }]
    if (node.t === 'expr') return []
    return [{ kind: 'element', componentId: owner.id, elementPath: path, ...withFrames }]
  })
}

const routeTitle = (name: string) => (name === '/' || name === 'App' ? 'Home' : name.replace(/^\//, ''))

/**
 * What the imported site looks like today, as canvas pages: Next.js routes wrapped in the
 * root layout, else a Vite-style `App`, else one page per HTML file.
 */
export function buildCurrentPages(components: ScannedComponent[]): CurrentPage[] {
  const byName = new Map<string, ScannedComponent>()
  for (const c of components) if (c.type !== 'page' && !byName.has(c.name)) byName.set(c.name, c)

  const layout = components.find(c => c.type === 'page' && c.name === '/ layout')
  const routes = components.filter(c => c.type === 'page' && !c.name.endsWith(' layout'))
  const app = components.find(c => c.name === 'App' && c.framework === 'react')

  const react = routes.length ? routes : app ? [app] : []
  if (react.length) {
    return react
      .map(page => ({
        name: routeTitle(page.name),
        blocks: layout ? toBlocks(layout, byName, [], frames => toBlocks(page, byName, frames)) : toBlocks(page, byName, []),
      }))
      .sort((a, b) => (a.name === 'Home' ? -1 : b.name === 'Home' ? 1 : a.name.localeCompare(b.name)))
  }

  const htmlFiles = [...new Set(components.filter(c => c.framework === 'html').map(c => c.filePath))]
  return htmlFiles.map(file => ({
    name: /(^|\/)index\.html?$/.test(file) ? 'Home' : file.replace(/\.html?$/, ''),
    blocks: components.filter(c => c.filePath === file).map(c => ({ kind: 'component', componentId: c.id })),
  }))
}
