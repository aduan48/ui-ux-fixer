import type { ScannedComponent, SourceFile } from '../types'
import { isImage } from './files'
import { resolveRef } from './paths'
import { scanHtmlFile } from './scanHtml'
import { scanReactFile } from './scanReact'

export interface ScanResult {
  components: ScannedComponent[]
  failed: { path: string; error: string }[]
  /** CSS for previews: url()s to project images inlined, plus remote stylesheet links from HTML (fonts). */
  styles: SourceFile[]
  /** Images by path, as data URLs. */
  assets: Record<string, string>
}

/** Scan every file; one bad file is reported, never fatal. Import this module lazily (it pulls in Babel). */
export function scanProject(files: SourceFile[]): ScanResult {
  const assets = Object.fromEntries(files.filter(f => isImage(f.path)).map(f => [f.path, f.content]))
  const known = new Set(Object.keys(assets))
  const resolve = (from: string, ref: string) => resolveRef(from, ref, known)

  const components: ScannedComponent[] = []
  const failed: ScanResult['failed'] = []
  for (const file of files) {
    const scanner = /\.[mc]?[jt]sx?$/.test(file.path) ? scanReactFile : /\.html?$/.test(file.path) ? scanHtmlFile : null
    if (!scanner) continue
    try {
      components.push(...scanner(file, resolve))
    } catch (e) {
      failed.push({ path: file.path, error: e instanceof Error ? e.message : String(e) })
    }
  }

  const styles = files
    .filter(f => f.path.endsWith('.css'))
    .map(f => ({
      path: f.path,
      content: f.content.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, _q, ref: string) => {
        const path = resolve(f.path, ref)
        return path ? `url("${assets[path]}")` : m
      }),
    }))
  // <link rel="stylesheet" href="https://fonts.googleapis.com/..."> in HTML entry files.
  for (const f of files.filter(f => /\.html?$/.test(f.path))) {
    const links = [...f.content.matchAll(/<link\b[^>]*>/gi)]
      .map(m => m[0])
      .filter(tag => /rel=["']?stylesheet/i.test(tag))
      .map(tag => tag.match(/href=["']?(https:[^"'\s>]+)/i)?.[1]?.replace(/&amp;/g, "&"))
      .filter(Boolean)
    if (links.length) styles.unshift({ path: `${f.path} (links)`, content: links.map(h => `@import url("${h}");`).join('\n') })
  }

  return { components, failed, styles, assets }
}
