import { del, get as idbGet, set as idbSet } from 'idb-keyval'
import { create } from 'zustand'
import { buildCurrentPages } from './lib/currentPages'
import { contentBottom, flowPositions, FRAMES, frameWidthOf, heightFrom } from './lib/layout'
import { migrateProject, PROJECT_VERSION } from './lib/projectFile'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { blockNode } from './lib/render'
import type { BankItem, Block, BrandToken, Page, Project, ScannedComponent, SourceFile, StaticNode, TokenKind, TokenRole } from './types'

const id = () => crypto.randomUUID()

const newPage = (name: string): Page => ({ id: id(), name, notes: '', blocks: [] })

const currentPages = (components: ScannedComponent[]): Page[] =>
  buildCurrentPages(components).map(c => {
    const blocks: Block[] = c.blocks.map(item => ({ id: id(), x: 0, y: 0, w: FRAMES[0].width, notes: '', ...item }))
    // `original` is a snapshot of the page as imported, so the export can say what changed.
    return { ...newPage(c.name), flow: true, blocks, original: blocks, route: c.route, componentId: c.componentId }
  })

const emptyProject = (): Project => ({
  name: 'Untitled project',
  components: [],
  styles: [],
  assets: {},
  tokens: [],
  pages: [newPage('Home')],
  globalNotes: '',
})

interface State {
  project: Project
  activePageId: string
  selectedBlockId: string | null
  /** Block whose inside is being rearranged in its preview, and the element picked in it. */
  editingBlockId: string | null
  selectedElementPath: string | null
  /** How dragging inside a block works: place freely (offset) or reorder in the layout. */
  editMode: 'free' | 'reorder'
  /** Each block's content height as its preview last measured it (page px). Not persisted. */
  measured: Record<string, number>

  setProjectName: (name: string) => void
  setGlobalNotes: (notes: string) => void
  /** Replace the bank. Ids are `path#name`, so blocks stay linked across re-imports. */
  /**
   * Load a scan as a fresh project: its pages (one tab per route), components, styles, images
   * and brand. Whatever was open before is replaced; the import dialog confirms that first.
   */
  importScan: (scan: { components: ScannedComponent[]; styles: SourceFile[]; assets: Record<string, string>; tokens: BrandToken[] }, source: string) => void

  addToken: (kind: TokenKind) => void
  updateToken: (id: string, patch: Partial<Omit<BrandToken, 'id' | 'kind'>>) => void
  deleteToken: (id: string) => void
  /** Toggle a role on a token; giving it takes the role from whichever token had it. */
  toggleTokenRole: (id: string, role: TokenRole) => void
  /** Replace everything with a project opened from a file. */
  loadProject: (project: Project) => void

  addPage: () => void
  renamePage: (pageId: string, name: string) => void
  deletePage: (pageId: string) => void
  setActivePage: (pageId: string) => void
  setPageNotes: (notes: string) => void
  setFrameWidth: (width: number) => void

  /** Place a block from the bank with its top-left at `at` (page px; below the content if omitted). Freezes a flow page. */
  addBlock: (item: BankItem, at?: { x: number; y: number }) => void
  updateBlock: (blockId: string, patch: Partial<Omit<Block, 'id'>>) => void
  deleteBlock: (blockId: string) => void
  selectBlock: (blockId: string | null) => void
  setMeasured: (blockId: string, height: number) => void

  startEditing: (blockId: string) => void
  stopEditing: () => void
  setEditMode: (mode: State['editMode']) => void
  selectElement: (path: string | null) => void
  /** Apply an edit to a block's own copy of its markup (made from the scanned tree on first edit). */
  editBlockTree: (blockId: string, fn: (tree: StaticNode) => StaticNode) => void
  resetBlockTree: (blockId: string) => void
}

