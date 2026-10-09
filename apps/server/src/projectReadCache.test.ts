import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { STATUS_FILE } from './agentStatus.js'
import { COMMENTS_DIR } from './comments.js'
import { LibraryReadIndex } from './libraryReadIndex.js'
import { invalidateProjects, projectRefsStamp, projectStamp } from './projectReadCache.js'
import { TASKS_DIR } from './tasks.js'
import { app, useSampleApp } from './testkit.js'

useSampleApp()

describe('project read stamps', () => {
  const wb = () => app.registry.get('sample-research')
  const write = (rel: string, text: string) => {
    const f = path.join(wb().root, rel)
    fs.mkdirSync(path.dirname(f), { recursive: true })
    // 앱처럼 임시 파일에 쓰고 바꿔 끼운다 (부모 폴더 mtime도 바뀐다)
    const tmp = path.join(path.dirname(f), `.${path.basename(f)}.tmp`)
    fs.writeFileSync(tmp, text); fs.renameSync(tmp, f)
  }
  const stamps = () => { invalidateProjects(app.registry); return { project: projectStamp(wb()), refs: projectRefsStamp(wb()) } }

  it('ignores the files the app writes often but no note reader reads', () => {
    const before = stamps()
    write(STATUS_FILE, '# status\n')
    write(`log/2026-10-09.md`, '# log\n')
    write(`${TASKS_DIR}/t1.md`, '---\nstate: 대기\n---\n')
    write(`${COMMENTS_DIR}/notes__a.md`, '- 메모\n')
    expect(stamps()).toEqual(before)
  })

  it('a note body edit changes the project stamp but not the library one', () => {
    const before = stamps()
    write('notes/n1/note.md', '# N1\n')
    const after = stamps()
    expect(after.project).not.toBe(before.project)
    expect(after.refs).toBe(before.refs)
  })

  it('blocks and research.yaml change both', () => {
    let before = stamps()
    write('blocks/new-block.tex', '% ---\n% title: New\n% ---\n')
    let after = stamps()
    expect(after.project).not.toBe(before.project); expect(after.refs).not.toBe(before.refs)
    before = after
    write('research.yaml', `${fs.readFileSync(wb().researchPath, 'utf8')}concepts: [x]\n`)
    after = stamps()
    expect(after.project).not.toBe(before.project); expect(after.refs).not.toBe(before.refs)
  })

  it('library and papers lists keep the same object after a note body edit', async () => {
    const read = new LibraryReadIndex(app.registry, () => null)
    const papers = read.papers(); const library = await read.library()
    write('notes/n1/note.md', '# N1 changed\n')
    read.invalidate()
    expect(read.papers()).toBe(papers)
    expect(await read.library()).toBe(library)
    write('blocks/another.tex', '% ---\n% title: Another\n% ---\n')
    read.invalidate()
    expect(read.papers()).not.toBe(papers)
  })
})
