import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addComment, readComments } from './comments.js'
import { localDate } from './fsutil.js'
import { writeLinkedTodoFiles } from './linkedTodoWrite.js'
import { app, R, repo, useSampleApp } from './testkit.js'
import { legacyJournalTodos, migrateJournalTodos, openTodos } from './todos.js'
import { Workbench } from './workbench.js'

// 할 일 원본 하나 (2026-10-16): 정본은 기록 파일, 일지에는 끝낸 날 "완료" 한 줄만
useSampleApp()
const at = new Date(2026, 9, 7, 12, 34)
const root = () => path.join(repo, 'workbench')
const wb = () => new Workbench(root())
const recordFile = (target = 'project') => path.join(root(), `comments/${target}.md`)
const todayLog = () => path.join(root(), `log/${localDate()}.md`)
const todo = (text = '할 일 하나', target = 'project') => addComment(root(), target, { kind: '할 일', title: '프로젝트', text }, at)
const recordUrl = (id: string, target = 'project') => `${R}/comments/${target}/${id}`
const journal = () => wb().recentJournal(365)
beforeEach(() => {
  for (const dir of ['comments', 'log']) {
    fs.rmSync(path.join(root(), dir), { recursive: true, force: true })
    fs.mkdirSync(path.join(root(), dir), { recursive: true })
  }
})

describe('할 일 기록', () => {
  it('적으면 기록 파일에만 쓰고 일지는 그대로 둔다', async () => {
    const res = await app.inject({ method: 'POST', url: `${R}/comments/project`, payload: { kind: '할 일', title: '프로젝트', text: '10/20까지 — 그림 다시 그리기' } })
    expect(res.statusCode).toBe(200)
    expect(res.json().entry).toMatchObject({ kind: '할 일', state: '대기' })
    expect(res.json().entry.journal).toBeUndefined()
    expect(journal()).toEqual([])
    const summary = (await app.inject({ method: 'GET', url: R })).json()
    expect(summary.todos).toEqual([expect.objectContaining({ target: 'project', id: res.json().entry.id, text: '10/20까지 — 그림 다시 그리기', due: expect.stringMatching(/-10-20$/) })])
  })

  it('끝내면 그날 일지에 완료와 기록 주소를 남기고, 다시 열거나 글을 고쳐도 지난 완료는 그대로 둔다', async () => {
    const { entry, hash } = todo('식 (3)의 부호 확인하기', 'block-kempe-chains')
    const done = await app.inject({ method: 'PATCH', url: recordUrl(entry.id, 'block-kempe-chains'), payload: { state: '끝냄', baseHash: hash } })
    expect(done.statusCode).toBe(200)
    expect(journal()).toEqual([expect.objectContaining({ kind: 'done', target: 'kempe-chains', text: '식 (3)의 부호 확인하기', link: `block-kempe-chains/${entry.id}` })])
    expect(fs.readFileSync(todayLog(), 'utf8')).toContain(`<!-- rw-todo: block-kempe-chains/${entry.id} -->`)
    expect(openTodos(root())).toEqual([])
    const reopened = await app.inject({ method: 'PATCH', url: recordUrl(entry.id, 'block-kempe-chains'), payload: { state: '대기', baseHash: done.json().hash } })
    const edited = await app.inject({ method: 'PATCH', url: recordUrl(entry.id, 'block-kempe-chains'), payload: { text: '고친 글', baseHash: reopened.json().hash } })
    expect(edited.statusCode).toBe(200)
    expect(journal()).toHaveLength(1)
    expect(openTodos(root()).map((t) => t.text)).toEqual(['고친 글'])
    // 다시 끝내면 새 사건이라 완료가 하나 더 붙는다
    await app.inject({ method: 'PATCH', url: recordUrl(entry.id, 'block-kempe-chains'), payload: { state: '끝냄', baseHash: edited.json().hash } })
    expect(journal().filter((e) => e.kind === 'done')).toHaveLength(2)
  })

  it('지워도 일지는 건드리지 않는다', async () => {
    const { entry, hash } = todo()
    expect((await app.inject({ method: 'DELETE', url: `${recordUrl(entry.id)}?baseHash=${hash}` })).statusCode).toBe(200)
    expect(readComments(root(), 'project').comments).toEqual([])
    expect(fs.readdirSync(path.join(root(), 'log'))).toEqual([])
  })

  it('주제 · 흐름 점의 할 일도 기록 대상 그대로 목록에 오고, 끝내면 일지는 프로젝트 대상과 기록 주소를 쓴다', async () => {
    const { entry, hash } = todo('주제 할 일', 'topic-coloring')
    expect(openTodos(root())).toEqual([expect.objectContaining({ target: 'topic-coloring', id: entry.id })])
    await app.inject({ method: 'PATCH', url: recordUrl(entry.id, 'topic-coloring'), payload: { state: '끝냄', baseHash: hash } })
    expect(journal()[0]).toMatchObject({ kind: 'done', target: '연구', link: `topic-coloring/${entry.id}` })
  })

  it('일지 쓰기가 실패하면 기록도 되돌리고 실패를 알린다', async () => {
    const { entry, hash } = todo()
    const before = fs.readFileSync(recordFile())
    const rename = fs.renameSync
    const spy = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (String(to) === todayLog()) throw Object.assign(new Error('journal write denied'), { code: 'EACCES' })
      return rename(from, to)
    })
    try {
      const response = await app.inject({ method: 'PATCH', url: recordUrl(entry.id), payload: { state: '끝냄', baseHash: hash } })
      expect(response.statusCode).toBe(500)
      expect(fs.readFileSync(recordFile())).toEqual(before)
      expect(fs.existsSync(todayLog())).toBe(false)
    } finally { spy.mockRestore() }
  })

  it('목록은 마감이 이른 것부터, 마감이 없으면 먼저 적은 것부터', () => {
    addComment(root(), 'project', { kind: '할 일', title: '프로젝트', text: '마감 없는 나중 것' }, new Date(2026, 9, 9, 9, 0))
    addComment(root(), 'project', { kind: '할 일', title: '프로젝트', text: '마감 없는 먼저 것' }, new Date(2026, 9, 8, 9, 0))
    addComment(root(), 'project', { kind: '할 일', title: '프로젝트', text: '10/12까지 — 늦은 마감' }, new Date(2026, 9, 9, 10, 0))
    addComment(root(), 'project', { kind: '할 일', title: '프로젝트', text: '10/10 — 이른 마감' }, new Date(2026, 9, 9, 11, 0))
    addComment(root(), 'project', { kind: '메모', title: '프로젝트', text: '메모는 빠진다' }, new Date(2026, 9, 9, 12, 0))
    expect(openTodos(root()).map((t) => t.text)).toEqual(['10/10 — 이른 마감', '10/12까지 — 늦은 마감', '마감 없는 먼저 것', '마감 없는 나중 것'])
    expect(openTodos(root())[0]).toMatchObject({ written: '2026-10-09', due: '2026-10-10', where: '코멘트 · 프로젝트'.replace('코멘트 · ', '') })
  })
})

