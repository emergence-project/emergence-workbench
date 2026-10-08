import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { figureEmbedResolver } from './figureEmbeds.js'
import { LATEX_FILES_DIR } from './latexFiles.js'
import { pathKeyOf } from './manuscript.js'
import { exportBlock, exportNotes } from './noteExport.js'
import { app, repo, tmp, useSampleApp } from './testkit.js'

useSampleApp()

const LOCAL = Buffer.from('local original\r\n')
const SHARED = Buffer.from('library original\r\n')
const REF = 'figure-library/library/picture.png'
const SOURCE = `![[${REF}]]\n\n![](${REF})\n![[Shared picture]]\nAfter picture\n\n![](note-assets/kept.png)\n\n\`\`\`tex\n\\includegraphics{${REF}}\n\`\`\`\n`
const write = (file: string, data: Buffer | string) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data) }

/** stored zip을 읽으면서 중복 파일 이름도 확인한다. */
function zipEntries(zip: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>()
  for (let at = 0; zip.readUInt32LE(at) === 0x04034b50;) {
    const size = zip.readUInt32LE(at + 18), nameSize = zip.readUInt16LE(at + 26), extraSize = zip.readUInt16LE(at + 28)
    const full = zip.subarray(at + 30, at + 30 + nameSize).toString()
    const name = full.slice(full.indexOf('/') + 1)
    const start = at + 30 + nameSize + extraSize
    expect(entries.has(name)).toBe(false)
    entries.set(name, zip.subarray(start, start + size))
    at = start + size
  }
  return entries
}

describe('내보낸 그림 경로 충돌', () => {
  it.each(['one', 'many', 'block'] as const)('%s: 로컬 그림과 라이브러리 원본을 각각 보존한다', (kind) => {
    const library = path.join(tmp, `collision-library-${kind}`)
    write(path.join(library, 'figures/picture.png'), SHARED)
    write(path.join(library, 'figures/figures.yaml'), 'picture.png: {name: Shared picture}\n')
    app.registry.setLibrary(library)
    const note = path.join(repo, kind === 'block' ? `workbench/blocks/collision-${kind}.md` : `workbench/notes/collision-${kind}/note.md`)
    const dir = path.dirname(note)
    const content = kind === 'block' ? `---\nid: collision-${kind}\ntitle: Collision\n---\n${SOURCE}` : SOURCE
    write(note, content)
    if (kind !== 'block') write(path.join(dir, 'note.yaml'), 'name: Collision\n')
    write(path.join(dir, REF), LOCAL)
    write(path.join(dir, 'note-assets/kept.png'), 'already used prefix')
    const wb = app.registry.get('sample-research')
    const latex = { template: app.registry.template('article'), filesDir: LATEX_FILES_DIR, figures: figureEmbedResolver(app.registry, 'sample-research') }
    const keys = [pathKeyOf(path.relative(repo, note))]
    if (kind === 'many') {
      const second = path.join(repo, 'workbench/notes/collision-other/note.md')
      write(second, 'Other note\n')
      write(path.join(path.dirname(second), 'note.yaml'), 'name: Other\n')
      keys.push(pathKeyOf(path.relative(repo, second)))
    }
    const result = kind === 'block' ? exportBlock(wb, `collision-${kind}`, latex) : exportNotes(wb, keys, latex)
    const entries = zipEntries(result.zip)
    const body = entries.get(kind === 'many' ? 'notes/collision/body.tex' : 'main.tex')!.toString()
    const assetPrefix = kind === 'block' ? 'block-files/note-assets/blocks/' : 'note-assets-2/'
    expect(body.match(new RegExp(`\\\\includegraphics\\[width=0.8\\\\linewidth\\]\\{${assetPrefix}${REF}\\}`, 'g'))).toHaveLength(2)
    expect(body).toContain(`\\begin{center}\n\\includegraphics[width=0.8\\linewidth]{${REF}}\n\\end{center}`)
    expect(body).toContain(`\\includegraphics[width=0.8\\linewidth]{${assetPrefix}${REF}}\n\\begin{center}`)
    expect(body).toContain('\\end{center}\nAfter picture')
    expect(body).toContain(`\\begin{verbatim}\n\\includegraphics{${REF}}\n\\end{verbatim}`)
    expect(entries.get(REF)).toEqual(SHARED)
    const localPrefix = kind === 'many' ? 'notes/collision/' : ''
    expect(entries.get(`${localPrefix}${assetPrefix}${REF}`)).toEqual(LOCAL)
    if (kind === 'many') expect(entries.has(`notes/collision/${REF}`)).toBe(false)
    if (kind === 'block') expect(entries.has(`block-files/blocks/${REF}`)).toBe(false)
    expect(fs.readFileSync(path.join(dir, REF))).toEqual(LOCAL)
    expect(fs.readFileSync(path.join(library, 'figures/picture.png'))).toEqual(SHARED)
    expect(fs.readFileSync(note, 'utf8')).toBe(content)
  })
})
