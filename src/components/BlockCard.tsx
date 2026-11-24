import { Check, ImageIcon, MessageSquareText, MousePointer2, RotateCcw, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { placeholderMeta } from '../lib/catalog'
import { labelAt, renderBlock } from '../lib/render'
import { useStore } from '../store'
import type { Block, PlaceholderType } from '../types'
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
  const selected = useStore(s => s.selectedBlockId === block.id)
  const editing = useStore(s => s.editingBlockId === block.id)
  const editMode = useStore(s => s.editMode)
  const components = useStore(s => s.project.components)
  const assets = useStore(s => s.project.assets)
  const { selectBlock, deleteBlock, startEditing, stopEditing, resetBlockTree } = useStore.getState()
  const title = useBlockTitle(block)
  const html = useMemo(() => renderBlock(block, components, assets), [block, components, assets])

  const ring = editing ? 'ring-2 ring-violet-500' : selected ? 'ring-2 ring-blue-500' : 'group-hover:ring-1 group-hover:ring-blue-400'
  const chrome = selected || editing ? 'flex' : 'hidden group-hover:flex'

  return (
    <div
      style={{ left: placed.x, top: placed.y, width: placed.w }}
      // select-none: a double-click (enter editing) must not select the iframe as text, which greys it and hijacks the next drag
      className={`group absolute select-none ${selected || editing ? 'z-10' : 'hover:z-10'}`}
    >
      <div
        onClick={e => { e.stopPropagation(); selectBlock(block.id) }}
        onDoubleClick={() => html && startEditing(block.id)}
        aria-label={`${title} block`}
        style={{ height: block.height }}
        className="relative overflow-hidden bg-white"
      >
        {block.kind === 'placeholder' ? (
          <PlaceholderBlock type={block.placeholder!} />
        ) : html ? (
          <Preview blockId={block.id} html={html} width={placed.w} editable={editing} />
        ) : (
          <div className="m-2 rounded-md border-2 border-dashed border-red-300 bg-red-50 px-4 py-6 text-center text-xs text-red-700">
            {title}. Re-import the project to bring it back.
          </div>
        )}
      </div>

      {/* Outline drawn on top so it never shifts the layout. */}
      <div className={`pointer-events-none absolute inset-0 ${ring}`} />

      {/* Name chip */}
      <div className={`pointer-events-none absolute top-0 left-0 max-w-[60%] origin-top-left [scale:calc(1/var(--zoom,1))] items-center gap-1 rounded-br-md px-1.5 py-0.5 text-[11px] font-medium text-white ${editing ? 'flex bg-violet-500' : `${chrome} bg-blue-500`}`}>
        <span className="truncate">{title}</span>
        {block.tree && <span className="shrink-0 opacity-75">· edited</span>}
      </div>
      {block.notes && (
        <div className="pointer-events-none absolute top-1 right-1 rounded-full bg-blue-500 p-1 text-white shadow group-hover:hidden" aria-label="Has notes">
          <MessageSquareText className="size-3" />
        </div>
      )}

      {/* Toolbar: outside the drag listeners so its clicks never start a drag. */}
      <div onClick={e => e.stopPropagation()} className={`absolute top-1 right-1 origin-top-right [scale:calc(1/var(--zoom,1))] items-center gap-0.5 rounded-md border border-neutral-200 bg-white p-0.5 shadow-sm ${chrome}`}>
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
            {html && <ToolButton onClick={() => startEditing(block.id)} icon={MousePointer2} label="Edit inside" />}
            <button onClick={() => deleteBlock(block.id)} aria-label="Delete block" className="rounded p-1 text-neutral-500 hover:bg-red-50 hover:text-red-600">
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

/** New blocks (not in the codebase yet): neutral stand-ins at page scale, outlined in amber. */
function PlaceholderBlock({ type }: { type: PlaceholderType }) {
  const line = 'rounded-full bg-neutral-200'
  return (
    <div className="relative bg-neutral-50 outline-2 -outline-offset-2 outline-amber-300 outline-dashed">
      <span className="absolute top-1.5 right-1.5 rounded bg-amber-100 px-1.5 text-[10px] font-semibold tracking-wide text-amber-700">NEW</span>
      {type === 'text' && (
        <div className="space-y-2.5 px-[6%] py-8">
          <div className={`${line} h-4 w-2/5 bg-neutral-300`} />
          <div className={`${line} h-2.5 w-full`} />
          <div className={`${line} h-2.5 w-11/12`} />
          <div className={`${line} h-2.5 w-3/4`} />
        </div>
      )}
      {type === 'image' && (
        <div className="grid aspect-[16/7] place-items-center text-neutral-300">
          <ImageIcon className="size-10" strokeWidth={1.25} />
        </div>
      )}
      {type === 'button' && (
        <div className="px-[6%] py-6">
          <div className="h-9 w-32 rounded-md bg-neutral-800" />
        </div>
      )}
      {type === 'spacer' && <div className="h-16" />}
      {type === 'columns' && (
        <div className="grid grid-cols-3 gap-4 px-[6%] py-8">
          {[0, 1, 2].map(i => (
            <div key={i} className="space-y-2 rounded-lg border border-neutral-200 bg-white p-4">
              <div className="h-16 rounded bg-neutral-100" />
              <div className={`${line} h-2.5 w-3/4 bg-neutral-300`} />
              <div className={`${line} h-2 w-full`} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
