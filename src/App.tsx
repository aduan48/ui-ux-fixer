import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useEffect, useState } from 'react'
import { Canvas, CANVAS_DROP_ID } from './components/Canvas'
import { ComponentBank } from './components/ComponentBank'
import { HeaderActions } from './components/HeaderActions'
import { RightPanel } from './components/RightPanel'
import { placeholderMeta } from './lib/catalog'
import { labelAt } from './lib/render'
import { useStore } from './store'
import type { BankItem } from './types'

const bankItemOf = (e: { active: { data: { current?: Record<string, unknown> } } }) =>
  e.active.data.current?.bankItem as BankItem | undefined

/**
 * Bank drags: only count a drop when the pointer is actually over the canvas, preferring
 * the block under it (insert before that block). Reorders: snap to the nearest block.
 */
const collision: CollisionDetection = args => {
  const blocks = args.droppableContainers.filter(c => c.id !== CANVAS_DROP_ID)
  if (!args.active.data.current?.bankItem) return closestCenter({ ...args, droppableContainers: blocks })
  if (!args.pointerCoordinates) return closestCenter(args) // keyboard drag
  const hits = pointerWithin(args)
  const block = hits.find(h => h.id !== CANVAS_DROP_ID)
  return block ? [block] : hits
}

/** The store loads from IndexedDB asynchronously; render nothing until it has. */
function useHydrated() {
  const [hydrated, setHydrated] = useState(useStore.persist.hasHydrated())
  useEffect(() => useStore.persist.onFinishHydration(() => setHydrated(true)), [])
  return hydrated
}

export default function App() {
  const hydrated = useHydrated()
  const projectName = useStore(s => s.project.name)
  const [dragging, setDragging] = useState<BankItem | null>(null)
  const [importing, setImporting] = useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), // lets clicks select
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragStart = (e: DragStartEvent) => setDragging(bankItemOf(e) ?? null)

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null)
    const { over, active } = e
    if (!over) return
    const { project, activePageId, addBlock, moveBlock } = useStore.getState()
    const blocks = project.pages.find(p => p.id === activePageId)!.blocks
    const overIndex = blocks.findIndex(b => b.id === over.id)

    const item = bankItemOf(e)
    if (item) return addBlock(item, overIndex === -1 ? undefined : overIndex)

    const from = blocks.findIndex(b => b.id === active.id)
    if (from !== -1 && overIndex !== -1 && from !== overIndex) moveBlock(from, overIndex)
  }

  if (!hydrated) return null

  return (
    <div className="flex h-screen flex-col text-neutral-900">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-4">
        <span className="text-sm font-semibold tracking-tight">SketchKit</span>
        <span className="text-neutral-300">/</span>
        <input
          value={projectName}
          onChange={e => useStore.getState().setProjectName(e.target.value)}
          aria-label="Project name"
          className="w-64 rounded px-1.5 py-0.5 text-sm text-neutral-600 hover:bg-neutral-100 focus:bg-white focus:outline-2 focus:outline-blue-500"
        />
        <HeaderActions importing={importing} setImporting={setImporting} />
      </header>

      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <div className="flex min-h-0 flex-1">
          <ComponentBank onImport={() => setImporting(true)} />
          <Canvas />
          <RightPanel />
        </div>
        <DragOverlay dropAnimation={null}>
          {dragging && <DragGhost item={dragging} />}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

function DragGhost({ item }: { item: BankItem }) {
  const component = useStore(s => item.kind === 'placeholder' ? undefined : s.project.components.find(c => c.id === item.componentId))
  const label = item.kind === 'placeholder' ? placeholderMeta(item.placeholder).label
    : item.kind === 'element' ? labelAt(component?.tree, item.elementPath)?.label
    : component?.name
  return (
    <div className="w-48 cursor-grabbing rounded-md border border-blue-400 bg-white px-3 py-2 text-[13px] font-medium shadow-lg">
      {label}
    </div>
  )
}
