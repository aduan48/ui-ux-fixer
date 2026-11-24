import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { MessageSquareText, Trash2 } from 'lucide-react'
import { COMPONENT_TYPE_ICONS, placeholderMeta } from '../lib/catalog'
import { useStore } from '../store'
import type { Block, BlockWidth, PlaceholderType } from '../types'

// Widths subtract their share of the canvas's 0.75rem gap so rows fit exactly.
export const WIDTH_CLASS: Record<BlockWidth, string> = {
  full: 'w-full',
  half: 'w-[calc(50%-0.375rem)]',
  third: 'w-[calc(33.333%-0.5rem)]',
}

const WIDTHS: { value: BlockWidth; label: string }[] = [
  { value: 'full', label: 'Full' },
  { value: 'half', label: '1/2' },
  { value: 'third', label: '1/3' },
]

export function BlockCard({ block }: { block: Block }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })
  const selected = useStore(s => s.selectedBlockId === block.id)
  const component = useStore(s => s.project.components.find(c => c.id === block.componentId))
  const { selectBlock, updateBlock, deleteBlock } = useStore.getState()

  const Icon = block.kind === 'component'
    ? COMPONENT_TYPE_ICONS[component?.type ?? 'other']
    : placeholderMeta(block.placeholder!).icon
  const title = block.kind === 'component'
    ? component?.name ?? 'Missing component'
    : placeholderMeta(block.placeholder!).label

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`${WIDTH_CLASS[block.width]} group relative ${isDragging ? 'z-10 opacity-50' : ''}`}
    >
      <div
        {...attributes}
        {...listeners}
        onClick={e => { e.stopPropagation(); selectBlock(block.id) }}
        aria-label={`${title} block`}
        className={`cursor-grab rounded-lg border bg-white active:cursor-grabbing ${selected ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-neutral-300 hover:border-neutral-400'}`}
      >
        <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-1.5">
          <Icon className="size-3.5 shrink-0 text-neutral-500" />
          <span className="truncate text-xs font-medium text-neutral-700">{title}</span>
          {block.kind === 'component' && component && (
            <span className="truncate font-mono text-[11px] text-neutral-400">{component.filePath}</span>
          )}
          {block.kind === 'placeholder' && (
            <span className="rounded bg-amber-100 px-1.5 text-[10px] font-medium text-amber-700">NEW</span>
          )}
          {block.notes && <MessageSquareText className="size-3.5 shrink-0 text-blue-500" aria-label="Has notes" />}
        </div>
        <div className="p-3">
          {block.kind === 'placeholder' ? <Wireframe type={block.placeholder!} /> : <ComponentWireframe />}
        </div>
      </div>

      {/* Controls sit outside the drag handle so clicking them never starts a drag. */}
      <div onClick={e => e.stopPropagation()} className={`absolute top-1 right-1 flex items-center gap-1 rounded-md border border-neutral-200 bg-white p-0.5 shadow-sm ${selected ? 'flex' : 'hidden group-hover:flex'}`}>
        {WIDTHS.map(w => (
          <button
            key={w.value}
            onClick={() => updateBlock(block.id, { width: w.value })}
            aria-pressed={block.width === w.value}
            className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${block.width === w.value ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}
          >
            {w.label}
          </button>
        ))}
        <button
          onClick={() => deleteBlock(block.id)}
          aria-label="Delete block"
          className="rounded p-1 text-neutral-500 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

const bar = 'rounded-sm bg-neutral-200'

function Wireframe({ type }: { type: PlaceholderType }) {
  switch (type) {
    case 'text':
      return (
        <div className="space-y-1.5">
          <div className={`${bar} h-2.5 w-1/3 bg-neutral-300`} />
          <div className={`${bar} h-2 w-full`} />
          <div className={`${bar} h-2 w-5/6`} />
          <div className={`${bar} h-2 w-2/3`} />
        </div>
      )
    case 'image':
      return (
        <svg className="h-24 w-full rounded border border-neutral-200 text-neutral-200" preserveAspectRatio="none" viewBox="0 0 100 100" aria-hidden>
          <line x1="0" y1="0" x2="100" y2="100" stroke="currentColor" vectorEffect="non-scaling-stroke" />
          <line x1="100" y1="0" x2="0" y2="100" stroke="currentColor" vectorEffect="non-scaling-stroke" />
        </svg>
      )
    case 'button':
      return <div className="h-7 w-24 rounded-md border-2 border-neutral-300" />
    case 'spacer':
      return <div className="h-8 rounded border border-dashed border-neutral-300" />
    case 'columns':
      return (
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map(i => <div key={i} className="h-16 rounded border border-neutral-200 bg-neutral-50" />)}
        </div>
      )
  }
}

function ComponentWireframe() {
  return (
    <div className="flex h-12 items-center gap-2 rounded border border-neutral-200 bg-neutral-50 px-3">
      <div className={`${bar} h-2 w-1/4`} />
      <div className={`${bar} h-2 w-1/6`} />
    </div>
  )
}
