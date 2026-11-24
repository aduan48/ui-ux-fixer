import type { Block, Offset, ScannedComponent, SourceFile, StaticNode } from '../types'

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
  // Separate the text of neighbouring elements ("EST. 2022" + "Colby Club Hockey"), then tidy spaces.
  return children(n).map(textOf).join(' ').replace(/\s+/g, ' ')
}

/** Components directly or deeply inside a node, by name: what a wrapper "contains". */
const compsIn = (n: StaticNode): string[] =>
  children(n).flatMap(c => (c.t === 'comp' ? [c.name] : compsIn(c)))

/** Tailwind-style utilities (mx-auto, mt-4, md:flex) say nothing about what an element is. */
const UTILITY = /:|^-?(m|p)[xytrblse]?-|^(text|font|bg|border|rounded|w|h|min|max|size|gap|space|flex|grid|items|justify|self|place|content|col|row|shadow|ring|opacity|z|top|left|right|bottom|inset|tracking|leading|overflow|object|aspect|transition|duration|ease|animate|cursor|order|basis|grow|shrink|from|via|to|fill|stroke|outline|divide|decoration|underline|whitespace|break|line-clamp|backdrop|blur|scale|rotate|translate)-|^(flex|grid|block|inline|inline-block|inline-flex|hidden|relative|absolute|fixed|sticky|static|container|truncate|uppercase|lowercase|capitalize|italic|underline|grow|shrink|border|rounded|shadow|antialiased|sr-only)$/

