import { Check, Copy, Download, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { downloadBlob, downloadText } from '../lib/download'
import { buildPrompt, pageImageName, promptFileName } from '../lib/prompt'
import { useStore } from '../store'

export function ExportModal({ onClose }: { onClose: () => void }) {
  const project = useStore(s => s.project)
  const measured = useStore(s => s.measured)
  const prompt = useMemo(() => buildPrompt(project, measured), [project, measured])
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle')
  const [saving, setSaving] = useState<'idle' | 'busy' | 'failed'>('idle')

  /** One .zip: the brief plus a PNG of each sketched page (one file, so browsers can't drop any of it). */
  const download = async () => {
    setSaving('busy')
    const files: Record<string, Uint8Array> = {}
    const imaged = new Set<string>()
    try {
      const [{ pagePng }, { strToU8, zipSync }] = await Promise.all([import('../lib/snapshot'), import('fflate')])
      // One page at a time: each block runs its own Tailwind compiler, so all pages at once can overload a laptop.
      for (const page of project.pages) {
        const png = await pagePng(page, project).catch(() => undefined)
        if (!png) continue
        files[pageImageName(project, page)] = new Uint8Array(await png.arrayBuffer())
        imaged.add(page.id)
      }
      files[promptFileName(project)] = strToU8(buildPrompt(project, measured, imaged))
      downloadBlob(promptFileName(project).replace(/\.md$/, '.zip'), new Blob([zipSync(files)], { type: 'application/zip' }))
      setSaving(project.pages.every(p => !p.blocks.length || imaged.has(p.id)) ? 'idle' : 'failed')
    } catch {
      // Couldn't load the renderer or the zip library: still save the brief on its own.
      downloadText(promptFileName(project), prompt, 'text/markdown')
      setSaving('failed')
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied('done')
    } catch {
      setCopied('failed') // e.g. clipboard permission denied: the text is still selectable below
    }
    setTimeout(() => setCopied('idle'), 2000)
  }

  const hasContent = project.pages.some(p => p.blocks.length)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-900/20 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-neutral-200 bg-white shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-neutral-200 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 id="export-title" className="text-sm font-semibold">Prompt for your coding agent</h2>
            <p className="text-xs text-neutral-500">
              Paste it into Claude Code (or any coding agent) in this project's repo. ~{Math.round(prompt.length / 4).toLocaleString()} tokens.
            </p>
          </div>
          <button
            autoFocus
            onClick={copy}
            className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-neutral-700"
          >
            {copied === 'done' ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied === 'done' ? 'Copied' : copied === 'failed' ? 'Copy failed, select below' : 'Copy'}
          </button>
          <button
            onClick={download}
            disabled={saving === 'busy'}
            className="flex items-center gap-1.5 rounded-md border border-neutral-200 px-3 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
          >
            <Download className="size-3.5" /> {saving === 'busy' ? 'Rendering pages…' : 'Download .zip with images'}
          </button>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-neutral-500 hover:bg-neutral-100">
            <X className="size-4" />
          </button>
        </div>
        {saving === 'failed' && (
          <p className="mx-4 mt-3 rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
            Some page images couldn't be rendered. The brief was saved without them.
          </p>
        )}
        {!hasContent && (
          <p className="mx-4 mt-3 rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
            Your pages are empty, so the prompt only has the brand rules. Import a project or add blocks first.
          </p>
        )}
        <textarea
          readOnly
          value={prompt}
          aria-label="Generated prompt"
          spellCheck={false}
          className="m-4 min-h-[50vh] flex-1 resize-none rounded-md border border-neutral-200 bg-neutral-50 p-3 font-mono text-[12px] leading-relaxed text-neutral-800 focus:outline-2 focus:outline-blue-500"
        />
      </div>
    </div>
  )
}
