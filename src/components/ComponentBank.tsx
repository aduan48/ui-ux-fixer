import { useDraggable } from '@dnd-kit/core'
import { ChevronRight, Search, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { COMPONENT_TYPE_ICONS, COMPONENT_TYPES, PLACEHOLDERS, elementIcon } from '../lib/catalog'
import { elementsOf } from '../lib/render'
import { useStore } from '../store'
import type { BankItem, ScannedComponent } from '../types'

/** One draggable tile. The drag ghost is rendered by DragOverlay in App, so the tile stays put. */
export function BankTile({ item, label, sublabel, title, icon: Icon, compact }: {
  item: BankItem
  label: string
  sublabel?: string
  title?: string
  icon: LucideIcon
  compact?: boolean
}) {
  const dragId =
    item.kind === 'component' ? `bank:c:${item.componentId}`
    : item.kind === 'element' ? `bank:e:${item.componentId}:${item.elementPath}`
    : `bank:p:${item.placeholder}`
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dragId, data: { bankItem: item } })
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      title={title ?? (compact ? label : undefined)}
      className={`flex w-full cursor-grab items-center gap-2.5 rounded-md border border-neutral-200 bg-white text-left ${compact ? 'px-2 py-1' : 'py-2 pr-10 pl-2.5'} hover:border-neutral-300 hover:bg-neutral-50 active:cursor-grabbing ${isDragging ? 'opacity-40' : ''}`}
    >
      <Icon className="size-4 shrink-0 text-neutral-500" />
      <span className="min-w-0">
        <span className={`block truncate text-neutral-800 ${compact ? 'text-xs' : 'text-[13px] font-medium'}`}>{label}</span>
        {sublabel && <span className="block truncate font-mono text-[11px] text-neutral-400">{sublabel}</span>}
      </span>
    </button>
  )
}

export function ComponentBank({ onImport }: { onImport: () => void }) {
  const components = useStore(s => s.project.components)
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const matches = q
    ? components.filter(c => c.name.toLowerCase().includes(q) || c.filePath.toLowerCase().includes(q))
    : components

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50/60">
      {components.length > 0 && (
        <label className="relative m-3 mb-0 block">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-neutral-400" />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search components"
            aria-label="Search components"
            className="w-full rounded-md border border-neutral-200 bg-white py-1.5 pr-2 pl-8 text-[13px] placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </label>
      )}
      <div className="flex-1 overflow-x-hidden overflow-y-auto p-3">
        {!q && (
          <>
            <SectionLabel>Placeholder blocks</SectionLabel>
            <div className="grid grid-cols-1 gap-1.5">
              {PLACEHOLDERS.map(p => (
                <BankTile key={p.type} item={{ kind: 'placeholder', placeholder: p.type }} label={p.label} icon={p.icon} />
              ))}
            </div>
          </>
        )}

        {components.length === 0 ? (
          <>
            <SectionLabel>Components</SectionLabel>
            <button
              onClick={onImport}
              className="w-full rounded-md border border-dashed border-neutral-300 p-3 text-left text-xs text-neutral-500 hover:border-neutral-400 hover:text-neutral-700"
            >
              Import a project to see its components here.
            </button>
          </>
        ) : matches.length === 0 ? (
          <p className="mt-4 text-xs text-neutral-400">No components match “{query}”.</p>
        ) : (
          COMPONENT_TYPES.map(({ type, label }) => {
            const group = matches.filter(c => c.type === type)
            return group.length > 0 && <Group key={type} label={label} count={group.length}>
              {group.map(c => <ComponentTile key={c.id} component={c} />)}
            </Group>
          })
        )}
      </div>
    </aside>
  )
}

/** A component tile plus an expandable list of its inner elements, each draggable on its own. */
function ComponentTile({ component: c }: { component: ScannedComponent }) {
  const [open, setOpen] = useState(false)
  const elements = elementsOf(c.tree)
  return (
    <div>
      <div className="relative">
        <BankTile
          item={{ kind: 'component', componentId: c.id }}
          label={c.name}
          sublabel={c.filePath}
          title={c.props.length ? `Props: ${c.props.join(', ')}` : undefined}
          icon={COMPONENT_TYPE_ICONS[c.type]}
        />
        {elements.length > 0 && (
          <button
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={`${open ? 'Hide' : 'Show'} ${elements.length} elements in ${c.name}`}
            className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-0.5 rounded px-1 py-0.5 text-[11px] text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            {elements.length}
            <ChevronRight className={`size-3 transition-transform ${open ? 'rotate-90' : ''}`} />
          </button>
        )}
      </div>
      {open && (
        <div className="mt-1 ml-3 grid grid-cols-1 gap-1 border-l border-neutral-200 pl-2">
          {elements.map(e => (
            <BankTile
              key={e.path}
              item={{ kind: 'element', componentId: c.id, elementPath: e.path }}
              label={e.label}
              icon={elementIcon(e.tag)}
              compact
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Group({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <section className="mt-4">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="mb-2 flex w-full items-center gap-1 text-[11px] font-semibold tracking-wide text-neutral-400 uppercase hover:text-neutral-600"
      >
        <ChevronRight className={`size-3 transition-transform ${open ? 'rotate-90' : ''}`} />
        {label}
        <span className="ml-auto font-normal">{count}</span>
      </button>
      {open && <div className="grid grid-cols-1 gap-1.5">{children}</div>}
    </section>
  )
}

export const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <h2 className="mt-4 mb-2 text-[11px] font-semibold tracking-wide text-neutral-400 uppercase first:mt-0">{children}</h2>
)