const describe = (n: StaticNode, tag: string) => {
  const attrs = n.t === 'el' || n.t === 'comp' ? n.attrs : undefined
  // div#about-section / section.white-section: an id or a meaningful class says more than a bare tag.
  const cls = n.t === 'el' ? n.cls?.split(/\s+/).find(c => c && !UTILITY.test(c)) : undefined
  const name = n.t === 'el' && attrs?.id ? `${tag}#${attrs.id}` : cls ? `${tag}.${cls}` : tag
  const text = (textOf(n).replace(/\s+/g, ' ').trim() || attrs?.alt || attrs?.placeholder || attrs?.['aria-label'] || '').slice(0, 32)
  if (text) return `${name} “${text}”`
  const inside = [...new Set(compsIn(n))]
  return inside.length ? `${name} with ${inside.slice(0, 3).map(c => `<${c}>`).join(', ')}` : name
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

/** Finds the component a `comp` node refers to: by its import when known, else by name. */
export interface ComponentIndex {
  find: (n: { name: string; src?: string; imp?: string }) => ScannedComponent | undefined
}

export function indexComponents(components: ScannedComponent[]): ComponentIndex {
  const byName = new Map<string, ScannedComponent>()
  const byFile = new Map<string, ScannedComponent>()
  // Prefer real components over route files when two share a name.
  for (const c of [...components].sort((a, b) => Number(a.type === 'page') - Number(b.type === 'page'))) {
    if (!byName.has(c.name)) byName.set(c.name, c)
    byFile.set(`${c.filePath}#${c.isDefault ? 'default' : c.name}`, c)
  }
  return {
    find: n => (n.src && byFile.get(`${n.src}#${n.imp === 'default' ? 'default' : n.imp ?? n.name}`)) || byName.get(n.name),
  }
}

/** Library wrappers we render straight through (their children are the content). */
const ROUTER_SWITCH = new Set(['Routes', 'Switch'])

interface Ctx {
  index: ComponentIndex
  assets: Record<string, string>
  depth: number
  props?: Record<string, string> // string props passed by the parent: <Hero title="Hi">
  slot?: () => string // the parent's children, for {children}
  /** data-sk path for the root element this call renders (a component placed in the edited tree). */
  mark?: string
  /** Free-form offset for that root element (a moved component). */
  offset?: Offset
}

/** Attribute string for an element, with images resolved and links neutralised. */
/** A free-form move: shift visually without disturbing the layout around it. */
const offsetCss = (o?: Offset) => (o ? `translate:${o.x}px ${o.y}px;position:relative;z-index:1` : '')

function attrsOf(n: { cls?: string; attrs?: Record<string, string> }, tag: string, ctx: Ctx, mark?: string, offset?: Offset): string {
  let out = n.cls ? ` class="${esc(n.cls)}"` : ''
  const shift = offsetCss(offset)
  if (shift && !n.attrs?.style) out += ` style="${shift}"`
  for (const [k, raw] of Object.entries(n.attrs ?? {})) {
    if (/^on/i.test(k)) continue
    // "@expr:logoSrc" = a dynamic value; fill it from the props the parent passed, if any.
    const v = raw.startsWith('@expr:') ? ctx.props?.[raw.slice(6)] ?? '' : raw
    if (k === 'href' || k === 'xlinkHref') out += ` ${attrName(k)}="${v.startsWith('#') && tag === 'use' ? esc(v) : '#'}"` // previews never navigate
    else if (k === 'src' || k === 'poster') out += ` ${k}="${esc(imageUrl(v, ctx))}"`
    else if (k === 'srcSet') continue // may point at files we don't have; src is enough
    else if (k === 'style') out += ` style="${esc([fixVh(v), shift].filter(Boolean).join(';'))}"`
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
      const target = ctx.index.find(n)
      const mark = path ? path : ctx.mark
      // <Routes>: only the first route renders, like in the browser.
      const kids = ROUTER_SWITCH.has(n.name) ? n.children.slice(0, 1) : n.children
      // `offset` is for wrappers with no element of their own (<Link>): their children carry the move.
      const slot = (offset?: Offset) =>
        kids.map((c, i) => render(c, offset ? { ...ctx, offset } : ctx, path === undefined ? undefined : path ? `${path}.${i}` : String(i))).join('')
      if (target?.tree && ctx.depth <= 8) // depth cap guards against components that render themselves
        return render(target.tree, { ...ctx, depth: ctx.depth + 1, props: n.attrs, slot, mark, offset: n.offset ?? ctx.offset })
      // Not in the project (Router, ThemeProvider, MUI…): show its children, or a small labelled stub.
      if (kids.length) return slot(n.offset)
      const shift = offsetCss(n.offset)
      return `<span class="sk-missing"${mark ? ` data-sk="${mark}"` : ''}${shift ? ` style="${shift}"` : ''}>${esc(n.name)}</span>`
    }
    case 'el': {
      if (DROPPED.has(n.tag)) return ''
      if (TRANSPARENT.has(n.tag)) return n.children.map(child).join('')
      const tag = /^[a-zA-Z][a-zA-Z0-9-]*$/.test(n.tag) ? n.tag : 'div'
      const mark = path ? path : ctx.mark
      const inner = { ...ctx, mark: undefined, offset: undefined }
      const attrs = attrsOf(n, tag, ctx, mark, n.offset ?? ctx.offset)
      if (VOID.has(tag)) return `<${tag}${attrs}>`
      const kids = n.children.map((c, i) => render(c, inner, path === undefined ? undefined : path ? `${path}.${i}` : String(i)))
      return `<${tag}${attrs}>${kids.join('')}</${tag}>`
    }
  }
}

function makeCtx(components: ScannedComponent[], assets: Record<string, string>, props?: Record<string, string>): Ctx {
  return { index: indexComponents(components), assets, depth: 0, props }
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
        html = `<${tag}${attrsOf(a, tag, ctx)} data-sk-frame>${inner}</${tag}>`
      } else if (a.t === 'comp') {
        const target = ctx.index.find(a)
        if (target?.tree) html = render(target.tree, { ...ctx, depth: 1, props: a.attrs, slot: () => inner })
      }
    }
  }
  return html
}

// ---------- Preview document ----------

/** The viewport height previews pretend to have (a laptop screen). */
export const VIEWPORT_HEIGHT = 800

/**
 * vh units → px. In an iframe sized to its content, \`vh\` is a percentage of the content's own
 * height, so a 60vh carousel grows the frame, which grows the carousel… forever. Pinning vh to
 * a fixed viewport breaks the loop and matches what a laptop would show.
 */
