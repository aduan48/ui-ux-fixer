import type { Block, ScannedComponent, SourceFile, StaticNode } from '../types'

// ---------- Inner elements ----------

const ELEMENT_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'button', 'a', 'img', 'input', 'textarea', 'select', 'label', 'ul', 'ol', 'form', 'nav', 'section', 'article', 'figure', 'video'])

export interface ElementRef {
  path: string // "0.2.1": child indexes from the component's root
  label: string // h1 “Build faster”
  tag: string
}

const children = (n: StaticNode) => ('children' in n ? n.children : [])

/** Flattened text, with dynamic parts shown as {expr}. */
export function textOf(n: StaticNode): string {
  if (n.t === 'text') return n.v
  if (n.t === 'expr') return `{${n.v}}`
  return children(n).map(textOf).join('')
}

const describe = (n: StaticNode, tag: string) => {
  const attrs = n.t === 'el' || n.t === 'comp' ? n.attrs : undefined
  const text = (textOf(n).replace(/\s+/g, ' ').trim() || attrs?.alt || attrs?.placeholder || attrs?.['aria-label'] || '').slice(0, 32)
  return text ? `${tag} “${text}”` : tag
}

/** The headings, text, buttons, images… inside a component (not its root), in document order. */
export function elementsOf(tree: StaticNode | undefined): ElementRef[] {
  const out: ElementRef[] = []
  const visit = (n: StaticNode, path: string) => {
    if (path) {
      if (n.t === 'el' && ELEMENT_TAGS.has(n.tag)) out.push({ path, tag: n.tag, label: describe(n, n.tag) })
      if (n.t === 'comp') out.push({ path, tag: n.name, label: describe(n, `<${n.name}>`) })
    }
    children(n).forEach((c, i) => visit(c, path ? `${path}.${i}` : String(i)))
  }
  if (tree) visit(tree, '')
  return out
}

/** Short label for the node at `path`, e.g. h1 “Build faster” or <Button> “Send”. */
export function labelAt(tree: StaticNode | undefined, path: string): { label: string; tag: string } | undefined {
  const n = nodeAt(tree, path)
  if (!n) return
  const tag = n.t === 'el' ? n.tag : n.t === 'comp' ? n.name : n.t === 'frag' ? 'fragment' : 'text'
  return { tag, label: describe(n, n.t === 'comp' ? `<${tag}>` : tag) }
}

export function nodeAt(tree: StaticNode | undefined, path: string): StaticNode | undefined {
  let n = tree
  for (const i of path.split('.')) n = n && children(n)[Number(i)]
  return n
}

// ---------- HTML rendering ----------

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

const VOID = new Set(['img', 'input', 'br', 'hr', 'meta', 'link', 'source', 'area', 'col', 'wbr'])
const DROPPED = new Set(['script', 'iframe', 'object', 'embed', 'head', 'title', 'meta', 'link', 'style', 'noscript'])
const TRANSPARENT = new Set(['html', 'body']) // render their children only (frames keep body's classes)

// React prop names → HTML attribute names. HTML ones lowercase; SVG presentation ones kebab-case;
// a few SVG attributes really are camelCase.
const LOWERCASE = new Set(['tabIndex', 'readOnly', 'maxLength', 'minLength', 'colSpan', 'rowSpan', 'autoComplete', 'autoFocus', 'autoPlay', 'crossOrigin', 'encType', 'noValidate', 'spellCheck', 'contentEditable', 'dateTime', 'frameBorder', 'allowFullScreen', 'playsInline', 'inputMode', 'enterKeyHint', 'accessKey', 'charSet', 'srcSet', 'useMap'])
const CAMEL = new Set(['viewBox', 'preserveAspectRatio', 'gradientUnits', 'gradientTransform', 'patternUnits', 'patternContentUnits', 'patternTransform', 'clipPathUnits', 'maskUnits', 'maskContentUnits', 'markerWidth', 'markerHeight', 'markerUnits', 'refX', 'refY', 'stdDeviation', 'baseFrequency', 'numOctaves', 'textLength', 'lengthAdjust', 'spreadMethod', 'startOffset', 'filterUnits', 'primitiveUnits', 'pathLength', 'tableValues', 'kernelMatrix', 'attributeName', 'repeatCount', 'keyTimes', 'keySplines', 'calcMode'])
const attrName = (k: string) =>
  k === 'htmlFor' ? 'for'
  : k === 'xlinkHref' ? 'href'
  : LOWERCASE.has(k) ? k.toLowerCase()
  : CAMEL.has(k) || !/[A-Z]/.test(k) ? k
  : k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())

