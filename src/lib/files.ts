import type { SourceFile } from '../types'

const IGNORED_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.next', 'out', 'coverage', '.vercel'])
const TEXT_EXT = /\.(jsx?|tsx?|mjs|cjs|html?|css|scss)$/i
const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|avif|ico)$/i
const MAX_TEXT_BYTES = 500_000
export const MAX_IMAGE_BYTES = 1_500_000

export interface ReadResult {
  /** Text files as text; images as data URLs (used by previews). */
  files: SourceFile[]
  skipped: string[] // wanted extension, but too large
}

export const isImage = (path: string) => IMAGE_EXT.test(path)

/** Path-level filter shared by every import source (folder picker, drag-drop, GitHub). */
export const isWanted = (path: string) =>
  (TEXT_EXT.test(path) || IMAGE_EXT.test(path)) && !path.split('/').some(part => IGNORED_DIRS.has(part))

/** Strip the picked folder's own name so paths read like `src/App.tsx`. */
const stripRoot = (paths: string[]) => {
  const first = paths[0]?.split('/')[0]
  return first && paths.every(p => p.startsWith(first + '/')) ? paths.map(p => p.slice(first.length + 1)) : paths
}

const dataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

async function readAll(entries: { path: string; file: File }[]): Promise<ReadResult> {
  const wanted = entries.filter(e => isWanted(e.path))
  const paths = stripRoot(wanted.map(e => e.path))
  const skipped: string[] = []
  const files: SourceFile[] = []
  await Promise.all(wanted.map(async (e, i) => {
    const image = isImage(paths[i])
    if (e.file.size > (image ? MAX_IMAGE_BYTES : MAX_TEXT_BYTES)) skipped.push(paths[i])
    else files.push({ path: paths[i], content: image ? await dataUrl(e.file) : await e.file.text() })
  }))
  files.sort((a, b) => a.path.localeCompare(b.path))
  return { files, skipped }
}

/** From `<input webkitdirectory>`. */
export const readFileList = (list: FileList) =>
  readAll([...list].map(file => ({ path: file.webkitRelativePath || file.name, file })))

/** From a drop event. Walks directory entries so ignored folders are never opened. */
export async function readDataTransfer(dt: DataTransfer): Promise<ReadResult> {
  const roots = [...dt.items].map(i => i.webkitGetAsEntry()).filter((e): e is FileSystemEntry => !!e)
  const out: { path: string; file: File }[] = []

  const walk = async (entry: FileSystemEntry, path: string): Promise<void> => {
    if (entry.isFile) {
      if (!isWanted(path)) return
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej))
      out.push({ path, file })
      return
    }
    if (IGNORED_DIRS.has(entry.name)) return
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    // readEntries returns batches (~100 in Chrome); keep reading until it returns none.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej))
      if (!batch.length) break
      await Promise.all(batch.map(child => walk(child, `${path}/${child.name}`)))
    }
  }

  await Promise.all(roots.map(r => walk(r, r.name)))
  return readAll(out)
}
