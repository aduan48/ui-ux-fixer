import tailwindBrowser from '@tailwindcss/browser?url'
import htmlToImage from 'html-to-image/dist/html-to-image.js?url'
import type { Block, Page, Project } from '../types'
import { backdropColor } from './color'
import { contentBottom, frameWidthOf, placedBlocks } from './layout'
import { blockHtml, previewDoc, VIEWPORT_HEIGHT } from './render'

const abs = (u: string) => new URL(u, location.href).href
const TIMEOUT_MS = 20_000

/**
 * Render one block offscreen and let it snapshot itself. Previews have no same-origin access, so the
 * app can't read their DOM: the frame runs html-to-image and posts the PNG back.
 */
function snapshotBlock(doc: string, width: number): Promise<{ png: string; height: number } | undefined> {
  return new Promise(resolve => {
    const frame = document.createElement('iframe')
    frame.sandbox.add('allow-scripts')
    // In the viewport but invisible: Chrome pauses animation frames in offscreen cross-origin frames, and html-to-image waits on one.
    frame.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:${VIEWPORT_HEIGHT}px;border:0;opacity:0;pointer-events:none;z-index:-1`
    const done = (v?: { png: string; height: number }) => {
      clearTimeout(timer)
      removeEventListener('message', onMessage)
      frame.remove()
      resolve(v)
    }
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.contentWindow || !e.data || !('skPng' in e.data)) return
      done(typeof e.data.skPng === 'string' ? { png: e.data.skPng, height: e.data.skHeight } : undefined)
    }
    const timer = setTimeout(() => done(), TIMEOUT_MS)
    addEventListener('message', onMessage)
    frame.srcdoc = doc
    document.body.append(frame)
  })
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })

/** A PNG of the page frame as sketched: every block rendered at its place, in z-order. Undefined for an empty page. */
export async function pagePng(page: Page, project: Project): Promise<Blob | undefined> {
  if (!page.blocks.length) return
  const fw = frameWidthOf(page)
  const opts = { backdrop: backdropColor(project.tokens), snapshotUrl: abs(htmlToImage) }
  // Widths don't depend on heights; heights come from the snapshots themselves (pages never opened have no measurements).
  const widths = new Map(placedBlocks(page, () => 0).map(b => [b.id, b.w]))
  const shots = new Map<string, { png: string; height: number } | undefined>()
  await Promise.all(page.blocks.map(async b => {
    const html = blockHtml(b, project)
    shots.set(b.id, html ? await snapshotBlock(previewDoc(html, project.styles, abs(tailwindBrowser), opts), widths.get(b.id)!) : undefined)
  }))
  // A block that didn't render would be a silent hole: report the page as failed instead.
  if (page.blocks.some(b => !shots.get(b.id) && blockHtml(b, project))) return
  const heightOf = (b: Block) => b.height ?? shots.get(b.id)?.height ?? 0
  const blocks = placedBlocks(page, heightOf)

  const canvas = Object.assign(document.createElement('canvas'), { width: fw, height: Math.max(VIEWPORT_HEIGHT, Math.ceil(contentBottom(blocks, heightOf))) })
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  for (const b of blocks) {
    const shot = shots.get(b.id)
    if (!shot) continue
    const img = await loadImage(shot.png)
    const h = heightOf(b) // a hand-set height crops the render, like the canvas does
    ctx.drawImage(img, 0, 0, b.w, Math.min(h, img.height), b.x, b.y, b.w, Math.min(h, img.height))
  }
  return new Promise(resolve => canvas.toBlob(blob => resolve(blob ?? undefined), 'image/png'))
}
