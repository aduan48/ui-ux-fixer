import { parse } from '@babel/parser'
import twTheme from 'tailwindcss/theme.css?raw'
import type { BrandToken, SourceFile, TokenKind, TokenRole } from '../types'
import { walk, type Node } from './ast'

// ---------- Tailwind's default theme, read from the installed package ----------

/** `--color-indigo-600: oklch(...)` → Map('color-indigo-600' → 'oklch(...)'). */
function cssVars(css: string): Map<string, string> {
  const vars = new Map<string, string>()
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) vars.set(m[1].slice(2), m[2].replace(/\s+/g, ' ').trim())
  return vars
}
const DEFAULT_THEME = cssVars(twTheme)

// ---------- Colours ----------

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\([^()]*\)/g
const IS_COLOR = new RegExp(`^(?:${COLOR_RE.source})$`)

/** Lowercase, #abc → #aabbcc, drop a fully opaque alpha, tidy spaces in functions. */
export function normalizeColor(c: string): string {
  c = c.trim().toLowerCase()
  if (/^#[0-9a-f]{3,4}$/.test(c)) c = '#' + [...c.slice(1)].map(ch => ch + ch).join('')
  if (/^#[0-9a-f]{8}$/.test(c) && c.endsWith('ff')) c = c.slice(0, 7)
  return c.replace(/\s*,\s*/g, ', ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s+/g, ' ')
}

/**
 * Greys, near-white and near-black are "neutral": real tokens, but never picked as the
 * primary or accent colour automatically.
 */
export function isNeutral(c: string): boolean {
  const hex = c.match(/^#([0-9a-f]{6})/)
  let r: number, g: number, b: number
  if (hex) [r, g, b] = [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16) / 255)
  else if (c.startsWith('rgb')) [r, g, b] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(n => Number(n) / 255)
  else if (c.startsWith('hsl')) {
    const [, s, l] = (c.match(/[\d.]+/g) ?? []).map(Number)
    return s < 12 || l > 92 || l < 15
  } else if (c.startsWith('oklch')) {
    const [l, ch] = (c.match(/[\d.]+/g) ?? []).map(Number)
    return ch < 0.03 || l > 95 || l < 25
  } else return false
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const sat = max === 0 ? 0 : (max - min) / max
  return sat < 0.12 || max < 0.2 || min > 0.92 // greys, near-black (incl. dark navy text), near-white
}

/** Hue in degrees (0–360) for hex, rgb(), hsl() and oklch(); undefined if unknown. */
export function hue(c: string): number | undefined {
  const n = (c.match(/[\d.]+/g) ?? []).map(Number)
  if (c.startsWith('hsl')) return n[0]
  if (c.startsWith('oklch')) return n[2]
  let rgb: number[] | undefined
  const hex = c.match(/^#([0-9a-f]{6})/)
  if (hex) rgb = [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16))
  else if (c.startsWith('rgb')) rgb = n.slice(0, 3)
  if (!rgb) return
  const [r, g, b] = rgb.map(v => v / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (!d) return
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}

const hueGap = (a?: number, b?: number) => (a === undefined || b === undefined ? 180 : Math.min(Math.abs(a - b), 360 - Math.abs(a - b)))

// ---------- Collecting ----------

interface Found { kind: TokenKind; value: string; names: string[]; source: string; count: number }

class Collector {
  private map = new Map<string, Found>()
  add(kind: TokenKind, value: string, source: string, name?: string, count = 1) {
    value = kind === 'color' ? normalizeColor(value) : value.trim()
    if (!value) return
    const key = `${kind}|${kind === 'font' ? value.toLowerCase() : value}`
    const hit = this.map.get(key)
    if (hit) {
      hit.count += count
      if (name && !hit.names.includes(name)) hit.names.push(name)
    } else this.map.set(key, { kind, value, names: name ? [name] : [], source, count })
  }
  /** Bump a token by any of its names (a `var(--brand)` use). */
  bumpName(name: string) {
    for (const f of this.map.values()) if (f.names.includes(name)) f.count++
  }
  all() {
    return [...this.map.values()]
  }
}

const GENERIC_FONTS = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'ui-rounded', 'inherit', 'initial', 'unset', '-apple-system', 'blinkmacsystemfont', 'emoji', 'math', 'fangsong'])

/** The first real family in a font-family list: `"Inter", system-ui, sans-serif` → Inter. */
export function firstFont(list: string): string | undefined {
  for (const raw of list.split(',')) {
    const f = raw.trim().replace(/^["']|["']$/g, '')
    if (f && !GENERIC_FONTS.has(f.toLowerCase()) && !f.startsWith('var(') && !f.startsWith('--')) return f
  }
}

const LENGTH = /^-?[\d.]+(px|rem|em)$/
const VAR_KIND: [RegExp, TokenKind][] = [
  [/^(color|colour|clr)-|-(color|colour|bg|background|fg|foreground|primary|secondary|accent|brand)$|^(primary|secondary|accent|brand|background|foreground)/, 'color'],
  [/^font-(family|sans|serif|mono|display|heading|body)|^font$|-font$/, 'font'],
  [/^(text|font-size|fs)-/, 'fontSize'],
  [/^(radius|rounded|border-radius)/, 'radius'],
  [/^(spacing|space|gap)/, 'spacing'],
]

/** Plain CSS (and Tailwind v4 @theme blocks): custom properties, then declarations. */
function fromCss(css: string, source: string, c: Collector, headingFonts: Set<string>, bodyFonts: Set<string>) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/url\([^)]*\)/g, 'url()')

  for (const [name, value] of cssVars(css)) {
    if (name.endsWith('--line-height') || name.endsWith('--letter-spacing') || name.endsWith('--font-weight')) continue
    const colors = value.match(COLOR_RE)
    if (colors?.length === 1 && colors[0].length >= value.length - 2) { c.add('color', colors[0], source, `--${name}`); continue }
    const kind = VAR_KIND.find(([re]) => re.test(name))?.[1]
    if (kind === 'font') { const f = firstFont(value); if (f) c.add('font', f, source, `--${name}`) }
    else if ((kind === 'fontSize' || kind === 'radius' || kind === 'spacing') && LENGTH.test(value)) c.add(kind, value, source, `--${name}`)
  }

  // selector { declarations } — nested at-rules are fine: their inner rules still match.
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = rule[1].trim()
    for (const decl of rule[2].split(';')) {
      const i = decl.indexOf(':')
      if (i < 0) continue
      const prop = decl.slice(0, i).trim().toLowerCase()
      const value = decl.slice(i + 1).replace(/!important/, '').trim()
      if (prop.startsWith('--')) continue
      for (const v of value.matchAll(/var\(\s*(--[\w-]+)/g)) c.bumpName(v[1])
      if (/color|background|border|fill|stroke|outline|shadow|decoration|caret|accent/.test(prop))
        for (const col of value.match(COLOR_RE) ?? []) c.add('color', col, source)
      if (prop === 'font-family') {
        const f = firstFont(value)
        if (f) {
          c.add('font', f, source)
          if (/(^|[\s,>+~])h[1-6]\b|heading|title|display/i.test(selector)) headingFonts.add(f)
          if (/(^|[\s,])(html|body|:root)\b/.test(selector)) bodyFonts.add(f)
        }
      }
      if (prop === 'font-size' && LENGTH.test(value)) c.add('fontSize', value, source)
      if (prop === 'border-radius' && /^[\d.]+(px|rem|em|%)$/.test(value) && !/^0/.test(value)) c.add('radius', value, source)
      if (/^(padding|margin|gap|row-gap|column-gap)(-|$)/.test(prop))
        for (const v of value.split(/\s+/)) if (LENGTH.test(v) && !/^-?0(\.0+)?[a-z]+$/.test(v)) c.add('spacing', v, source)
    }
  }
}

// ---------- tailwind.config.* ----------

/** A literal JS value from the AST, or undefined for anything computed. */
function literal(n: Node | undefined): unknown {
  if (!n) return
  switch (n.type) {
    case 'StringLiteral': return n.value
    case 'NumericLiteral': return n.value
    case 'TemplateLiteral': return n.expressions.length ? undefined : n.quasis[0].value.cooked
    case 'ArrayExpression': return n.elements.map(literal)
    case 'TSAsExpression': case 'TSSatisfiesExpression': return literal(n.expression)
    case 'ObjectExpression': {
      const o: Record<string, unknown> = {}
      for (const p of n.properties) {
        if (p.type !== 'ObjectProperty') continue
        const k = p.key.type === 'Identifier' ? p.key.name : p.key.value
        if (k !== undefined) o[String(k)] = literal(p.value)
      }
      return o
    }
  }
}

/** { brand: { DEFAULT: '#x', 500: '#y' } } → [['brand', '#x'], ['brand-500', '#y']]. */
function flatten(obj: unknown, prefix = ''): [string, string][] {
  if (typeof obj === 'string' || typeof obj === 'number') return [[prefix, String(obj)]]
  if (Array.isArray(obj)) return typeof obj[0] === 'string' ? [[prefix, obj[0]]] : [] // fontSize: ['1rem', {...}] / fontFamily lists
  if (!obj || typeof obj !== 'object') return []
  return Object.entries(obj).flatMap(([k, v]) => flatten(v, k === 'DEFAULT' ? prefix : prefix ? `${prefix}-${k}` : k))
}

export interface TailwindConfigTheme {
  colors: Map<string, string>
  fontFamily: Map<string, string>
  fontSize: Map<string, string>
  borderRadius: Map<string, string>
  spacing: Map<string, string>
}

/** Read the literal parts of `theme` and `theme.extend` from a tailwind.config file. */
export function readTailwindConfig(source: string): TailwindConfigTheme {
  const out: TailwindConfigTheme = { colors: new Map(), fontFamily: new Map(), fontSize: new Map(), borderRadius: new Map(), spacing: new Map() }
  const ast = parse(source, { sourceType: 'unambiguous', plugins: ['typescript'], errorRecovery: true })
  walk(ast, n => {
    if (n.type !== 'ObjectProperty' || (n.key.name ?? n.key.value) !== 'theme') return
    const theme = literal(n.value) as Record<string, unknown> | undefined
    if (!theme) return
    for (const section of [theme, theme.extend as Record<string, unknown> | undefined]) {
      if (!section) continue
      for (const key of ['colors', 'fontFamily', 'fontSize', 'borderRadius', 'spacing'] as const) {
        for (const [name, value] of flatten(section[key])) if (name && value) out[key].set(name, value)
      }
    }
    return false
  })
  return out
}

/** A Tailwind v4 `@theme` block for the config, so previews know `bg-brand-500` and friends. */
export function themeCss(t: TailwindConfigTheme): string {
  const lines = [
    ...[...t.colors].map(([k, v]) => `--color-${k}: ${v};`),
    ...[...t.fontFamily].map(([k, v]) => `--font-${k}: ${v};`),
    ...[...t.fontSize].map(([k, v]) => `--text-${k}: ${v};`),
    ...[...t.borderRadius].map(([k, v]) => `--radius-${k}: ${v};`),
    ...[...t.spacing].map(([k, v]) => `--spacing-${k}: ${v};`),
  ]
  return lines.length ? `@theme {\n  ${lines.join('\n  ')}\n}` : ''
}

// ---------- Tailwind classes in markup ----------

const COLOR_PREFIX = '(?:bg|text|border(?:-[trblxy])?|ring|ring-offset|from|via|to|fill|stroke|outline|decoration|divide|accent|caret|shadow|placeholder)'
const SIZE_NAMES = new Set(['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl'])

/** Every Tailwind class in the project's source strings, resolved through the config, then the default theme. */
function fromClasses(sources: SourceFile[], cfg: TailwindConfigTheme, c: Collector) {
  const counts = new Map<string, number>()
  for (const f of sources)
    for (const str of f.content.matchAll(/["'`]([^"'`\n]{2,400})["'`]/g))
      for (const cls of str[1].split(/\s+/)) {
        const base = cls.split(':').pop()! // drop variants: md:hover:bg-x → bg-x
        if (/^[a-z-]+(-[\w.\/[\]#%]+)+$|^rounded$/.test(base)) counts.set(base, (counts.get(base) ?? 0) + 1)
      }

  const color = new RegExp(`^${COLOR_PREFIX}-(.+?)(?:\\/\\d+)?$`)
  for (const [cls, n] of counts) {
    const m = cls.match(color)
    if (m) {
      const name = m[1]
      const arbitrary = name.match(/^\[(#[0-9a-fA-F]{3,8}|(?:rgb|hsl|oklch)a?\([^\]]+\))\]$/)
      if (arbitrary) { c.add('color', arbitrary[1].replace(/_/g, ' '), 'classes', undefined, n); continue }
      const value = cfg.colors.get(name) ?? DEFAULT_THEME.get(`color-${name}`)
      if (value && IS_COLOR.test(value.trim())) c.add('color', value, 'classes', name, n)
      if (value) continue
    }
    let s: RegExpMatchArray | null
    if ((s = cls.match(/^text-(.+)$/)) && (SIZE_NAMES.has(s[1]) || cfg.fontSize.has(s[1]))) {
      const v = cfg.fontSize.get(s[1]) ?? DEFAULT_THEME.get(`text-${s[1]}`)
      if (v) c.add('fontSize', v, 'classes', `text-${s[1]}`, n)
    } else if ((s = cls.match(/^rounded(?:-[trblse]{1,2})?(?:-(.+))?$/))) {
      const size = s[1] ?? ''
      const v = size === 'full' ? '9999px' : size === 'none' ? undefined : cfg.borderRadius.get(size || 'DEFAULT') ?? (size ? DEFAULT_THEME.get(`radius-${size}`) : '0.25rem')
      if (v) c.add('radius', v, 'classes', size ? `rounded-${size}` : 'rounded', n)
    } else if ((s = cls.match(/^font-(.+)$/)) && (cfg.fontFamily.has(s[1]) || ['sans', 'serif', 'mono'].includes(s[1]))) {
      const list = cfg.fontFamily.get(s[1]) ?? DEFAULT_THEME.get(`font-${s[1]}`) ?? ''
      const f = firstFont(list)
      if (f) c.add('font', f, 'classes', `font-${s[1]}`, n)
    } else if ((s = cls.match(/^(?:p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y)-(\d+(?:\.5)?)$/)) && s[1] !== '0') {
      c.add('spacing', cfg.spacing.get(s[1]) ?? `${Number(s[1]) * 0.25}rem`, 'classes', undefined, n)
    }
  }
}

// ---------- Entry point ----------

const LIMITS: Record<TokenKind, number> = { color: 24, font: 6, fontSize: 12, radius: 8, spacing: 12 }

export interface TokenScan {
  tokens: BrandToken[]
  /** `@theme` CSS generated from tailwind.config, for previews ('' if none). */
  themeCss: string
}

/**
 * Brand tokens ranked by how often they're used: CSS files and variables, tailwind.config,
 * Tailwind classes in markup, Google Fonts links and next/font imports. Picks a primary and
 * accent colour (most-used non-neutral ones) and heading/body fonts.
 */
export function extractTokens(files: SourceFile[]): TokenScan {
  const c = new Collector()
  const headingFonts = new Set<string>()
  const bodyFonts = new Set<string>()

  const configFile = files.find(f => /(^|\/)tailwind\.config\.[cm]?[jt]s$/.test(f.path))
  let cfg: TailwindConfigTheme = { colors: new Map(), fontFamily: new Map(), fontSize: new Map(), borderRadius: new Map(), spacing: new Map() }
  if (configFile) {
    try { cfg = readTailwindConfig(configFile.content) } catch { /* unparseable config: fall back to defaults */ }
    for (const [k, v] of cfg.colors) for (const col of v.match(COLOR_RE) ?? []) c.add('color', col, configFile.path, k, 0)
    for (const [k, v] of cfg.fontFamily) { const f = firstFont(v); if (f) c.add('font', f, configFile.path, `font-${k}`, 0) }
  }

  for (const f of files) {
    if (/\.(css|scss)$/.test(f.path)) fromCss(f.content, f.path, c, headingFonts, bodyFonts)
    // Fonts the HTML pulls from Google Fonts: family=Playfair+Display:wght@400
    if (/\.html?$/.test(f.path))
      for (const m of f.content.matchAll(/fonts\.googleapis\.com\/css2?\?([^"'\s>]+)/g))
        for (const fam of m[1].matchAll(/family=([^&:;]+)/g)) c.add('font', decodeURIComponent(fam[1].replace(/\+/g, ' ')), f.path)
    // next/font: import { Inter, Playfair_Display } from 'next/font/google'
    for (const m of f.content.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']next\/font\/google["']/g))
      for (const name of m[1].split(',')) {
        const fam = name.split(/\s+as\s+/)[0].trim().replace(/_/g, ' ')
        if (fam) c.add('font', fam, f.path)
      }
  }
  fromClasses(files.filter(f => /\.(jsx?|tsx?|html?|vue|svelte)$/.test(f.path)), cfg, c)

  // Rank, cap per kind, and keep tokens that are actually used (config-only entries have count 0 but are kept: they're declared brand).
  const tokens: BrandToken[] = []
  for (const kind of Object.keys(LIMITS) as TokenKind[]) {
    const found = c.all().filter(f => f.kind === kind).sort((a, b) => b.count - a.count).slice(0, LIMITS[kind])
    // A token can go by several names (--brand in CSS, brand in tailwind.config): show them all.
    for (const f of found) tokens.push({ id: `${kind}:${f.value}`, kind, value: f.value, count: f.count, ...(f.names.length && { name: f.names.join(' · ') }), source: f.source })
  }

  // Roles: most-used non-neutral colours; heading/body from CSS selectors, else by rank.
  const brandColors = tokens.filter(t => t.kind === 'color' && !isNeutral(t.value) && !/^(transparent|currentcolor)$/.test(t.value))
  const give = (t: BrandToken | undefined, role: TokenRole) => t && (t.roles = [...(t.roles ?? []), role])
  // Accent: the most-used brand colour that's visibly different from the primary, not just a darker shade of it.
  give(brandColors[0], 'primary')
  give(brandColors.slice(1).find(t => hueGap(hue(t.value), hue(brandColors[0].value)) >= 30) ?? brandColors[1], 'accent')
  const fonts = tokens.filter(t => t.kind === 'font')
  const body = fonts.find(t => bodyFonts.has(t.value)) ?? fonts[0]
  // One-font sites use it for both.
  give(body, 'body')
  give(fonts.find(t => headingFonts.has(t.value) && t !== body) ?? fonts.find(t => t !== body && !/mono/i.test(t.value)) ?? body, 'heading')

  return { tokens, themeCss: themeCss(cfg) }
}
