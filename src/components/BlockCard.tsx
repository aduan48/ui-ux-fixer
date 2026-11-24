import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, ImageIcon, MessageSquareText, MousePointer2, RotateCcw, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { placeholderMeta } from '../lib/catalog'
import { labelAt, renderBlock } from '../lib/render'
import { useStore } from '../store'
import type { Block, PlaceholderType } from '../types'
import { Preview } from './Preview'

const COL = 100 / 12
const PRESETS = [
  { width: 100, label: 'Full' },
  { width: 50, label: '1/2' },
  { width: 100 / 3, label: '1/3' },
]
const MIN_HEIGHT = 32

/** Snap to twelfths unless `free`; always between one column and full width. */
const clampWidth = (pct: number, free: boolean) =>
  Math.min(100, Math.max(COL, free ? pct : Math.round(pct / COL) * COL))

const widthLabel = (w: number) => {
  const cols = w / COL
  return Math.abs(cols - Math.round(cols)) < 0.01 ? `${Math.round(cols)}/12` : `${Math.round(w)}%`
}

export function useBlockTitle(block: Block | undefined) {
  const component = useStore(s => s.project.components.find(c => c.id === block?.componentId))
  if (!block) return ''
  if (block.kind === 'placeholder') return placeholderMeta(block.placeholder!).label
  if (!component) return 'Missing component'
  if (block.kind === 'element') return `${component.name} › ${labelAt(component.tree, block.elementPath!)?.label ?? 'element'}`
  return component.name
}

