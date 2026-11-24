// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isImage, isWanted } from './files'
import { extractTokens, firstFont, isNeutral, normalizeColor, readTailwindConfig } from './tokens'

const readSample = (name: string) => {
  const root = join(__dirname, '../../samples', name)
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => relative(root, join(e.parentPath, e.name)))
    .filter(p => isWanted(p) && !isImage(p))
    .map(path => ({ path, content: readFileSync(join(root, path), 'utf8') }))
}

describe('extractTokens on the React sample', () => {
  const { tokens, themeCss } = extractTokens(readSample('sample-react-app'))
  const role = (r: string) => tokens.find(t => t.roles?.includes(r as never))?.value
  const values = (kind: string) => tokens.filter(t => t.kind === kind).map(t => t.value)

  it('picks the brand colours as primary and accent, not greys', () => {
    expect(role('primary')).toBe('#4f46e5')
    expect(role('accent')).toBe('#f59e0b')
    expect(values('color')).toContain('#eef2ff') // bg-brand-50 via tailwind.config
  })

  it('finds body and heading fonts from CSS, config and classes', () => {
    expect(role('body')).toBe('Inter')
    expect(role('heading')).toBe('Playfair Display')
  })

  it('resolves Tailwind classes through the config and the default theme', () => {
    expect(values('radius')).toContain('14px') // rounded-card
    expect(values('fontSize')).toEqual(expect.arrayContaining(['3rem', '1.125rem'])) // text-5xl, text-lg
    expect(values('spacing')).toContain('2rem') // p-8 / mt-8
  })

  it('ranks by use and names tokens after their variable or class', () => {
    const brand = tokens.find(t => t.value === '#4f46e5')!
    expect(brand.name).toContain('--brand')
    expect(brand.name).toContain('brand')
    expect(brand.count).toBeGreaterThan(1)
  })

  it('turns the config into a @theme block for previews', () => {
    expect(themeCss).toContain('--color-brand: #4f46e5;')
    expect(themeCss).toContain('--color-brand-50: #eef2ff;')
    expect(themeCss).toContain('--radius-card: 14px;')
    expect(themeCss).toContain(`--font-display: "Playfair Display";`)
  })
})

it('reads Google Fonts linked from HTML, and uses a lone font for headings and body', () => {
  const { tokens } = extractTokens(readSample('sample-html-site'))
  const font = tokens.find(t => t.kind === 'font')!
  expect(font.value).toBe('Inter')
  expect(font.roles).toEqual(['body', 'heading'])
})

it('reads module.exports, export default and satisfies configs alike', () => {
  for (const src of [
    `module.exports = { theme: { colors: { ink: '#111' } } }`,
    `export default { theme: { extend: { colors: { ink: '#111' } } } }`,
    `import type { Config } from 'tailwindcss'\nexport default { theme: { extend: { colors: { ink: '#111' } } } } satisfies Config`,
  ]) expect(readTailwindConfig(src).colors.get('ink')).toBe('#111')
})

it('normalises colours, spots neutrals, and picks the first real font', () => {
  expect(normalizeColor('#ABC')).toBe('#aabbcc')
  expect(normalizeColor('#4F46E5FF')).toBe('#4f46e5')
  expect(normalizeColor('rgb( 1 ,2,3 )')).toBe('rgb(1, 2, 3)')
  expect(isNeutral('#f5f5f5')).toBe(true)
  expect(isNeutral('#111827')).toBe(true)
  expect(isNeutral('#4f46e5')).toBe(false)
  expect(isNeutral('oklch(51.1% 0.262 276.966)')).toBe(false)
  expect(firstFont(`var(--font-x), "Inter", system-ui, sans-serif`)).toBe('Inter')
  expect(firstFont('system-ui, sans-serif')).toBeUndefined()
})

it('picks an accent that differs in hue from the primary, not a darker shade of it', () => {
  const { tokens } = extractTokens([{ path: 'a.css', content: `:root { --primary: #002877; --darker-primary: #021a4a; --highlight: #f8bd0d; }
    .a { color: var(--primary); background: var(--darker-primary); border-color: var(--darker-primary) } .b { color: var(--highlight) }` }])
  expect(tokens.find(t => t.roles?.includes('primary'))?.value).toBe('#021a4a')
  expect(tokens.find(t => t.roles?.includes('accent'))?.value).toBe('#f8bd0d')
})
