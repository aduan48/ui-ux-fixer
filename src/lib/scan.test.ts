// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isImage, isWanted } from './files'
import { guessType, splitWords } from './guessType'
import { buildCurrentPages } from './currentPages'
import { elementsOf, renderBlock, renderHtml } from './render'
import { moveInto, moveNode, nudgeNode, removeNode } from './treeEdit'
import type { Block, StaticNode } from '../types'
import { scanProject } from './scan'

const readSample = (name: string) => {
  const root = join(__dirname, '../../samples', name)
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => relative(root, join(e.parentPath, e.name)))
    .filter(isWanted)
    .map(path => ({
      path,
      content: isImage(path)
        ? `data:image/svg+xml;base64,${readFileSync(join(root, path)).toString('base64')}`
        : readFileSync(join(root, path), 'utf8'),
    }))
}

const summary = (name: string) => {
  const { components, failed } = scanProject(readSample(name))
  expect(failed).toEqual([])
  return Object.fromEntries(components.map(c => [c.name, `${c.type} ${c.filePath} [${c.props.join(',')}]`]))
}

describe('scanProject', () => {
  it('finds every export style in the React sample, and only components', () => {
    expect(summary('sample-react-app')).toEqual({
      '/ layout': 'page app/layout.tsx [children]',
      '/': 'page app/page.tsx []',
      '/about': 'page app/about/page.tsx []',
      PricingPage: 'page app/(marketing)/pricing/page.tsx []',
      Button: 'button src/components/Button.tsx [variant,size]',
      ContactForm: 'form src/components/ContactForm.jsx [onSubmit]',
      FeatureCard: 'card src/components/FeatureCard.tsx [icon,title,body]',
      Footer: 'footer src/components/Footer.tsx [year]',
      Hero: 'hero src/components/hero/index.tsx [title,subtitle,ctaLabel]',
      Navbar: 'navbar src/components/Navbar.tsx [links,logoSrc]',
      PricingSection: 'section src/components/PricingSection.tsx [highlight]',
      TestimonialWall: 'section src/components/Testimonials.tsx [quotes]',
    })
  })

  it('treats top-level semantic HTML as components', () => {
    expect(summary('sample-html-site')).toEqual({
      'header.site-header': 'navbar index.html []',
      'section#hero': 'hero index.html []',
      'div.feature-grid': 'list index.html []',
      'section “Frequently asked”': 'section index.html []',
      'section.newsletter': 'form index.html []',
      footer: 'footer index.html []',
    })
  })

  it('reports a file that fails to parse without stopping the scan', () => {
    const { components, failed } = scanProject([
      { path: 'Broken.tsx', content: 'export function Broken( { return <div' },
      { path: 'Ok.tsx', content: 'export const Ok = () => <div />' },
    ])
    expect(failed.map(f => f.path)).toEqual(['Broken.tsx'])
    expect(components.map(c => c.name)).toEqual(['Ok'])
  })
})

describe('guessType', () => {
  it('lets the last matching word of the name win, then falls back to markup', () => {
    expect(guessType(splitWords('CardList'))).toBe('list')
    expect(guessType(splitWords('FAQ'))).toBe('section')
    expect(guessType(splitWords('Thing'), { rootTag: 'nav' })).toBe('navbar')
    expect(guessType(splitWords('Thing'), { rendersList: true })).toBe('list')
    expect(guessType(splitWords('Thing'))).toBe('other')
  })
})

it('ignores build output and dependencies', () => {
  expect(isWanted('src/App.tsx')).toBe(true)
  expect(isWanted('node_modules/react/index.js')).toBe(false)
  expect(isWanted('packages/web/.next/page.js')).toBe(false)
  expect(isWanted('README.md')).toBe(false)
})

