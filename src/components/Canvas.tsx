import { useDroppable } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { useActivePage, useStore } from '../store'
import { BlockCard } from './BlockCard'
import { PageTabs } from './PageTabs'

export const CANVAS_DROP_ID = 'canvas'

export function Canvas() {
  const page = useActivePage()
  const { setNodeRef, isOver } = useDroppable({ id: CANVAS_DROP_ID })

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-neutral-100">
      <PageTabs />
      <div className="flex-1 overflow-y-auto p-8" onClick={() => useStore.getState().selectBlock(null)}>
        <div
          ref={setNodeRef}
          className={`mx-auto min-h-[calc(100%-1rem)] max-w-4xl rounded-xl border bg-white p-6 shadow-sm transition-colors ${isOver ? 'border-blue-400' : 'border-neutral-200'}`}
        >
          <SortableContext items={page.blocks.map(b => b.id)} strategy={rectSortingStrategy}>
            <div className="flex flex-wrap content-start gap-3">
              {page.blocks.map(b => <BlockCard key={b.id} block={b} />)}
            </div>
          </SortableContext>
          {page.blocks.length === 0 && (
            <div className="grid h-64 place-items-center rounded-lg border-2 border-dashed border-neutral-200 text-sm text-neutral-400">
              Drag blocks here to sketch “{page.name}”
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
