import type { BrandToken } from '../types'

/** Relative luminance (0 black … 1 white) of a hex or rgb() colour; undefined for other formats. */
export function luminance(c: string): number | undefined {
  const hex = c.trim().match(/^#([0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-f])/i) // 6 first: "#4f46e5" must not match as "#4f4"
  let rgb: number[] | undefined
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map(x => x + x).join('') : hex[1]
    rgb = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
  } else if (/^rgba?\(/i.test(c.trim())) rgb = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
  if (!rgb || rgb.length < 3) return
  const [r, g, b] = rgb.map(v => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * The site's dark tone, used behind light content that has no background of its own:
 * the primary colour if it's dark, else the most-used dark brand colour, else near-black.
 */
export function backdropColor(tokens: BrandToken[]): string {
  const colors = tokens.filter(t => t.kind === 'color')
  const ranked = [...colors.filter(t => t.roles?.includes('primary')), ...colors.filter(t => t.roles?.includes('accent')), ...colors]
  return ranked.find(t => (luminance(t.value) ?? 1) < 0.08)?.value ?? '#111827'
}
