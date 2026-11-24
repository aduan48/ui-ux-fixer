import { useState } from 'react'
import { MAX_IMAGE_BYTES } from '../lib/files'
import { screenshotKey, screenshotOf } from '../lib/render'
import { useActivePage, useStore } from '../store'
import { useBlockTitle } from './BlockCard'
import { SectionLabel } from './ComponentBank'
import { Layers } from './Layers'

const textarea =
  'w-full resize-y rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-[13px] text-neutral-800 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20'

export function NotesPanel() {
  const page = useActivePage()
  const globalNotes = useStore(s => s.project.globalNotes)
  // Notes are per block, so they show for a single selection only.
  const selectedBlockId = useStore(s => (s.selectedIds.length === 1 ? s.selectedIds[0] : null))
  const block = page.blocks.find(b => b.id === selectedBlockId)
  const blockName = useBlockTitle(block)
  const assets = useStore(s => s.project.assets)
  const { updateBlock, setPageNotes, setGlobalNotes } = useStore.getState()

  return (
    <div className="p-3">
      <SectionLabel>Block</SectionLabel>
      {block ? (
        <>
          <p className="mb-2 truncate text-[13px] font-medium text-neutral-800">{blockName}</p>
          {block.kind !== 'placeholder' && !screenshotOf(block, assets) && (
            <>
              <h3 className="mb-1 text-xs text-neutral-500">Inside this block</h3>
              <Layers block={block} />
            </>
          )}
          <label className="mt-3 block">
            <span className="mb-1 block text-xs text-neutral-500">Notes</span>
            <textarea
              rows={3}
              className={textarea}
              value={block.notes}
              onChange={e => updateBlock(block.id, { notes: e.target.value })}
              placeholder="e.g. swap the image for a product video"
            />
          </label>
          {block.kind === 'component' && <ScreenshotField componentId={block.componentId!} />}
        </>
      ) : (
        <p className="text-xs text-neutral-400">Click a block to select it and add notes. Double-click to edit inside.</p>
      )}

      <SectionLabel>Page · {page.name}</SectionLabel>
      <textarea
        rows={4}
        aria-label="Page notes"
        className={textarea}
        value={page.notes}
        onChange={e => setPageNotes(e.target.value)}
        placeholder="e.g. this page should convert sign-ups"
      />

      <SectionLabel>Global</SectionLabel>
      <textarea
        rows={4}
        aria-label="Global notes"
        className={textarea}
        value={globalNotes}
        onChange={e => setGlobalNotes(e.target.value)}
        placeholder="e.g. make it feel more premium, mobile first"
      />
    </div>
  )
}

/** A screenshot that stands in for a component that doesn't render well (canvas, 3D, data-driven). */
function ScreenshotField({ componentId }: { componentId: string }) {
  const shot = useStore(s => s.project.assets[screenshotKey(componentId)])
  const [error, setError] = useState('')
  const { setScreenshot } = useStore.getState()

  const pick = (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_IMAGE_BYTES) return setError('That image is over 1.5 MB. Try a smaller one.')
    setError('')
    const reader = new FileReader()
    reader.onload = () => setScreenshot(componentId, reader.result as string)
    reader.readAsDataURL(file)
  }

  return (
    <div className="mt-3">
      <span className="mb-1 block text-xs text-neutral-500">Preview image</span>
      {shot ? (
        <div className="flex items-center gap-2">
          <img src={shot} alt="Attached screenshot" className="h-10 w-16 rounded border border-neutral-200 object-cover object-top" />
          <button onClick={() => setScreenshot(componentId, null)} className="text-[13px] text-neutral-600 hover:text-neutral-900 hover:underline">
            Remove
          </button>
        </div>
      ) : (
        <label className="inline-flex cursor-pointer rounded-md border border-neutral-200 px-2.5 py-1 text-[13px] text-neutral-700 hover:bg-neutral-50 focus-within:outline-2 focus-within:outline-blue-500">
          Use a screenshot…
          <input type="file" accept="image/*" className="sr-only" onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }} />
        </label>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <p className="mt-1 text-xs text-neutral-400">{shot ? 'Shown instead of the live render wherever this component is used.' : 'For components that don’t render well here.'}</p>
    </div>
  )
}
