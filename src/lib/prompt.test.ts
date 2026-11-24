// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Block, Page, Project } from '../types'
import { buildCurrentPages } from './currentPages'
import { isImage, isWanted } from './files'
import { buildPrompt } from './prompt'
import { scanProject } from './scan'
import { moveNode } from './treeEdit'

const readSample = (name: string) => {
  const root = join(__dirname, '../../samples', name)
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => relative(root, join(e.parentPath, e.name)))
    .filter(isWanted)
    .map(path => ({ path, content: isImage(path) ? 'data:image/svg+xml;base64,AA==' : readFileSync(join(root, path), 'utf8') }))
}

/** The sample site as SketchKit would import it, then sketched on. */
function sketchedProject(): Project {
  const scan = scanProject(readSample('sample-react-app'))
  let n = 0
  const pages: Page[] = buildCurrentPages(scan.components).map(c => {
    const blocks: Block[] = c.blocks.map(item => ({ id: `b${n++}`, x: 0, y: 0, w: 1440, notes: '', ...item }))
    return { id: c.name, name: c.name, notes: '', flow: true, blocks, original: blocks, route: c.route, componentId: c.componentId }
  })
  const home = pages[0]
  const name = (b: Block) => scan.components.find(c => c.id === b.componentId)?.name
  const hero = home.blocks.find(b => name(b) === 'Hero')!
  const heroTree = scan.components.find(c => c.name === 'Hero')!.tree!
  home.blocks = [
    home.blocks[0], // Navbar
    { ...hero, w: 720, tree: moveNode(heroTree, '3', '0', false), notes: 'make the image feel bigger' }, // image first
    { id: 'new1', kind: 'placeholder', placeholder: 'text', x: 0, y: 0, w: 720, notes: 'short pitch for coaches' },
    ...home.blocks.filter(b => name(b) !== 'Hero' && name(b) !== 'Navbar').reverse(), // reorder the rest
  ]
  home.notes = 'convert visitors into sign-ups'
  return { name: 'Sample', source: 'sample-react-app', components: scan.components, styles: scan.styles, assets: scan.assets, tokens: scan.tokens, pages, globalNotes: 'feel more premium, mobile first' }
}

describe('buildPrompt', () => {
  const prompt = buildPrompt(sketchedProject())

  it('opens with instructions for the agent', () => {
    expect(prompt).toMatch(/^# UI redesign brief: Sample\n/)
    expect(prompt).toContain('**Reuse before you create.**')
  })

  it('states the brand as rules, with names the code already uses', () => {
    expect(prompt).toContain('- **Primary color:** `#4f46e5` (brand · --brand)')
    expect(prompt).toContain('- **Heading font:** `Playfair Display` (font-display)')
    expect(prompt).toContain('- Stack: React (12 components found) · Tailwind CSS')
  })

  it('lays the page out top to bottom with real file paths, rows and NEW blocks', () => {
    expect(prompt).toContain('Route `/`, rendered by `app/page.tsx`.')
    expect(prompt).toContain('1. **Navbar** (full width): reuse `src/components/Navbar.tsx`.')
    expect(prompt).toContain('2. A row of 2, side by side:')
    expect(prompt).toContain('   - **Hero** (left, 6/12 width): reuse `src/components/hero/index.tsx`.')
    expect(prompt).toContain("   - **NEW: text block** (right, 6/12 width): build a text section (heading and paragraph). It doesn't exist yet.")
    expect(prompt).toContain('4. **`section “What people say”`** (full width): keep the existing markup, currently written inline in `app/page.tsx`.')
  })

  it('spells out rearranged components, notes, and how the page looks today', () => {
    expect(prompt).toContain('**Rearrange its contents** to this structure (top to bottom):\n         - img\n         - h1 “{title}”')
    expect(prompt).toContain('- Note: make the image feel bigger')
    expect(prompt).toContain('**Page notes:** convert visitors into sign-ups')
    expect(prompt).toContain('## Overall direction\n\nfeel more premium, mobile first')
    expect(prompt).toContain('### Current layout (for comparison)\n\n1. Navbar (`src/components/Navbar.tsx`)\n2. Hero')
    expect(prompt).toContain('## Page 2: About\n\nRoute `/about`, rendered by `app/about/page.tsx`.\n\nNo layout changes on this page.')
    expect(prompt).toContain('## New things to build\n\n- Home: a text section (heading and paragraph)')
  })
})

it('lists removed pieces, not containers whose children were merely reordered', async () => {
  const { removeNode } = await import('./treeEdit')
  const p = sketchedProject()
  const hero = p.pages[0].blocks[1]
  hero.tree = removeNode(hero.tree!, '0') // image was moved first; now drop it
  const brief = buildPrompt(p)
  expect(brief).toContain('- Remove: img')
  expect(brief).not.toContain('Remove: section')
})

it('describes free-form moves in words, without a structure dump when only positions changed', async () => {
  const { setOffset } = await import('./treeEdit')
  const p = sketchedProject()
  const hero = p.pages[0].blocks[1]
  const heroTree = p.components.find(c => c.name === 'Hero')!.tree!
  hero.tree = setOffset(setOffset(heroTree, '0', { x: 40, y: -24 }), '2', { x: 0, y: 16 })
  const brief = buildPrompt(p)
  expect(brief).toContain('**Reposition** (placed by hand in the sketch, measured on a 1440px-wide page).')
  expect(brief).toContain('- `h1 “{title}”`: about 40px right and 24px up from where it sits now')
  expect(brief).toContain('- `button.btn-primary “{ctaLabel}”`: about 16px down from where it sits now')
  expect(brief.slice(brief.indexOf('**Hero**'), brief.indexOf('**NEW'))).not.toContain('Rearrange its contents')
})
