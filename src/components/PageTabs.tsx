import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { useStore } from '../store'

export function PageTabs() {
  const pages = useStore(s => s.project.pages)
  const activePageId = useStore(s => s.activePageId)
  const { setActivePage, addPage, renamePage, deletePage } = useStore.getState()
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-neutral-200 bg-white px-3 py-1.5" role="tablist">
      {pages.map(p => {
        const active = p.id === activePageId
        return (
          <div
            key={p.id}
            className={`group flex items-center rounded-md text-[13px] ${active ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-500 hover:bg-neutral-50'}`}
          >
            {editingId === p.id ? (
              <input
                autoFocus
                defaultValue={p.name}
                aria-label="Page name"
                className="w-28 rounded-md bg-white px-2.5 py-1 outline-2 outline-blue-500"
                onBlur={e => { renamePage(p.id, e.target.value.trim() || p.name); setEditingId(null) }}
                onKeyDown={e => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') setEditingId(null)
                }}
              />
            ) : (
              <button
                role="tab"
                aria-selected={active}
                onClick={() => setActivePage(p.id)}
                onDoubleClick={() => setEditingId(p.id)}
                title="Double-click to rename"
                className="px-2.5 py-1 font-medium"
              >
                {p.name}
              </button>
            )}
            {pages.length > 1 && (
              <button
                onClick={() => deletePage(p.id)}
                aria-label={`Delete page ${p.name}`}
                className="mr-1 hidden rounded p-0.5 text-neutral-400 group-hover:block hover:bg-neutral-200 hover:text-neutral-700"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        )
      })}
      <button onClick={addPage} aria-label="Add page" className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100">
        <Plus className="size-3.5" />
      </button>
    </div>
  )
}
