import type { ScannedComponent, SourceFile } from '../types'
import { scanHtmlFile } from './scanHtml'
import { scanReactFile } from './scanReact'

export interface ScanResult {
  components: ScannedComponent[]
  failed: { path: string; error: string }[]
}

/** Scan every file; one bad file is reported, never fatal. Import this module lazily (it pulls in Babel). */
export function scanProject(files: SourceFile[]): ScanResult {
  const components: ScannedComponent[] = []
  const failed: ScanResult['failed'] = []
  for (const file of files) {
    const scanner = /\.[mc]?[jt]sx?$/.test(file.path) ? scanReactFile : /\.html?$/.test(file.path) ? scanHtmlFile : null
    if (!scanner) continue
    try {
      components.push(...scanner(file))
    } catch (e) {
      failed.push({ path: file.path, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return { components, failed }
}