describe('static trees, rendering and current pages', () => {
  const { components } = scanProject(readSample('sample-react-app'))
  const byName = (name: string) => components.find(c => c.name === name)!

  it('lists the inner elements of a component', () => {
    expect(elementsOf(byName('Hero').tree).map(e => `${e.path} ${e.label}`)).toEqual([
      '0 h1 “{title}”',
      '1 p “{subtitle}”',
      '2 button.btn-primary “{ctaLabel}”',
      '3 img',
    ])
  })

  it('renders nested components with the string props the parent passes', () => {
    const html = renderHtml(byName('/').tree!, components)
    expect(html).toContain('<h1 class="font-display text-5xl font-bold tracking-tight">Ship faster</h1><p class="mt-4 text-lg text-gray-600">The toolkit for small teams</p><button class="btn-primary mt-8">Start free</button>')
    expect(html).toContain('<h2 class="text-2xl font-bold">What people say</h2><ul><li><span class="sk-expr">q.text</span></li></ul>')
  })

  it('never renders live links, scripts, or unescaped text', () => {
    const tree = { t: 'el', tag: 'div', children: [
      { t: 'el', tag: 'a', attrs: { href: 'javascript:alert(1)' }, children: [{ t: 'text', v: '<b>&' }] },
      { t: 'el', tag: 'script', children: [{ t: 'text', v: 'alert(1)' }] },
    ] } as const
    expect(renderHtml(tree as never, [])).toBe('<div><a href="#">&lt;b&gt;&amp;</a></div>')
  })

  it('rebuilds each route as sections wrapped in the root layout', () => {
    const NAV = 'Navbar {"logoSrc":"@asset:public/logo.svg"}'
    const FOOT = 'Footer {"year":"2026"}'
    const name = (id: string) => components.find(c => c.id === id)!.name
    const pages = buildCurrentPages(components).map(p => ({
      name: p.name,
      blocks: p.blocks.map(b => (b.kind === 'component' && b.props ? `${name(b.componentId)} ${JSON.stringify(b.props)}` : b.kind === 'element' ? `${name(b.componentId)}@${b.elementPath}` : b.kind === 'component' ? name(b.componentId) : b.placeholder)),
    }))
    expect(pages).toEqual([
      { name: 'Home', blocks: [NAV, 'Hero {"title":"Ship faster","subtitle":"The toolkit for small teams","ctaLabel":"Start free"}', 'PricingSection', '/@2', FOOT] },
      { name: 'About', blocks: [NAV, 'Navbar', '/about@1', FOOT] },
      { name: 'PricingPage', blocks: [NAV, 'PricingSection', FOOT] },
    ])
  })
})

describe('detailed previews', () => {
  const scan = scanProject(readSample('sample-react-app'))
  const { components, assets, styles } = scan
  const home = buildCurrentPages(components)[0]
  const block = (name: string) => {
    const item = home.blocks.find(b => b.kind !== 'placeholder' && components.find(c => c.id === b.componentId)?.name === name)!
    return { id: 'x', x: 0, y: 0, w: 1440, notes: '', ...item } as Block
  }

  it('keeps the wrappers a section sat in on the page', () => {
    const html = renderBlock(block('Hero'), components, assets)!
    expect(html.startsWith('<div class="bg-gray-50 text-gray-900" data-sk-frame><main class="mx-auto max-w-5xl px-6" data-sk-frame><section class="hero-bg py-24 text-center">')).toBe(true)
  })

  it('shows imported, public and prop-passed images', () => {
    expect(renderBlock(block('Hero'), components, assets)).toContain(`<img class="mx-auto mt-12 w-80" src="${assets['src/assets/hero.svg']}" alt="" data-sk="3">`)
    expect(renderBlock(block('Navbar'), components, assets)).toContain(`src="${assets['public/logo.svg']}"`)
    expect(styles.find(s => s.path === 'app/globals.css')!.content).toContain(`url("${assets['public/logo.svg']}")`)
  })

  it('renders inline SVG icons with valid attribute names', () => {
    expect(renderBlock(block('Footer'), components, assets)).toContain('<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" data-sk="0">')
  })

  it('tags the block\'s own elements for the in-preview editor, not nested internals', () => {
    const html = renderBlock(block('Hero'), components, assets)!
    expect(html).toContain('<h1 class="font-display text-5xl font-bold tracking-tight" data-sk="0">')
    expect(html).not.toContain('data-sk=""')
  })

  it('pulls font stylesheets linked from HTML', () => {
    const html = scanProject(readSample('sample-html-site'))
    expect(html.styles[0].content).toBe('@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap");')
  })
})

