import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addComment, readComments } from './comments.js'
import { app, R, repo, useSampleApp } from './testkit.js'
import { Workbench } from './workbench.js'
import { writeLinkedTodoFiles } from './linkedTodoWrite.js'

useSampleApp()
const date = '2026-10-07'
const at = new Date(2026, 9, 7, 12, 34)
const root = () => path.join(repo, 'workbench')
const recordFile = () => path.join(root(), 'comments/project.md')
const journalFile = () => path.join(root(), `log/${date}.md`)
const record = () => readComments(root(), 'project')
const journal = () => new Workbench(root()).readJournal(date)
const todo = (text = '예전 할 일') => addComment(root(), 'project', { kind: '할 일', title: '프로젝트', text }, at)
const journalUrl = (index: number) => `${R}/journal/${date}/${index}`
const recordUrl = (id: string) => `${R}/comments/project/${id}`
beforeEach(() => {
  for (const dir of ['comments', 'log']) {
    fs.rmSync(path.join(root(), dir), { recursive: true, force: true })
    fs.mkdirSync(path.join(root(), dir), { recursive: true })
  }
})

describe('연결된 할 일의 양방향 수정·삭제', () => {
  it.each(['PATCH', 'DELETE'] as const)('기록이 외부에서 삭제되면 남은 일지의 %s는 독립 항목으로 처리한다', async (method) => {
    const { entry } = todo()
    const selected = journal()[0]!
    fs.unlinkSync(recordFile())
    const response = await app.inject(method === 'PATCH'
      ? { method, url: journalUrl(0), payload: { was: entry.body, link: selected.link, text: '남은 일지만 고침' } }
      : { method, url: `${journalUrl(0)}?was=${encodeURIComponent(entry.body)}&link=${encodeURIComponent(selected.link!)}` })
    expect(response.statusCode).toBe(200)
    expect(fs.existsSync(recordFile())).toBe(false)
    expect(journal().map((e) => e.text)).toEqual(method === 'PATCH' ? ['남은 일지만 고침'] : [])
  })

  it.each(['PATCH', 'DELETE'] as const)('기록 항목만 외부에서 삭제돼도 다른 기록을 보존하고 남은 일지를 %s한다', async (method) => {
    const { entry } = todo()
    const selected = journal()[0]!
    addComment(root(), 'project', { kind: '메모', title: '프로젝트', text: '남아 있는 다른 기록' }, at)
    const content = fs.readFileSync(recordFile(), 'utf8')
    const start = content.indexOf(`## ${entry.id} ·`)
    const end = content.indexOf('\n## ', start + 3)
    fs.writeFileSync(recordFile(), content.slice(0, start) + content.slice(end + 1))
    const before = fs.readFileSync(recordFile())
    const response = await app.inject(method === 'PATCH'
      ? { method, url: journalUrl(0), payload: { was: entry.body, link: selected.link, text: '남은 일지만 고침' } }
      : { method, url: `${journalUrl(0)}?was=${encodeURIComponent(entry.body)}&link=${encodeURIComponent(selected.link!)}` })
    expect(response.statusCode).toBe(200)
    expect(fs.readFileSync(recordFile())).toEqual(before)
    expect(journal().map((e) => e.text)).toEqual(method === 'PATCH' ? ['남은 일지만 고침'] : [])
  })

  it.each(['PATCH', 'DELETE'] as const)('일지 파일이 외부에서 삭제되면 남은 기록의 %s는 일지를 다시 만들지 않는다', async (method) => {
    const { entry, hash } = todo()
    fs.unlinkSync(journalFile())
    const response = await app.inject(method === 'PATCH'
      ? { method, url: recordUrl(entry.id), payload: { baseHash: hash, text: '남은 기록만 고침' } }
      : { method, url: `${recordUrl(entry.id)}?baseHash=${hash}` })
    expect(response.statusCode).toBe(200)
    expect(fs.existsSync(journalFile())).toBe(false)
    expect(record().comments.map((e) => e.body)).toEqual(method === 'PATCH' ? ['남은 기록만 고침'] : [])
  })

  it.each(['PATCH', 'DELETE'] as const)('일지 항목만 외부에서 삭제되면 다른 항목을 보존하고 남은 기록을 %s한다', async (method) => {
    const { entry } = todo()
    todo('남길 다른 할 일')
    new Workbench(root()).editJournal(date, 0, entry.body, null)
    const before = fs.readFileSync(journalFile())
    const response = await app.inject(method === 'PATCH'
      ? { method, url: recordUrl(entry.id), payload: { baseHash: record().hash, text: '남은 기록만 고침' } }
      : { method, url: `${recordUrl(entry.id)}?baseHash=${record().hash}` })
    expect(response.statusCode).toBe(200)
    expect(fs.readFileSync(journalFile())).toEqual(before)
    expect(record().comments.map((e) => e.body)).toEqual(method === 'PATCH' ? ['남은 기록만 고침', '남길 다른 할 일'] : ['남길 다른 할 일'])
  })

  it.each(['PATCH', 'DELETE'] as const)('외부 삭제로 같은 글의 번호가 밀리면 읽었던 연결 식별자와 다른 %s 요청은 거절한다', async (method) => {
    todo('같은 글')
    const second = todo('같은 글')
    todo('같은 글')
    const selected = journal()[1]!
    new Workbench(root()).editJournal(date, 0, '같은 글', null)
    const beforeRecord = fs.readFileSync(recordFile())
    const beforeJournal = fs.readFileSync(journalFile())
    const link = `project/${second.entry.id}`
    const response = await app.inject(method === 'PATCH'
      ? { method, url: journalUrl(selected.index), payload: { was: selected.text, link, text: '두 번째를 고치려던 글' } }
      : { method, url: `${journalUrl(selected.index)}?was=${encodeURIComponent(selected.text)}&link=${encodeURIComponent(link)}` })
    expect(response.statusCode).toBe(409)
    expect(fs.readFileSync(recordFile())).toEqual(beforeRecord)
    expect(fs.readFileSync(journalFile())).toEqual(beforeJournal)
  })

  it('같은 글의 독립 일지가 있어도 기록의 명시된 연결을 먼저 찾아 완료한다', async () => {
    const { entry, hash } = todo('같은 글')
    new Workbench(root()).appendJournal({ date, time: '12:34', kind: 'todo', target: '연구', text: '같은 글' })
    const response = await app.inject({ method: 'PATCH', url: recordUrl(entry.id), payload: { baseHash: hash, state: '끝냄' } })
    expect(response.statusCode).toBe(200)
    expect(record().comments[0]!.state).toBe('끝냄')
    expect(journal().filter((e) => e.kind === 'todo').map((e) => e.done)).toEqual([true, false])
  })

  it('같은 시각·대상의 독립 할 일은 다른 유일한 연결 기록과 혼동해 막지 않는다', async () => {
    const { entry } = todo('기록에 연결된 할 일')
    new Workbench(root()).appendJournal({ date, time: '12:34', kind: 'todo', target: '연구', text: '손으로 쓴 독립 할 일' })
    const beforeRecord = fs.readFileSync(recordFile())
    const response = await app.inject({ method: 'PATCH', url: journalUrl(1), payload: { was: '손으로 쓴 독립 할 일', text: '독립 할 일의 새 글' } })
    expect(response.statusCode).toBe(200)
    expect(fs.readFileSync(recordFile())).toEqual(beforeRecord)
    expect(journal().map((e) => e.text)).toEqual([entry.body, '독립 할 일의 새 글'])
  })

  it('예전 중복 할 일 앞에 메모가 끼어 인덱스가 모두 밀려도 일지를 홀로 고치지 않는다', async () => {
    todo('예전 같은 글')
    todo('예전 같은 글')
    const original = fs.readFileSync(journalFile(), 'utf8').replace(/^<!-- rw-todo: .* -->\n/gm, '')
    fs.writeFileSync(journalFile(), original.replace(`# ${date}\n`, `# ${date}\n\n## 12:33 · 메모 · 연구\n앞에 끼운 메모\n`))
    const beforeRecord = fs.readFileSync(recordFile())
    const beforeJournal = fs.readFileSync(journalFile())
    const response = await app.inject({ method: 'PATCH', url: journalUrl(2), payload: { was: '예전 같은 글', text: '이름만 바꿀 글' } })
    expect(response.statusCode).toBe(409)
    expect(fs.readFileSync(recordFile())).toEqual(beforeRecord)
    expect(fs.readFileSync(journalFile())).toEqual(beforeJournal)
  })

  it('실패 중 기록 폴더가 바깥 링크로 바뀌면 되돌림도 저장소 밖을 쓰지 않는다', () => {
    const { entry } = todo()
    const beforeRecord = fs.readFileSync(recordFile(), 'utf8')
    const beforeJournal = fs.readFileSync(journalFile(), 'utf8')
    const outside = fs.mkdtempSync(path.join(path.dirname(repo), 'outside-rollback-'))
    const changed = beforeRecord.replace(entry.body, '함께 고친 글')
    const outsideFile = path.join(outside, 'project.md')
    fs.writeFileSync(outsideFile, changed)
    const dir = path.dirname(recordFile())
    const saved = dir + '-saved'
    const rename = fs.renameSync
    const spy = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (String(to) === journalFile()) {
        rename(dir, saved)
        fs.symlinkSync(outside, dir)
        throw new Error('journal denied after parent replacement')
      }
      return rename(from, to)
    })
    try {
      expect(() => writeLinkedTodoFiles(root(), [
        { file: recordFile(), before: beforeRecord, after: changed },
        { file: journalFile(), before: beforeJournal, after: beforeJournal.replace(entry.body, '함께 고친 글') },
      ])).toThrow(expect.objectContaining({ status: 500 }))
      expect(fs.readFileSync(outsideFile, 'utf8')).toBe(changed)
    } finally {
      spy.mockRestore()
      if (fs.lstatSync(dir).isSymbolicLink()) { fs.unlinkSync(dir); fs.renameSync(saved, dir) }
      fs.rmSync(outside, { recursive: true, force: true })
    }
  })

  it('일지에서 글을 고치면 정본 기록도 같은 글이 된다', async () => {
    const { entry } = todo()
    const response = await app.inject({ method: 'PATCH', url: journalUrl(0), payload: { link: journal()[0]!.link, was: entry.body, text: '일지에서 고친 할 일' } })
    expect(response.statusCode).toBe(200)
    expect(record().comments[0]!.body).toBe('일지에서 고친 할 일')
    expect(journal()[0]!.text).toBe('일지에서 고친 할 일')
  })

  it('일지에서 지우면 연결된 기록만 함께 지우고 다른 기록은 보존한다', async () => {
    const { entry } = todo()
    const memo = addComment(root(), 'project', { kind: '메모', title: '프로젝트', text: '다른 기록 그대로' }, at)
    const response = await app.inject({ method: 'DELETE', url: `${journalUrl(0)}?was=${encodeURIComponent(entry.body)}&link=${encodeURIComponent(journal()[0]!.link!)}` })
    expect(response.statusCode).toBe(200)
    expect(record().comments.map((c) => c.id)).toEqual([memo.entry.id])
    expect(record().comments[0]!.body).toBe('다른 기록 그대로')
    expect(journal()).toEqual([])
  })

  it('기록에서 지우면 연결된 일지만 함께 지운다', async () => {
    const first = todo()
    todo('남길 할 일')
    const response = await app.inject({ method: 'DELETE', url: `${recordUrl(first.entry.id)}?baseHash=${record().hash}` })
    expect(response.statusCode).toBe(200)
    expect(journal().map((e) => e.text)).toEqual(['남길 할 일'])
    expect(record().comments.map((c) => c.body)).toEqual(['남길 할 일'])
  })

  it('같은 분·같은 글 세 개에서 첫 항목을 지운 뒤 마지막 항목을 일지에서 고쳐도 다른 기록을 고치지 않는다', async () => {
    const first = todo('같은 글')
    const second = todo('같은 글')
    const third = todo('같은 글')
    expect((await app.inject({ method: 'DELETE', url: `${journalUrl(0)}?was=${encodeURIComponent('같은 글')}&link=${encodeURIComponent(journal()[0]!.link!)}` })).statusCode).toBe(200)
    expect(record().comments.find((c) => c.id === first.entry.id)).toBeUndefined()
    expect((await app.inject({ method: 'PATCH', url: journalUrl(1), payload: { link: journal()[1]!.link, was: '같은 글', text: '세 번째만 고침' } })).statusCode).toBe(200)
    expect(record().comments.find((c) => c.id === second.entry.id)!.body).toBe('같은 글')
    expect(record().comments.find((c) => c.id === third.entry.id)!.body).toBe('세 번째만 고침')
  })

  it('연결된 일지 글이 밖에서 달라지면 기록 수정 전에 409로 멈춘다', async () => {
    const { entry, hash } = todo()
    new Workbench(root()).editJournal(date, 0, entry.body, '바깥에서 고친 일지')
    const beforeRecord = fs.readFileSync(recordFile())
    const beforeJournal = fs.readFileSync(journalFile())
    const response = await app.inject({ method: 'PATCH', url: recordUrl(entry.id), payload: { baseHash: hash, text: '앱에서 고칠 글' } })
    expect(response.statusCode).toBe(409)
    expect(fs.readFileSync(recordFile())).toEqual(beforeRecord)
    expect(fs.readFileSync(journalFile())).toEqual(beforeJournal)
  })

  it('답이 달린 기록에 연결된 일지 삭제는 어느 파일도 쓰기 전에 409로 멈춘다', async () => {
    const { entry } = todo()
    fs.appendFileSync(recordFile(), '\n### 답 · agent · 2026-10-07 12:35\n답은 보존\n')
    const beforeRecord = fs.readFileSync(recordFile())
    const beforeJournal = fs.readFileSync(journalFile())
    expect((await app.inject({ method: 'DELETE', url: `${journalUrl(0)}?was=${encodeURIComponent(entry.body)}&link=${encodeURIComponent(journal()[0]!.link!)}` })).statusCode).toBe(409)
    expect(fs.readFileSync(recordFile())).toEqual(beforeRecord)
    expect(fs.readFileSync(journalFile())).toEqual(beforeJournal)
  })

  it('연결 일지 저장이 실패하면 기록도 되돌리고 실패를 알린다', async () => {
    const { entry, hash } = todo()
    const beforeRecord = fs.readFileSync(recordFile())
    const beforeJournal = fs.readFileSync(journalFile())
    const rename = fs.renameSync
    const spy = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (String(to) === journalFile()) throw Object.assign(new Error('journal write denied'), { code: 'EACCES' })
      return rename(from, to)
    })
    try {
      const response = await app.inject({ method: 'DELETE', url: `${recordUrl(entry.id)}?baseHash=${hash}` })
      expect(response.statusCode).toBe(500)
      expect(response.json().error).toContain('일지')
      expect(fs.readFileSync(recordFile())).toEqual(beforeRecord)
      expect(fs.readFileSync(journalFile())).toEqual(beforeJournal)
    } finally { spy.mockRestore() }
  })
})
