const normalize = (path: string) => {
  const out: string[] = []
  for (const part of path.split('/')) {
    if (part === '..') out.pop()
    else if (part && part !== '.') out.push(part)
  }
  return out.join('/')
}

const dirname = (path: string) => path.split('/').slice(0, -1).join('/')

/**
 * Resolve a reference found in `from` (an import, an `src`, a CSS `url()`) to a known
 * project file. Root-relative refs (`/logo.png`) check `public/` folders anywhere in the
 * project, so monorepos and nested apps work. Returns undefined for remote or unknown refs.
 */
export function resolveRef(from: string, ref: string, known: Set<string>): string | undefined {
  const clean = ref.split(/[?#]/)[0]
  if (!clean || /^(https?:|data:|blob:|\/\/)/.test(clean)) return
  if (clean.startsWith('/')) {
    const rel = clean.slice(1)
    if (known.has(rel)) return rel
    let best: string | undefined
    for (const p of known) if (p.endsWith(`public/${rel}`) && (!best || p.length < best.length)) best = p
    return best
  }
  const path = normalize(`${dirname(from)}/${clean}`)
  return known.has(path) ? path : undefined
}

export const ASSET_PREFIX = '@asset:'