/**
 * Projects can carry a few MB of CSS, past localStorage's limit, so they live in IndexedDB.
 * Reads fall back to localStorage, where v1 saved. Writes are debounced (every keystroke in
 * a notes field changes state) and flushed when the page is hidden so nothing is lost.
 */
let pending: { name: string; value: string } | undefined
let timer: ReturnType<typeof setTimeout> | undefined
const flush = () => {
  clearTimeout(timer)
  if (!pending) return
  const { name, value } = pending
  pending = undefined
  idbSet(name, value).then(() => localStorage.removeItem(name))
}
addEventListener('pagehide', flush)

const idbStorage: StateStorage = {
  getItem: async name => (await idbGet<string>(name)) ?? localStorage.getItem(name),
  setItem: (name, value) => {
    pending = { name, value }
    clearTimeout(timer)
    timer = setTimeout(flush, 300)
  },
  removeItem: name => del(name),
}

export const useStore = create<State>()(
  persist(
    (set, get) => {
      // Every block edit targets the active page; this keeps those setters one-liners.
      const editActivePage = (fn: (p: Page) => Page) =>
        set(s => ({
          project: {
            ...s.project,
            pages: s.project.pages.map(p => (p.id === s.activePageId ? fn(p) : p)),
          },
        }))

      const initial = emptyProject()
      return {
        project: initial,
        activePageId: initial.pages[0].id,
        selectedBlockId: null,
        editingBlockId: null,
        selectedElementPath: null,
        editMode: 'free',
        measured: {},

        setProjectName: name => set(s => ({ project: { ...s.project, name } })),
        setGlobalNotes: globalNotes => set(s => ({ project: { ...s.project, globalNotes } })),
        importScan: ({ components, styles, assets, tokens }, source) => {
          const pages = currentPages(components)
          const project: Project = {
            ...emptyProject(),
            name: source,
            source,
            components,
            styles,
            assets,
            tokens,
            ...(pages.length && { pages }),
          }
          set({ project, activePageId: project.pages[0].id, selectedBlockId: null, editingBlockId: null, selectedElementPath: null })
        },
        loadProject: project =>
          set({ project, activePageId: project.pages[0].id, selectedBlockId: null, editingBlockId: null, selectedElementPath: null }),

        addPage: () => {
          const page = newPage(`Page ${get().project.pages.length + 1}`)
          set(s => ({
            project: { ...s.project, pages: [...s.project.pages, page] },
            activePageId: page.id,
            selectedBlockId: null,
          }))
        },
        renamePage: (pageId, name) =>
          set(s => ({
            project: {
              ...s.project,
              pages: s.project.pages.map(p => (p.id === pageId ? { ...p, name } : p)),
            },
          })),
        deletePage: pageId =>
          set(s => {
            if (s.project.pages.length === 1) return s // always keep one page
            const pages = s.project.pages.filter(p => p.id !== pageId)
            const activePageId = s.activePageId === pageId ? pages[0].id : s.activePageId
            return { project: { ...s.project, pages }, activePageId, selectedBlockId: null }
          }),
        setActivePage: activePageId => set({ activePageId, selectedBlockId: null, editingBlockId: null, selectedElementPath: null }),
        setPageNotes: notes => editActivePage(p => ({ ...p, notes })),
        setFrameWidth: frameWidth => editActivePage(p => ({ ...p, frameWidth })),

        addBlock: (item, at) => {
          const heightOf = heightFrom(get().measured)
          const blockId = id()
          editActivePage(p => {
            const fw = frameWidthOf(p)
            // The first positioned edit freezes the computed flow layout, original snapshot included, so the brief can compare.
            const frozen = p.flow
              ? { ...p, flow: false, blocks: flowPositions(p.blocks, fw, heightOf), original: p.original && flowPositions(p.original, fw, heightOf) }
              : p
            const w = fw // shortcut: new blocks span the frame until M2 adds resizing
            const { x, y } = at ?? { x: 0, y: contentBottom(frozen.blocks, heightOf) }
            const block: Block = { id: blockId, notes: '', ...item, w, x: Math.round(Math.min(Math.max(0, x), fw - w)), y: Math.round(Math.max(0, y)) }
            return { ...frozen, blocks: [...frozen.blocks, block] }
          })
          set({ selectedBlockId: blockId })
        },
        updateBlock: (blockId, patch) =>
          editActivePage(p => ({
            ...p,
            blocks: p.blocks.map(b => (b.id === blockId ? { ...b, ...patch } : b)),
          })),
        deleteBlock: blockId => {
          editActivePage(p => ({ ...p, blocks: p.blocks.filter(b => b.id !== blockId) }))
          if (get().selectedBlockId === blockId) set({ selectedBlockId: null, editingBlockId: null, selectedElementPath: null })
        },
        selectBlock: selectedBlockId =>
          set(s => ({
            selectedBlockId,
            ...(s.editingBlockId !== selectedBlockId && { editingBlockId: null, selectedElementPath: null }),
          })),

        addToken: kind => {
          const defaults: Record<TokenKind, string> = { color: '#000000', font: 'Inter', fontSize: '1rem', radius: '0.5rem', spacing: '1rem' }
          const token: BrandToken = { id: id(), kind, value: defaults[kind], count: 0, source: 'added' }
          set(s => ({ project: { ...s.project, tokens: [...s.project.tokens, token] } }))
        },
        updateToken: (tokenId, patch) =>
          set(s => ({ project: { ...s.project, tokens: s.project.tokens.map(t => (t.id === tokenId ? { ...t, ...patch } : t)) } })),
        deleteToken: tokenId =>
          set(s => ({ project: { ...s.project, tokens: s.project.tokens.filter(t => t.id !== tokenId) } })),
        toggleTokenRole: (tokenId, role) =>
          set(s => {
            const had = s.project.tokens.find(t => t.id === tokenId)?.roles?.includes(role)
            const tokens = s.project.tokens.map(t => {
              const others = (t.roles ?? []).filter(r => r !== role)
              return { ...t, roles: t.id === tokenId && !had ? [...others, role] : others }
            })
            return { project: { ...s.project, tokens } }
          }),

        setMeasured: (blockId, height) => set(s => (s.measured[blockId] === height ? s : { measured: { ...s.measured, [blockId]: height } })),

        startEditing: blockId => set({ selectedBlockId: blockId, editingBlockId: blockId, selectedElementPath: null }),
        stopEditing: () => set({ editingBlockId: null, selectedElementPath: null }),
        setEditMode: editMode => set({ editMode }),
        selectElement: selectedElementPath => set({ selectedElementPath }),
        editBlockTree: (blockId, fn) => {
          const { project } = get()
          const block = project.pages.flatMap(p => p.blocks).find(b => b.id === blockId)
          const tree = block && blockNode(block, project.components)
          if (!block || !tree) return
          const next = fn(tree)
          // Back to exactly the scanned markup (e.g. a moved element double-clicked home): drop the copy.
          const original = blockNode({ ...block, tree: undefined }, project.components)
          get().updateBlock(blockId, { tree: JSON.stringify(next) === JSON.stringify(original) ? undefined : next })
        },
        resetBlockTree: blockId => {
          get().updateBlock(blockId, { tree: undefined })
          set({ selectedElementPath: null })
        },
      }
    },
    {
      name: 'sketchkit',
      version: PROJECT_VERSION,
      storage: createJSONStorage(() => idbStorage),
      partialize: s => ({ project: s.project, activePageId: s.activePageId }),
      migrate: (persisted, version) => {
        const state = persisted as { project: Project }
        state.project = migrateProject(state.project, version)
        return state as unknown as State
      },
    },
  ),
)

export const useActivePage = () =>
  useStore(s => s.project.pages.find(p => p.id === s.activePageId) ?? s.project.pages[0])
