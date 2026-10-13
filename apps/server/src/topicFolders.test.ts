// 주제 폴더 배치 (10/13 연구 저장소 폴더): workbench/topics/<주제>/topic.yaml과 그 안의 노트
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import YAML from 'yaml'
import { app, noteHash, R, repo, topicsHash, useSampleApp } from './testkit.js'
import { classify } from './watcher.js'
import { pathKeyOf } from './manuscript.js'
import { REFRESH_MS } from './readCache.js'

useSampleApp()
// 읽기 캐시는 REFRESH_MS마다 파일을 다시 본다. 파일을 직접 쓴 뒤에는 시계만 앞으로 돌린다 (앱에서는 파일 감시가 맡는다)
let skew = 0
const realNow = Date.now.bind(Date)
vi.spyOn(Date, 'now').mockImplementation(() => realNow() + skew)

const wb = (...p: string[]) => path.join(repo, 'workbench', ...p)
const write = (rel: string, text: string) => { fs.mkdirSync(path.dirname(wb(rel)), { recursive: true }); fs.writeFileSync(wb(rel), text); skew += REFRESH_MS + 10 }
const research = () => YAML.parse(fs.readFileSync(wb('research.yaml'), 'utf8'))
const topics = async () => (await app.inject({ method: 'GET', url: `${R}/topics` })).json().topics as { id: string; title: string; star: boolean }[]
const notes = async () => (await app.inject({ method: 'GET', url: `${R}/notes` })).json().notes as { file: string; id: string; type: string; topics: string[]; hash: string }[]
const setHead = async (file: string, patch: object, baseHash?: string) =>
  app.inject({ method: 'PATCH', url: `${R}/notes/head`, payload: { file, patch, baseHash: baseHash ?? await noteHash(file) } })

describe('주제 폴더 읽기', () => {
  it('research.yaml의 id 한 줄은 topic.yaml을 읽고, 예전 모양과 섞여도 되며, 목록에 없는 주제 폴더는 뒤에 붙인다', async () => {
    const text = fs.readFileSync(wb('research.yaml'), 'utf8')
    fs.writeFileSync(wb('research.yaml'), `${text.trimEnd()}\ntopics:\n  - kempe\n  - id: old\n    title: 예전 주제\n  - bare\n`)
    write('topics/kempe/topic.yaml', 'title: Kempe 사슬\nstar: true\ndescription: 두 색 맞바꾸기\n')
    write('topics/extra/topic.yaml', 'title: 덧붙은 주제\n')
    fs.mkdirSync(wb('topics/bare'), { recursive: true })
    fs.mkdirSync(wb('topics/stray'), { recursive: true })
    expect((await topics()).map((t) => [t.id, t.title, t.star])).toEqual([
      ['kempe', 'Kempe 사슬', true], ['old', '예전 주제', false], ['bare', 'bare', false], ['extra', '덧붙은 주제', false],
    ])
  })

  it('주제 폴더 안 노트는 연구노트이고 폴더의 주제가 첫 주제다 (note.yaml topics:가 달라도)', async () => {
    write('topics/kempe/recolor/note.md', '# 다시 칠하기\n')
    write('topics/kempe/recolor/note.yaml', 'name: 다시 칠하기\ntopics: [old]\n')
    write('notes/loose/note.md', '# 주제 없는 노트\n')
    const rows = await notes()
    expect(rows.find((n) => n.id === 'recolor')).toMatchObject({ file: 'workbench/topics/kempe/recolor/note.md', type: 'note', topics: ['kempe', 'old'] })
    expect(rows.find((n) => n.id === 'loose')).toMatchObject({ file: 'workbench/notes/loose/note.md', topics: [] })
  })

  it('원고 key·파일 알림은 주제 폴더 사이를 옮겨도 같은 노트로 본다', () => {
    expect(pathKeyOf('workbench/topics/kempe/recolor/note.md')).toBe(pathKeyOf('workbench/notes/recolor/note.md'))
    const root = wb()
    expect(classify(root, wb('topics/kempe/topic.yaml'))).toEqual({ type: 'research' })
    expect(classify(root, wb('topics/kempe/recolor/note.md'))).toEqual({ type: 'note', file: 'workbench/topics/kempe/recolor/note.md' })
    expect(classify(root, wb('topics/kempe/recolor/note.yaml'))).toEqual({ type: 'note', file: 'workbench/topics/kempe/recolor/note.yaml' })
  })
})

