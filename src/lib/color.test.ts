import { expect, it } from 'vitest'
import type { BrandToken } from '../types'
import { backdropColor, luminance } from './color'
import { previewDoc } from './render'

const tok = (value: string, roles?: BrandToken['roles']): BrandToken => ({ id: value, kind: 'color', value, count: 1, roles })

it('measures luminance of hex and rgb colours', () => {
  expect(luminance('#ffffff')).toBeCloseTo(1)
  expect(luminance('#000')).toBe(0)
  expect(luminance('#4f46e5')).toBeCloseTo(0.117, 2) // six digits, not read as #4f4
  expect(luminance('rgb(0, 40, 119)')).toBeLessThan(0.05)
  expect(luminance('oklch(50% 0.1 200)')).toBeUndefined()
})

it('puts the site\'s dark tone behind light content', () => {
  expect(backdropColor([tok('#f8bd0d'), tok('#002877', ['primary'])])).toBe('#002877')
  expect(backdropColor([tok('#4f46e5', ['primary']), tok('#021a4a')])).toBe('#021a4a') // primary too light
  expect(backdropColor([tok('#ffffff')])).toBe('#111827')
})

it('never lets a token value close the preview script', () => {
  const doc = previewDoc('', [], 'tw.js', { backdrop: '</script><script>alert(1)//' })
  expect(doc).not.toContain('</script><script>alert(1)')
})

it('pins vh units to a fixed viewport so content-sized previews cannot grow forever', async () => {
  const { fixVh } = await import('./render')
  expect(fixVh('.a{height:60vh;min-height:100svh;margin:-2.5vh 0} .b{width:50vw}')).toBe('.a{height:480px;min-height:800px;margin:-20px 0} .b{width:50vw}')
  expect(fixVh('.c{background:url(data:image/png;base64,AB3vh/x9vh+)}')).toBe('.c{background:url(data:image/png;base64,AB3vh/x9vh+)}')
})

it('renders free-form offsets as a translate, merged with inline styles and passed through element-less wrappers', async () => {
  const { renderHtml } = await import('./render')
  const tree = {
    t: 'el', tag: 'div', children: [
      { t: 'el', tag: 'h1', offset: { x: 40, y: -24 }, children: [{ t: 'text', v: 'Hi' }] },
      { t: 'el', tag: 'p', attrs: { style: 'color:red' }, offset: { x: 0, y: 8 }, children: [] },
      { t: 'comp', name: 'Link', offset: { x: 4, y: 4 }, children: [{ t: 'el', tag: 'button', children: [] }] },
    ],
  }
  const html = renderHtml(tree as never, [])
  expect(html).toContain('<h1 style="translate:40px -24px;position:relative;z-index:1">Hi</h1>')
  expect(html).toContain('<p style="color:red;translate:0px 8px;position:relative;z-index:1"></p>')
  expect(html).toContain('<button style="translate:4px 4px;position:relative;z-index:1"></button>')
})
