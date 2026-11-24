import { ArrowDown, ArrowUp, RotateCcw, Trash2 } from 'lucide-react'
import { elementIcon } from '../lib/catalog'
import { blockNode, labelAt } from '../lib/render'
import { nudgeNode, removeNode } from '../lib/treeEdit'
import { useStore } from '../store'
import type { Block, StaticNode } from '../types'

const MAX_ROWS = 200
const MAX_DEPTH = 8

interface Row { path: string; depth: number; tag: string; label: string; first: boolean; last: boolean }

/** Element and component nodes under the root, depth first (text and {expressions} are left out). */
function rowsOf(tree: StaticNode): Row[] {
  const rows: Row[] = []
  const visit = (n: StaticNode, path: string, depth: number) => {
    if (!('children' in n) || depth > MAX_DEPTH) return
    const kids = n.children.map((c, i) => [c, i] as const).filter(([c]) => c.t === 'el' || c.t === 'comp' || c.t === 'frag')
    kids.forEach(([c, i], k) => {
      if (rows.length >= MAX_ROWS) return
      const p = path ? `${path}.${i}` : String(i)
      const info = labelAt(tree, p)!
      rows.push({ path: p, depth, tag: info.tag, label: info.label, first: k === 0, last: k === kids.length - 1 })
      if (c.t !== 'comp') visit(c, p, depth + 1) // a nested component moves as one piece
    })
  }
  visit(tree, '', 0)
  return rows
}

/** The inside of the selected block, as a list you can reorder; mirrors the in-preview editor. */
export function Layers({ block }: { block: Block }) {
  const components = useStore(s => s.project.components)
  const editing = useStore(s => s.editingBlockId === block.id)
  const selectedPath = useStore(s => (s.editingBlockId === block.id ? s.selectedElementPath : null))
  const { startEditing, selectElement, editBlockTree, resetBlockTree } = useStore.getState()
  const tree = blockNode(block, components)
  if (!tree) return null
  const rows = rowsOf(tree)

  const pick = (path: string) => {
    if (!editing) startEditing(block.id)
    selectElement(path)
  }
  const edit = (fn: (t: StaticNode) => StaticNode) => {
    editBlockTree(block.id, fn)
    selectElement(null)
  }

  return (
    <div>
      {rows.length === 0 ? (
        <p className="text-xs text-neutral-400">Nothing inside to rearrange.</p>
      ) : (
        <ul className="max-h-72 overflow-y-auto rounded-md border border-neutral-200 bg-white py-1" role="tree" aria-label="Layers">
          {rows.map(r => {
            const Icon = elementIcon(r.tag)
            const on = r.path === selectedPath
            return (
              <li
                key={r.path}
                role="treeitem"
                aria-selected={on}
                className={`group flex items-center gap-1.5 pr-1 text-xs ${on ? 'bg-violet-50 text-violet-900' : 'text-neutral-700 hover:bg-neutral-50'}`}
                style={{ paddingLeft: 8 + r.depth * 12 }}
              >
                <button onClick={() => pick(r.path)} className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left">
                  <Icon className="size-3.5 shrink-0 text-neutral-400" />
                  <span className="truncate">{r.label}</span>
                </button>
                <span className={`items-center ${on ? 'flex' : 'hidden group-hover:flex'}`}>
                  <IconButton label="Move up" icon={ArrowUp} disabled={r.first} onClick={() => edit(t => nudgeNode(t, r.path, -1))} />
                  <IconButton label="Move down" icon={ArrowDown} disabled={r.last} onClick={() => edit(t => nudgeNode(t, r.path, 1))} />
                  <IconButton label="Remove" icon={Trash2} danger onClick={() => edit(t => removeNode(t, r.path))} />
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {block.tree && (
        <button onClick={() => resetBlockTree(block.id)} className="mt-2 flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800">
          <RotateCcw className="size-3" /> Reset to original
        </button>
      )}
    </div>
  )
}

function IconButton({ label, icon: Icon, onClick, disabled, danger }: { label: string; icon: typeof ArrowUp; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`rounded p-0.5 disabled:opacity-25 ${danger ? 'text-neutral-400 hover:bg-red-50 hover:text-red-600' : 'text-neutral-400 hover:bg-neutral-200 hover:text-neutral-800'}`}
    >
      <Icon className="size-3" />
    </button>
  )
}