const PLACEHOLDER_IMG =
  'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="96"><rect width="100%" height="100%" fill="#e5e5e5"/><path d="M0 0L160 96M160 0L0 96" stroke="#d4d4d4"/></svg>')

interface Ctx {
  byName: Map<string, ScannedComponent>
  assets: Record<string, string>
  depth: number
  props?: Record<string, string> // string props passed by the parent: <Hero title="Hi">
  slot?: () => string // the parent's children, for {children}
  /** data-sk path for the root element this call renders (a component placed in the edited tree). */
  mark?: string
}

/** Attribute string for an element, with images resolved and links neutralised. */
function attrsOf(n: { cls?: string; attrs?: Record<string, string> }, tag: string, ctx: Ctx, mark?: string): string {
  let out = n.cls ? ` class="${esc(n.cls)}"` : ''
  for (const [k, raw] of Object.entries(n.attrs ?? {})) {
    if (/^on/i.test(k)) continue
    // "@expr:logoSrc" = a dynamic value; fill it from the props the parent passed, if any.
    const v = raw.startsWith('@expr:') ? ctx.props?.[raw.slice(6)] ?? '' : raw
    if (k === 'href' || k === 'xlinkHref') out += ` ${attrName(k)}="${v.startsWith('#') && tag === 'use' ? esc(v) : '#'}"` // previews never navigate
    else if (k === 'src' || k === 'poster') out += ` ${k}="${esc(imageUrl(v, ctx))}"`
    else if (k === 'srcSet') continue // may point at files we don't have; src is enough
    else out += ` ${attrName(k)}="${esc(v)}"`
  }
  if (tag === 'img' && !n.attrs?.src) out += ` src="${PLACEHOLDER_IMG}"`
  if (mark) out += ` data-sk="${mark}"`
  return out
}

const imageUrl = (v: string, ctx: Ctx) =>
  v.startsWith('@asset:') ? ctx.assets[v.slice(7)] ?? PLACEHOLDER_IMG : /^(https?:|data:)/.test(v) ? v : PLACEHOLDER_IMG

/**
 * Render a node. `path` is set while rendering the block's own (editable) tree, so every
 * element gets a data-sk attribute the in-preview editor can address.
 */
function render(n: StaticNode, ctx: Ctx, path?: string): string {
  const child = (c: StaticNode, i: number) => render(c, ctx, path === undefined ? undefined : path ? `${path}.${i}` : String(i))
  switch (n.t) {
    case 'text':
      return esc(n.v)
    case 'expr': {
      if (/(^|\.)children$/.test(n.v) && ctx.slot) return ctx.slot()
      const prop = ctx.props?.[n.v.split('.').pop()!]
      return prop !== undefined ? esc(prop) : `<span class="sk-expr">${esc(n.v)}</span>`
    }
    case 'frag':
      return n.children.map(child).join('')
    case 'comp': {
      const target = ctx.byName.get(n.name)
      const slot = () => n.children.map(child).join('')
      const mark = path ? path : ctx.mark
      // depth cap guards against components that render themselves
      if (!target?.tree || ctx.depth > 8) return `<div class="sk-missing"${mark ? ` data-sk="${mark}"` : ''}>&lt;${esc(n.name)}&gt;${slot()}</div>`
      return render(target.tree, { ...ctx, depth: ctx.depth + 1, props: n.attrs, slot, mark })
    }
    case 'el': {
      if (DROPPED.has(n.tag)) return ''
      if (TRANSPARENT.has(n.tag)) return n.children.map(child).join('')
      const tag = /^[a-zA-Z][a-zA-Z0-9-]*$/.test(n.tag) ? n.tag : 'div'
      const mark = path ? path : ctx.mark
      const inner = { ...ctx, mark: undefined }
      const attrs = attrsOf(n, tag, ctx, mark)
      if (VOID.has(tag)) return `<${tag}${attrs}>`
      const kids = n.children.map((c, i) => render(c, inner, path === undefined ? undefined : path ? `${path}.${i}` : String(i)))
      return `<${tag}${attrs}>${kids.join('')}</${tag}>`
    }
  }
}

