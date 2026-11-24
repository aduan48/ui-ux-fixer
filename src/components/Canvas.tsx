import { useDroppable } from '@dnd-kit/core'
import { Maximize, Minus, Plus } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { contentBottom, FRAMES, frameWidthOf, heightFrom, placedBlocks } from '../lib/layout'
import { VIEWPORT_HEIGHT } from '../lib/render'
import { useActivePage, useStore } from '../store'
import { BlockCard } from './BlockCard'
import { PageTabs } from './PageTabs'

export const CANVAS_DROP_ID = 'canvas'

const MIN_ZOOM = 0.1
const MAX_ZOOM = 4
const MARGIN = 32
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

/** "Home" → "/", "about" → "/about": shown in the browser frame's address bar. */
const pageUrl = (name: string) => (/^home$/i.test(name) ? '/' : '/' + name.toLowerCase().replace(/^\//, '').replace(/\s+/g, '-'))

/** The page frame's content box, for turning screen points into page px. */
let frameEl: HTMLDivElement | null = null

/** A screen point in page px (relative to the frame's content, unzoomed). */
export function toPagePoint(clientX: number, clientY: number) {
  if (!frameEl) return { x: 0, y: 0 }
  const r = frameEl.getBoundingClientRect()
  const zoom = r.width / frameEl.offsetWidth
  return { x: (clientX - r.left) / zoom, y: (clientY - r.top) / zoom }
}

export function Canvas() {
  const page = useActivePage()
  const source = useStore(s => s.project.source ?? s.project.name)
  const measured = useStore(s => s.measured)
  const { setNodeRef, isOver } = useDroppable({ id: CANVAS_DROP_ID })
  const { selectBlock, stopEditing } = useStore.getState()

  const fw = frameWidthOf(page)
  const heightOf = heightFrom(measured)
  const blocks = placedBlocks(page, heightOf)
  const frameHeight = Math.max(VIEWPORT_HEIGHT, contentBottom(blocks, heightOf))

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [view, setView] = useState({ x: MARGIN, y: MARGIN, zoom: 1 })

  /** Fit the frame's width into the viewport, top aligned. */
  const fit = () => {
    const vw = viewportRef.current?.clientWidth
    if (!vw) return
    const zoom = clampZoom(Math.min(1, (vw - 2 * MARGIN) / fw))
    setView({ zoom, x: (vw - fw * zoom) / 2, y: MARGIN })
  }
  useLayoutEffect(fit, [page.id, fw])

  /** Zoom to `zoom`, keeping the viewport point (px, py) still (the center if omitted). */
  const zoomTo = (zoom: number, px?: number, py?: number) =>
    setView(v => {
      const el = viewportRef.current!
      const x = px ?? el.clientWidth / 2, y = py ?? el.clientHeight / 2
      const z = clampZoom(zoom)
      return { zoom: z, x: x - ((x - v.x) * z) / v.zoom, y: y - ((y - v.y) * z) / v.zoom }
    })

  // Wheel pans, pinch / ⌘-wheel zooms. Non-passive so it can stop the browser's own page zoom.
  useEffect(() => {
    const el = viewportRef.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect()
        setView(v => {
          const z = clampZoom(v.zoom * Math.exp(-e.deltaY * 0.01))
          const px = e.clientX - r.left, py = e.clientY - r.top
          return { zoom: z, x: px - ((px - v.x) * z) / v.zoom, y: py - ((py - v.y) * z) / v.zoom }
        })
      } else setView(v => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Space-drag or middle-drag pans.
  const space = useRef(false)
  const panned = useRef(false)
  useEffect(() => {
    const typing = (e: KeyboardEvent) => (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')
    const down = (e: KeyboardEvent) => { if (e.code === 'Space' && !typing(e)) { space.current = true; e.preventDefault() } }
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') space.current = false }
    addEventListener('keydown', down)
    addEventListener('keyup', up)
    return () => { removeEventListener('keydown', down); removeEventListener('keyup', up) }
  }, [])
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    panned.current = false
    if (e.button !== 1 && !(e.button === 0 && space.current)) return
    e.preventDefault()
    e.stopPropagation() // not a dnd-kit drag or a block click
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    let last = { x: e.clientX, y: e.clientY }
    el.onpointermove = ev => {
      panned.current = true
      setView(v => ({ ...v, x: v.x + ev.clientX - last.x, y: v.y + ev.clientY - last.y }))
      last = { x: ev.clientX, y: ev.clientY }
    }
    el.onpointerup = el.onpointercancel = () => { el.onpointermove = el.onpointerup = el.onpointercancel = null }
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-neutral-100">
      <PageTabs />
      <div
        ref={el => { viewportRef.current = el; setNodeRef(el) }}
        onPointerDownCapture={onPointerDown}
        onClick={() => { if (!panned.current) { stopEditing(); selectBlock(null) } }}
        className={`relative flex-1 overflow-hidden ${isOver ? 'outline-2 -outline-offset-2 outline-blue-400' : ''}`}
      >
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, '--zoom': view.zoom } as React.CSSProperties}
        >
          {/* A browser window, so the sketch reads as "the site", not as a stack of cards. */}
          <div className="rounded-xl bg-white shadow-[0_1px_3px_rgba(0,0,0,.08),0_8px_24px_rgba(0,0,0,.06)] ring-1 ring-neutral-200" style={{ width: fw }}>
            <div className="flex items-center gap-3 rounded-t-xl border-b border-neutral-200 bg-neutral-50 px-4 py-2.5">
              <div className="flex gap-1.5" aria-hidden>
                <span className="size-2.5 rounded-full bg-neutral-300" />
                <span className="size-2.5 rounded-full bg-neutral-300" />
                <span className="size-2.5 rounded-full bg-neutral-300" />
              </div>
              <div className="mx-auto w-full max-w-sm truncate rounded-md bg-white px-3 py-1 text-center text-xs text-neutral-500 ring-1 ring-neutral-200">
                {source.toLowerCase().replace(/\s+/g, '-')}{pageUrl(page.name)}
              </div>
              <span className="w-[42px]" aria-hidden />
            </div>

            <div ref={el => { frameEl = el }} className="relative rounded-b-xl" style={{ height: frameHeight }}>
              {blocks.map((b, i) => <BlockCard key={b.id} block={page.blocks[i]} placed={b} />)}
              {page.blocks.length === 0 && (
                <div className="grid h-full place-items-center p-8 text-center">
                  <div>
                    <p className="text-sm font-medium text-neutral-700">“{page.name}” is empty</p>
                    <p className="mt-1 text-[13px] text-neutral-500">Drag components or blocks here from the left, or import a project to start from your current site.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <CanvasToolbar zoom={view.zoom} frameWidth={fw} onZoom={z => zoomTo(z)} onFit={fit} />
      </div>
    </main>
  )
}

function CanvasToolbar({ zoom, frameWidth, onZoom, onFit }: { zoom: number; frameWidth: number; onZoom: (z: number) => void; onFit: () => void }) {
  const btn = 'rounded p-1 text-neutral-600 hover:bg-neutral-100'
  return (
    <div
      onClick={e => e.stopPropagation()}
      className="absolute right-3 bottom-3 flex items-center gap-1 rounded-md border border-neutral-200 bg-white p-0.5 text-[11px] font-medium shadow-sm"
    >
      <div role="radiogroup" aria-label="Page frame" className="flex rounded bg-neutral-100 p-0.5">
        {FRAMES.map(f => (
          <button
            key={f.width}
            role="radio"
            aria-checked={frameWidth === f.width}
            title={`${f.width}px`}
            onClick={() => useStore.getState().setFrameWidth(f.width)}
            className={`rounded px-1.5 py-0.5 ${frameWidth === f.width ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <span className="mx-0.5 h-4 w-px bg-neutral-200" />
      <button onClick={() => onZoom(zoom / 1.25)} aria-label="Zoom out" className={btn}><Minus className="size-3.5" /></button>
      <button onClick={() => onZoom(1)} title="Zoom to 100%" className="w-11 rounded py-0.5 text-center text-neutral-700 tabular-nums hover:bg-neutral-100">
        {Math.round(zoom * 100)}%
      </button>
      <button onClick={() => onZoom(zoom * 1.25)} aria-label="Zoom in" className={btn}><Plus className="size-3.5" /></button>
      <button onClick={onFit} aria-label="Fit width" title="Fit width" className={btn}><Maximize className="size-3.5" /></button>
    </div>
  )
}
