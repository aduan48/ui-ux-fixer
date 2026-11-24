import {
  Columns3, Component, CreditCard, File, FileText, Heading, Image, LayoutPanelTop, Link, List, Menu,
  MousePointerClick, PanelBottom, Pilcrow, Rows3, Square, SquareDashed, Tag, TextCursorInput, Type, Video,
  type LucideIcon,
} from 'lucide-react'
import type { ComponentType, PlaceholderType } from '../types'

export const PLACEHOLDERS: { type: PlaceholderType; label: string; icon: LucideIcon }[] = [
  { type: 'text', label: 'Text', icon: Type },
  { type: 'image', label: 'Image', icon: Image },
  { type: 'button', label: 'Button', icon: MousePointerClick },
  { type: 'spacer', label: 'Spacer', icon: SquareDashed },
  { type: 'columns', label: 'Columns', icon: Columns3 },
]

export const placeholderMeta = (type: PlaceholderType) => PLACEHOLDERS.find(p => p.type === type)!

export const COMPONENT_TYPE_ICONS: Record<ComponentType, LucideIcon> = {
  navbar: Menu,
  hero: LayoutPanelTop,
  card: CreditCard,
  button: MousePointerClick,
  form: FileText,
  footer: PanelBottom,
  section: Rows3,
  list: List,
  other: Square,
  page: File,
}

/** Bank group order and labels. */
export const COMPONENT_TYPES: { type: ComponentType; label: string }[] = [
  { type: 'navbar', label: 'Navbars' },
  { type: 'hero', label: 'Heroes' },
  { type: 'section', label: 'Sections' },
  { type: 'card', label: 'Cards' },
  { type: 'list', label: 'Lists' },
  { type: 'form', label: 'Forms' },
  { type: 'button', label: 'Buttons' },
  { type: 'footer', label: 'Footers' },
  { type: 'other', label: 'Other' },
  { type: 'page', label: 'Pages' },
]

/** Icon for an inner element, by tag (or a component name for nested components). */
export function elementIcon(tag: string): LucideIcon {
  if (/^h[1-6]$/.test(tag)) return Heading
  if (/^[A-Z]/.test(tag)) return Component
  const icons: Record<string, LucideIcon> = {
    p: Pilcrow, button: MousePointerClick, a: Link, img: Image, figure: Image, video: Video,
    input: TextCursorInput, textarea: TextCursorInput, select: TextCursorInput, label: Tag,
    ul: List, ol: List, form: FileText, nav: Menu, section: Rows3, article: CreditCard,
  }
  return icons[tag] ?? Square
}
