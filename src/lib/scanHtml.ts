import type { ScannedComponent, SourceFile, StaticNode } from '../types'
import { guessType, splitWords } from './guessType'
import { ASSET_PREFIX } from './paths'

type Resolve = (from: string, ref: string) => string | undefined

const SEMANTIC = new Set(['header', 'nav', 'section', 'footer', 'aside', 'article'])

function toTree(node: globalThis.Node, file: string, resolve: Resolve): StaticNode | undefined {
  if (node.nodeType === 3) {
    const v = node.textContent!.replace(/\s+/g, ' ')
    return v.trim() ? { t: 'text', v } : undefined
  }
  if (!(node instanceof Element) || ['SCRIPT', 'STYLE', 'TEMPLATE'].includes(node.tagName)) return
  const attrs: Record<string, string> = {}
  for (const a of node.attributes) {
    if (a.name === 'class' || /^on/i.test(a.name)) continue
    const asset = a.name === 'src' || a.name === 'poster' ? resolve(file, a.value) : undefined
    attrs[a.name] = asset ? ASSET_PREFIX + asset : a.value
  }
  return {
    t: 'el',
    tag: node.tagName.toLowerCase(),
    ...(node.getAttribute('class') && { cls: node.getAttribute('class')! }),
    ...(Object.keys(attrs).length && { attrs }),
    children: [...node.childNodes].map(c => toTree(c, file, resolve)).filter((n): n is StaticNode => !!n),
  }
}

function label(el: Element) {
  const tag = el.tagName.toLowerCase()
  if (el.id) return { name: `${tag}#${el.id}`, words: splitWords(el.id.replace(/[-_]/g, ' ')) }
  const cls = el.classList[0]
  if (cls) return { name: `${tag}.${cls}`, words: splitWords(cls.replace(/[-_]/g, ' ')) }
  const heading = el.querySelector('h1, h2, h3')?.textContent?.trim().slice(0, 30)
  return { name: heading ? `${tag} “${heading}”` : tag, words: [] }
}

/**
 * Top-level semantic elements become components. `main` is a container: its semantic
 * children and its classed divs are components. Unclassed wrapper divs are looked through.
 */
export function scanHtmlFile(file: SourceFile, resolve: Resolve = () => undefined): ScannedComponent[] {
  const doc = new DOMParser().parseFromString(file.content, 'text/html')
  const found: Element[] = []
  const visit = (parent: Element, inMain: boolean) => {
    for (const el of parent.children) {
      const tag = el.tagName.toLowerCase()
      if (SEMANTIC.has(tag) || (inMain && tag === 'div' && el.classList.length)) found.push(el)
      else if (tag === 'main') visit(el, true)
      else if (tag === 'div') visit(el, inMain)
    }
  }
  visit(doc.body, false)

  const out = new Map<string, ScannedComponent>()
  for (const el of found) {
    const { name, words } = label(el)
    // Repeated names (three `section`s with no id) get a counter so ids stay unique.
    let unique = name
    for (let i = 2; out.has(`${file.path}#${unique}`); i++) unique = `${name} ${i}`
    const id = `${file.path}#${unique}`
    out.set(id, {
      id,
      name: unique,
      filePath: file.path,
      props: [],
      type: guessType(words, {
        rootTag: el.tagName.toLowerCase(),
        tags: new Set([...el.querySelectorAll('*')].map(e => e.tagName.toLowerCase())),
      }),
      framework: 'html',
      tree: toTree(el, file.path, resolve),
    })
  }
  return [...out.values()]
}
