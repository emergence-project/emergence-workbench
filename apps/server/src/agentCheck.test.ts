import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { checkWorkbench } from './agentCheck.js'
import { withLang } from './i18n.js'
import { makeRepo, useSampleApp } from './testkit.js'
import { Workbench } from './workbench.js'
import { scanTasks } from './tasks.js'

useSampleApp()
let wb: Workbench
let serial = 0
beforeEach(() => { wb = new Workbench(path.join(makeRepo(`check-${serial++}`), 'workbench')) })
const write = (file: string, text: string) => {
  const abs = path.join(wb.root, file)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, text)
}
const note = (text: string) => { write('notes/example/note.md', '# 노트\n'); write('notes/example/note.yaml', text) }
const block = (text: string, file = 'example.md') => write(`blocks/${file}`, text)
const check = () => withLang('ko', () => checkWorkbench(wb))

describe('직접 고친 연구 파일의 읽기 전용 검사', () => {
  it('예제 연구는 오류가 없고 파일 수를 센다', () => {
    const result = check()
    expect(result.files).toBe(5)
    expect(result.diagnostics.filter((d) => d.level === 'error')).toEqual([])
    for (const d of result.diagnostics) console.info(d)
  })

  it('쓴 이가 없는 새 기록(앱 · MCP를 거치지 않음)을 오류로 보고한다 (10/21)', () => {
    write('comments/project.md', '# 코멘트 · 프로젝트\n\n## c-20261010-0900 · 메모 · 전체\n\n옛 기록\n\n## c-20261022-0900 · 할 일 · 전체\n- 상태: 대기\n\n직접 쓴 할 일\n\n## c-20261022-0901 · 메모 · 전체\n<!-- rw: {"by":"codex"} -->\n\n에이전트 메모\n')
    const errors = check().diagnostics.filter((d) => d.file === 'workbench/comments/project.md')
    expect(errors.map((d) => [d.level, d.line])).toEqual([['error', 7]])
    expect(errors[0]!.message).toContain('c-20261022-0900')
  })

  it.each([
    ['research.yaml', '\uFEFFtitle: 연구\n'],
    ['notes/example/note.yaml', '\uFEFFname: 노트\n'],
    ['notes/example/note.md', '\uFEFF# 노트\n'],
    ['calc/example/main.tex', '\uFEFF\\section{계산}\n'],
    ['tasks/2026-10-10-example.md', '\uFEFF---\ntitle: 일\nstate: working\ntask: 검사\n---\n'],
  ])('%s의 BOM을 오류로 보고한다', (file, text) => {
    write(file, text)
    expect(check().diagnostics).toContainEqual({ level: 'error', file: `workbench/${file}`, line: 1, message: '파일 앞의 BOM을 지우세요.' })
  })

  it.each([
    ['YAML 오류', 'title: 연구\ntopics: [\n', 'error', 'YAML 오류', 3],
    ['모르는 키', 'title: 연구\nunknown: value\n', 'warning', '모르는 research.yaml 키', 2],
    ['제목 없음', 'topics:\n  - id: valid\n', 'error', 'title이 필요', 2],
    ['틀린 id', 'topics:\n  - title: 주제\n    id: INVALID\n', 'error', '주제 id는', 3],
    ['중복 id', 'topics:\n  - {id: same, title: 하나}\n  - {id: same, title: 둘}\n', 'error', '같은 주제 id', 3],
    ['Markdown 원고', 'sources:\n  manuscript: note.md — 노트\n', 'warning', '있는 .tex', 2],
    ['없는 원고', 'sources:\n  manuscript: missing.tex\n', 'warning', '있는 .tex', 2],
  ] as const)('research.yaml: %s', (_, text, level, message, line) => {
    write('research.yaml', text)
    expect(check().diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ level, file: 'workbench/research.yaml', line, message: expect.stringContaining(message) })]))
  })

  it.each([
    ['YAML 오류', 'name: [\n', 'error', 'YAML 오류'],
    ['status 키', 'status: blocked\n', 'error', 'note.yaml은 `state:`'],
    ['active 상태', 'state: active\n', 'error', '진행이면 키를 두지 않는다'],
    ['블록 상태', 'state: in-progress\n', 'error', '진행이면 키를 두지 않는다'],
    ['모르는 상태', 'state: unknown\n', 'error', 'state는'],
    ['모르는 키', 'unknown: true\n', 'warning', '모르는 note.yaml 키'],
    ['옛 설명', 'summary: 설명\n', 'warning', 'description'],
    ['옛 해결', 'done: true\n', 'warning', 'state: done'],
    ['진행 재개 조건', 'resume: 기다림\n', 'warning', '멈춤·폐기'],
    ['긴 재개 조건', `state: paused\nresume: ${'가'.repeat(301)}\n`, 'warning', '300자'],
    ['틀린 성격', 'kind: invalid\n', 'error', 'kind는'],
    ['없는 주제', 'topics: [missing]\n', 'warning', '없는 주제 id'],
  ] as const)('note.yaml: %s', (_, text, level, message) => {
    note(text)
    expect(check().diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ level, file: 'workbench/notes/example/note.yaml', message: expect.stringContaining(message) })]))
  })

  it('본문이 없는 폴더와 읽지 않는 Markdown 머리말을 경고한다', () => {
    write('calc/empty/note.yaml', 'name: 빈 계산\n')
    write('notes/front/note.md', '---\nname: 무시됨\n---\n# 본문\n')
    const ds = check().diagnostics
    expect(ds).toEqual(expect.arrayContaining([
      expect.objectContaining({ level: 'warning', file: 'workbench/calc/empty/note.yaml', message: expect.stringContaining('note.md도 main.tex도') }),
      expect.objectContaining({ level: 'warning', file: 'workbench/notes/front/note.md', message: expect.stringContaining('note.md 머리말은 읽지 않는다') }),
    ]))
  })

  it('블록 노트 폴더(blocks/)가 남아 있으면 노트 폴더로 옮기라고 오류로 보고한다 (2026-10-27)', () => {
    block('---\nstatus: blocked\n---\n')
    block('\\section{본문}\n', 'other.tex')
    const errors = check().diagnostics.filter((d) => d.level === 'error')
    expect(errors.map((d) => d.file).sort()).toEqual(['workbench/blocks/example.md', 'workbench/blocks/other.tex'])
    expect(errors[0]!.message).toContain('topics/<주제>/<id>/')
  })

  it('유효한 새·옛 노트 상태와 주제는 오류로 세지 않는다', () => {
    write('research.yaml', 'topics:\n  - title: 주제\n    id: topic\n')
    note('state: paused\nresume: 재개\nkind: none\ntopics: [topic]\n')
    write('calc/done/main.tex', '\\section{계산}\n')
    write('calc/done/note.yaml', 'done: true\n')
    expect(check().diagnostics.filter((d) => d.level === 'error')).toEqual([])
  })

  describe('주제 폴더 (10/13)', () => {
    const has = (level: string, file: string, message: string) => expect.objectContaining({ level, file, message: expect.stringContaining(message) })
    it('바른 주제 폴더와 그 안의 노트는 오류도 경고도 없다', () => {
      write('research.yaml', 'title: 연구\ntopics:\n  - kempe\n  - id: old\n    title: 예전\n')
      write('topics/kempe/topic.yaml', 'title: Kempe 사슬\ndescription: 맞바꾸기\n')
      write('topics/kempe/recolor/note.md', '# 다시 칠하기\n')
      write('topics/kempe/recolor/note.yaml', 'name: 다시 칠하기\ntopics: [kempe, old]\n')
      write('topics/kempe/bare/note.md', '# 주제를 적지 않은 노트\n')
      expect(check().diagnostics).toEqual([])
    })
    it('topic.yaml이 없는 주제, 모르는 키, 폴더와 다른 id, 틀린 폴더 이름을 보고한다', () => {
      write('research.yaml', 'topics:\n  - missing\n  - BAD\n  - {id: kempe, title: 안 모양}\n')
      write('topics/kempe/topic.yaml', 'title: Kempe\nid: other\ncolour: red\n')
      fs.mkdirSync(path.join(wb.root, 'topics/Stray'), { recursive: true })
      const ds = check().diagnostics
      expect(ds).toEqual(expect.arrayContaining([
        has('warning', 'workbench/research.yaml', 'topics/missing/topic.yaml'),
        has('error', 'workbench/research.yaml', '주제 id는'),
        has('warning', 'workbench/research.yaml', '주제 폴더에 함께'),
        has('warning', 'workbench/topics/kempe/topic.yaml', '모르는 topic.yaml 키: colour'),
        has('warning', 'workbench/topics/kempe/topic.yaml', 'id는 폴더 이름'),
        has('error', 'workbench/topics/Stray', '주제 폴더 이름은'),
        has('warning', 'workbench/topics/Stray', 'topic.yaml이 없습니다'),
      ]))
    })
    it('notes/와 주제 폴더에 같은 노트 폴더 이름이 있으면 오류, 주인 주제가 맨 앞이 아니면 경고', () => {
      write('research.yaml', 'topics:\n  - kempe\n  - other\n')
      write('topics/kempe/topic.yaml', 'title: Kempe\n')
      write('topics/other/topic.yaml', 'title: Other\n')
      write('notes/twin/note.md', '# 하나\n')
      write('topics/kempe/twin/note.md', '# 둘\n')
      write('topics/kempe/order/note.md', '# 순서\n')
      write('topics/kempe/order/note.yaml', 'topics: [other, kempe]\n')
      write('calc/twin/note.md', '# 계산 노트는 따로 센다\n')
      const ds = check().diagnostics
      expect(ds.filter((d) => d.message.includes('같은 노트 폴더 이름'))).toEqual([has('error', 'workbench/topics/kempe/twin', 'workbench/notes/twin')])
      expect(ds).toContainEqual(has('warning', 'workbench/topics/kempe/order/note.yaml', '주인 주제는 폴더(kempe)'))
    })
  })

  it('맡긴 일은 scanTasks 진단을 그대로 오류로 보인다', () => {
    write('tasks/2026-10-10-invalid.md', '---\ntitle: 검사\nstate: invalid\n---\n')
    const expected = withLang('ko', () => scanTasks(wb).diagnostics).map(({ file, line, message }) => ({ level: 'error', file, line, message }))
    expect(check().diagnostics).toEqual(expected)
  })

  it('영어 진단도 같은 파일과 줄을 가리킨다', () => {
    note('status: blocked\n')
    const ds = withLang('en', () => checkWorkbench(wb)).diagnostics
    // 테스트 전체 RW_LANG보다 요청 언어가 앞서지 않으므로 환경을 잠깐 비운다.
    const old = process.env.RW_LANG
    delete process.env.RW_LANG
    try {
      expect(withLang('en', () => checkWorkbench(wb)).diagnostics[0]).toMatchObject({ ...ds[0], message: expect.stringContaining('note.yaml uses `state:`') })
    } finally { if (old !== undefined) process.env.RW_LANG = old }
  })

  it('오류·경고가 있어도 검사 전후 모든 파일의 내용·mtime이 같다', () => {
    note('status: blocked\nunknown: true\n')
    write('tasks/2026-10-10-invalid.md', '# 오류\n')
    const snapshot = (dir: string): unknown[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e): unknown[] => {
      const abs = path.join(dir, e.name)
      return e.isDirectory() ? snapshot(abs) : [[path.relative(wb.repo, abs), fs.readFileSync(abs).toString('base64'), fs.statSync(abs).mtimeMs]]
    })
    const before = snapshot(wb.repo)
    expect(check().diagnostics.length).toBeGreaterThan(0)
    expect(snapshot(wb.repo)).toEqual(before)
  })
})
