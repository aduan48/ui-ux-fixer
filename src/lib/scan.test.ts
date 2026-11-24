// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isWanted } from './files'
import { guessType, splitWords } from './guessType'
import { scanProject } from './scan'

const readSample = (name: string) => {
  const root = join(__dirname, '../../samples', name)
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => relative(root, join(e.parentPath, e.name)))
    .filter(isWanted)
    .map(path => ({ path, content: readFileSync(join(root, path), 'utf8') }))
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
