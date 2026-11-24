import { useActivePage, useStore } from '../store'
import { SectionLabel } from './ComponentBank'

const textarea =
  'w-full resize-y rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-[13px] text-neutral-800 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20'

export function NotesPanel() {
  const page = useActivePage()
  const globalNotes = useStore(s => s.project.globalNotes)
  const selectedBlockId = useStore(s => s.selectedBlockId)
  const block = page.blocks.find(b => b.id === selectedBlockId)
  const blockName = useStore(s =>
    block?.kind === 'component'
      ? s.project.components.find(c => c.id === block.componentId)?.name
      : block?.placeholder,
  )
  const { updateBlock, setPageNotes, setGlobalNotes } = useStore.getState()

  return (
    <div className="p-3">
      <SectionLabel>Block</SectionLabel>
      {block ? (
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-500">Notes for <span className="font-medium capitalize text-neutral-700">{blockName}</span></span>
          <textarea
            rows={4}
            className={textarea}
            value={block.notes}
            onChange={e => updateBlock(block.id, { notes: e.target.value })}
            placeholder="e.g. swap the image for a product video"
          />
        </label>
      ) : (
        <p className="text-xs text-neutral-400">Select a block to add notes.</p>
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
