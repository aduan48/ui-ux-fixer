import type { Block, BrandToken, Page, PlaceholderType, Project, StaticNode, TokenKind, TokenRole } from '../types'
import { blockNode, labelAt } from './render'
import { frameWidthOf, heightFrom, placedBlocks, rowsOf } from './layout'
import { withoutOffsets } from './treeEdit'

// The brief is written for a coding agent (Claude Code etc.): concrete file paths, explicit
// "reuse" vs "build new", brand values as rules, and what changed compared to today.

const COL = 100 / 12

const PLACEHOLDER_BRIEF: Record<PlaceholderType, string> = {
  text: 'a text section (heading and paragraph)',
  image: 'an image or media area',
  button: 'a call-to-action button',
  spacer: 'extra vertical space',
  columns: 'a row of three columns or cards',
}

const KIND_TITLES: Record<TokenKind, string> = {
  color: 'Colors',
  font: 'Fonts',
  fontSize: 'Font sizes',
  radius: 'Corner radius',
  spacing: 'Spacing',
}

const ROLE_TITLES: Record<TokenRole, string> = { primary: 'Primary color', accent: 'Accent color', heading: 'Heading font', body: 'Body font' }

const code = (s: string) => '`' + s.replace(/`/g, "'") + '`'

/** Width as a share of the page frame: "full width", "6/12 width", "40% width". */
function widthText(px: number, frameWidth: number): string {
  const w = (px / frameWidth) * 100
  if (w >= 99.9) return 'full width'
  const cols = w / COL
  return Math.abs(cols - Math.round(cols)) < 0.01 ? `${Math.round(cols)}/12 width` : `${Math.round(w)}% width`
}

const position = (i: number, n: number) => (n === 2 ? ['left', 'right'][i] : n === 3 ? ['left', 'middle', 'right'][i] : `column ${i + 1} of ${n}`)

/** Indented outline of the element/component structure inside a tree (text and {expressions} left out). */
function outline(tree: StaticNode, maxDepth = 3, maxLines = 30): string[] {
  const lines: string[] = []
  const visit = (n: StaticNode, path: string, depth: number) => {
    if (!('children' in n) || depth >= maxDepth) return
    n.children.forEach((c, i) => {
      if (lines.length >= maxLines || (c.t !== 'el' && c.t !== 'comp' && c.t !== 'frag')) return
      const p = path ? `${path}.${i}` : String(i)
      lines.push(`${'  '.repeat(depth)}- ${labelAt(tree, p)!.label}`)
      if (c.t !== 'comp') visit(c, p, depth + 1)
    })
  }
  visit(tree, '', 0)
  if (lines.length >= maxLines) lines.push('- …')
  return lines
}

/**
 * Labels of the pieces that matter when checking for removals: elements with no element
 * children (headings, buttons, images…) and nested components. Containers are left out:
 * their label is their text, which changes whenever their children are reordered.
 */
function leafLabels(tree: StaticNode): string[] {
  const out: string[] = []
  const visit = (n: StaticNode, path: string) => {
    if (!('children' in n)) return
    n.children.forEach((c, i) => {
      const p = path ? `${path}.${i}` : String(i)
      if (c.t === 'comp') out.push(labelAt(tree, p)!.label)
      else if (c.t === 'el' || c.t === 'frag') {
        if (c.children.some(k => k.t === 'el' || k.t === 'comp' || k.t === 'frag')) visit(c, p)
        else out.push(labelAt(tree, p)!.label)
      }
    })
  }
  visit(tree, '')
  return out
}

/** What's in `before` but not in `after`, counting duplicates. */
function removedLeaves(before: StaticNode, after: StaticNode): string[] {
  const left = new Map<string, number>()
  for (const l of leafLabels(after)) left.set(l, (left.get(l) ?? 0) + 1)
  return leafLabels(before).filter(l => {
    const n = left.get(l) ?? 0
    if (n) left.set(l, n - 1)
    return !n
  })
}

/** Every free-form move in a tree, as [label, offset]. */
function offsetsIn(tree: StaticNode): [string, { x: number; y: number }][] {
  const out: [string, { x: number; y: number }][] = []
  const visit = (n: StaticNode, path: string) => {
    if (!('children' in n)) return
    n.children.forEach((c, i) => {
      const p = path ? `${path}.${i}` : String(i)
      if ((c.t === 'el' || c.t === 'comp') && c.offset) out.push([labelAt(tree, p)!.label, c.offset])
      visit(c, p)
    })
  }
  visit(tree, '')
  return out
}

/** "about 40px right and 24px up". */
function moveText({ x, y }: { x: number; y: number }): string {
  const parts = [
    x ? `${Math.abs(x)}px ${x > 0 ? 'right' : 'left'}` : '',
    y ? `${Math.abs(y)}px ${y > 0 ? 'down' : 'up'}` : '',
  ].filter(Boolean)
  return `about ${parts.join(' and ')}`
}

interface Described {
  title: string
  file?: string
  isNew: boolean
  missing: boolean
}

function describe(block: Block, project: Project): Described {
  const c = project.components.find(x => x.id === block.componentId)
  if (block.kind === 'placeholder') return { title: `NEW: ${block.placeholder} block`, isNew: true, missing: false }
  if (!c) return { title: `Missing component (${block.componentId?.split('#').pop() ?? 'unknown'})`, isNew: false, missing: true }
  if (block.kind === 'element') {
    const label = labelAt(c.tree, block.elementPath!)?.label ?? 'element'
    return { title: `${code(label)} from ${c.name}`, file: c.filePath, isNew: false, missing: false }
  }
  return { title: c.name, file: c.filePath, isNew: false, missing: false }
}

function blockLines(block: Block, project: Project, where: string, page: Page): string[] {
  const d = describe(block, project)
  // An element that was already on this page as imported is existing page markup, not something to extract.
  const existing = block.kind === 'element' && !!page.original?.some(o => o.componentId === block.componentId && o.elementPath === block.elementPath)
  const lines: string[] = []
  if (block.kind === 'placeholder') {
    lines.push(`**NEW: ${block.placeholder} block** (${where}): build ${PLACEHOLDER_BRIEF[block.placeholder!]}. It doesn't exist yet.`)
  } else if (d.missing) {
    lines.push(`**${d.title}** (${where}): this component is no longer in the codebase. Ask before recreating it.`)
  } else if (block.kind === 'element' && existing) {
    lines.push(`**${d.title.replace(/ from .*$/, '')}** (${where}): keep the existing markup, currently written inline in ${code(d.file!)}.`)
  } else if (block.kind === 'element') {
    lines.push(`**${d.title}** (${where}): reuse this element from ${code(d.file!)} as its own piece here.`)
  } else {
    lines.push(`**${d.title}** (${where}): reuse ${code(d.file!)}.`)
  }

  const sub: string[] = []
  if (block.props && Object.keys(block.props).length)
    sub.push(`Props it gets today: ${Object.entries(block.props).map(([k, v]) => `${k}=${code(v.replace(/^@asset:/, ''))}`).join(', ')}`)
  if (block.tree) {
    const source = blockNode({ ...block, tree: undefined }, project.components)
    const restructured = !source || JSON.stringify(withoutOffsets(source)) !== JSON.stringify(withoutOffsets(block.tree))
    if (restructured) {
      sub.push('**Rearrange its contents** to this structure (top to bottom):', ...outline(block.tree).map(l => '  ' + l))
      if (source) {
        const removed = removedLeaves(source, block.tree)
        if (removed.length) sub.push(`Remove: ${removed.join(', ')}`)
        sub.push('Current structure, for comparison:', ...outline(source).map(l => '  ' + l))
      }
    }
    const moves = offsetsIn(block.tree)
    if (moves.length) {
      sub.push(
        `**Reposition** (placed by hand in the sketch, measured on a ${frameWidthOf(page)}px-wide page). Get there with real layout: alignment, spacing, grid/flex, not hard-coded offsets:`,
        ...moves.map(([label, o]) => `  - ${code(label)}: ${moveText(o)} from where it sits now`),
      )
    }
  }
  if (block.height) sub.push('Its height was set by hand in the sketch: make it noticeably more compact or taller to match, rather than sizing to content.')
  if (block.notes.trim()) sub.push(`Note: ${block.notes.trim()}`)
  return [lines[0], ...sub.map(s => (s.startsWith('  ') ? '  ' + s : `  - ${s}`))]
}

function layoutLines(project: Project, page: Page, heightOf: (b: Block) => number): string[] {
  const out: string[] = []
  const fw = frameWidthOf(page)
  rowsOf(placedBlocks(page, heightOf), heightOf).forEach((row, r) => {
    if (row.length === 1) {
      const [first, ...rest] = blockLines(row[0], project, widthText(row[0].w, fw), page)
      out.push(`${r + 1}. ${first}`, ...rest.map(l => '   ' + l))
    } else {
      out.push(`${r + 1}. A row of ${row.length}, side by side:`)
      row.forEach((b, i) => {
        const [first, ...rest] = blockLines(b, project, `${position(i, row.length)}, ${widthText(b.w, fw)}`, page)
        out.push(`   - ${first}`, ...rest.map(l => '     ' + l))
      })
    }
  })
  return out
}

/** Short one-line-per-section list of a page as imported. */
function currentLines(blocks: Block[], project: Project): string[] {
  return blocks.map((b, i) => {
    const d = describe(b, project)
    return `${i + 1}. ${d.title}${d.file ? ` (${code(d.file)})` : ''}`
  })
}

const sameLayout = (a: Block[], b: Block[]) =>
  a.length === b.length &&
  a.every((x, i) => {
    const y = b[i]
    return x.kind === y.kind && x.componentId === y.componentId && x.elementPath === y.elementPath && x.placeholder === y.placeholder &&
      Math.abs(x.x - y.x) < 0.5 && Math.abs(x.y - y.y) < 0.5 && Math.abs(x.w - y.w) < 0.5 && !x.tree && !x.notes.trim() && !x.height
  })

function brandLines(tokens: BrandToken[]): string[] {
  if (!tokens.length) return ['No brand tokens were extracted. Match the existing styles in the codebase.']
  const out = [
    'Treat these as hard rules. Use these exact values (prefer the existing CSS variable or Tailwind name where one is listed). Don\'t introduce new colors, fonts or sizes; if something genuinely needs a new one, derive it from these and say so in your summary.',
    '',
  ]
  for (const role of ['primary', 'accent', 'heading', 'body'] as TokenRole[]) {
    const t = tokens.find(x => x.roles?.includes(role))
    if (t) out.push(`- **${ROLE_TITLES[role]}:** ${code(t.value)}${t.name ? ` (${t.name})` : ''}`)
  }
  for (const kind of Object.keys(KIND_TITLES) as TokenKind[]) {
    const list = tokens.filter(t => t.kind === kind)
    if (!list.length) continue
    out.push('', `**${KIND_TITLES[kind]}**`)
    for (const t of list) out.push(`- ${code(t.value)}${t.name ? ` · ${t.name}` : ''}${t.source === 'added' ? ' · added for the redesign' : ''}`)
  }
  return out
}

function stackLine(project: Project): string {
  const react = project.components.filter(c => c.framework === 'react').length
  const html = project.components.filter(c => c.framework === 'html').length
  const parts = [react ? `React (${react} components found)` : html ? `plain HTML (${html} sections found)` : 'unknown framework']
  if (project.styles.some(s => /@tailwind|@apply|@theme|tailwindcss/.test(s.content)) || project.tokens.some(t => t.source === 'classes'))
    parts.push('Tailwind CSS')
  const css = project.styles.filter(s => s.path.endsWith('.css')).map(s => s.path)
  if (css.length) parts.push(`CSS files: ${css.slice(0, 8).map(code).join(', ')}${css.length > 8 ? ', …' : ''}`)
  return parts.join(' · ')
}

/** The full Markdown brief for a coding agent. `measured`: preview heights by block id, for grouping rows. */
export function buildPrompt(project: Project, measured: Record<string, number> = {}): string {
  const heightOf = heightFrom(measured)
  const L: string[] = []
  const pages = project.pages.filter(p => p.blocks.length || p.notes.trim())

  L.push(`# UI redesign brief: ${project.name}`, '')
  L.push(
    'You are working in an existing codebase. Update its UI so each page below matches the **target layout**. This brief was sketched in SketchKit from the real components in this repo, so the names and file paths below are real.',
    '',
  )

  L.push('## How to work', '')
  L.push(
    '1. **Reuse before you create.** Every block that names a file is an existing component: use it, adjust it or restyle it in place. Only create new components for blocks marked **NEW**.',
    '2. **Stay on brand.** The brand rules below are constraints, not suggestions.',
    '3. **Follow existing conventions.** Put new components next to similar ones, and use the same styling approach (Tailwind classes vs CSS files, naming, file layout).',
    '4. **Keep behaviour working.** Routing, data fetching, forms and state must keep working; this brief is about layout and design.',
    "5. **Change only what's described.** Leave pages and components not mentioned alone.",
    '6. **Keep it accessible.** Semantic HTML, alt text, visible focus states, readable contrast.',
    "7. **When you're done,** summarise what you changed, file by file, and anything you couldn't do or had to guess.",
    '',
  )

  L.push('## Project', '')
  L.push(`- Stack: ${stackLine(project)}`)
  if (project.source) L.push(`- Source: ${project.source}`)
  L.push(`- Pages in this brief: ${pages.map(p => p.name).join(', ') || 'none'}`, '')

  L.push('## Brand rules', '', ...brandLines(project.tokens), '')

  if (project.globalNotes.trim()) L.push('## Overall direction', '', project.globalNotes.trim(), '')

  pages.forEach((page, i) => {
    L.push(`## Page ${i + 1}: ${page.name}`, '')
    const meta: string[] = []
    if (page.route) meta.push(`Route ${code(page.route)}`)
    const owner = project.components.find(c => c.id === page.componentId)
    // Next.js route components are named after their route ("/about"), so only the file is useful.
    if (owner) meta.push(owner.name.startsWith('/') ? `rendered by ${code(owner.filePath)}` : `rendered by ${code(owner.name)} in ${code(owner.filePath)}`)
    if (!page.original) meta.push('a new page that does not exist yet')
    if (meta.length) L.push(meta.join(', ').replace(/^./, c => c.toUpperCase()) + '.', '')
    if (page.notes.trim()) L.push(`**Page notes:** ${page.notes.trim()}`, '')

    if (page.original && sameLayout(page.blocks, page.original)) {
      L.push('No layout changes on this page.', '')
      return
    }
    L.push('### Target layout (top to bottom)', '', ...layoutLines(project, page, heightOf), '')
    if (page.original) L.push('### Current layout (for comparison)', '', ...currentLines(page.original, project), '')
  })

  const fresh = pages.flatMap(p => p.blocks.filter(b => b.kind === 'placeholder').map(b => `- ${p.name}: ${PLACEHOLDER_BRIEF[b.placeholder!]}`))
  if (fresh.length) L.push('## New things to build', '', ...fresh, '')

  return L.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/** A safe file name for the download. */
export const promptFileName = (project: Project) =>
  `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sketchkit'}-brief.md`