describe('주제 폴더 고치기', () => {
  it('주제 폴더의 주제는 topic.yaml을, 예전 모양은 research.yaml을 고친다', async () => {
    const r = await app.inject({ method: 'PATCH', url: `${R}/topics/kempe`, payload: { baseHash: await topicsHash(), star: false, description: '맞바꾸기\n- 정확한 경우' } })
    expect(r.statusCode).toBe(200)
    expect(YAML.parse(fs.readFileSync(wb('topics/kempe/topic.yaml'), 'utf8'))).toEqual({ title: 'Kempe 사슬', description: '맞바꾸기\n- 정확한 경우' })
    // 목록에 없던 주제 폴더(extra)는 앱이 주제를 고칠 때 목록 끝에 적는다. topic.yaml이 없는 폴더(bare)에 빈 파일을 만들지 않는다
    expect(research().topics).toEqual(['kempe', { id: 'old', title: '예전 주제' }, 'bare', 'extra'])
    expect(fs.existsSync(wb('topics/bare/topic.yaml'))).toBe(false)
    const old = await app.inject({ method: 'PATCH', url: `${R}/topics/old`, payload: { baseHash: await topicsHash(), star: true } })
    expect(old.statusCode).toBe(200)
    expect(research().topics[1]).toEqual({ id: 'old', title: '예전 주제', star: true })
  })

  it('topic.yaml을 바깥에서 고치면 주제 hash가 바뀌어 낡은 고침은 409', async () => {
    const before = await topicsHash()
    write('topics/kempe/topic.yaml', `${fs.readFileSync(wb('topics/kempe/topic.yaml'), 'utf8')}star: true\n`)
    const stale = await app.inject({ method: 'PATCH', url: `${R}/topics/kempe`, payload: { baseHash: before, star: false } })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().currentHash).toBe(await topicsHash())
  })

  it('주제 폴더를 쓰는 프로젝트에서 새 주제는 주제 폴더로 만든다', async () => {
    const r = await app.inject({ method: 'POST', url: `${R}/topics`, payload: { baseHash: await topicsHash(), title: 'Discharging' } })
    expect(r.statusCode).toBe(200)
    expect(r.json().topic).toMatchObject({ id: 'discharging', title: 'Discharging' })
    expect(YAML.parse(fs.readFileSync(wb('topics/discharging/topic.yaml'), 'utf8'))).toEqual({ title: 'Discharging' })
    expect(research().topics.at(-1)).toBe('discharging')
  })
})

