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
    expect(result.files).toBe(3)
    expect(result.diagnostics.filter((d) => d.level === 'error')).toEqual([])
    for (const d of result.diagnostics) console.info(d)
  })

  it.each([
    ['research.yaml', '\uFEFFtitle: 연구\n'],
    ['notes/example/note.yaml', '\uFEFFname: 노트\n'],
    ['notes/example/note.md', '\uFEFF# 노트\n'],
    ['calc/example/main.tex', '\uFEFF\\section{계산}\n'],
    ['blocks/example.tex', '\uFEFF% ---\n% id: example\n% ---\n'],
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

  it.each([
    ['닫히지 않은 머리', '---\nid: example\n', 'error', '80줄'],
    ['80줄 넘는 머리', `---\n${'unknown: x\n'.repeat(79)}---\n`, 'error', '80줄'],
    ['다른 id', '---\nid: another\n---\n', 'error', '파일 이름과 다릅니다'],
    ['틀린 상태', '---\nstatus: done\n---\n', 'error', 'status는'],
    ['멈춘 이유 없음', '---\nstatus: blocked\nresume-condition: 재개\n---\n', 'warning', 'blocked-reason'],
    ['재개 조건 없음', '---\nstatus: blocked\nblocked-reason: 이유\n---\n', 'warning', 'resume-condition'],
    ['폐기 이유 없음', '---\nstatus: stopped\n---\n', 'warning', 'stopped-reason'],
    ['밑줄 키', '---\nblocked_reason: 이유\n---\n', 'warning', '_ 대신 -'],
    ['없는 주제', '---\ntopics: [missing]\n---\n', 'warning', '없는 주제 id'],
  ] as const)('블록 머리: %s', (_, text, level, message) => {
    block(text)
    expect(check().diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ level, file: 'workbench/blocks/example.md', message: expect.stringContaining(message) })]))
  })

  it.each(['parent', 'alternatives', 'next', 'concepts', 'topics'])('%s의 여러 줄 목록을 오류로 보고한다', (key) => {
    block(`---\n${key}:\n  - something\n---\n`)
    expect(check().diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ level: 'error', line: 2, message: expect.stringContaining(`${key}는 여러 줄 목록`) })]))
  })

  it('여러 줄 설명 안의 목록은 한 줄 키의 목록 형식 오류로 오해하지 않는다', () => {
    block('---\ndescription: |-\n  - 첫 설명\n  - 둘째 설명\n---\n')
    expect(check().diagnostics).toEqual([])
  })

  it('TeX 머리도 같은 키와 목록을 검사한다', () => {
    block('% ---\n% id: different\n% topics:\n%   - missing\n% ---\n', 'example.tex')
    expect(check().diagnostics.filter((d) => d.level === 'error')).toHaveLength(2)
  })

  it('틀린 파일 이름과 같은 id의 두 확장자를 보고한다', () => {
    block('# 본문\n', 'Invalid.md')
    block('# 본문\n')
    block('\\section{본문}\n', 'example.tex')
    expect(check().diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ level: 'error', file: 'workbench/blocks/Invalid.md' }),
      expect.objectContaining({ level: 'warning', file: 'workbench/blocks/example.md', message: expect.stringContaining('.md가 이긴다') }),
    ]))
  })

  it('유효한 새·옛 노트 상태와 주제는 오류로 세지 않는다', () => {
    write('research.yaml', 'topics:\n  - title: 주제\n    id: topic\n')
    note('state: paused\nresume: 재개\nkind: none\ntopics: [topic]\n')
    block('---\nstatus: blocked\nblocked-reason: 이유\nresume-condition: 재개\ntopics: [topic]\n---\n')
    write('calc/done/main.tex', '\\section{계산}\n')
    write('calc/done/note.yaml', 'done: true\n')
    expect(check().diagnostics.filter((d) => d.level === 'error')).toEqual([])
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
