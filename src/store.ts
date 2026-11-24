import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BankItem, Block, Page, Project, ScannedComponent } from './types'

const id = () => crypto.randomUUID()

const newPage = (name: string): Page => ({ id: id(), name, notes: '', blocks: [] })

const emptyProject = (): Project => ({
  name: 'Untitled project',
  components: [],
  tokens: [],
  pages: [newPage('Home')],
  globalNotes: '',
})

interface State {
  project: Project
  activePageId: string
  selectedBlockId: string | null

  setProjectName: (name: string) => void
  setGlobalNotes: (notes: string) => void
  /** Replace the bank. Ids are `path#name`, so blocks stay linked across re-imports. */
  importComponents: (components: ScannedComponent[], source: string) => void

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

        setProjectName: name => set(s => ({ project: { ...s.project, name } })),
        setGlobalNotes: globalNotes => set(s => ({ project: { ...s.project, globalNotes } })),
        importComponents: (components, source) =>
          set(s => ({
            project: {
              ...s.project,
              components,
              source,
              name: s.project.name === emptyProject().name ? source : s.project.name,
            },
          })),

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
        setActivePage: activePageId => set({ activePageId, selectedBlockId: null }),
        setPageNotes: notes => editActivePage(p => ({ ...p, notes })),

        addBlock: (item, index) => {
          const block: Block = { id: id(), width: 'full', notes: '', ...item }
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
          if (get().selectedBlockId === blockId) set({ selectedBlockId: null })
        },
        selectBlock: selectedBlockId => set({ selectedBlockId }),
      }
    },
    {
      name: 'sketchkit',
      version: 1,
      partialize: s => ({ project: s.project, activePageId: s.activePageId }),
    },
  ),
)

export const useActivePage = () =>
  useStore(s => s.project.pages.find(p => p.id === s.activePageId) ?? s.project.pages[0])