export const fixVh = (css: string) =>
  // url(...) is matched first and kept as is, so inlined base64 images are never touched.
  css.replace(/url\([^)]*\)|(-?\d*\.?\d+)(?:[sdl])?vh\b/g, (m, n?: string) =>
    n === undefined ? m : `${+(Number(n) * VIEWPORT_HEIGHT / 100).toFixed(2)}px`)

/** Tailwind's screen-height utilities are generated at runtime, so pin them with overrides. */
const SCREEN_UTILITIES = ['h', 'min-h', 'max-h']
  .flatMap(p => ['screen', 'svh', 'dvh', 'lvh'].map(u => `.${p}-${u}{${p === 'h' ? 'height' : p === 'min-h' ? 'min-height' : 'max-height'}:${VIEWPORT_HEIGHT}px!important}`))
  .join('')

const TAILWIND_SOURCE = /@tailwind\b|@apply\b|@theme\b|@import\s+["']tailwindcss/

/**
 * Runs inside an editable preview: hover outlines, click to select, drag an element anywhere
 * (before/after another element, or into a container). Reports intents to the app with
 * postMessage; the app edits the tree and re-renders.
 *
 * Hit-testing is geometric, not elementFromPoint: sites stack overlays (video backgrounds,
 * absolute wrappers, pointer-events:none layers) on top of their content, and we always want
 * the most specific element under the pointer, whatever is painted above it.
 */
const EDITOR_SCRIPT = `(() => {
  const post = m => parent.postMessage(m, '*')
  // A custom tag, so the site's own \`div { … }\` rules can never style our overlays.
  const mk = c => { const d = document.createElement('sk-box'); d.className = c; document.documentElement.append(d); return d }
  const hover = mk('sk-hover'), sel = mk('sk-sel'), line = mk('sk-line'), into = mk('sk-into'), tip = mk('sk-tip')
  // 'free': drag to any position (stored as an offset). 'reorder': drag into a slot in the layout.
  let mode = 'free'
  const SNAP = 4
  const translateOf = el => {
    const t = getComputedStyle(el).translate
    if (!t || t === 'none') return [0, 0]
    const [x = 0, y = 0] = t.split(' ').map(parseFloat)
    return [x, y]
  }
  const place = (b, el) => {
    if (!el) return (b.style.display = 'none')
    const r = el.getBoundingClientRect()
    Object.assign(b.style, { display: 'block', left: r.left + scrollX + 'px', top: r.top + scrollY + 'px', width: r.width + 'px', height: r.height + 'px' })
  }
  const visible = () => [...document.querySelectorAll('[data-sk]')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 })
  const contains = (el, x, y) => { const r = el.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom }
  const depth = p => (p ? p.split('.').length : 0)
  const MEDIA = /^(VIDEO|IMG|PICTURE|CANVAS|SOURCE|IFRAME|SVG)$/i
  /** A box that only holds media (a background video layer): not a place to drop content. */
  const isMediaBox = el => el.children.length > 0 && [...el.children].every(c => MEDIA.test(c.tagName))
  /** The smallest editable element under (x, y), ignoring \`skip\` and everything inside it. */
  const at = (x, y, skip, forDrop) => {
    let best = null, area = Infinity
    for (const el of visible()) {
      if (skip && skip.contains(el)) continue
      if (forDrop && (isMediaBox(el) || (MEDIA.test(el.tagName) && el.parentElement && isMediaBox(el.parentElement)))) continue
      if (!contains(el, x, y)) continue
      const r = el.getBoundingClientRect()
      if (r.width * r.height < area) { best = el; area = r.width * r.height }
    }
    return best
  }
  /**
   * Children of the container at \`path\` ("" = the block's root), as { path, el }. Worked out
   * from paths, not the DOM: a component like <Link> renders no element of its own, but it's
   * still a child (represented by its first rendered element).
   */
  const kidsOf = (path, skip) => {
    const base = depth(path), map = new Map()
    for (const el of visible()) {
      if (skip && skip.contains(el)) continue
      const p = el.dataset.sk
      if (depth(p) <= base || (path !== '' && !p.startsWith(path + '.'))) continue
      const child = p.split('.').slice(0, base + 1).join('.')
      const cur = map.get(child)
      if (!cur || depth(p) < depth(cur.dataset.sk)) map.set(child, el)
    }
    return [...map].map(([p, el]) => ({ path: p, el }))
  }
  const isRow = el => {
    const s = el && getComputedStyle(el)
    return !!s && ((s.display.includes('flex') && !s.flexDirection.startsWith('column')) || s.display.includes('grid'))
  }
  const isEmpty = el => !el.textContent.trim() && !el.querySelector('img,svg,video,input,button,textarea,select,iframe')
  const CONTAINER = /^(DIV|SECTION|MAIN|ARTICLE|ASIDE|HEADER|FOOTER|NAV|UL|OL|LI|FORM|FIGURE|SPAN)$/

  /**
   * Where a drop at (x, y) lands: inside the container under the pointer, next to whichever of
   * its children is closest (so dropping anywhere in a div works), or into it if it's empty.
   */
  const dropAt = (x, y, dragged) => {
    const t = at(x, y, dragged, true)
    let path = ''
    if (t) {
      if (kidsOf(t.dataset.sk, dragged).length) path = t.dataset.sk
      else if (CONTAINER.test(t.tagName) && isEmpty(t)) return { into: t.dataset.sk, box: t }
      else {
        const r = t.getBoundingClientRect()
        const row = isRow(t.parentElement) || getComputedStyle(t).display.startsWith('inline')
        return { target: t.dataset.sk, after: row ? x > r.left + r.width / 2 : y > r.top + r.height / 2, el: t, row }
      }
    }
    const all = kidsOf(path, dragged)
    // Background layers (a full-size video box) sit at distance 0 from everything; prefer real content.
    const content = all.filter(k => !isMediaBox(k.el) && !MEDIA.test(k.el.tagName))
    const kids = content.length ? content : all
    if (!kids.length) return path ? { into: path, box: t } : null
    let best = null, dist = Infinity
    for (const k of kids) {
      const r = k.el.getBoundingClientRect()
      const dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - y, 0, y - r.bottom)
      if (dx * dx + dy * dy < dist) { dist = dx * dx + dy * dy; best = k }
    }
    const r = best.el.getBoundingClientRect()
    const row = isRow(best.el.parentElement)
    return { target: best.path, after: row ? x > r.left + r.width / 2 : y > r.top + r.height / 2, el: best.el, row }
  }

  let selected = null
  new ResizeObserver(() => place(sel, selected)).observe(document.body)
  // The app tells us what's selected (e.g. picked in the layers panel).
  addEventListener('message', e => {
    if (e.source !== parent || !e.data) return
    if ('skMode' in e.data) mode = e.data.skMode
    if (!('skShow' in e.data)) return
    selected = e.data.skShow ? document.querySelector('[data-sk="' + CSS.escape(e.data.skShow) + '"]') : null
    place(sel, selected)
  })

  let drag = null
  addEventListener('pointermove', e => {
    if (!drag) return place(hover, at(e.clientX, e.clientY))
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return
    if (!drag.moved) {
      Object.assign(drag, lift(drag.el))
      drag.base = translateOf(drag.el)
    }
    drag.moved = true
    place(hover, null)
    if (mode === 'free') {
      let dx = e.clientX - drag.x, dy = e.clientY - drag.y
      if (e.shiftKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0) // lock to one direction
      const x = Math.round((drag.base[0] + dx) / SNAP) * SNAP, y = Math.round((drag.base[1] + dy) / SNAP) * SNAP
      Object.assign(drag.el.style, { translate: x + 'px ' + y + 'px', position: 'relative', zIndex: '1' })
      drag.offset = { x, y }
      place(sel, drag.el)
      tip.textContent = (x >= 0 ? '+' : '') + x + ', ' + (y >= 0 ? '+' : '') + y
      Object.assign(tip.style, { display: 'block', left: e.clientX + scrollX + 12 + 'px', top: e.clientY + scrollY + 12 + 'px', width: 'auto', height: 'auto' })
      return
    }
    drag.el.style.opacity = '.35'
    drag.drop = dropAt(e.clientX, e.clientY, drag.el)
    line.style.display = 'none'
    place(into, drag.drop && drag.drop.into !== undefined ? drag.drop.box || document.body : null)
    const d = drag.drop
    if (!d || d.into !== undefined) return
    const r = d.el.getBoundingClientRect()
    Object.assign(line.style, d.row
      ? { display: 'block', left: (d.after ? r.right : r.left) - 2 + scrollX + 'px', top: r.top + scrollY + 'px', width: '4px', height: r.height + 'px' }
      : { display: 'block', left: r.left + scrollX + 'px', top: (d.after ? r.bottom : r.top) - 2 + scrollY + 'px', width: r.width + 'px', height: '4px' })
  })
  /**
   * <a><button>Go</button></a>: the wrapper is what you mean to move, not the button inside it.
   * Climbs (by path) while the parent has just this one child and no text of its own. Returns
   * the path to move and the element to show while dragging.
   */
  const lift = el => {
    let path = el.dataset.sk
    while (depth(path) > 1) {
      const parentPath = path.split('.').slice(0, -1).join('.')
      if (kidsOf(parentPath).length !== 1) break
      const parentEl = document.querySelector('[data-sk="' + CSS.escape(parentPath) + '"]')
      if (parentEl && [...parentEl.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) break
      path = parentPath
      if (parentEl) el = parentEl
    }
    return { path, el }
  }
  addEventListener('pointerdown', e => {
    const t = at(e.clientX, e.clientY)
    if (!t) return
    e.preventDefault()
    focus()
    drag = { el: t, path: t.dataset.sk, x: e.clientX, y: e.clientY, moved: false }
  })
  addEventListener('pointerup', () => {
    if (!drag) return
    const d = drag
    drag = null
    d.el.style.opacity = ''
    line.style.display = 'none'
    place(into, null)
    tip.style.display = 'none'
    if (d.moved && mode === 'free') return d.offset && post({ skOffset: { path: d.path, ...d.offset } })
    if (d.moved) {
      const from = d.path
      if (d.drop && d.drop.into !== undefined) post({ skMoveInto: { from, parent: d.drop.into } })
      else if (d.drop) post({ skMove: { from, target: d.drop.target, after: d.drop.after } })
      return
    }
    selected = d.el
    place(sel, selected)
    post({ skSelect: d.el.dataset.sk })
  })
  addEventListener('pointerleave', () => place(hover, null))
  // Double-click puts a free-moved element back where the layout has it.
  addEventListener('dblclick', e => {
    const t = at(e.clientX, e.clientY)
    if (t) post({ skOffset: { path: lift(t).path, x: 0, y: 0 } })
  })
  addEventListener('keydown', e => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected) post({ skDelete: selected.dataset.sk })
    if (e.key === 'Escape') post({ skDone: true })
  })
  addEventListener('click', e => e.preventDefault(), true)
  addEventListener('submit', e => e.preventDefault(), true)
  addEventListener('dragstart', e => e.preventDefault()) // native image/link dragging would hijack the gesture
})()`

/**
 * Runs in every preview: if nothing behind the content paints a background and its text is
 * mostly light (white nav text that normally sits over a dark hero), put the site's dark
 * colour behind it so it's readable — the way it looks on the real page.
 */
const BACKDROP_SCRIPT = `(() => {
  const clear = s => s.backgroundImage === 'none' && (s.backgroundColor === 'transparent' || /,\\s*0\\)$|\\/\\s*0\\)$/.test(s.backgroundColor))
  const lum = c => {
    const n = (c.match(/[\\d.]+/g) || []).map(Number)
    if (c.startsWith('rgb')) return (0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2]) / 255
    if (c.startsWith('oklch') || c.startsWith('oklab') || c.startsWith('lab') || c.startsWith('lch')) return n[0] > 1 ? n[0] / 100 : n[0]
    if (c.startsWith('color(')) return 0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2]
    return 0
  }
  const check = () => {
    if (document.body.dataset.skBackdrop) return
    let painted = !clear(getComputedStyle(document.documentElement)) || !clear(getComputedStyle(document.body))
    // Single wrappers (page frames) around the content count as "behind" it too.
    for (let el = document.body.firstElementChild; !painted && el; el = el.children.length === 1 ? el.firstElementChild : null)
      painted = !clear(getComputedStyle(el)) && el.getBoundingClientRect().height >= document.body.getBoundingClientRect().height * 0.9
    if (painted) return
    let light = 0, total = 0
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode, n = node.textContent.trim().length
      if (!n || !node.parentElement || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(node.parentElement.tagName)) continue
      total += n
      if (lum(getComputedStyle(node.parentElement).color) > 0.75) light += n
    }
    if (total && light / total > 0.5) {
      document.body.dataset.skBackdrop = '1'
      document.body.style.background = BACKDROP
    }
  }
  addEventListener('load', () => { setTimeout(check, 60); setTimeout(check, 500) })
})()`

export interface PreviewOptions {
  editable?: boolean
  /** Colour shown behind light content that has no background of its own (the site's dark tone). */
  backdrop?: string
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
  const editor = opts.editable ? `<script>${EDITOR_SCRIPT}</script>` : ''
  // Token values are user-editable: escape "<" so a value can never close the <script>.
  const backdrop = `<script>${BACKDROP_SCRIPT.replace('BACKDROP', JSON.stringify(opts.backdrop ?? '#111827').replace(/</g, '\\u003c'))}</script>`
  return `<!doctype html><html><head><meta charset="utf-8">
${plain.map(s => `<style>${safe(fixVh(s.content))}</style>`).join('\n')}
<style type="text/tailwindcss">${safe(fixVh(twCss))}</style>
<script src="${tailwindUrl}"></script>
<style>
html,body{margin:0}
body{display:flow-root} /* contain child margins so body height = content height */
[data-sk-frame]{min-height:0!important;height:auto!important} /* page wrappers must not force full-screen heights on every section */
/* Previews are snapshots: show every element in its final state (no fade-ins on each re-render). */
*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}
${SCREEN_UTILITIES}
.sk-expr{opacity:.55;font-style:italic}
.sk-missing{border:1px dashed #a3a3a3;padding:2px 6px;color:#737373;font:11px ui-monospace,monospace;background:rgba(163,163,163,.08)}
/* A component we can't render (3D scene, chart…) that fills its container: show it as a labelled area. */
.sk-missing:only-child{display:flex;align-items:center;justify-content:center;width:100%;height:100%;min-height:48px;box-sizing:border-box}
${opts.editable ? `html{-webkit-user-select:none;user-select:none}
[data-sk]{cursor:grab}
sk-box{all:initial;position:absolute;pointer-events:none;z-index:2147483647;display:none;box-sizing:border-box}
.sk-into{outline:2px dashed #3b82f6;outline-offset:-2px;background:rgba(59,130,246,.12)}
.sk-tip{background:#7c3aed;color:#fff;font:600 12px/1 ui-sans-serif,system-ui,sans-serif;padding:4px 6px;border-radius:4px;white-space:nowrap}
.sk-hover{outline:2px dashed #3b82f6;outline-offset:-1px}
.sk-sel{outline:2px solid #3b82f6;outline-offset:-1px;background:rgba(59,130,246,.06)}
.sk-line{background:#3b82f6;border-radius:2px}` : ''}
</style></head><body>${bodyHtml}
<script>new ResizeObserver(()=>parent.postMessage({skHeight:Math.ceil(document.body.getBoundingClientRect().height)},'*')).observe(document.body)</script>
${backdrop}
${editor}
</body></html>`
}
