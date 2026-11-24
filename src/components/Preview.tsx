import tailwindBrowser from '@tailwindcss/browser?url'
import { useEffect, useMemo, useRef } from 'react'
import { previewDoc, VIEWPORT_HEIGHT } from '../lib/render'
import { backdropColor } from '../lib/color'
import { moveInto, moveNode, removeNode, setOffset } from '../lib/treeEdit'
import { useStore } from '../store'

const MAX_HEIGHT = 4000
const tailwindUrl = new URL(tailwindBrowser, location.href).href

/** Renders at the block's own width in page px; the canvas zoom scales it. */
export function Preview({ blockId, html, width, editable }: { blockId: string; html: string; width: number; editable: boolean }) {
  const styles = useStore(s => s.project.styles)
  const backdrop = useStore(s => backdropColor(s.project.tokens))
  const selected = useStore(s => (editable ? s.selectedElementPath : null))
  const editMode = useStore(s => s.editMode)
  const doc = useMemo(() => previewDoc(html, styles, tailwindUrl, { editable, backdrop }), [html, styles, editable, backdrop])

  const frameRef = useRef<HTMLIFrameElement>(null)
  // Kept in the store across re-renders (so edits don't flash) and for the canvas layout.
  const height = useStore(s => s.measured[blockId]) ?? VIEWPORT_HEIGHT

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow || typeof e.data !== 'object' || !e.data) return
      const { skHeight, skSelect, skMove, skMoveInto, skOffset, skDelete, skDone, skUndo } = e.data
      const store = useStore.getState()
      if (typeof skHeight === 'number') store.setMeasured(blockId, Math.min(MAX_HEIGHT, Math.max(24, skHeight)))
      if (typeof skSelect === 'string') store.selectElement(skSelect)
      if (skMove && typeof skMove.from === 'string' && typeof skMove.target === 'string') {
        store.editBlockTree(blockId, t => moveNode(t, skMove.from, skMove.target, !!skMove.after))
        store.selectElement(null)
      }
      if (skMoveInto && typeof skMoveInto.from === 'string' && typeof skMoveInto.parent === 'string') {
        store.editBlockTree(blockId, t => moveInto(t, skMoveInto.from, skMoveInto.parent))
        store.selectElement(null)
      }
      if (skOffset && typeof skOffset.path === 'string' && Number.isFinite(skOffset.x) && Number.isFinite(skOffset.y))
        store.editBlockTree(blockId, t => setOffset(t, skOffset.path, { x: skOffset.x, y: skOffset.y }))
      if (typeof skDelete === 'string') {
        store.editBlockTree(blockId, t => removeNode(t, skDelete))
        store.selectElement(null)
      }
      if (skDone) store.stopEditing()
      if (skUndo === 'undo') store.undo()
      if (skUndo === 'redo') store.redo()
    }
    addEventListener('message', onMessage)
    return () => removeEventListener('message', onMessage)
  }, [blockId])

  // The editor in the frame learns the selection and drag mode by message (no reload needed).
  const showSelection = () => frameRef.current?.contentWindow?.postMessage({ skShow: selected, skMode: editMode }, '*')
  useEffect(showSelection, [selected, editMode])

  return (
    <div className="relative overflow-hidden" style={{ height }}>
      <iframe
        ref={frameRef}
        title="Preview"
        srcDoc={doc}
        onLoad={showSelection}
        // Scripts only for the Tailwind compiler and the editor; no same-origin, so it can't touch the app.
        sandbox="allow-scripts"
        className={`absolute top-0 left-0 border-0 ${editable ? '' : 'pointer-events-none'}`}
        style={{ width, height }}
      />
    </div>
  )
}
