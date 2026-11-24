import { useDroppable } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { useActivePage, useStore } from '../store'
import { BlockCard } from './BlockCard'
import { PageTabs } from './PageTabs'

export const CANVAS_DROP_ID = 'canvas'

/** "Home" → "/", "about" → "/about": shown in the browser frame's address bar. */
const pageUrl = (name: string) => (/^home$/i.test(name) ? '/' : '/' + name.toLowerCase().replace(/^\//, '').replace(/\s+/g, '-'))

export function Canvas() {
  const page = useActivePage()
  const source = useStore(s => s.project.source ?? s.project.name)
  const { setNodeRef, isOver } = useDroppable({ id: CANVAS_DROP_ID })
  const { selectBlock, stopEditing } = useStore.getState()

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-neutral-100">
      <PageTabs />
      <div
        className="flex-1 overflow-y-auto px-8 pt-6 pb-16"
        onClick={() => { stopEditing(); selectBlock(null) }}
      >
        {/* A browser window, so the sketch reads as "the site", not as a stack of cards. */}
        <div className={`mx-auto max-w-[1280px] rounded-xl bg-white shadow-[0_1px_3px_rgba(0,0,0,.08),0_8px_24px_rgba(0,0,0,.06)] ring-1 transition-shadow ${isOver ? 'ring-2 ring-blue-400' : 'ring-neutral-200'}`}>
          <div className="flex items-center gap-3 rounded-t-xl border-b border-neutral-200 bg-neutral-50 px-4 py-2.5">
            <div className="flex gap-1.5" aria-hidden>
              <span className="size-2.5 rounded-full bg-neutral-300" />
              <span className="size-2.5 rounded-full bg-neutral-300" />
              <span className="size-2.5 rounded-full bg-neutral-300" />
            </div>
            <div className="mx-auto w-full max-w-sm truncate rounded-md bg-white px-3 py-1 text-center text-xs text-neutral-500 ring-1 ring-neutral-200">
              {source.toLowerCase().replace(/\s+/g, '-')}{pageUrl(page.name)}
            </div>
            <span className="w-[42px]" aria-hidden />
          </div>

          <div ref={setNodeRef} className="min-h-[60vh]">
            <SortableContext items={page.blocks.map(b => b.id)} strategy={rectSortingStrategy}>
              <div className="flex flex-wrap content-start">
                {page.blocks.map(b => <BlockCard key={b.id} block={b} />)}
              </div>
            </SortableContext>
            {page.blocks.length === 0 && (
              <div className="grid h-[50vh] place-items-center p-8 text-center">
                <div>
                  <p className="text-sm font-medium text-neutral-700">“{page.name}” is empty</p>
                  <p className="mt-1 text-[13px] text-neutral-500">Drag components or blocks here from the left, or import a project to start from your current site.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