function makeCtx(components: ScannedComponent[], assets: Record<string, string>, props?: Record<string, string>): Ctx {
  const byName = new Map<string, ScannedComponent>()
  for (const c of components) if (c.type !== 'page' && !byName.has(c.name)) byName.set(c.name, c)
  return { byName, assets, depth: 0, props }
}

export function renderHtml(node: StaticNode, components: ScannedComponent[], props?: Record<string, string>, assets: Record<string, string> = {}): string {
  return render(node, makeCtx(components, assets, props))
}

/** The node a block shows: its edited copy, a whole component, or one element of one. */
export function blockNode(block: Block, components: ScannedComponent[]): StaticNode | undefined {
  if (block.tree) return block.tree
  const c = components.find(x => x.id === block.componentId)
  return block.kind === 'element' ? nodeAt(c?.tree, block.elementPath!) : c?.tree
}

/**
 * Full HTML for a block: its markup (every element tagged with data-sk for editing), wrapped
 * in the elements it sat inside on the original page so backgrounds and containers survive.
 */
export function renderBlock(block: Block, components: ScannedComponent[], assets: Record<string, string>): string | undefined {
  const node = blockNode(block, components)
  if (!node) return
  const ctx = makeCtx(components, assets, block.props)
  let html = render(node, ctx, '')
  for (const frame of [...(block.frames ?? [])].reverse()) {
    const tree = components.find(c => c.id === frame.componentId)?.tree
    if (!tree) continue
    const chain: StaticNode[] = [tree]
    const parts = frame.path ? frame.path.split('.') : []
    for (const i of parts.slice(0, -1)) chain.push(children(chain[chain.length - 1])[Number(i)])
    for (const a of chain.reverse()) {
      if (!a) continue
      const inner = html
      if (a.t === 'el' && !DROPPED.has(a.tag) && a.tag !== 'html') {
        const tag = a.tag === 'body' ? 'div' : a.tag
        html = `<${tag}${attrsOf(a, tag, ctx)}>${inner}</${tag}>`
      } else if (a.t === 'comp') {
        const target = ctx.byName.get(a.name)
        if (target?.tree) html = render(target.tree, { ...ctx, depth: 1, props: a.attrs, slot: () => inner })
      }
    }
  }
  return html
}

// ---------- Preview document ----------

