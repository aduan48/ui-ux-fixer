import { Check, Copy, Download, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { downloadText } from '../lib/download'
import { buildPrompt, promptFileName } from '../lib/prompt'
import { useStore } from '../store'

export function ExportModal({ onClose }: { onClose: () => void }) {
  const project = useStore(s => s.project)
  const measured = useStore(s => s.measured)
  const prompt = useMemo(() => buildPrompt(project, measured), [project, measured])
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle')

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
            onClick={() => downloadText(promptFileName(project), prompt, 'text/markdown')}
            className="flex items-center gap-1.5 rounded-md border border-neutral-200 px-3 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50"
          >
            <Download className="size-3.5" /> .md
          </button>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-neutral-500 hover:bg-neutral-100">
            <X className="size-4" />
          </button>
        </div>
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
