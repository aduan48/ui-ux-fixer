export type ComponentType =
  | 'navbar' | 'hero' | 'card' | 'button' | 'form' | 'footer' | 'section' | 'list' | 'other'
  | 'page' // framework route files (Next.js app/pages); shown last in the bank

export type PlaceholderType = 'text' | 'image' | 'button' | 'spacer' | 'columns'

/**
 * A component's markup frozen at scan time: enough to list its inner elements and draw an
 * approximate render. Dynamic parts become `expr` (shown as placeholders); a `.map()` keeps
 * one item and a ternary keeps its first branch.
 */
export type StaticNode =
  | { t: 'el'; tag: string; cls?: string; attrs?: Record<string, string>; children: StaticNode[]; offset?: Offset }
  // Another component. Resolved at render time by import (src + imp) when known, else by name.
  | { t: 'comp'; name: string; src?: string; imp?: string; attrs?: Record<string, string>; children: StaticNode[]; offset?: Offset }
  | { t: 'frag'; children: StaticNode[] }
  | { t: 'text'; v: string }
  | { t: 'expr'; v: string }

/** A free-form move in the sketch: shift from where the element sits in the layout, in page pixels. */
export interface Offset {
  x: number
  y: number
}

export interface ScannedComponent {
  id: string
  name: string
  filePath: string
  props: string[]
  type: ComponentType
  framework: 'react' | 'html'
  description?: string
  tree?: StaticNode
  /** The file's default export (so `import Anything from './File'` finds it). */
  isDefault?: boolean
}

/** A source file as read from a folder or GitHub. Paths are relative to the project root. */
export interface SourceFile {
  path: string
  content: string
}

export interface Block {
  id: string
  kind: 'component' | 'element' | 'placeholder'
  componentId?: string
  /** For `element` blocks: index path into the component's tree, e.g. "0.2.1". */
  elementPath?: string
  placeholder?: PlaceholderType
  /** Percent of the canvas width. Presets are 100 / 50 / 33.33; resizing snaps to twelfths. */
  width: number
  /** Pixels; undefined = fit content. */
  height?: number
  /** String props the original page passed (<Hero title="Hi">), so previews show real copy. */
  props?: Record<string, string>
  /** Wrappers this block sat inside on the original page (body, main…), outermost first. */
  frames?: Frame[]
  /** The user's rearranged copy of the block's markup; undefined = as scanned. */
  tree?: StaticNode
  notes: string
}

/** "Render me inside the ancestors of `path` in component `componentId`." */
export interface Frame {
  componentId: string
  path: string
}

export interface Page {
  id: string
  name: string
  notes: string
  blocks: Block[]
  /** For pages rebuilt from the imported site: its route, the component that renders it, and its blocks as imported. */
  route?: string
  componentId?: string
  original?: Block[]
}

export type TokenKind = 'color' | 'font' | 'fontSize' | 'radius' | 'spacing'
export type TokenRole = 'primary' | 'accent' | 'heading' | 'body'

export interface BrandToken {
  id: string
  kind: TokenKind
  value: string
  name?: string
  count: number
  /** A token can fill several roles (one font for headings and body); each role belongs to one token. */
  roles?: TokenRole[]
  /** Where it was found: a file path, "classes" (Tailwind classes in markup), or "added" by the user. */
  source?: string
}

export interface Project {
  name: string
  source?: string
  components: ScannedComponent[]
  /** The project's CSS (url()s inlined), injected into previews. */
  styles: SourceFile[]
  /** Images by project path, as data URLs. Trees refer to them as `@asset:<path>`. */
  assets: Record<string, string>
  tokens: BrandToken[]
  pages: Page[]
  globalNotes: string
}

/** What the bank hands to the canvas when something is dragged out of it. */
export type BankItem =
  | { kind: 'component'; componentId: string; props?: Record<string, string>; frames?: Frame[] }
  | { kind: 'element'; componentId: string; elementPath: string; frames?: Frame[] }
  | { kind: 'placeholder'; placeholder: PlaceholderType }
