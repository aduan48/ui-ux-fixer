import type { Block, Project } from '../types'

/** Version of the saved project shape. Bump it, and extend migrateProject, whenever Project changes shape. */
export const PROJECT_VERSION = 4

/** Bring a project saved by an older SketchKit up to date. Used for browser saves and opened files alike. */
export function migrateProject(project: Project, from: number): Project {
  if (from < 2) {
    // v1: width was 'full' | 'half' | 'third'; no saved styles.
    const pct: Record<string, number> = { full: 100, half: 50, third: 100 / 3 }
    project.styles ??= []
    for (const page of project.pages) for (const b of page.blocks as (Block & { width?: unknown })[]) b.width = pct[b.width as string] ?? 100
  }
  if (from < 3) project.assets ??= {} // v2 had no images
  if (from < 4) {
    // v3: width was a percent of a stacked canvas. Now page px on a 1440 frame; flow keeps the old wrapping until the first move.
    for (const page of project.pages) {
      page.flow = true
      for (const b of [...page.blocks, ...(page.original ?? [])]) {
        const old = b as Block & { width?: number }
        Object.assign(b, { x: 0, y: 0, w: Math.round(((old.width ?? 100) * 1440) / 100) })
        delete old.width
      }
    }
  }
  return project
}

export const serializeProject = (project: Project) =>
  JSON.stringify({ app: 'sketchkit', version: PROJECT_VERSION, savedAt: new Date().toISOString(), project })

/** Parse a saved project file. Throws an Error with a message fit to show the user. */
export function parseProjectFile(text: string): Project {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error("That file isn't valid JSON.")
  }
  const file = data as { app?: unknown; version?: unknown; project?: Partial<Project> }
  if (file?.app !== 'sketchkit' || typeof file.version !== 'number' || !file.project) throw new Error("That isn't a SketchKit project file.")
  if (file.version > PROJECT_VERSION) throw new Error('That project was saved by a newer version of SketchKit. Reload the app and try again.')
  const p = file.project
  const valid =
    typeof p.name === 'string' &&
    Array.isArray(p.pages) && p.pages.length > 0 &&
    p.pages.every(pg => pg && typeof pg.id === 'string' && typeof pg.name === 'string' && Array.isArray(pg.blocks)) &&
    Array.isArray(p.components) && Array.isArray(p.tokens)
  if (!valid) throw new Error('That project file is incomplete or damaged.')
  return migrateProject(
    { styles: [], assets: {}, globalNotes: '', ...p } as Project,
    file.version,
  )
}
