import type { ComponentType } from '../types'

const WORDS: Record<string, ComponentType> = {}
const add = (type: ComponentType, words: string) => words.split(' ').forEach(w => (WORDS[w] = type))
add('navbar', 'nav navbar navigation header menu topbar sidebar')
add('hero', 'hero banner jumbotron splash masthead')
add('card', 'card tile')
add('button', 'button btn cta')
add('form', 'form input login signin signup register contact subscribe newsletter search')
add('footer', 'footer')
add('section', 'section features pricing testimonials testimonial faq about stats team gallery showcase')
add('list', 'list grid table feed items carousel slider')

const TAGS: Record<string, ComponentType> = {
  nav: 'navbar', header: 'navbar', footer: 'footer', form: 'form', button: 'button',
  section: 'section', article: 'card', ul: 'list', ol: 'list', table: 'list',
}

/** `PricingSection` → ['pricing', 'section'], `hero-banner` → ['hero', 'banner'], `FAQ` → ['faq']. */
export const splitWords = (name: string) =>
  (name.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+/g) ?? []).map(w => w.toLowerCase())

export interface ContentHints {
  rootTag?: string
  tags?: Set<string>
  rendersList?: boolean // `.map(...)` producing JSX
}

/**
 * The name wins over content, and its LAST matching word wins (FeatureCard is a card,
 * CardList is a list). Without a name match, fall back to the markup.
 */
export function guessType(words: string[], hints: ContentHints = {}): ComponentType {
  for (let i = words.length - 1; i >= 0; i--) {
    const type = WORDS[words[i]]
    if (type) return type
  }
  if (hints.rootTag && TAGS[hints.rootTag]) return TAGS[hints.rootTag]
  if (hints.rendersList) return 'list'
  if (hints.tags?.has('form') || hints.tags?.has('input')) return 'form'
  return 'other'
}
