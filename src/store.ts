import { del, get as idbGet, set as idbSet } from 'idb-keyval'
import { create } from 'zustand'
import { buildCurrentPages } from './lib/currentPages'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { blockNode } from './lib/render'
import type { BankItem, Block, BrandToken, Page, Project, ScannedComponent, SourceFile, StaticNode, TokenKind, TokenRole } from './types'

const id = () => crypto.randomUUID()

const newPage = (name: string): Page => ({ id: id(), name, notes: '', blocks: [] })

const currentPages = (components: ScannedComponent[]): Page[] =>
  buildCurrentPages(components).map(c => ({
    ...newPage(c.name),
    blocks: c.blocks.map(item => ({ id: id(), width: 100, notes: '', ...item })),
  }))

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

  setProjectName: (name: string) => void
  setGlobalNotes: (notes: string) => void
  /** Replace the bank. Ids are `path#name`, so blocks stay linked across re-imports. */
  /**
   * Load a scan. A different project (other folder/repo name) replaces everything: pages,
   * notes, components, images, tokens. Re-importing the same project keeps the sketch.
   */
  importScan: (scan: { components: ScannedComponent[]; styles: SourceFile[]; assets: Record<string, string>; tokens: BrandToken[] }, source: string) => void

  addToken: (kind: TokenKind) => void
  updateToken: (id: string, patch: Partial<Omit<BrandToken, 'id' | 'kind'>>) => void
  deleteToken: (id: string) => void
  /** Toggle a role on a token; giving it takes the role from whichever token had it. */
  toggleTokenRole: (id: string, role: TokenRole) => void
  /** Add the imported site's current pages as new tabs (never replaces existing ones). */
  addCurrentPages: () => number

  addPage: () => void
  renamePage: (pageId: string, name: string) => void
  deletePage: (pageId: string) => void
  setActivePage: (pageId: string) => void
  setPageNotes: (notes: string) => void

  /** Insert a block from the bank at `index` (end of page if omitted). */
  addBlock: (item: BankItem, index?: number) => void
  moveBlock: (from: number, to: number) => void
  updateBlock: (blockId: string, patch: Partial<Omit<Block, 'id'>>) => void
  deleteBlock: (blockId: string) => void
  selectBlock: (blockId: string | null) => void

  startEditing: (blockId: string) => void
  stopEditing: () => void
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

        setProjectName: name => set(s => ({ project: { ...s.project, name } })),
        setGlobalNotes: globalNotes => set(s => ({ project: { ...s.project, globalNotes } })),
        importScan: ({ components, styles, assets, tokens }, source) =>
          set(s => {
            const same = s.project.source === source
            const project: Project = same
              ? { ...s.project, components, styles, assets, tokens: s.project.tokens.length ? s.project.tokens : tokens }
              : { ...emptyProject(), name: source, source, components, styles, assets, tokens }
            const reset = { selectedBlockId: null, editingBlockId: null, selectedElementPath: null }
            // Start from the site as it is today, unless that would overwrite an existing sketch.
            const pages = currentPages(components)
            if (same && s.project.pages.some(p => p.blocks.length)) return { project }
            if (!pages.length) return { project, activePageId: project.pages[0].id, ...reset }
            return { project: { ...project, pages }, activePageId: pages[0].id, ...reset }
          }),
        addCurrentPages: () => {
          const pages = currentPages(get().project.components)
          if (pages.length)
            set(s => ({
              project: { ...s.project, pages: [...s.project.pages, ...pages] },
              activePageId: pages[0].id,
              selectedBlockId: null,
            }))
          return pages.length
        },

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

        addBlock: (item, index) => {
          const block: Block = { id: id(), width: 100, notes: '', ...item }
          editActivePage(p => {
            const blocks = [...p.blocks]
            blocks.splice(index ?? blocks.length, 0, block)
            return { ...p, blocks }
          })
          set({ selectedBlockId: block.id })
        },
        moveBlock: (from, to) =>
          editActivePage(p => {
            const blocks = [...p.blocks]
            blocks.splice(to, 0, ...blocks.splice(from, 1))
            return { ...p, blocks }
          }),
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

        startEditing: blockId => set({ selectedBlockId: blockId, editingBlockId: blockId, selectedElementPath: null }),
        stopEditing: () => set({ editingBlockId: null, selectedElementPath: null }),
        selectElement: selectedElementPath => set({ selectedElementPath }),
        editBlockTree: (blockId, fn) => {
          const { project } = get()
          const block = project.pages.flatMap(p => p.blocks).find(b => b.id === blockId)
          const tree = block && blockNode(block, project.components)
          if (tree) get().updateBlock(blockId, { tree: fn(tree) })
        },
        resetBlockTree: blockId => {
          get().updateBlock(blockId, { tree: undefined })
          set({ selectedElementPath: null })
        },
      }
    },
    {
      name: 'sketchkit',
      version: 3,
      storage: createJSONStorage(() => idbStorage),
      partialize: s => ({ project: s.project, activePageId: s.activePageId }),
      migrate: (persisted, version) => {
        const state = persisted as { project: Project }
        if (version < 2) {
          // v1: width was 'full' | 'half' | 'third'; no saved styles.
          const pct: Record<string, number> = { full: 100, half: 50, third: 100 / 3 }
          state.project.styles ??= []
          for (const page of state.project.pages)
            for (const b of page.blocks) b.width = pct[b.width as unknown as string] ?? 100
        }
        if (version < 3) state.project.assets ??= {} // v2 had no images
        return state as unknown as State
      },
    },
  ),
)

export const useActivePage = () =>
  useStore(s => s.project.pages.find(p => p.id === s.activePageId) ?? s.project.pages[0])
