# SketchKit

Static web app (GitHub Pages) for sketching UI redesigns of an existing project. The user imports a codebase, gets a bank of its components and brand tokens, wireframes pages from them on a canvas, and exports a Markdown prompt for a coding agent. Everything runs client-side; there is no server.

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

- Rows are not a data structure: a block's `width` is a percentage (snaps to twelfths, Shift for free) and the canvas is `flex-wrap`, so consecutive narrow blocks form a row. Blocks carry their own `p-1.5` instead of a flex `gap`, so percentages add up to exactly 100.
- Block kinds: `component` (whole component), `element` (`componentId` + `elementPath`, a child-index path into the component's tree), `placeholder` (NEW, to be built).
- The canvas is preview-only (no wireframe mode): blocks are seamless sections inside a browser frame; names, toolbars and resize handles show on hover/selection. Blocks are `select-none` so double-click (enter editing) never selects the iframe as text.
- Blocks may carry `frames` (the wrappers they sat in on the original page, re-applied by `renderBlock`), `props` (string props the page passed) and `tree` (the user's rearranged copy of the markup, edited via `lib/treeEdit.ts`; Reset clears it).
- "Edit inside": `editingBlockId` makes that block's iframe interactive and injects the editor script (`EDITOR_SCRIPT` in `lib/render.ts`). The script only reports intents by postMessage (`skSelect`, `skMove`, `skDelete`, `skDone`); the app applies them to the tree and re-renders. The app sends `skShow` to highlight a selection. Only the block's own nodes get `data-sk` paths; nested components move as one piece.
- Bank tiles are dnd-kit `useDraggable` items carrying `data.bankItem`; canvas blocks are `useSortable` items. `onDragEnd` tells them apart by `active.data.current.bankItem`.
- Only CSS (`project.styles`, url()s inlined) and images (`project.assets`, data URLs, ≤1.5 MB each) are stored. Never store JS/TSX source; store scan results. Trees refer to images as `@asset:<path>`, and to dynamic attribute values as `@expr:<prop>` (filled from passed props at render time).
- Keep the app's own UI minimal: neutral greys, 1px borders, 13px text, wireframe look.
- Read store actions with `useStore.getState()` in event handlers; subscribe with selectors only for data you render.
- Testing drag-and-drop with browser automation: one-jump synthetic drags don't trigger dnd-kit drops. Dispatch stepped `pointermove` events instead.
- `vite.config.ts` uses `base: './'`; there is no router, so the app works under any GitHub Pages path.

## Import and scanning

- Every import source produces `SourceFile[]` (`{ path, content }`, paths relative to the project root). `lib/files.ts` owns the ignore list and extension filter (`isWanted`). Reuse it for new sources.
- `lib/scan.ts` is the scanner entry point and pulls in `@babel/parser` (~300 KB). Only import it with `await import()`, never statically from UI code.
- Component ids are `filePath#name`. That keeps canvas blocks linked across re-imports; don't change the format without migrating saved projects.
- React components: an exported, capitalised function, arrow function or class that contains JSX, including `memo` / `forwardRef` wrappers. Props come from the destructured first parameter plus same-file `interface` / `type` declarations.
- Next.js route files (`app/**/page|layout`, `pages/**`) get type `page` and a route name such as `/about`.
- Type guessing (`lib/guessType.ts`): the last matching word of the name wins (`FeatureCard` is a card), then the root JSX/HTML tag.
- `src/lib/scan.test.ts` asserts the exact scan output for `samples/`. When you add a sample file, update the expected table.
- Each component keeps a `tree` (`StaticNode`, built by `lib/jsxTree.ts` or `scanHtml.ts`): its returned markup with literal text and classNames; dynamic parts become `expr`, `.map()` keeps one item, ternaries keep their first branch. Capped at 400 nodes.
- `lib/render.ts`: lists inner elements (`elementsOf`), renders trees to HTML (nested components resolved by name, string props substituted, `{children}` slotted, hrefs neutralised, scripts dropped), and builds the preview document.
- Previews (`components/Preview.tsx`) are sandboxed iframes (`allow-scripts` only) with the project's CSS (each plain file in its own `<style>` so `@import`s work) plus the bundled `@tailwindcss/browser` compiler. They render at 1280px × the block's width share, start 800px tall so `h-screen` sections measure like a laptop, and are scaled down to fit.
- `lib/currentPages.ts`: on import into an empty canvas, rebuilds the site's current pages (Next routes wrapped in the root layout, else `App`, else one page per HTML file) as blocks, in Preview.
- Browser-testing: use a separate origin (`npx vite --port 5174 --host 127.0.0.1`) so you never touch the user's saved project on localhost:5173. To call app modules, import the exact URL the page loaded (the latest `performance.getEntriesByType('resource')` entry, which carries Vite's `?t=` timestamp), not the bare path, or you get a second store instance. After editing store dependencies, do a full reload.
- Browser-testing drags inside previews: the drag tool's final mouse position often isn't delivered before release, so drops land on the last intermediate element. Listen for the iframe's postMessages to verify intent.
- Browser-testing the scanner in dev: native folder pickers can't be automated. Import sample files with `import('/samples/...?raw')` and call `scanProject`.