describe('주인 주제를 바꾸면 노트 폴더를 옮긴다', () => {
  it('첫 주제를 바꾸면 그 주제 폴더로, 옛 경로로 불러도 같은 노트, 주제를 다 빼면 notes/로', async () => {
    const r = await setHead('workbench/topics/kempe/recolor/note.md', { topics: ['discharging', 'kempe'] })
    expect(r.statusCode).toBe(200)
    expect(r.json().note).toMatchObject({ file: 'workbench/topics/discharging/recolor/note.md', topics: ['discharging', 'kempe'] })
    expect(fs.existsSync(wb('topics/kempe/recolor'))).toBe(false)
    expect(fs.existsSync(wb('topics/kempe/topic.yaml'))).toBe(true)
    expect(YAML.parse(fs.readFileSync(wb('topics/discharging/recolor/note.yaml'), 'utf8')).topics).toEqual(['discharging', 'kempe'])

    // 열어 둔 화면의 옛 경로: 머리 고치기, 본문 읽기·쓰기 모두 지금 자리의 노트
    const moved = (await notes()).find((n) => n.id === 'recolor')!
    const star = await setHead('workbench/topics/kempe/recolor/note.md', { star: true }, moved.hash)
    expect(star.statusCode).toBe(200)
    expect(star.json().note.file).toBe('workbench/topics/discharging/recolor/note.md')
    const part = await app.inject({ method: 'GET', url: `${R}/manuscript/part?file=${encodeURIComponent('workbench/topics/kempe/recolor/note.md')}` })
    expect(part.statusCode).toBe(200)
    expect(part.json().content).toBe('# 다시 칠하기\n')
    const saved = await app.inject({ method: 'PUT', url: `${R}/manuscript/part`, payload: { file: 'workbench/topics/kempe/recolor/note.md', content: '# 다시 칠하기\n\n고침\n', baseHash: part.json().hash } })
    expect(saved.statusCode).toBe(200)
    expect(fs.readFileSync(wb('topics/discharging/recolor/note.md'), 'utf8')).toBe('# 다시 칠하기\n\n고침\n')
    expect(fs.existsSync(wb('topics/kempe/recolor'))).toBe(false)

    const none = await setHead('workbench/topics/discharging/recolor/note.md', { topics: [] })
    expect(none.json().note).toMatchObject({ file: 'workbench/notes/recolor/note.md', topics: [] })
    // 예전 모양 주제(폴더 없음)가 첫 주제면 notes/에 둔다
    const old = await setHead('workbench/notes/recolor/note.md', { topics: ['old'] })
    expect(old.json().note).toMatchObject({ file: 'workbench/notes/recolor/note.md', topics: ['old'] })
  })

  it('옮길 자리에 같은 이름의 폴더가 있으면 아무것도 고치지 않고 409', async () => {
    write('topics/kempe/recolor/note.md', '# 같은 이름\n')
    const r = await setHead('workbench/notes/recolor/note.md', { topics: ['kempe'] })
    expect(r.statusCode).toBe(409)
    expect(YAML.parse(fs.readFileSync(wb('notes/recolor/note.yaml'), 'utf8')).topics).toEqual(['old'])
    fs.rmSync(wb('topics/kempe/recolor'), { recursive: true }); skew += REFRESH_MS + 10
  })

  it('비게 된 주제 폴더(topic.yaml도 없는 것)는 지운다', async () => {
    write('topics/bare/lonely/note.md', '# 혼자\n')
    const r = await setHead('workbench/topics/bare/lonely/note.md', { topics: [] })
    expect(r.json().note.file).toBe('workbench/notes/lonely/note.md')
    expect(fs.existsSync(wb('topics/bare'))).toBe(false)
  })

  it('주제를 지우면 topic.yaml을 지우고 노트를 꺼낸 뒤 빈 폴더를 지운다', async () => {
    await setHead('workbench/notes/lonely/note.md', { topics: ['extra'] })
    expect(fs.existsSync(wb('topics/extra/lonely/note.md'))).toBe(true)
    const r = await app.inject({ method: 'DELETE', url: `${R}/topics/extra?baseHash=${encodeURIComponent(await topicsHash())}` })
    expect(r.statusCode).toBe(200)
    expect(fs.existsSync(wb('topics/extra'))).toBe(false)
    expect((await notes()).find((n) => n.id === 'lonely')).toMatchObject({ file: 'workbench/notes/lonely/note.md', topics: [] })
    expect((await topics()).map((t) => t.id)).not.toContain('extra')
  })
})

describe('노트 만들기와 되살리기', () => {
  it('노트 폴더 이름은 notes/와 주제 폴더를 통틀어 겹치지 않게, 계산 노트도 kind: calc로 같은 자리에', async () => {
    write('topics/kempe/proof/note.md', '# 증명\n')
    const made = await app.inject({ method: 'POST', url: `${R}/notes`, payload: { kind: 'note', name: 'proof' } })
    expect(made.statusCode).toBe(200)
    expect(made.json().path).toBe('workbench/notes/proof-2/note.md')
    const calc = await app.inject({ method: 'POST', url: `${R}/notes`, payload: { kind: 'calc', name: 'Numerics' } })
    expect(calc.json()).toMatchObject({ path: 'workbench/notes/numerics/note.md', kind: 'note' })
    expect(YAML.parse(fs.readFileSync(wb('notes/numerics/note.yaml'), 'utf8'))).toEqual({ name: 'Numerics', kind: 'calc' })
  })

  it('주제 폴더의 노트를 지우고 되살리면 그 주제 폴더로 돌아간다', async () => {
    const key = (await app.inject({ method: 'GET', url: `${R}/manuscripts` })).json().find((m: { main: string }) => m.main === 'workbench/topics/kempe/proof/note.md').key
    const trashed = await app.inject({ method: 'DELETE', url: `${R}/notes?ms=${encodeURIComponent(key)}` })
    expect(trashed.statusCode).toBe(200)
    expect(trashed.json().from).toBe('workbench/topics/kempe/proof')
    expect(fs.existsSync(wb('topics/kempe/proof'))).toBe(false)
    const list = (await app.inject({ method: 'GET', url: `${R}/notes/trash` })).json() as { id: string }[]
    const back = await app.inject({ method: 'POST', url: `${R}/notes/trash/${encodeURIComponent(list[0]!.id)}/restore` })
    expect(back.json()).toEqual({ path: 'workbench/topics/kempe/proof' })
    expect(fs.existsSync(wb('topics/kempe/proof/note.md'))).toBe(true)
  })
})
