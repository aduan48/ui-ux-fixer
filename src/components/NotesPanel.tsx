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
  const { updateBlock, setPageNotes, setGlobalNotes } = useStore.getState()

  return (
    <div className="p-3">
      <SectionLabel>Block</SectionLabel>
      {block ? (
        <>
          <p className="mb-2 truncate text-[13px] font-medium text-neutral-800">{blockName}</p>
          {block.kind !== 'placeholder' && (
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