describe('tree edits', () => {
  const t = (tag: string, ...children: StaticNode[]): StaticNode => ({ t: 'el', tag, children })
  const tags = (n: StaticNode): string =>
    n.t === 'el' ? (n.children.length ? `${n.tag}(${n.children.map(tags).join(',')})` : n.tag) : '?'
  const hero = t('section', t('h1'), t('p'), t('div', t('button'), t('a')))

  it('moves within a parent, in both directions', () => {
    expect(tags(moveNode(hero, '0', '1', true))).toBe('section(p,h1,div(button,a))')
    expect(tags(moveNode(hero, '2', '0', false))).toBe('section(div(button,a),h1,p)')
  })

  it('moves across parents, adjusting for the removed node', () => {
    expect(tags(moveNode(hero, '0', '2.1', false))).toBe('section(p,div(button,h1,a))')
    expect(tags(moveNode(hero, '2.0', '0', false))).toBe('section(button,h1,p,div(a))')
  })

  it('refuses to move a node into itself', () => {
    expect(moveNode(hero, '2', '2.0', true)).toBe(hero)
  })

  it('moves into a container, including from an earlier sibling and to the root', () => {
    const withEmpty = t('section', t('h1'), t('div'), t('p'))
    expect(tags(moveInto(withEmpty, '0', '1'))).toBe('section(div(h1),p)')
    expect(tags(moveInto(withEmpty, '2', '1'))).toBe('section(h1,div(p))')
    expect(tags(moveInto(hero, '2.0', ''))).toBe('section(h1,p,div(a),button)')
    expect(moveInto(hero, '2', '2.0')).toBe(hero)
  })

  it('sets and clears free-form offsets without touching structure', async () => {
    const { setOffset, withoutOffsets } = await import('./treeEdit')
    const moved = setOffset(hero, '2.1', { x: 12.4, y: -8 })
    expect((moved as { children: { children: { offset?: unknown }[] }[] }).children[2].children[1].offset).toEqual({ x: 12, y: -8 })
    expect(withoutOffsets(moved)).toEqual(withoutOffsets(hero))
    expect(setOffset(moved, '2.1', { x: 0, y: 0 })).toEqual(hero)
  })

  it('nudges and removes', () => {
    expect(tags(nudgeNode(hero, '1', -1))).toBe('section(p,h1,div(button,a))')
    expect(nudgeNode(hero, '0', -1)).toBe(hero)
    expect(tags(removeNode(hero, '2.0'))).toBe('section(h1,p,div(a))')
  })
})

describe('Create React App + React Router sites', () => {
  const files = [
    { path: 'src/App.js', content: `import Home from './pages/Home'
import Schedule from './pages/Schedule'
import Nav from './components/Navbar'
import Footer from './components/Footer'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom'
function App() {
  const [loading] = useState(true)
  if (loading) return <div className="loading-screen"><div className="loader" /></div>
  return (
    <div className="App">
      <Router>
        <Nav />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<Home />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/team/:id" element={<Schedule />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <Footer />
      </Router>
    </div>
  )
}
export default App` },
    { path: 'src/pages/Home.js', content: `import Puck from '../components/Hero'
export default function Home() { return <div className="home"><Puck /><div className="white-section"><p>About us</p></div></div> }` },
    { path: 'src/pages/Schedule.js', content: `export default function Schedule() { return <section className="schedule">Games</section> }` },
    { path: 'src/components/Hero.js', content: `function Hero() { return <div className="hero"><h1>Club Hockey</h1></div> }\nexport default Hero` },
    { path: 'src/components/Navbar.js', content: `export default function Navbar() { return <nav>Menu</nav> }` },
    { path: 'src/components/Footer.js', content: `export default function Footer() { return <footer>©</footer> }` },
  ]
  const { components } = scanProject(files)
  const pages = buildCurrentPages(components)
  const name = (id: string) => components.find(c => c.id === id)!.name

  it('uses the main render, not an early loading return', () => {
    const app = components.find(c => c.name === 'App')!
    expect(app.tree).toMatchObject({ t: 'el', tag: 'div', cls: 'App' })
  })

  it('makes one page per route, inside the App shell, skipping aliases, 404s and dynamic routes', () => {
    expect(pages.map(p => ({ name: p.name, blocks: p.blocks.map(b => (b.kind === 'element' ? `${name(b.componentId)}@${b.elementPath}` : b.kind === 'component' ? name(b.componentId) : '')) }))).toEqual([
      { name: 'Home', blocks: ['Navbar', 'Hero', 'Home@1', 'Footer'] },
      { name: 'Schedule', blocks: ['Navbar', 'Schedule', 'Footer'] },
    ])
  })

  it('finds components imported under another name, inside the page wrappers', () => {
    const hero = { id: 'x', x: 0, y: 0, w: 1440, notes: '', ...pages[0].blocks[1] } as Block
    expect(renderBlock(hero, components, {})).toBe('<div class="App" data-sk-frame><div class="home" data-sk-frame><div class="hero"><h1 data-sk="0">Club Hockey</h1></div></div></div>')
  })
})