describe('예전 일지의 할 일 옮기기', () => {
  const log = (date: string, body: string) => fs.writeFileSync(path.join(root(), `log/${date}.md`), body)
  const notePath = 'workbench/notes/todo-note/note.md'
  beforeEach(() => {
    fs.mkdirSync(path.dirname(path.join(repo, notePath)), { recursive: true })
    fs.writeFileSync(path.join(repo, notePath), '# 할 일 노트\n')
  })

  it('끝내지 않은 할 일을 대상의 기록으로 옮기고 일지에서 빼며, 끝낸 할 일과 다른 기록은 둔다', () => {
    log('2026-09-30', [
      '# 2026-09-30', '',
      '## 09:10 · 할 일 · 연구', '- [ ] 2장 그림 다시 그리기', '',
      '## 09:20 · 할 일 · kempe-chains', '- [ ] 10/20까지 — 보조정리 조건', '',
      `## 09:25 · 할 일 · ${notePath}`, '- [ ] 노트 할 일', '',
      '## 09:30 · 할 일 · docs/old.tex', '- [ ] 원고 할 일', '',
      '## 09:40 · 메모 · 연구', '그대로 둘 메모', '',
      '## 10:00 · 할 일 · 연구', '- [x] 끝낸 할 일', '',
    ].join('\n'))
    expect(legacyJournalTodos(wb())).toBe(4)
    expect(migrateJournalTodos(wb())).toEqual({ moved: 4, removed: 4 })
    expect(legacyJournalTodos(wb())).toBe(0)
    expect(fs.readFileSync(path.join(root(), 'log/2026-09-30.md'), 'utf8')).toBe('# 2026-09-30\n\n## 09:40 · 메모 · 연구\n그대로 둘 메모\n\n## 10:00 · 할 일 · 연구\n- [x] 끝낸 할 일\n')
    const todos = openTodos(root())
    expect(todos).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: 'project', id: 'c-20260930-0910', text: '2장 그림 다시 그리기', written: '2026-09-30' }),
      expect.objectContaining({ target: 'block-kempe-chains', id: 'c-20260930-0920', due: '2026-10-20' }),
      expect.objectContaining({ target: 'note-todo-note', id: 'c-20260930-0925', text: '노트 할 일' }),
      expect.objectContaining({ target: 'project', id: 'c-20260930-0930', text: '원고 할 일 (docs/old.tex)' }),
    ]))
    expect(readComments(root(), 'block-kempe-chains').source).toBe('kempe-chains')
    expect(readComments(root(), 'note-todo-note').source).toBe(notePath)
    // 다시 돌아도 아무것도 하지 않는다
    expect(migrateJournalTodos(wb())).toEqual({ moved: 0, removed: 0 })
    expect(openTodos(root())).toHaveLength(4)
  })

  it('이미 기록과 이어진 줄은 일지에서 빼기만 하고, 기록을 쓴 뒤 멈췄던 줄도 겹쳐 만들지 않는다', () => {
    const { entry } = todo('이어진 할 일')
    addComment(root(), 'project', { kind: '할 일', title: '프로젝트', text: '옮기다 멈춘 할 일' }, new Date(2026, 8, 30, 11, 0))
    log('2026-10-07', `## 12:34 · 할 일 · 연구\n- [ ] 이어진 할 일\n<!-- rw-todo: project/${entry.id} -->\n`)
    log('2026-09-30', '## 11:00 · 할 일 · 연구\n- [ ] 옮기다 멈춘 할 일\n')
    expect(migrateJournalTodos(wb())).toEqual({ moved: 0, removed: 2 })
    expect(openTodos(root()).map((t) => t.text).sort()).toEqual(['옮기다 멈춘 할 일', '이어진 할 일'])
    expect(journal()).toEqual([])
  })

  it('앱 서버가 프로젝트를 감시하기 시작할 때 옮긴다', async () => {
    log('2026-09-30', '## 09:10 · 할 일 · 연구\n- [ ] 서버가 옮길 할 일\n')
    const { buildApp } = await import('./app.js')
    const watched = buildApp({ configDir: path.join(path.dirname(repo), 'config-todo-migrate'), watch: true })
    try {
      const id = (await watched.inject({ method: 'POST', url: '/api/researches', payload: { path: repo } })).json().id
      const summary = (await watched.inject({ method: 'GET', url: `/api/researches/${id}` })).json()
      expect(summary.todos.map((t: { text: string }) => t.text)).toEqual(['서버가 옮길 할 일'])
      expect(legacyJournalTodos(wb())).toBe(0)
    } finally { await watched.close() }
  })
})

