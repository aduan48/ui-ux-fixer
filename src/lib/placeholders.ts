import type { BrandToken, PlaceholderType, TokenRole } from '../types'
import { luminance } from './color'

/** Default widths (page px) for placeholders that aren't sections; the rest span the frame. */
export const PLACEHOLDER_WIDTHS: Partial<Record<PlaceholderType, number>> = { button: 280, image: 720 }

/**
 * Markup for a NEW block, rendered in the preview iframe like any component: the project's CSS styles
 * the elements, and the brand roles (heading/body font, primary color, radius) fill in the rest.
 */
export function placeholderHtml(type: PlaceholderType, tokens: BrandToken[]): string {
  // Token values are user-editable and go into style attributes: keep them to plain CSS values.
  const clean = (v: string | undefined) => v?.replace(/[<>"]/g, '')
  const role = (r: TokenRole) => clean(tokens.find(t => t.roles?.includes(r))?.value)
  const primary = role('primary') ?? '#111827'
  const radius = clean(tokens.find(t => t.kind === 'radius')?.value) ?? '8px'
  const heading = role('heading') ? `font-family:${role('heading')};` : ''
  const body = role('body') ? `font-family:${role('body')};` : ''
  const onPrimary = (luminance(primary) ?? 0) > 0.5 ? '#111827' : '#ffffff'
  const tint = `color-mix(in srgb, ${primary} 10%, #f5f5f5)`

  // Defaults sit in a cascade layer: declared last, it beats Tailwind's reset (layer `base`), but any unlayered
  // project rule (`h2 {…}`, `button {…}`) still wins. Only the brand roles are inline.
  const defaults = `<style>@layer sk-new{h2{font-size:2.25rem;font-weight:700;line-height:1.2;margin:0 0 12px}h3{font-size:1.25rem;font-weight:700;margin:0 0 8px}`
    + `p{margin:0;max-width:40em;opacity:.7;line-height:1.6}button{border:0;padding:12px 24px;font-size:1rem;font-weight:600;cursor:pointer}}</style>`
  const h = (tag: 'h2' | 'h3', text: string) => `<${tag}${heading && ` style="${heading}"`}>${text}</${tag}>`
  const p = (text: string) => `<p${body && ` style="${body}"`}>${text}</p>`

  switch (type) {
    case 'text':
      return `${defaults}<section style="padding:64px 6%;${body}">${h('h2', 'A clear section heading')}${p('One or two sentences of supporting copy that explain the idea and lead into what comes next.')}</section>`
    case 'image':
      return `<div style="aspect-ratio:16/9;border-radius:${radius};background:${tint};display:grid;place-items:center;color:${primary};opacity:.9">`
        + `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg></div>`
    case 'button':
      return `${defaults}<div style="padding:16px"><button style="${body}background:${primary};color:${onPrimary};border-radius:${radius}">Call to action</button></div>`
    case 'spacer':
      return '<div style="height:64px"></div>'
    case 'columns': {
      const card = `<div style="border:1px solid rgba(0,0,0,.08);border-radius:${radius};padding:24px;background:#fff">`
        + `<div style="aspect-ratio:4/3;border-radius:${radius};background:${tint};margin-bottom:16px"></div>`
        + `${h('h3', 'Card title')}${p('A short line about this item.')}</div>`
      return `${defaults}<section style="padding:64px 6%;display:grid;grid-template-columns:repeat(3,1fr);gap:24px">${card.repeat(3)}</section>`
    }
  }
}
