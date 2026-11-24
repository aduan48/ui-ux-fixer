# SketchKit

Static web app (GitHub Pages) for sketching UI redesigns of an existing project. A freeform-canvas rework is in progress: see `SPEC.md` for the plan and milestones; this file describes what has landed. The user imports a codebase, gets a bank of its components and brand tokens, wireframes pages from them on a canvas, and exports a Markdown prompt for a coding agent. Everything runs client-side; there is no server.

## Commands

- `npm run dev`: dev server at http://localhost:5173
- `npm run build`: type-check (`tsc -b`) and production build to `dist/`
- `npm test`: Vitest (pure logic in `src/lib/`)

## Stack

Vite + React 19 + TypeScript, Tailwind v4 (via `@tailwindcss/vite`, theme in `src/index.css`, no config file), dnd-kit, Zustand, lucide-react icons.

## Layout

- `src/types.ts`: the data model (`Project` → `Page` → `Block`, plus `ScannedComponent`, `BrandToken`).
- `src/store.ts`: the single Zustand store. All state changes go through its actions. Persisted to IndexedDB (idb-keyval, key `sketchkit`; writes debounced 300 ms and flushed on `pagehide`; reads fall back to v1's localStorage). Bump `version` and extend `migrate` if the persisted shape changes.
- `src/App.tsx`: three-panel shell and the single `DndContext`. Drag-end logic and collision detection live here.
- `src/components/`: UI panels (`ComponentBank`, `Canvas`, `BlockCard`, `PageTabs`, `NotesPanel`).
- `src/lib/`: framework-free logic (scanner, tokens, prompt, etc.) and `catalog.ts` (labels and icons for block and component types).
- `samples/`: small projects to test the scanner against.

## Conventions

- Freeform canvas: blocks sit at `x`, `y`, `w` (page px, relative to the page frame) with optional `height` (undefined = fit content, as measured). Each page has a frame width (`page.frameWidth`, presets in `lib/layout.ts` `FRAMES`: 1440 / 768 / 390, default 1440). Array order is z-order.
- Flow pages (`page.flow`, set by import and the v3 migration): positions are computed by `flowPositions` (blocks wrap left to right, rows as tall as their tallest block, widths clamped to the frame) from measured heights. The first positioned edit (`addBlock`) freezes them into the blocks and into `page.original`, then clears `flow`. Always read drawn positions through `placedBlocks(page, heightOf)`.
- Measured preview heights live in the store (`measured`, not persisted); `heightFrom(measured)` gives a block's height (explicit, else measured, else `VIEWPORT_HEIGHT`).
- Pan/zoom is one CSS transform on the canvas world (`Canvas.tsx`, local state): wheel pans, ⌘/Ctrl-wheel zooms around the cursor, Space- or middle-drag pans. The world sets `--zoom` so block chips and toolbars counter-scale to stay screen-sized. `toPagePoint` turns screen points into page px.
- Block kinds: `component` (whole component), `element` (`componentId` + `elementPath`, a child-index path into the component's tree), `placeholder` (NEW, to be built).
- The canvas is preview-only (no wireframe mode): blocks are seamless sections inside a browser frame; names and toolbars show on hover/selection. Blocks are `select-none` so double-click (enter editing) never selects the iframe as text.
- Blocks may carry `frames` (the wrappers they sat in on the original page, re-applied by `renderBlock`), `props` (string props the page passed) and `tree` (the user's rearranged copy of the markup, edited via `lib/treeEdit.ts`; Reset clears it).
- "Edit inside": `editingBlockId` makes that block's iframe interactive and injects the editor script (`EDITOR_SCRIPT` in `lib/render.ts`). The script only reports intents by postMessage (`skSelect`, `skMove`, `skMoveInto`, `skDelete`, `skDone`); the app applies them to the tree (`lib/treeEdit.ts`) and re-renders. The app sends `skShow` to highlight a selection. Only the block's own nodes get `data-sk` paths; nested components move as one piece.
- Two drag modes while editing inside (`editMode`, sent to the frame as `skMode`, not persisted): **free** (default) stores an `offset` {x, y} in page px on the node (`setOffset`), rendered as a CSS `translate` so the surrounding layout doesn't move; Shift locks direction, 4px snap, double-click resets. **reorder** moves nodes in the structure (`skMove` / `skMoveInto`). Offsets on element-less wrappers (`<Link>`) pass to their children. An edit that leaves the tree identical to the scanned one clears `block.tree`.
- The brief describes offsets in words ("about 40px right and 24px up") and asks for real layout, not offsets; it prints the restructure section only when the structure (`withoutOffsets`) changed.
- Editor rules: hit-testing is geometric (smallest `[data-sk]` box under the pointer), never `elementFromPoint`, because real sites stack overlays (video layers, absolute wrappers). Children are counted by path, not DOM (a `<Link>` renders no element of its own). Dragging lifts single-child wrappers (`<a><button>`). Drops go next to the nearest child of the container under the pointer, or into an empty container; media-only boxes (background video layers) are never drop targets. Overlay boxes are `<sk-box>` so site `div` rules can't style them.
- Bank tiles are dnd-kit `useDraggable` items carrying `data.bankItem`; the canvas viewport is the only droppable. A drop places the block's top-left where the drag ghost's top-left is (`addBlock(item, toPagePoint(...))`). Moving and resizing blocks on the canvas is M2 (react-moveable), not dnd-kit.
- Only CSS (`project.styles`, url()s inlined) and images (`project.assets`, data URLs, ≤1.5 MB each) are stored. Never store JS/TSX source; store scan results. Trees refer to images as `@asset:<path>`, and to dynamic attribute values as `@expr:<prop>` (filled from passed props at render time).
- Keep the app's own UI minimal: neutral greys, 1px borders, 13px text, wireframe look.
- Read store actions with `useStore.getState()` in event handlers; subscribe with selectors only for data you render.
- Testing drag-and-drop with browser automation: one-jump synthetic drags don't trigger dnd-kit drops. Dispatch stepped `pointermove` events instead.
- `vite.config.ts` uses `base: './'`; there is no router, so the app works under any GitHub Pages path.

## Import and scanning

- Every import source produces `SourceFile[]` (`{ path, content }`, paths relative to the project root). `lib/files.ts` owns the ignore list and extension filter (`isWanted`). Reuse it for new sources.
- `lib/scan.ts` is the scanner entry point and pulls in `@babel/parser` (~300 KB). Only import it with `await import()`, never statically from UI code.
- Every import replaces the whole project: page tabs (rebuilt from the imported site), blocks, notes, components, images and tokens. The import dialog asks first whenever the current sketch has blocks or notes, and points to Save.
- Component ids are `filePath#name`. That keeps canvas blocks linked across re-imports; don't change the format without migrating saved projects.
- React components: an exported, capitalised function, arrow function or class that contains JSX, including `memo` / `forwardRef` wrappers. Props come from the destructured first parameter plus same-file `interface` / `type` declarations.
- Next.js route files (`app/**/page|layout`, `pages/**`) get type `page` and a route name such as `/about`.
- Type guessing (`lib/guessType.ts`): the last matching word of the name wins (`FeatureCard` is a card), then the root JSX/HTML tag.
- `src/lib/scan.test.ts` asserts the exact scan output for `samples/`. When you add a sample file, update the expected table.
- Each component keeps a `tree` (`StaticNode`, built by `lib/jsxTree.ts` or `scanHtml.ts`): its returned markup with literal text and classNames; dynamic parts become `expr`, `.map()` keeps one item, ternaries keep their first branch. Capped at 400 nodes.
- `lib/render.ts`: lists inner elements (`elementsOf`), renders trees to HTML (nested components resolved by name, string props substituted, `{children}` slotted, hrefs neutralised, scripts dropped), and builds the preview document.
- Preview CSS fixes: `vh` units are rewritten to px against `VIEWPORT_HEIGHT` (`fixVh`), since in a content-sized iframe `vh` feeds back into its own height; animations and transitions are disabled (site fade-ins would replay on every re-render); page `frames` get `data-sk-frame` so wrapper `min-height: 100vh` can't stretch each section; `BACKDROP_SCRIPT` puts the site's dark tone (`backdropColor`) behind light text that has no background (e.g. a transparent white-text navbar).
- Previews (`components/Preview.tsx`) are sandboxed iframes (`allow-scripts` only) with the project's CSS (each plain file in its own `<style>` so `@import`s work) plus the bundled `@tailwindcss/browser` compiler. They render at the block's own px width, unscaled (the canvas zoom scales them), and start 800px tall so `h-screen` sections measure like a laptop.
- `lib/currentPages.ts`: on every import, rebuilds the site's current pages as blocks: React Router `<Route>`s inside the component that renders `<Routes>` (aliases, `*` and `:param` routes skipped), else Next routes wrapped in the root layout, else `App`, else one page per HTML file. Unknown library wrappers (`Router`, providers) are walked through.
- Component references resolve by import first (`comp.src` + `comp.imp`, so `import Puck from './Hero'` finds Hero), then by name (`indexComponents` in `lib/render.ts`). Components keep `isDefault`. A component's tree is its *last* JSX return (early returns are loading states).
- Browser-testing: use a separate origin (`npx vite --port 5174 --host 127.0.0.1`) so you never touch the user's saved project on localhost:5173. To call app modules, import the exact URL the page loaded (the latest `performance.getEntriesByType('resource')` entry, which carries Vite's `?t=` timestamp), not the bare path, or you get a second store instance. After editing store dependencies, do a full reload.
- Browser-testing drags inside previews: the drag tool's final mouse position often isn't delivered before release, so drops land on the last intermediate element. Listen for the iframe's postMessages to verify intent.
- Browser-testing the scanner in dev: native folder pickers can't be automated. Import sample files with `import('/samples/...?raw')` and call `scanProject`.

## Brand tokens

- `lib/tokens.ts` (`extractTokens`, run inside `scanProject`) collects colors, fonts, font sizes, radii and spacing from CSS (custom properties, declarations, Tailwind v4 `@theme`), `tailwind.config.*` (literal `theme` / `theme.extend` only, read with Babel, never executed), Tailwind classes in markup (resolved through the config, then Tailwind's own `theme.css`, imported `?raw`), Google Fonts links and `next/font/google` imports. Tokens are deduped by normalized value, keep every alias in `name`, rank by use and are capped per kind.
- Roles: `roles` is an array, so one font can be heading and body. Each role belongs to one token (`toggleTokenRole`). On import, primary/accent are the most-used non-neutral colors (`isNeutral`: greys, near-black, near-white).
- The config is also emitted as a v4 `@theme` block and added to `project.styles`, so previews understand `bg-brand-500`, `rounded-card`, etc.
- Vitest stubs CSS imports; `vite.config.ts` sets `test.css.include` so `tailwindcss/theme.css?raw` loads as real text in tests.

## Export and project files

- `lib/prompt.ts` (`buildPrompt`) writes the Markdown brief: agent instructions, project/stack, brand rules (roles first), overall notes, then each page's target layout (rows by vertical overlap of the drawn positions via `rowsOf` in `lib/layout.ts`, widths as a share of the frame; "reuse `path`" vs "NEW"; props; rearranged structure with the current structure for comparison and removed leaf pieces; notes), the page's current layout from `page.original`, and a list of new things to build. Unchanged imported pages collapse to "No layout changes".
- Element labels (`labelAt` in `lib/render.ts`) are tag + id or first non-utility class + text, or the components a wrapper contains. They appear in the layers panel, bank and brief, so keep them meaningful.
- Pages rebuilt from an import keep `route`, `componentId` and `original` (a snapshot of their blocks) so the brief can describe changes.
- `lib/projectFile.ts`: `.sketchkit.json` save/open (`serializeProject` / `parseProjectFile`) and `migrateProject`, shared with the IndexedDB persist migration. Bump `PROJECT_VERSION` and extend `migrateProject` together.
- SketchKit never writes to the imported project: import is read-only and all output is text (the brief or a project file).
