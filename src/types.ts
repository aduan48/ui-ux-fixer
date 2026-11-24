export type ComponentType =
  | 'navbar' | 'hero' | 'card' | 'button' | 'form' | 'footer' | 'section' | 'list' | 'other'
  | 'page' // framework route files (Next.js app/pages); shown last in the bank

export type PlaceholderType = 'text' | 'image' | 'button' | 'spacer' | 'columns'

export type BlockWidth = 'full' | 'half' | 'third'

export interface ScannedComponent {
  id: string
  name: string
  filePath: string
  props: string[]
  type: ComponentType
  framework: 'react' | 'html'
  description?: string
}

/** A source file as read from a folder or GitHub. Paths are relative to the project root. */
export interface SourceFile {
  path: string
  content: string
}

export interface Block {
  id: string
  kind: 'component' | 'placeholder'
  componentId?: string
  placeholder?: PlaceholderType
  width: BlockWidth
  notes: string
}

export interface Page {
  id: string
  name: string
  notes: string
  blocks: Block[]
}

export type TokenKind = 'color' | 'font' | 'fontSize' | 'radius' | 'spacing'
export type TokenRole = 'primary' | 'accent' | 'heading' | 'body'

export interface BrandToken {
  id: string
  kind: TokenKind
  value: string
  name?: string
  count: number
  role?: TokenRole
}

export interface Project {
  name: string
  source?: string
  components: ScannedComponent[]
  tokens: BrandToken[]
  pages: Page[]
  globalNotes: string
}

/** What the bank hands to the canvas when something is dragged out of it. */
export type BankItem =
  | { kind: 'component'; componentId: string }
  | { kind: 'placeholder'; placeholder: PlaceholderType }
