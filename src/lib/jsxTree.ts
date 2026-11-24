import type { StaticNode } from '../types'
import { hasJsx, isFnLike, walk, type Node } from './ast'
import { ASSET_PREFIX } from './paths'

const SKIP_ATTR = /^(on[A-Z]|key$|ref$|dangerouslySetInnerHTML$|suppress)/
/** Attributes worth keeping as "" when dynamic, so the renderer still shows something sensible. */
const PLACEHOLDER_ATTRS = new Set(['alt', 'href', 'placeholder', 'aria-label'])
const UNITLESS = new Set(['opacity', 'zIndex', 'fontWeight', 'lineHeight', 'flex', 'flexGrow', 'flexShrink', 'order', 'zoom', 'scale'])
const IMAGE_REF = /\.(png|jpe?g|gif|svg|webp|avif|ico)([?#].*)?$/i
const MAX_NODES = 400 // keeps saved projects small even for giant components

export interface TreeContext {
  source: string
  /** `import Puck from '../components/Hero'` → Puck → { src: 'src/components/Hero.js', imp: 'default' }. */
  componentImports: Map<string, { src: string; imp: string }>
  /** Project path of an image this file refers to (`./a.png`, `/logo.svg`), if it was imported. */
  resolveAsset: (ref: string) => string | undefined
  /** `import logo from './logo.png'` → logo → project path. */
  imageImports: Map<string, string>
}

/** A literal attribute value, or undefined if it's computed at runtime. Bare `disabled` → "". */
function staticValue(v: Node | null | undefined): string | undefined {
  if (!v) return ''
  if (v.type === 'StringLiteral') return v.value
  if (v.type === 'NumericLiteral') return String(v.value)
  if (v.type === 'BooleanLiteral') return v.value ? '' : undefined
  if (v.type === 'TemplateLiteral' && !v.expressions.length) return v.quasis[0].value.cooked
}

/** style={{ marginTop: 8, color: 'red' }} → "margin-top:8px;color:red". Dynamic entries are dropped. */
function styleOf(v: Node | null | undefined): string | undefined {
  if (v?.type !== 'ObjectExpression') return staticValue(v) || undefined
  const decls: string[] = []
  for (const p of v.properties) {
    if (p.type !== 'ObjectProperty') continue
    const key: string | undefined = p.key.type === 'Identifier' ? p.key.name : p.key.value
    const val = p.value.type === 'NumericLiteral' && key && !UNITLESS.has(key) ? `${p.value.value}px` : staticValue(p.value)
    if (key && val) decls.push(`${key.startsWith('--') ? key : key.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}:${val}`)
  }
  return decls.join(';') || undefined
}

/** The JSX a component returns: the arrow body, the first JSX-returning `return`, or a class's render(). */
function rootJsx(fn: Node): Node | undefined {
  if (fn.type.startsWith('Class')) {
    const render = fn.body.body.find((m: Node) => m.key?.name === 'render')
    return render && rootJsx(render)
  }
  if (fn.body?.type !== 'BlockStatement') return fn.body
  // The LAST JSX return: early ones are usually loading/error states (`if (loading) return <Spinner/>`).
  let found: Node | undefined
  walk(fn.body.body, n => {
    if (isFnLike(n)) return false // returns inside nested callbacks aren't the component's
    if (n.type === 'ReturnStatement' && n.argument && hasJsx(n.argument)) found = n.argument
  })
  return found
}

/** Convert a component function's returned JSX into a StaticNode tree. */
export function jsxToTree(fn: Node, ctx: TreeContext): StaticNode | undefined {
  const { source } = ctx
  let count = 0

  /** {logoSrc} / {props.logoSrc} → "@expr:logoSrc", filled from the parent's props at render time. */
  const exprRef = (v: Node | null | undefined): string | undefined =>
    v?.type === 'Identifier' ? `@expr:${v.name}` : v?.type === 'MemberExpression' && v.property?.type === 'Identifier' ? `@expr:${v.property.name}` : undefined

  /** An image reference in an attribute: './a.png', {logo}, {process.env.PUBLIC_URL + '/a.png'}. */
  const assetOf = (v: Node | null | undefined): string | undefined => {
    if (!v) return
    if (v.type === 'Identifier' && ctx.imageImports.has(v.name)) return ASSET_PREFIX + ctx.imageImports.get(v.name)
    let ref: string | undefined
    walk(v, n => {
      if (!ref && n.type === 'StringLiteral' && IMAGE_REF.test(n.value)) ref = n.value
      if (!ref && n.type === 'TemplateElement' && IMAGE_REF.test(n.value.cooked ?? '')) ref = n.value.cooked
    })
    if (!ref) return
    if (/^(https?:|data:)/.test(ref)) return ref
    const path = ctx.resolveAsset(ref)
    return path ? ASSET_PREFIX + path : undefined
  }
  const text = (n: Node) => source.slice(n.start, n.end).replace(/\s+/g, ' ').slice(0, 40)

  /** Every string literal in a className expression: cn('a', on && 'b') → "a b". */
  const classOf = (value: Node): string => {
    if (value.type === 'StringLiteral') return value.value
    const parts: string[] = []
    walk(value, n => {
      if (n.type === 'StringLiteral') parts.push(n.value)
      if (n.type === 'TemplateElement') parts.push(n.value.cooked ?? n.value.raw)
    })
    return parts.join(' ').replace(/\s+/g, ' ').trim()
  }

  const expr = (n: Node | undefined): StaticNode | undefined => {
    if (!n) return
    switch (n.type) {
      case 'JSXElement':
        return element(n)
      case 'JSXFragment':
        return { t: 'frag', children: children(n.children) }
      case 'ParenthesizedExpression':
      case 'TSAsExpression':
        return expr(n.expression)
      case 'ConditionalExpression':
        return expr(n.consequent) ?? expr(n.alternate)
      case 'LogicalExpression':
        return expr(n.right)
      case 'StringLiteral':
      case 'NumericLiteral':
        return { t: 'text', v: String(n.value) }
      case 'TemplateLiteral':
        return n.expressions.length ? { t: 'expr', v: text(n) } : { t: 'text', v: n.quasis[0].value.cooked }
      case 'NullLiteral':
      case 'BooleanLiteral':
        return
      case 'CallExpression': {
        // items.map(item => <li/>): render a single item.
        const cb = n.callee.property?.name === 'map' ? n.arguments[0] : undefined
        if (cb && isFnLike(cb)) return expr(rootJsx(cb))
        return hasJsx(n) ? undefined : { t: 'expr', v: text(n) }
      }
    }
    return hasJsx(n) ? undefined : { t: 'expr', v: text(n) }
  }

  const children = (kids: Node[]): StaticNode[] => {
    const out: StaticNode[] = []
    for (const k of kids) {
      if (count >= MAX_NODES) break
      if (k.type === 'JSXText') {
        const v = k.value.replace(/\s+/g, ' ')
        if (v.trim()) out.push({ t: 'text', v })
      } else if (k.type === 'JSXExpressionContainer') {
        if (k.expression.type === 'JSXEmptyExpression') continue // {/* comments */}
        const node = expr(k.expression)
        if (node) out.push(node)
      } else {
        const node = expr(k)
        if (node) out.push(node)
      }
    }
    return out
  }

  const compRef = (name: string, kids: StaticNode[], attrs: Record<string, string>): StaticNode => {
    const from = ctx.componentImports.get(name.split('.')[0])
    return { t: 'comp', name, ...(from && { src: from.src, imp: from.imp }), ...(Object.keys(attrs).length && { attrs }), children: kids }
  }

  const element = (n: Node): StaticNode => {
    count++
    const name = n.openingElement.name
    // <div>, <motion.div> → elements; <Button>, <UI.Card> → component references.
    const tag: string =
      name.type === 'JSXIdentifier' ? name.name
      : name.type === 'JSXMemberExpression' ? (/^[a-z]/.test(name.property.name) ? name.property.name : text(name))
      : name.name?.name ?? 'div'

    let cls: string | undefined
    const attrs: Record<string, string> = {}
    const isComp = /^[A-Z]/.test(tag)
    for (const a of n.openingElement.attributes) {
      if (a.type !== 'JSXAttribute') continue
      const key: string = a.name.type === 'JSXNamespacedName' ? `${a.name.namespace.name}:${a.name.name.name}` : a.name.name
      if (SKIP_ATTR.test(key)) continue
      const value = a.value?.type === 'JSXExpressionContainer' ? a.value.expression : a.value
      if (!isComp && (key === 'className' || key === 'class')) {
        cls = value ? classOf(value) || undefined : undefined
      } else if (!isComp && key === 'style') {
        const css = styleOf(value)
        if (css) attrs.style = css
      } else if (key === 'src' || key === 'poster' || /^(image|img|logo|icon|avatar|photo|picture|background|bg)(src|url)?$/i.test(key)) {
        // Image-ish attributes (and image props passed to components) point at project files when possible.
        const v = assetOf(value) ?? staticValue(value) ?? (isComp ? undefined : exprRef(value) ?? '')
        if (v !== undefined) attrs[key] = v
      } else {
        const v = staticValue(value)
        if (v !== undefined) attrs[key] = v
        else if (!isComp && PLACEHOLDER_ATTRS.has(key)) attrs[key] = exprRef(value) ?? ''
      }
    }
    const kids = children(n.children)
    const hasAttrs = Object.keys(attrs).length > 0
    if (isComp) {
      // React Router: <Route path="/" element={<Home/>} /> (v6) or component={Home} (v5) → Home is the content.
      for (const a of n.openingElement.attributes) {
        if (a.type !== 'JSXAttribute' || !['element', 'component', 'render'].includes(a.name.name)) continue
        const v = a.value?.type === 'JSXExpressionContainer' ? a.value.expression : undefined
        if (v?.type === 'JSXElement') kids.push(element(v))
        else if (v?.type === 'Identifier' && /^[A-Z]/.test(v.name)) kids.push(compRef(v.name, [], {}))
      }
      return compRef(tag, kids, attrs)
    }
    return { t: 'el', tag, ...(cls && { cls }), ...(hasAttrs && { attrs }), children: kids }
  }

  return expr(rootJsx(fn))
}
