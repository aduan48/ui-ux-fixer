import { expect, it } from 'vitest'
import type { BrandToken } from '../types'
import { placeholderHtml } from './placeholders'

const tokens: BrandToken[] = [
  { id: '1', kind: 'color', value: '#4f46e5', count: 3, roles: ['primary'] },
  { id: '2', kind: 'font', value: 'Playfair Display', count: 2, roles: ['heading'] },
  { id: '3', kind: 'radius', value: '12px', count: 1 },
]

it('styles NEW blocks with the brand roles', () => {
  const button = placeholderHtml('button', tokens)
  expect(button).toContain('background:#4f46e5;color:#ffffff;border-radius:12px')
  expect(placeholderHtml('text', tokens)).toContain('<h2 style="font-family:Playfair Display;">')
})

it('keeps its own defaults in a cascade layer, so the project\'s CSS wins', () => {
  const text = placeholderHtml('text', [])
  expect(text).toMatch(/^<style>@layer sk-new\{h2\{/)
  expect(text).toContain('<h2>A clear section heading</h2>')
})

it('falls back to neutral styles without tokens, and never lets a token value break out of the attribute', () => {
  expect(placeholderHtml('button', [])).toContain('background:#111827')
  expect(placeholderHtml('button', [{ ...tokens[0], value: '"><script>x</script>' }])).not.toContain('<script')
})