const TAILWIND_SOURCE = /@tailwind\b|@apply\b|@theme\b|@import\s+["']tailwindcss/

/**
 * Runs inside an editable preview: hover outlines, click to select, drag an element to move
 * it before/after another (a line shows where). Reports intents to the app with postMessage;
 * the app edits the tree and re-renders.
 */
const EDITOR_SCRIPT = `(() => {
  const post = m => parent.postMessage(m, '*')
  const mk = c => { const d = document.createElement('div'); d.className = c; document.documentElement.append(d); return d }
  const hover = mk('sk-hover'), sel = mk('sk-sel'), line = mk('sk-line')
  const place = (b, el) => {
    if (!el) return (b.style.display = 'none')
    const r = el.getBoundingClientRect()
    Object.assign(b.style, { display: 'block', left: r.left + scrollX + 'px', top: r.top + scrollY + 'px', width: r.width + 'px', height: r.height + 'px' })
  }
  const at = (x, y) => document.elementFromPoint(x, y)?.closest('[data-sk]')
  let selected = null
  new ResizeObserver(() => place(sel, selected)).observe(document.body)
  // The app tells us what's selected (e.g. picked in the layers panel).
  addEventListener('message', e => {
    if (e.source !== parent || !('skShow' in (e.data || {}))) return
    selected = e.data.skShow ? document.querySelector('[data-sk="' + CSS.escape(e.data.skShow) + '"]') : null
    place(sel, selected)
  })
  let drag = null
  addEventListener('pointermove', e => {
    if (!drag) return place(hover, at(e.clientX, e.clientY))
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return
    drag.moved = true
    drag.el.style.opacity = '.35'
    place(hover, null)
    const t = at(e.clientX, e.clientY)
    drag.drop = null
    line.style.display = 'none'
    if (!t || t === drag.el || drag.el.contains(t) || t.contains(drag.el)) return
    const r = t.getBoundingClientRect(), ps = getComputedStyle(t.parentElement)
    const row = (ps.display.includes('flex') && !ps.flexDirection.startsWith('column')) || ps.display.includes('grid') || getComputedStyle(t).display.startsWith('inline')
    const after = row ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2
    drag.drop = { target: t.dataset.sk, after }
    Object.assign(line.style, row
      ? { display: 'block', left: (after ? r.right : r.left) - 2 + scrollX + 'px', top: r.top + scrollY + 'px', width: '4px', height: r.height + 'px' }
      : { display: 'block', left: r.left + scrollX + 'px', top: (after ? r.bottom : r.top) - 2 + scrollY + 'px', width: r.width + 'px', height: '4px' })
  })
  addEventListener('pointerdown', e => {
    const t = at(e.clientX, e.clientY)
    if (!t) return
    e.preventDefault()
    focus()
    drag = { el: t, x: e.clientX, y: e.clientY, moved: false }
  })
  addEventListener('pointerup', () => {
    if (!drag) return
    const d = drag
    drag = null
    d.el.style.opacity = ''
    line.style.display = 'none'
    if (d.moved) return d.drop && post({ skMove: { from: d.el.dataset.sk, ...d.drop } })
    selected = d.el
    place(sel, selected)
    post({ skSelect: d.el.dataset.sk })
  })
  addEventListener('pointerleave', () => place(hover, null))
  addEventListener('keydown', e => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected) post({ skDelete: selected.dataset.sk })
    if (e.key === 'Escape') post({ skDone: true })
  })
  addEventListener('click', e => e.preventDefault(), true)
  addEventListener('submit', e => e.preventDefault(), true)
  addEventListener('dragstart', e => e.preventDefault()) // native image/link dragging would hijack the gesture
})()`

export interface PreviewOptions {
  editable?: boolean
}

/**
 * A standalone HTML page for one block's iframe. Stylesheets using Tailwind directives go
 * through the in-browser Tailwind compiler (v3 `@tailwind` lines are dropped; the compiler
 * adds preflight and utilities itself); plain CSS files each get their own <style>, so
 * their @imports (fonts) stay at the top where they work.
 */
export function previewDoc(bodyHtml: string, styles: SourceFile[], tailwindUrl: string, opts: PreviewOptions = {}): string {
  const safe = (css: string) => css.replace(/<\/style/gi, '<\\/style') // `</style` would end the tag early
  const plain = styles.filter(s => !TAILWIND_SOURCE.test(s.content))
  const twCss = styles
    .filter(s => TAILWIND_SOURCE.test(s.content))
    .map(s => s.content.replace(/^\s*@tailwind\b[^;]*;/gm, '').replace(/^\s*@import\s+["']tailwindcss[^;]*;/gm, ''))
    .join('\n')
  const editor = opts.editable
    ? `<script>${EDITOR_SCRIPT}</script>`
    : ''
  return `<!doctype html><html><head><meta charset="utf-8">
${plain.map(s => `<style>${safe(s.content)}</style>`).join('\n')}
<style type="text/tailwindcss">${safe(twCss)}</style>
<script src="${tailwindUrl}"></script>
<style>
html,body{margin:0}
body{display:flow-root} /* contain child margins so body height = content height */
.sk-expr{opacity:.55;font-style:italic}
.sk-missing{border:1px dashed #a3a3a3;padding:8px;color:#737373;font:12px ui-monospace,monospace}
${opts.editable ? `html{-webkit-user-select:none;user-select:none}
[data-sk]{cursor:grab}
.sk-hover,.sk-sel,.sk-line{position:absolute;pointer-events:none;z-index:2147483647;display:none;box-sizing:border-box}
.sk-hover{outline:2px dashed #3b82f6;outline-offset:-1px}
.sk-sel{outline:2px solid #3b82f6;outline-offset:-1px;background:rgba(59,130,246,.06)}
.sk-line{background:#3b82f6;border-radius:2px}` : ''}
</style></head><body>${bodyHtml}
<script>new ResizeObserver(()=>parent.postMessage({skHeight:Math.ceil(document.body.getBoundingClientRect().height)},'*')).observe(document.body)</script>
${editor}
</body></html>`
}
