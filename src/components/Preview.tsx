import tailwindBrowser from '@tailwindcss/browser?url'
import { useEffect, useMemo, useRef, useState } from 'react'
import { previewDoc } from '../lib/render'
import { moveNode, removeNode } from '../lib/treeEdit'
import { useStore } from '../store'

/** Desktop width the page is rendered at; each block gets its share, then is scaled to fit. */
export const PAGE_WIDTH = 1280
/** Starting viewport height, so `h-screen` sections measure like a laptop screen, not 0px. */
const VIEWPORT_HEIGHT = 800
const MAX_HEIGHT = 4000
const tailwindUrl = new URL(tailwindBrowser, location.href).href

/** Each block's last measured height, so re-renders (e.g. after an edit) don't flash. */
const heights = new Map<string, number>()

export function Preview({ blockId, html, blockWidth, editable }: { blockId: string; html: string; blockWidth: number; editable: boolean }) {
  const styles = useStore(s => s.project.styles)
  const selected = useStore(s => (editable ? s.selectedElementPath : null))
  const doc = useMemo(() => previewDoc(html, styles, tailwindUrl, { editable }), [html, styles, editable])

  const frameRef = useRef<HTMLIFrameElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(() => heights.get(blockId) ?? VIEWPORT_HEIGHT)
  const [boxWidth, setBoxWidth] = useState(0)

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow || typeof e.data !== 'object' || !e.data) return
      const { skHeight, skSelect, skMove, skDelete, skDone } = e.data
      const store = useStore.getState()
      if (typeof skHeight === 'number') {
        const h = Math.min(MAX_HEIGHT, Math.max(24, skHeight))
        heights.set(blockId, h)
        setHeight(h)
      }
      if (typeof skSelect === 'string') store.selectElement(skSelect)
      if (skMove && typeof skMove.from === 'string' && typeof skMove.target === 'string') {
        store.editBlockTree(blockId, t => moveNode(t, skMove.from, skMove.target, !!skMove.after))
        store.selectElement(null)
      }
      if (typeof skDelete === 'string') {
        store.editBlockTree(blockId, t => removeNode(t, skDelete))
        store.selectElement(null)
      }
      if (skDone) store.stopEditing()
    }
    addEventListener('message', onMessage)
    const ro = new ResizeObserver(([entry]) => setBoxWidth(entry.contentRect.width))
    ro.observe(boxRef.current!)
    return () => { removeEventListener('message', onMessage); ro.disconnect() }
  }, [blockId])

  const showSelection = () => frameRef.current?.contentWindow?.postMessage({ skShow: selected }, '*')
  useEffect(showSelection, [selected])

  const virtualWidth = (PAGE_WIDTH * blockWidth) / 100
  const scale = boxWidth ? boxWidth / virtualWidth : 0

  return (
    <div ref={boxRef} className="relative overflow-hidden" style={{ height: height * scale }}>
      <iframe
        ref={frameRef}
        title="Preview"
        srcDoc={doc}
        onLoad={showSelection}
        // Scripts only for the Tailwind compiler and the editor; no same-origin, so it can't touch the app.
        sandbox="allow-scripts"
        className={`absolute top-0 left-0 origin-top-left border-0 ${editable ? '' : 'pointer-events-none'}`}
        style={{ width: virtualWidth, height, transform: `scale(${scale})` }}
      />
    </div>
  )
}
