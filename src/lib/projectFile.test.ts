import { describe, expect, it } from 'vitest'
import type { Project } from '../types'
import { parseProjectFile, PROJECT_VERSION, serializeProject } from './projectFile'

const project: Project = {
  name: 'Hockey', source: 'hockey', components: [], styles: [], assets: { 'a.png': 'data:image/png;base64,AA==' }, tokens: [],
  globalNotes: 'premium', pages: [{ id: 'p1', name: 'Home', notes: '', blocks: [{ id: 'b1', kind: 'placeholder', placeholder: 'text', x: 0, y: 0, w: 720, notes: 'hi' }], flow: true }],
}

describe('project files', () => {
  it('round-trips a project', () => {
    expect(parseProjectFile(serializeProject(project))).toEqual(project)
  })

  it('migrates files from older versions', () => {
    const v1 = JSON.stringify({ app: 'sketchkit', version: 1, project: { ...project, styles: undefined, assets: undefined, pages: [{ ...project.pages[0], blocks: [{ ...project.pages[0].blocks[0], width: 'half' }] }] } })
    const p = parseProjectFile(v1)
    expect(p.pages[0].blocks[0]).toEqual({ id: 'b1', kind: 'placeholder', placeholder: 'text', x: 0, y: 0, w: 720, notes: 'hi' })
    expect(p.pages[0].flow).toBe(true)
    expect(p.assets).toEqual({})
    expect(p.styles).toEqual([])
  })

  it('rejects anything that is not a usable SketchKit file, with a readable reason', () => {
    expect(() => parseProjectFile('{nope')).toThrow("isn't valid JSON")
    expect(() => parseProjectFile('{"name":"x"}')).toThrow("isn't a SketchKit project file")
    expect(() => parseProjectFile(JSON.stringify({ app: 'sketchkit', version: PROJECT_VERSION + 1, project }))).toThrow('newer version')
    expect(() => parseProjectFile(JSON.stringify({ app: 'sketchkit', version: PROJECT_VERSION, project: { ...project, pages: [] } }))).toThrow('incomplete or damaged')
  })
})
