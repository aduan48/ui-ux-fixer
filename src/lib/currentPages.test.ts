import { expect, it } from 'vitest'
import type { ScannedComponent } from '../types'
import { buildCurrentPages } from './currentPages'

const comp = (name: string, type: ScannedComponent['type'], filePath: string): ScannedComponent => ({
  id: `${filePath}#${name}`, name, filePath, type, framework: 'react', props: [],
  tree: { t: 'el', tag: 'div', cls: name.toLowerCase(), children: [{ t: 'text', v: name }] },
})

it('puts navbars and footers no page shows on a tab of their own, navbar first', () => {
  const pages = buildCurrentPages([
    comp('Footer', 'footer', 'src/components/Footer.jsx'),
    comp('/about', 'page', 'src/pages/About.jsx'), // the router couldn't be followed: pages without their shell
    comp('Navbar', 'navbar', 'src/components/Navbar.jsx'),
  ])
  expect(pages.map(p => p.name)).toEqual(['About', 'Navbar & Footer'])
  expect(pages[1].blocks).toEqual([
    { kind: 'component', componentId: 'src/components/Navbar.jsx#Navbar' },
    { kind: 'component', componentId: 'src/components/Footer.jsx#Footer' },
  ])
})
