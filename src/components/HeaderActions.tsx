import { FileDown, FolderOpen, Sparkles, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { downloadText } from '../lib/download'
import { parseProjectFile, serializeProject } from '../lib/projectFile'
import { useStore } from '../store'
import { ExportModal } from './ExportModal'
import { ImportDialog } from './ImportDialog'

const ghost = 'flex items-center gap-1.5 rounded-md border border-neutral-200 px-2.5 py-1 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50'

export function HeaderActions({ importing, setImporting }: { importing: boolean; setImporting: (v: boolean) => void }) {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const save = () => {
    const { project } = useStore.getState()
    const name = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sketchkit'
    downloadText(`${name}.sketchkit.json`, serializeProject(project), 'application/json')
  }

  const open = async (file: File) => {
    setError('')
    try {
      const project = parseProjectFile(await file.text())
      const current = useStore.getState().project
      const hasWork = current.pages.some(p => p.blocks.length || p.notes) || current.globalNotes
      if (hasWork && !confirm(`Open "${project.name}"? It replaces "${current.name}" and its sketch. Save first if you want to keep it.`)) return
      useStore.getState().loadProject(project)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setTimeout(() => setError(''), 6000)
    }
  }

  return (
    <div className="ml-auto flex items-center gap-2">
      {error && <span role="alert" className="max-w-xs truncate text-xs text-red-600" title={error}>{error}</span>}
      <button onClick={() => setImporting(true)} className={ghost} title="Scan a project folder for components and brand">
        <Upload className="size-3.5" /> Import code
      </button>
      <button onClick={() => fileRef.current?.click()} className={ghost} title="Open a saved .sketchkit.json">
        <FolderOpen className="size-3.5" /> Open
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) open(f)
          e.target.value = ''
        }}
      />
      <button onClick={save} className={ghost} title="Download this sketch as a .sketchkit.json file">
        <FileDown className="size-3.5" /> Save
      </button>
      <button
        onClick={() => setExporting(true)}
        className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-1 text-[13px] font-medium text-white hover:bg-neutral-700"
      >
        <Sparkles className="size-3.5" /> Export prompt
      </button>
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
      {exporting && <ExportModal onClose={() => setExporting(false)} />}
    </div>
  )
}
