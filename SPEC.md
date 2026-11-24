# SketchKit spec: freeform canvas

Replaces the vertical-stack canvas with a Figma-style freeform canvas. `CLAUDE.md` describes the code as it is; each milestone folds its part of this spec into `CLAUDE.md` when it lands. Everything stays client-side (GitHub Pages).

## Decisions

- **Real rendering for everything.** HTML and React components both render their scanned markup in sandboxed iframes with the project's CSS and the bundled Tailwind compiler (as today). An attached screenshot replaces the live render. A token-styled wireframe (brand colors, fonts, radii) is the fallback only when a component has no renderable tree.
- **react-moveable + selecto** for drag, resize, group selection, grid snap and alignment guides, on real DOM elements (no `<canvas>`). dnd-kit stays only for dragging bank tiles onto the canvas.
- **PNG export inside the frames.** Previews are `sandbox="allow-scripts"` without same-origin, so the app can't read their DOM and html-to-image can't see them. Each preview snapshots itself with html-to-image and posts the PNG back; the app composites them on a 2D canvas at block positions. Never add `allow-same-origin`.

## Canvas

- Pan and zoom: one CSS transform (`translate + scale`) on the world layer. Wheel/trackpad pans, ⌘/Ctrl + wheel (pinch) zooms around the cursor, Space-drag or middle-drag pans. Toolbar: zoom out / in, percentage (click for 100%), Fit.
- Each page has one frame. Presets: Desktop 1440, Tablet 768, Mobile 390 (`page.frameWidth`, default 1440). Frame height grows to fit content (at least 800).
- Blocks are absolutely positioned in page px: `x`, `y`, `w`, optional `height` (undefined = fit content, measured from the preview). Previews render at the block's own px width, unscaled; the world transform does the scaling.
- **Flow pages.** Pages rebuilt by an import (and pages migrated from v3) start with `flow: true`: positions are computed, blocks wrap like the old canvas (left to right, then the next row) with measured heights, so sections stack exactly as their content needs. The first positioned edit (a drop, move or resize) freezes the computed positions into the blocks and their `original` snapshot, and clears `flow`.
- Manipulation (M2): drag, resize, marquee and Shift multi-select, Delete, Duplicate (⌘D), layer order (array order is z-order; ⌘] / ⌘[), 8px grid snap, guides to frame edges and other blocks. Edit inside keeps working; moveable is off for the block being edited.
- Undo/redo (M3): snapshot stack of `project.pages`, pushed per committed action (drag end, not every pointer move). ⌘Z / ⇧⌘Z.

## Components

- Attach a screenshot to any component (M5): stored in `project.assets` (≤1.5 MB, data URL), used as its preview.

## Prompt export

- Layout from positions (M4, `lib/layout.ts`): rows by vertical overlap, columns inside a row by horizontal overlap, recursively; alignment from shared left/center/right edges (±4px); gaps mapped to the nearest spacing token (else px). Pages are described top to bottom in layout terms, never raw coordinates.
- PNG of each page frame alongside the Markdown (M5). The brief tells the agent: the image is visual reference, the text is the exact spec.

## Milestones

1. **Data model and freeform display.** `x/y/w` + `frameWidth` + `flow`, `PROJECT_VERSION` 4 migration, pan/zoom canvas with frame presets, absolute blocks, bank drops at the release point, previews at block px width.
2. **Manipulation** with react-moveable + selecto.
3. **Undo/redo.**
4. **Layout inference** and brief rewrite.
5. **Screenshots and PNG export.**
6. **Docs**: everything folded into `CLAUDE.md`; delete this file.
