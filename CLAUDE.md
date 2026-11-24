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
- `src/store.ts`: the single Zustand store. All state changes go through its actions. Persisted to localStorage under the key `sketchkit`; bump `version` and add `migrate` if the persisted shape changes.
- `src/App.tsx`: three-panel shell and the single `DndContext`. Drag-end logic and collision detection live here.
- `src/components/`: UI panels (`ComponentBank`, `Canvas`, `BlockCard`, `PageTabs`, `NotesPanel`).
- `src/lib/`: framework-free logic (scanner, tokens, prompt, etc.) and `catalog.ts` (labels and icons for block and component types).
- `samples/`: small projects to test the scanner against.

## Conventions

- Rows are not a data structure: blocks have a width (`full | half | third`) and the canvas is `flex-wrap`, so consecutive narrow blocks form a row.
- Bank tiles are dnd-kit `useDraggable` items carrying `data.bankItem`; canvas blocks are `useSortable` items. `onDragEnd` tells them apart by `active.data.current.bankItem`.
- Never store file contents in the store, only scan results, to keep localStorage small.
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
- Browser-testing the scanner in dev: native folder pickers can't be automated. Import sample files with `import('/samples/...?raw')` and call `scanProject`. The app's store is a different module instance after HMR, so write through localStorage and reload instead.