describe('기록 · 일지 함께 쓰기', () => {
  it('실패 중 기록 폴더가 바깥 링크로 바뀌면 되돌림도 저장소 밖을 쓰지 않는다', () => {
    const recordPath = recordFile()
    const logPath = path.join(root(), 'log/2026-10-07.md')
    fs.writeFileSync(recordPath, '# 기록\n')
    fs.writeFileSync(logPath, '# 2026-10-07\n')
    const outside = fs.mkdtempSync(path.join(path.dirname(repo), 'outside-rollback-'))
    const changed = '# 기록\n\n고친 글\n'
    const outsideFile = path.join(outside, 'project.md')
    fs.writeFileSync(outsideFile, changed)
    const dir = path.dirname(recordPath)
    const saved = dir + '-saved'
    const rename = fs.renameSync
    const spy = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (String(to) === logPath) {
        rename(dir, saved)
        fs.symlinkSync(outside, dir)
        throw new Error('journal denied after parent replacement')
      }
      return rename(from, to)
    })
    try {
      expect(() => writeLinkedTodoFiles(root(), [
        { file: recordPath, before: '# 기록\n', after: changed },
        { file: logPath, before: '# 2026-10-07\n', after: '# 2026-10-07\n\n## 09:00 · 완료 · 연구\n고친 글\n' },
      ])).toThrow(expect.objectContaining({ status: 500 }))
      expect(fs.readFileSync(outsideFile, 'utf8')).toBe(changed)
    } finally {
      spy.mockRestore()
      if (fs.lstatSync(dir).isSymbolicLink()) { fs.unlinkSync(dir); fs.renameSync(saved, dir) }
      fs.rmSync(outside, { recursive: true, force: true })
    }
  })
})