export function BlockCard({ block }: { block: Block }) {
  const selected = useStore(s => s.selectedBlockId === block.id)
  const editing = useStore(s => s.editingBlockId === block.id)
  const editMode = useStore(s => s.editMode)
  const components = useStore(s => s.project.components)
  const assets = useStore(s => s.project.assets)
  const { selectBlock, updateBlock, deleteBlock, startEditing, stopEditing, resetBlockTree } = useStore.getState()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id, disabled: editing })
  const title = useBlockTitle(block)
  const html = useMemo(() => renderBlock(block, components, assets), [block, components, assets])

  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [resizing, setResizing] = useState(false)

  /** Pointer-captured drag on a handle; the handle sits outside the dnd-kit listeners. */
  const startResize = (axis: 'x' | 'y') => (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    e.preventDefault()
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    const start = { x: e.clientX, y: e.clientY }
    const startWidth = wrapperRef.current!.getBoundingClientRect().width
    const containerWidth = wrapperRef.current!.parentElement!.clientWidth
    const startHeight = cardRef.current!.offsetHeight
    setResizing(true)
    handle.onpointermove = ev => {
      if (axis === 'x') updateBlock(block.id, { width: clampWidth(((startWidth + ev.clientX - start.x) / containerWidth) * 100, ev.shiftKey) })
      else updateBlock(block.id, { height: Math.max(MIN_HEIGHT, Math.round(startHeight + ev.clientY - start.y)) })
    }
    handle.onpointerup = handle.onpointercancel = () => {
      handle.onpointermove = handle.onpointerup = handle.onpointercancel = null
      setResizing(false)
    }
  }

  const keyResize = (axis: 'x' | 'y') => (e: React.KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1 }[e.key]
    if (!step) return
    e.preventDefault()
    if (axis === 'x') updateBlock(block.id, { width: clampWidth(block.width + step * COL, false) })
    else updateBlock(block.id, { height: Math.max(MIN_HEIGHT, (block.height ?? cardRef.current!.offsetHeight) + step * 16) })
  }

  const ring = editing ? 'ring-2 ring-violet-500' : selected ? 'ring-2 ring-blue-500' : 'group-hover:ring-1 group-hover:ring-blue-400'
  const chrome = selected || editing ? 'flex' : 'hidden group-hover:flex'

  return (
    <div
      ref={el => { setNodeRef(el); wrapperRef.current = el }}
      style={{ width: `${block.width}%`, transform: CSS.Translate.toString(transform), transition }}
      // select-none: a double-click (enter editing) must not select the iframe as text, which greys it and hijacks the next drag
      className={`group relative select-none ${isDragging ? 'z-20 opacity-60' : ''} ${selected || editing ? 'z-10' : 'hover:z-10'}`}
    >
      <div
        ref={cardRef}
        {...attributes}
        {...listeners}
        onClick={e => { e.stopPropagation(); selectBlock(block.id) }}
        onDoubleClick={() => html && startEditing(block.id)}
        aria-label={`${title} block`}
        style={{ height: block.height }}
        className={`relative overflow-hidden bg-white ${editing ? '' : 'cursor-grab active:cursor-grabbing'}`}
      >
        {block.kind === 'placeholder' ? (
          <PlaceholderBlock type={block.placeholder!} />
        ) : html ? (
          <Preview blockId={block.id} html={html} blockWidth={block.width} editable={editing} />
        ) : (
          <div className="m-2 rounded-md border-2 border-dashed border-red-300 bg-red-50 px-4 py-6 text-center text-xs text-red-700">
            {title}. Re-import the project to bring it back.
          </div>
        )}
      </div>

      {/* Outline drawn on top so it never shifts the layout. */}
      <div className={`pointer-events-none absolute inset-0 ${ring}`} />

      {/* Name chip */}
      <div className={`pointer-events-none absolute top-0 left-0 max-w-[60%] items-center gap-1 rounded-br-md px-1.5 py-0.5 text-[11px] font-medium text-white ${editing ? 'flex bg-violet-500' : `${chrome} bg-blue-500`}`}>
        <span className="truncate">{title}</span>
        {block.tree && <span className="shrink-0 opacity-75">· edited</span>}
      </div>
      {block.notes && (
        <div className="pointer-events-none absolute top-1 right-1 rounded-full bg-blue-500 p-1 text-white shadow group-hover:hidden" aria-label="Has notes">
          <MessageSquareText className="size-3" />
        </div>
      )}

      {/* Toolbar: outside the drag listeners so its clicks never start a drag. */}
      <div onClick={e => e.stopPropagation()} className={`absolute top-1 right-1 items-center gap-0.5 rounded-md border border-neutral-200 bg-white p-0.5 shadow-sm ${chrome}`}>
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
            <span className="mx-0.5 h-4 w-px bg-neutral-200" />
            {PRESETS.map(p => {
              const on = Math.abs(block.width - p.width) < 0.01
              return (
                <button
                  key={p.label}
                  onClick={() => updateBlock(block.id, { width: p.width })}
                  aria-pressed={on}
                  className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${on ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}
                >
                  {p.label}
                </button>
              )
            })}
            <button onClick={() => deleteBlock(block.id)} aria-label="Delete block" className="rounded p-1 text-neutral-500 hover:bg-red-50 hover:text-red-600">
              <Trash2 className="size-3.5" />
            </button>
          </>
        )}
      </div>

      {!editing && (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize width (Shift for free size)"
            aria-valuenow={Math.round(block.width)}
            tabIndex={0}
            onPointerDown={startResize('x')}
            onKeyDown={keyResize('x')}
            onClick={e => e.stopPropagation()}
            className="absolute top-0 -right-1.5 bottom-0 z-10 flex w-3 cursor-ew-resize items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100"
          >
            <div className="h-10 w-1.5 rounded-full border border-white bg-blue-500 shadow" />
          </div>
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize height (double-click to fit content)"
            tabIndex={0}
            onPointerDown={startResize('y')}
            onKeyDown={keyResize('y')}
            onDoubleClick={() => updateBlock(block.id, { height: undefined })}
            onClick={e => e.stopPropagation()}
            className="absolute right-0 -bottom-1.5 left-0 z-10 flex h-3 cursor-ns-resize items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100"
          >
            <div className="h-1.5 w-10 rounded-full border border-white bg-blue-500 shadow" />
          </div>
        </>
      )}
      {resizing && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded bg-neutral-900 px-1.5 py-0.5 text-[11px] font-medium text-white">
          {widthLabel(block.width)}{block.height ? ` × ${block.height}px` : ''}
        </div>
      )}
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
