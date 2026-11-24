import {
  Columns3, File, CreditCard, FileText, Image, LayoutPanelTop, List, Menu, MousePointerClick,
  PanelBottom, Rows3, Square, SquareDashed, Type, type LucideIcon,
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
