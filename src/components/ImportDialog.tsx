import { FolderOpen, Loader2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { readDataTransfer, readFileList, type ReadResult } from '../lib/files'
import type { ScanResult } from '../lib/scan'
import { useStore } from '../store'

type Status =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done'; files: number; skipped: string[]; scan: ScanResult; pages: string[] }
  | { kind: 'confirm'; files: number; skipped: string[]; scan: ScanResult; source: string; replacing: string; tabs: string[] }
  | { kind: 'error'; message: string }

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [over, setOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const run = async (read: () => Promise<ReadResult>, source: string) => {
    setStatus({ kind: 'busy' })
    try {
      const { files, skipped } = await read()
      if (!files.some(f => !/\.(png|jpe?g|gif|svg|webp|avif|ico)$/i.test(f.path))) throw new Error('No .js, .jsx, .ts, .tsx, .html or .css files found in that folder.')
      const { scanProject } = await import('../lib/scan') // pulls in Babel only when needed
      const scan = scanProject(files)
      // Every import starts fresh (new tabs, blocks, notes, brand); ask first if there's work to lose.
      const current = useStore.getState().project
      const hasWork = current.pages.some(p => p.blocks.length || p.notes) || current.globalNotes
      if (hasWork) {
        setStatus({ kind: 'confirm', files: files.length, skipped, scan, source, replacing: current.name, tabs: current.pages.map(p => p.name) })
        return
      }
      apply(scan, source, files.length, skipped)
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  const apply = (scan: ScanResult, source: string, fileCount: number, skipped: string[]) => {
    useStore.getState().importScan(scan, source)
    const pages = useStore.getState().project.pages
    setStatus({ kind: 'done', files: fileCount, skipped, scan, pages: pages.some(p => p.blocks.length) ? pages.map(p => p.name) : [] })
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setOver(false)
    const dt = e.dataTransfer
    const name = dt.items[0]?.webkitGetAsEntry()?.name ?? 'Imported project'
    run(() => readDataTransfer(dt), name)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-900/20 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        className="w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <h2 id="import-title" className="text-sm font-semibold">Import project</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-neutral-500 hover:bg-neutral-100">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <div
            onDragOver={e => { e.preventDefault(); setOver(true) }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
            className={`grid place-items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center ${over ? 'border-blue-400 bg-blue-50' : 'border-neutral-200'}`}
          >
            {status.kind === 'busy' ? (
              <Loader2 className="size-5 animate-spin text-neutral-400" aria-label="Scanning" />
            ) : (
              <FolderOpen className="size-5 text-neutral-400" />
            )}
            <p className="text-[13px] text-neutral-600">Drop a project folder here</p>
            <button
              autoFocus
              onClick={() => inputRef.current?.click()}
              disabled={status.kind === 'busy'}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              Choose folder
            </button>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              // React's types don't know webkitdirectory; spread it in as a plain attribute.
              {...{ webkitdirectory: '' }}
              onChange={e => {
                const list = e.target.files
                if (list?.length) run(() => readFileList(list), list[0].webkitRelativePath.split('/')[0] || 'Imported project')
                e.target.value = '' // allow picking the same folder again
              }}
            />
            <p className="text-[11px] text-neutral-400">
              Read in your browser only, nothing is uploaded. Skips node_modules, dist, build, .git, .next.
            </p>
          </div>

          {status.kind === 'confirm' && (
            <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-900" role="alert">
              <p>
                Importing <b>{status.source}</b> replaces <b>{status.replacing}</b>. Its {status.tabs.length === 1 ? 'page' : 'pages'}{' '}
                ({status.tabs.join(', ')}), blocks, notes and brand edits will be removed and replaced with the imported site.
                Use <b>Save</b> first if you want to keep them.
              </p>
              <div className="flex gap-2">
                <button
                  autoFocus
                  onClick={() => apply(status.scan, status.source, status.files, status.skipped)}
                  className="rounded-md bg-amber-600 px-3 py-1.5 font-medium text-white hover:bg-amber-700"
                >
                  Replace and import
                </button>
                <button onClick={() => setStatus({ kind: 'idle' })} className="rounded-md border border-amber-300 px-3 py-1.5 font-medium hover:bg-amber-100">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {status.kind === 'error' && <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{status.message}</p>}

          {status.kind === 'done' && (
            <div className="space-y-2 text-[13px]">
              <p className="rounded-md bg-green-50 px-3 py-2 text-green-800">
                Found <b>{status.scan.components.length}</b> components in {status.files} files ({Object.keys(status.scan.assets).length} images, {status.scan.tokens.length} brand tokens).
              </p>
              {status.scan.failed.length > 0 && (
                <Details title={`${status.scan.failed.length} files could not be parsed`} items={status.scan.failed.map(f => `${f.path}: ${f.error}`)} />
              )}
              {status.skipped.length > 0 && <Details title={`${status.skipped.length} files skipped (over 500 KB)`} items={status.skipped} />}
              <p className="text-neutral-500">
                {status.pages.length
                  ? `Your site is on the canvas as ${status.pages.length === 1 ? '1 page' : `${status.pages.length} pages`} (${status.pages.join(', ')}), ready to redesign.`
                  : "Couldn't work out the site's pages, so you're starting from a blank Home page. Drag components in from the left."}
              </p>
              <button onClick={onClose} className="w-full rounded-md border border-neutral-200 py-1.5 font-medium hover:bg-neutral-50">
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const Details = ({ title, items }: { title: string; items: string[] }) => (
  <details className="rounded-md bg-amber-50 px-3 py-2 text-amber-800">
    <summary className="cursor-pointer">{title}</summary>
    <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto font-mono text-[11px]">
      {items.map(i => <li key={i}>{i}</li>)}
    </ul>
  </details>
)
