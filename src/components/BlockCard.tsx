import { Check, MoveVertical, MessageSquareText, MousePointer2, RotateCcw, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { placeholderMeta } from '../lib/catalog'
import { placeholderHtml } from '../lib/placeholders'
import { labelAt, renderBlock } from '../lib/render'
import { useStore } from '../store'
import type { Block } from '../types'
import { Preview } from './Preview'

export function useBlockTitle(block: Block | undefined) {
  const component = useStore(s => s.project.components.find(c => c.id === block?.componentId))
  if (!block) return ''
  if (block.kind === 'placeholder') return placeholderMeta(block.placeholder!).label
  if (!component) return 'Missing component'
  if (block.kind === 'element') return `${component.name} › ${labelAt(component.tree, block.elementPath!)?.label ?? 'element'}`
  return component.name
}

/** A block at its place on the page frame. `placed` carries the drawn position (computed on flow pages). */
export function BlockCard({ block, placed }: { block: Block; placed: Pick<Block, 'x' | 'y' | 'w'> }) {
  const selected = useStore(s => s.selectedIds.includes(block.id))
  const editing = useStore(s => s.editingBlockId === block.id)
  const editMode = useStore(s => s.editMode)
  const multi = useStore(s => s.selectedIds.length > 1)
  const components = useStore(s => s.project.components)
  const assets = useStore(s => s.project.assets)
  const tokens = useStore(s => s.project.tokens)
  const { deleteBlocks, updateBlock, startEditing, stopEditing, resetBlockTree } = useStore.getState()
  const title = useBlockTitle(block)
  const isNew = block.kind === 'placeholder'
  const html = useMemo(
    () => (isNew ? placeholderHtml(block.placeholder!, tokens) : renderBlock(block, components, assets)),
    [isNew, block, components, assets, tokens],
  )

  const ring = editing ? 'ring-2 ring-violet-500' : selected ? 'ring-2 ring-blue-500' : 'group-hover:ring-1 group-hover:ring-blue-400'
  // Hidden for a group selection: Moveable's group area covers the blocks, so the toolbar couldn't be clicked.
  const chrome = editing || (selected && !multi) ? 'flex' : multi ? 'hidden' : 'hidden group-hover:flex'

  return (
    <div
      data-block-id={block.id}
      data-editable={html && !isNew ? '' : undefined}
      style={{ left: placed.x, top: placed.y, width: placed.w, height: block.height }}
      // select-none: a double-click (enter editing) must not select the iframe as text, which greys it and hijacks the next drag
      // No z-index here: array order is the stacking order. The chip and toolbar lift themselves (z-20) instead.
      className="group absolute select-none"
    >
      <div
        aria-label={`${title} block`}
        className="relative h-full overflow-hidden bg-white"
      >
        {html ? (
          <Preview blockId={block.id} html={html} width={placed.w} editable={editing} />
        ) : (
          <div className="m-2 rounded-md border-2 border-dashed border-red-300 bg-red-50 px-4 py-6 text-center text-xs text-red-700">
            {title}. Re-import the project to bring it back.
          </div>
        )}
      </div>

      {/* NEW blocks: on brand, but marked as not built yet. */}
      {isNew && (
        <>
          <span className="pointer-events-none absolute right-1.5 bottom-1.5 z-20 origin-bottom-right [scale:calc(1/var(--zoom,1))] rounded bg-amber-100 px-1.5 text-[10px] font-semibold tracking-wide text-amber-700">NEW</span>
        </>
      )}
      {/* Outline drawn on top so it never shifts the layout. */}
      <div className={`pointer-events-none absolute inset-0 ${ring}`} />

      {/* Name chip */}
      <div className={`pointer-events-none absolute top-0 left-0 z-20 max-w-[60%] origin-top-left [scale:calc(1/var(--zoom,1))] items-center gap-1 rounded-br-md px-1.5 py-0.5 text-[11px] font-medium text-white ${editing ? 'flex bg-violet-500' : `${chrome} bg-blue-500`}`}>
        <span className="truncate">{title}</span>
        {block.tree && <span className="shrink-0 opacity-75">· edited</span>}
      </div>
      {block.notes && (
        <div className="pointer-events-none absolute top-1 right-1 rounded-full bg-blue-500 p-1 text-white shadow group-hover:hidden" aria-label="Has notes">
          <MessageSquareText className="size-3" />
        </div>
      )}

      {/* Toolbar: outside the drag listeners so its clicks never start a drag. */}
      <div onClick={e => e.stopPropagation()} className={`absolute top-1 right-1 z-20 origin-top-right [scale:calc(1/var(--zoom,1))] items-center gap-0.5 rounded-md border border-neutral-200 bg-white p-0.5 shadow-sm ${chrome}`}>
        {editing ? (
          <>
            <EditModeToggle />
            <span className="hidden px-1.5 text-[11px] text-neutral-500 xl:inline">
              {editMode === 'free' ? 'Drag anywhere · Shift locks direction · double-click resets' : 'Drag into place in the layout'} · Del removes
            </span>
            {block.tree && <ToolButton onClick={() => resetBlockTree(block.id)} icon={RotateCcw} label="Reset" />}
            <ToolButton onClick={stopEditing} icon={Check} label="Done" primary />
          </>
        ) : (
          <>
            {html && !isNew && <ToolButton onClick={() => startEditing(block.id)} icon={MousePointer2} label="Edit inside" />}
            {block.height && <ToolButton onClick={() => updateBlock(block.id, { height: undefined })} icon={MoveVertical} label="Fit height" />}
            <button onClick={() => deleteBlocks([block.id])} aria-label="Delete block" className="rounded p-1 text-neutral-500 hover:bg-red-50 hover:text-red-600">
              <Trash2 className="size-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function EditModeToggle() {
  const mode = useStore(s => s.editMode)
  const modes = [
    { id: 'free', label: 'Free move' },
    { id: 'reorder', label: 'Reorder' },
  ] as const
  return (
    <div role="radiogroup" aria-label="Drag mode" className="flex rounded bg-neutral-100 p-0.5">
      {modes.map(m => (
        <button
          key={m.id}
          role="radio"
          aria-checked={mode === m.id}
          onClick={() => useStore.getState().setEditMode(m.id)}
          className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${mode === m.id ? 'bg-white text-violet-700 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'}`}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}

function ToolButton({ onClick, icon: Icon, label, primary }: { onClick: () => void; icon: typeof Check; label: string; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${primary ? 'bg-violet-600 text-white hover:bg-violet-700' : 'text-neutral-700 hover:bg-neutral-100'}`}
    >
      <Icon className="size-3" /> {label}
    </button>
  )
}
