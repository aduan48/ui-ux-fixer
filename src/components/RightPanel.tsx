import { useState } from 'react'
import { BrandPanel } from './BrandPanel'
import { NotesPanel } from './NotesPanel'

const TABS = [
  { id: 'inspect', label: 'Inspect' },
  { id: 'brand', label: 'Brand' },
] as const

export function RightPanel() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('inspect')
  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-neutral-200 bg-neutral-50/60">
      <div role="tablist" aria-label="Side panel" className="flex gap-1 border-b border-neutral-200 bg-white px-3 py-1.5">
        {TABS.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-md px-2.5 py-1 text-[13px] font-medium ${tab === t.id ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-500 hover:bg-neutral-50'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="flex-1 overflow-y-auto">
        {tab === 'inspect' ? <NotesPanel /> : <BrandPanel />}
      </div>
    </aside>
  )
}
