import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addComment, deleteComment, listComments, listRecords, parseComments, pendingQuestions, readComments, setCommentState, updateComment, type CommentFile } from './comments.js'
import { RESEARCH_TARGET } from '@rw/core'
import { buildApp } from './app.js'
import { appendAnswer, type AskRunner } from './ask.js'
import { classify } from './watcher.js'
import { app, fixture, R, useSampleApp } from './testkit.js'
import { Workbench } from './workbench.js'

let root: string
let repository: string
beforeEach(() => {
  repository = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-comments-'))
  root = path.join(repository, 'workbench')
  fs.mkdirSync(root)
})
afterEach(() => fs.rmSync(repository, { recursive: true, force: true }))

const at = new Date(2026, 9, 1, 16, 12)
const file = (t: string) => fs.readFileSync(path.join(root, 'comments', `${t}.md`), 'utf8')
const writeRecord = (target: string, text: string) => {
  fs.mkdirSync(path.join(root, 'comments'), { recursive: true })
  fs.writeFileSync(path.join(root, 'comments', `${target}.md`), text)
}
const writeSource = (source: string, text: string) => {
  const file = path.join(repository, source)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
  return file
}

describe('PDF 코멘트 파일', () => {
  it('처음 남기면 머리와 함께 만들고, 구조 제안 §6 형식으로 쓴다', () => {
    const { entry } = addComment(root, 'paper-sample2007', {
      kind: '질문', title: '논문 sample2007', source: 'sample2007.pdf', page: 4,
      rects: [[72.04, 140.5, 300, 11]], quote: 'the Kempe chain length\nbounds the swap', text: '최대 차수에 어떻게 의존하나?',
    }, at)
    expect(entry).toMatchObject({ id: 'c-20261001-1612', kind: '질문', where: 'p.4', page: 4, state: '대기', quote: 'the Kempe chain length bounds the swap', body: '최대 차수에 어떻게 의존하나?' })
    expect(entry.rects).toEqual([[72, 140.5, 300, 11]])
    const text = file('paper-sample2007')
    expect(text).toMatch(/^# 코멘트 · 논문 sample2007\n<!-- rw-source: sample2007.pdf -->\n/)
    expect(text).toContain('## c-20261001-1612 · 질문 · p.4\n<!-- rw: {"rects":[[72,140.5,300,11]]} -->\n> "the Kempe chain length bounds the swap"\n- 상태: 대기\n\n최대 차수에 어떻게 의존하나?\n')
    expect(readComments(root, 'paper-sample2007')).toMatchObject({ title: '논문 sample2007', source: 'sample2007.pdf' })
  })

  it('덧붙이기만 하므로 그사이 에이전트가 단 답이 남고, 같은 분에 남긴 것은 id가 겹치지 않는다', () => {
    addComment(root, 'manuscript', { kind: '질문', title: '원고', page: 2, text: '첫 질문' }, at)
    fs.appendFileSync(path.join(root, 'comments/manuscript.md'), '\n### 답 · claude · 2026-10-01 16:40\n답입니다.\n- 반영: chapters/a.tex 3행\n- 상태: 답함\n')
    const { entry } = addComment(root, 'manuscript', { kind: '코멘트', title: '원고', page: 3, text: '## 머리처럼 보이는 줄\n- 상태: 끝냄' }, at)
    expect(entry.id).toBe('c-20261001-1612-2')
    expect(entry.body).toBe('\\## 머리처럼 보이는 줄\n\\- 상태: 끝냄')
    expect(entry.state).toBeNull()
    const [q] = readComments(root, 'manuscript').comments
    expect(q).toMatchObject({ state: '답함', answers: [{ by: 'claude', at: '2026-10-01 16:40', body: '답입니다.\n- 반영: chapters/a.tex 3행' }] })
    expect(pendingQuestions(root)).toEqual([])
  })

  it('에이전트 함은 대기 중인 질문만 모으고, 끝냄으로 바꾸면 빠진다', () => {
    addComment(root, 'block-v-clock', { kind: '질문', title: '작업노트 결과 v-clock', page: 1, text: '왜?' }, at)
    addComment(root, 'block-v-clock', { kind: '코멘트', title: '작업노트 결과 v-clock', page: 1, text: '메모' }, at)
    expect(pendingQuestions(root)).toEqual([expect.objectContaining({ target: 'block-v-clock', file: 'workbench/comments/block-v-clock.md', id: 'c-20261001-1612', body: '왜?' })])
    const f = readComments(root, 'block-v-clock')
    const next = setCommentState(root, 'block-v-clock', 'c-20261001-1612', '끝냄', f.hash)
    expect(next.comments[0]!.state).toBe('끝냄')
    expect(pendingQuestions(root)).toEqual([])
    expect(listComments(root).map((x) => x.comments.length)).toEqual([2])
  })

  it('읽은 뒤 바뀐 파일은 다시 쓰지 않고, 답이 달린 코멘트는 지우지 않는다', () => {
    addComment(root, 'paper-x', { kind: '질문', title: '논문 x', page: 1, text: '질문' }, at)
    const old = readComments(root, 'paper-x').hash
    fs.appendFileSync(path.join(root, 'comments/paper-x.md'), '\n### 답 · claude · 2026-10-01 17:00\n답\n- 상태: 답함\n')
    const before = file('paper-x')
    expect(() => setCommentState(root, 'paper-x', 'c-20261001-1612', '끝냄', old)).toThrow(/바뀌었음/)
    expect(() => deleteComment(root, 'paper-x', 'c-20261001-1612', readComments(root, 'paper-x').hash)).toThrow(/지우지 않습니다/)
    expect(file('paper-x')).toBe(before)
  })

  it('답이 없는 코멘트는 지우고 나머지는 바이트 그대로 둔다', () => {
    addComment(root, 'paper-y', { kind: '코멘트', title: '논문 y', page: 1, text: '하나' }, at)
    const one = file('paper-y')
    addComment(root, 'paper-y', { kind: '코멘트', title: '논문 y', page: 2, text: '둘' }, new Date(2026, 9, 1, 16, 13))
    const f = deleteComment(root, 'paper-y', 'c-20261001-1613', readComments(root, 'paper-y').hash)
    expect(f.comments.map((c) => c.body)).toEqual(['하나'])
    expect(file('paper-y').trimEnd()).toBe(one.trimEnd())
  })

  it('대상 이름으로 폴더 밖을 가리킬 수 없다', () => {
    for (const bad of ['../x', 'paper-../../x', 'Paper', 'paper-a/b', '']) {
      expect(() => readComments(root, bad)).toThrow(/올바르지 않음/)
    }
  })

  it('손으로 쓴 파일도 읽는다 (상태 줄 없는 질문은 대기)', () => {
    const f = parseComments('paper-z', '# 코멘트 · 논문 z\n\n## c-1 · 질문 · p.7\n> "인용"\n\n본문\n')
    expect(f.comments[0]).toMatchObject({ id: 'c-1', state: '대기', page: 7, quote: '인용', body: '본문' })
  })

  it('파일 감시가 코멘트 파일을 알린다', () => {
    expect(classify(root, path.join(root, 'comments', 'paper-x.md'))).toEqual({ type: 'comments', target: 'paper-x' })
    expect(classify(root, path.join(root, 'comments', '.paper-x.md.tmp'))).toBeNull()
  })
})

describe('노트 기록 파일', () => {
  it('예전 코멘트 머리를 메모로 읽고 파일은 바꾸지 않는다', () => {
    const original = '# 코멘트 · 예전 노트\r\n<!-- rw-source: workbench/notes/old/note.md -->\r\n\r\n## c-old · 코멘트 · 전체\r\n\r\n원래 메모  \r\n'
    writeRecord('note-old', original)
    const result = readComments(root, 'note-old')
    expect(result.comments).toEqual([expect.objectContaining({ id: 'c-old', kind: '메모', body: '원래 메모', state: null })])
    expect(result.highlights).toEqual([])
    expect(file('note-old')).toBe(original)
  })

  it('예전 수동 인용의 줄별 따옴표는 공백으로 잇고 파일은 그대로 둔다', () => {
    const original = '# 코멘트 · 예전 노트\n\n## c-old-quote · 코멘트 · 전체\n> "first"\n> "second"\n\n메모\n'
    writeRecord('note-old-quote', original)
    expect(readComments(root, 'note-old-quote').comments[0]).toMatchObject({ kind: '메모', quote: 'first second', body: '메모' })
    expect(file('note-old-quote')).toBe(original)
    const wrapped = '# 코멘트 · 새 노트\n\n## c-new-quote · 메모 · 전체\n> "first\n> second"\n\n메모\n'
    writeRecord('note-new-quote', wrapped)
    expect(readComments(root, 'note-new-quote').comments[0]!.quote).toBe('first\nsecond')
    expect(file('note-new-quote')).toBe(wrapped)
  })

  it('네 종류를 같은 파일에 덧붙이고 하이라이트는 목록과 질문 수에서 뺀다', () => {
    const target = 'note-kinds'
    const common = { title: '기록', source: 'workbench/notes/kinds/note.md' }
    addComment(root, target, { ...common, kind: '메모', text: '메모 내용', color: 'green' }, at)
    const first = file(target)
    addComment(root, target, { ...common, kind: '할 일', text: '확인하기' }, at)
    addComment(root, target, { ...common, kind: '질문', text: '왜 그런가?' }, at)
    const highlight = addComment(root, target, { ...common, kind: '하이라이트', color: 'yellow', quote: '고른 글', text: '' }, at).entry
    const result = readComments(root, target)
    expect(file(target).startsWith(first)).toBe(true)
    expect(result.comments.map((entry) => [entry.kind, entry.state])).toEqual([['메모', null], ['할 일', '대기'], ['질문', '대기']])
    expect(result.comments[0]!.color).toBe('green')
    expect(result.highlights).toEqual([expect.objectContaining({ id: highlight.id, kind: '하이라이트', color: 'yellow', quote: '고른 글' })])
    expect(new Set([...result.comments, ...result.highlights].map((entry) => entry.id)).size).toBe(4)
    expect(pendingQuestions(root).map((entry) => entry.body)).toEqual(['왜 그런가?'])
    expect(listComments(root)[0]!.comments).toHaveLength(3)
    expect(file(target)).toContain(' · 할 일 · 전체\n')
    expect(file(target)).toContain(' · 하이라이트 · 전체\n')
  })

  it('코멘트 입력은 메모로, 자동 입력은 분류 전 메모로 저장한다', () => {
    addComment(root, 'note-automatic', { kind: '코멘트', title: '노트', text: '예전 화면' }, at)
    addComment(root, 'note-automatic', { kind: '자동', title: '노트', text: '나중에 분류' }, at)
    const result = readComments(root, 'note-automatic')
    expect(result.comments[0]).toMatchObject({ kind: '메모', body: '예전 화면' })
    expect(result.comments[0]!.unsorted).toBeUndefined()
    expect(result.comments[1]).toMatchObject({ kind: '메모', body: '나중에 분류', unsorted: true })
    expect(file('note-automatic')).not.toMatch(/^## .* · (코멘트|자동) · /m)
    expect(file('note-automatic')).toContain('"unsorted":true')
  })

  it('하이라이트에는 네 색 중 하나가 필요하다', () => {
    for (const color of [undefined, 'red']) {
      expect(() => addComment(root, 'note-color', { kind: '하이라이트', title: '노트', quote: '선택', text: '', color: color as 'yellow' })).toThrow(expect.objectContaining({ status: 400 }))
    }
    for (const color of ['yellow', 'green', 'blue', 'pink'] as const) {
      expect(addComment(root, 'note-color', { kind: '하이라이트', title: '노트', quote: '선택', text: '', color }, at).entry.color).toBe(color)
    }
    expect(readComments(root, 'note-color').highlights).toHaveLength(4)
  })

  it('색과 상태를 함께 바꾸고 오래된 해시로는 아무것도 바꾸지 않는다', () => {
    const { entry, hash } = addComment(root, 'note-update', { kind: '질문', title: '노트', text: '질문', color: 'yellow' }, at)
    const result = updateComment(root, 'note-update', entry.id, { state: '끝냄', color: 'pink' }, hash)
    expect(result.comments[0]).toMatchObject({ state: '끝냄', color: 'pink' })
    const before = file('note-update')
    expect(() => updateComment(root, 'note-update', entry.id, { color: 'blue' }, hash)).toThrow(expect.objectContaining({ status: 409, currentHash: result.hash }))
    expect(file('note-update')).toBe(before)
  })

  it('할 일에는 대기와 끝냄만 허용한다', () => {
    const { entry, hash } = addComment(root, 'note-todo-state', { kind: '할 일', title: '노트', source: 'workbench/notes/state/note.md', text: '확인' }, at)
    const before = file('note-todo-state')
    expect(() => updateComment(root, 'note-todo-state', entry.id, { state: '답함' }, hash)).toThrow(expect.objectContaining({ status: 400 }))
    expect(file('note-todo-state')).toBe(before)
  })

  it('인용 문법으로 시작하는 할 일 본문도 기록과 일지에서 같은 글로 유지한다', () => {
    const target = 'note-quoted-todo'
    const source = 'workbench/notes/quoted-todo/note.md'
    const { entry, hash } = addComment(root, target, { kind: '할 일', title: '노트', source, text: '> quoted todo' }, at)
    const wb = new Workbench(root)
    expect(entry).toMatchObject({ body: '\\> quoted todo', state: '대기' })
    expect(entry.quote).toBeUndefined()
    expect(wb.readJournal('2026-10-01')).toEqual([expect.objectContaining({ kind: 'todo', target: source, text: '\\> quoted todo', done: false })])
    const changed = updateComment(root, target, entry.id, { state: '끝냄' }, hash)
    expect(changed.comments[0]).toMatchObject({ body: '\\> quoted todo', state: '끝냄' })
    expect(wb.readJournal('2026-10-01').find((item) => item.kind === 'todo')).toMatchObject({ text: '\\> quoted todo', done: true })
  })

  it.each([
    { label: '본문', tail: 'Body text\n<!-- rw: {"literal":true} -->\n' },
    { label: '답', tail: 'Body text\n\n### 답 · agent · 2026-10-01 17:00\n<!-- rw: {"literal":true} -->\nAnswer text\n- 상태: 답함\n' },
  ])('색을 바꿀 때 $label 속의 rw 줄은 고치지 않고 머리에 메타를 넣는다', ({ tail }) => {
    const head = '# 코멘트 · 수동 기록\n\n## c-literal · 질문 · 전체\n'
    writeRecord('note-literal-meta', `${head}\n${tail}`)
    const before = readComments(root, 'note-literal-meta')
    const changed = updateComment(root, 'note-literal-meta', 'c-literal', { color: 'pink' }, before.hash)
    expect(changed.comments[0]!.color).toBe('pink')
    expect(changed.comments[0]!.body).toBe(before.comments[0]!.body)
    expect(changed.comments[0]!.answers).toEqual(before.comments[0]!.answers)
    expect(file('note-literal-meta')).toBe(`${head}<!-- rw: {"color":"pink"} -->\n\n${tail}`)
  })

  it.each(['\n', '\r\n'])('수정과 삭제는 대상 section 밖의 바이트를 유지한다 (%j)', (newline) => {
    const prefix = ['# 코멘트 · 수동 기록  ', '', '## c-first · 코멘트 · 전체', '<!-- rw: {"custom":"keep"} -->', '', '앞의 글  ', '', ''].join(newline)
    const section = ['## c-selected · 하이라이트 · L3', '<!-- rw: {"color":"yellow","line":3,"custom":"keep me"} -->', '> "선택"', '', ''].join(newline)
    const suffix = ['## c-last · 질문 · 전체', '- 상태: 대기', '', '뒤의 글  ', '', '### 답 · agent · 2026-10-01 17:00', '답을 지키기  ', '- 상태: 답함', '', ''].join(newline)
    writeRecord('note-bytes', prefix + section + suffix)
    const result = updateComment(root, 'note-bytes', 'c-selected', { color: 'blue' }, readComments(root, 'note-bytes').hash)
    const changed = file('note-bytes')
    expect(changed.slice(0, changed.indexOf('## c-selected'))).toBe(prefix)
    expect(changed.slice(changed.indexOf('## c-last'))).toBe(suffix)
    expect(changed).toContain('"custom":"keep me"')
    expect(result.highlights[0]!.color).toBe('blue')
    deleteComment(root, 'note-bytes', 'c-selected', result.hash)
    expect(file('note-bytes')).toBe(prefix + suffix)
  })
})

describe('기록 글 고치기와 프로젝트 모음', () => {
  it.each(['\n', '\r\n'])('본문만 바꾸고 다른 절·머리·메타·인용·상태·답 바이트를 보존한다 (%j)', (newline) => {
    const prefix = ['# 코멘트 · 노트  ', '<!-- rw-source: workbench/notes/edit/note.md -->', '', '## c-first · 메모 · 전체', '', '앞의 글  ', '', '## c-edit · 질문 · L2', '<!-- rw: { "color": "green", "line": 2, "custom": true } -->', '> "고른 글"', '- 상태: 대기  ', '', ''].join(newline)
    const oldBody = ['예전 질문  ', '', '두 번째 문단'].join(newline)
    const suffix = ['', '', '- 상태: 답함  ', '', '### 답 · agent · 2026-10-01 17:00', '에이전트가 쓴 답  ', '<!-- rw: {"literal":true} -->', '- 상태: 답함', '', '## c-last · 메모 · 전체', '', '뒤의 글  ', ''].join(newline)
    const sourceFile = writeSource('workbench/notes/edit/note.md', '첫 줄\n고른 글\n')
    writeRecord('note-edit', prefix + oldBody + suffix)
    const before = readComments(root, 'note-edit')
    const changed = updateComment(root, 'note-edit', 'c-edit', { text: '새 질문\n두 번째 줄' }, before.hash)
    expect(file('note-edit')).toBe(prefix + ['새 질문', '두 번째 줄'].join(newline) + suffix)
    expect(changed.comments[1]).toMatchObject({ body: '새 질문\n두 번째 줄', quote: '고른 글', color: 'green', state: '답함', answers: before.comments[1]!.answers })
    expect(fs.readFileSync(sourceFile, 'utf8')).toBe('첫 줄\n고른 글\n')
  })

  it('처음 글을 더할 때 인용과 에이전트 답을 지키고 글 속의 구조 문법을 보호한다', () => {
    const original = '# 코멘트 · 노트\n\n## c-empty · 질문 · L1\n<!-- rw: {"line":1} -->\n> "고른 글"\n- 상태: 대기\n\n### 답 · agent · 2026-10-01 17:00\n답 그대로  \n- 상태: 답함\n'
    writeRecord('note-empty', original)
    const result = updateComment(root, 'note-empty', 'c-empty', { text: '> 본문 인용\n## 가짜 머리\n- 상태: 끝냄' }, readComments(root, 'note-empty').hash)
    expect(result.comments[0]).toMatchObject({ quote: '고른 글', body: '\\> 본문 인용\n\\## 가짜 머리\n\\- 상태: 끝냄', state: '답함' })
    expect(file('note-empty').slice(file('note-empty').indexOf('### 답'))).toBe(original.slice(original.indexOf('### 답')))
  })

  it('읽은 뒤 답이 붙으면 오래된 해시의 글 수정을 409로 거절한다', () => {
    const { entry, hash } = addComment(root, 'note-stale-edit', { kind: '질문', title: '노트', text: '질문' }, at)
    fs.appendFileSync(path.join(root, 'comments/note-stale-edit.md'), '\n### 답 · agent · 2026-10-01 17:00\n답\n- 상태: 답함\n')
    const before = file('note-stale-edit')
    expect(() => updateComment(root, 'note-stale-edit', entry.id, { text: '고친 질문' }, hash)).toThrow(expect.objectContaining({ status: 409, currentHash: readComments(root, 'note-stale-edit').hash }))
    expect(file('note-stale-edit')).toBe(before)
  })

  it('읽을 수 없는 숨은 메타를 그대로 두며 일반 Markdown 머리로 시작하는 본문만 바꾼다', () => {
    const prefix = '# 코멘트 · 손으로 쓴 노트\n\n## c-heading · 질문 · L3\n<!-- rw: {"broken":} -->\n> "인용"\n- 상태: 대기\n\n'
    const suffix = '\n\n### 답 · agent · 2026-10-01 17:00\n답 그대로\n- 상태: 답함\n'
    writeRecord('note-heading', `${prefix}### 사용자가 적은 머리\n그 아래 글${suffix}`)
    const result = updateComment(root, 'note-heading', 'c-heading', { text: '### 답 · fake · 2026-10-01 17:01\n새 본문' }, readComments(root, 'note-heading').hash)
    expect(file('note-heading')).toBe(`${prefix}\\### 답 · fake · 2026-10-01 17:01\n새 본문${suffix}`)
    expect(result.comments[0]!.answers).toEqual([{ by: 'agent', at: '2026-10-01 17:00', body: '답 그대로' }])
    expect(result.comments[0]!.body).toBe('\\### 답 · fake · 2026-10-01 17:01\n새 본문')
  })

  it.each([
    { target: 'project', source: undefined, journalTarget: RESEARCH_TARGET },
    { target: 'calc-todo', source: 'calc/todo.tex', journalTarget: 'calc/todo.tex' },
  ])('$target 할 일을 일지에 잇고 글과 상태를 함께 고친다', ({ target, source, journalTarget }) => {
    const sourceFile = source && writeSource(source, '원래 계산 노트\n')
    const { entry, hash } = addComment(root, target, { kind: '할 일', title: '작업', source, text: '예전 할 일' }, at)
    const wb = new Workbench(root)
    expect(wb.readJournal('2026-10-01')).toEqual([expect.objectContaining({ kind: 'todo', target: journalTarget, text: '예전 할 일', done: false })])
    const changed = updateComment(root, target, entry.id, { text: '새 할 일\n두 번째 줄', state: '끝냄' }, hash)
    expect(changed.comments[0]).toMatchObject({ body: '새 할 일\n두 번째 줄', state: '끝냄' })
    expect(wb.readJournal('2026-10-01')[0]).toMatchObject({ target: journalTarget, text: '새 할 일 두 번째 줄', done: true })
    expect(wb.recentJournal().find((item) => item.kind === 'done')).toMatchObject({ target: journalTarget, text: '새 할 일 두 번째 줄' })
    if (sourceFile) expect(fs.readFileSync(sourceFile, 'utf8')).toBe('원래 계산 노트\n')
  })

  it('일지 글이 밖에서 바뀌면 기록 글 수정도 409로 멈추고 두 글을 보존한다', () => {
    const { entry, hash } = addComment(root, 'project', { kind: '할 일', title: '프로젝트', text: '예전 글' }, at)
    const wb = new Workbench(root)
    wb.editJournal('2026-10-01', 0, '예전 글', '바깥에서 고친 글')
    const journal = fs.readFileSync(path.join(root, 'log/2026-10-01.md'), 'utf8')
    const before = file('project')
    expect(() => updateComment(root, 'project', entry.id, { text: '기록의 새 글' }, hash)).toThrow(expect.objectContaining({ status: 409 }))
    expect(file('project')).toBe(before)
    expect(fs.readFileSync(path.join(root, 'log/2026-10-01.md'), 'utf8')).toBe(journal)
  })

  it('같은 분에 같은 글을 적어도 고른 기록의 연결만 고친다', () => {
    addComment(root, 'project', { kind: '할 일', title: '프로젝트', text: '같은 글' }, at)
    const { entry, hash } = addComment(root, 'project', { kind: '할 일', title: '프로젝트', text: '같은 글' }, at)
    updateComment(root, 'project', entry.id, { text: '두 번째 글' }, hash)
    expect(new Workbench(root).readJournal('2026-10-01').map((item) => item.text)).toEqual(['같은 글', '두 번째 글'])
  })

  it('계산 노트 경로가 없거나 빈 글로 바꾸면 기록을 쓰지 않는다', () => {
    expect(() => addComment(root, 'calc-missing', { kind: '할 일', title: '계산 노트', text: '할 일' }, at)).toThrow(expect.objectContaining({ status: 400 }))
    expect(fs.existsSync(path.join(root, 'comments/calc-missing.md'))).toBe(false)
    const { entry, hash } = addComment(root, 'project', { kind: '메모', title: '프로젝트', text: '글' }, at)
    const before = file('project')
    expect(() => updateComment(root, 'project', entry.id, { text: ' ' }, hash)).toThrow(expect.objectContaining({ status: 400 }))
    expect(file('project')).toBe(before)
  })

  it('프로젝트를 먼저 두고 노트별 기록은 다시 찾은 위치와 해시로 모으며 하이라이트는 뺀다', () => {
    const source = 'workbench/notes/group/note.md'
    writeSource(source, '새 줄\n둘째 줄\n고른 글\n')
    addComment(root, 'note-group', { kind: '질문', title: '묶인 노트', source, text: '왜?', quote: '고른 글', line: 1 }, at)
    addComment(root, 'note-highlight-only', { kind: '하이라이트', title: '하이라이트만', text: '', quote: '색', color: 'yellow' }, at)
    const original = file('note-group')
    const groups = listRecords(root, '프로젝트 이름')
    expect(groups.map((group) => group.target)).toEqual(['project', 'note-group'])
    expect(groups[0]).toEqual({ target: 'project', title: '프로젝트 이름', hash: '', comments: [] })
    expect(groups[1]).toMatchObject({ title: '묶인 노트', source, hash: readComments(root, 'note-group').hash, comments: [expect.objectContaining({ line: 3, body: '왜?' })] })
    expect(groups.every((group) => !('highlights' in group))).toBe(true)
    expect(file('note-group')).toBe(original)
    expect(fs.existsSync(path.join(root, 'comments/project.md'))).toBe(false)
    addComment(root, 'project', { kind: '메모', title: '프로젝트 이름', text: '프로젝트 메모' }, at)
    expect(listRecords(root, '프로젝트 이름')[0]!.comments[0]!.body).toBe('프로젝트 메모')
  })
})

describe('본문 선택 다시 찾기', () => {
  it.each([
    { target: 'note-legacy', source: 'workbench/notes/legacy/note.md', bodyFile: 'workbench/notes/legacy/note.md' },
    { target: 'block-legacy', source: 'legacy', bodyFile: 'workbench/blocks/legacy.md' },
  ])('줄 정보가 없는 예전 $target 인용은 여러 줄 본문과 일치하지 않아도 lost가 아니다', ({ target, source, bodyFile }) => {
    writeSource(bodyFile, 'first\nsecond\n')
    const original = `# 코멘트 · 예전 노트\n<!-- rw-source: ${source} -->\n\n## c-20261001-1612 · 코멘트 · 전체\n> "first second"\n\n예전 메모\n`
    writeRecord(target, original)
    const entry = readComments(root, target).comments[0]!
    expect(entry).toMatchObject({ kind: '메모', quote: 'first second', body: '예전 메모' })
    expect(entry.line).toBeUndefined()
    expect(entry.lost).toBeUndefined()
    expect(file(target)).toBe(original)
  })

  it('줄 정보가 없는 예전 인용도 원문과 일치하면 찾은 줄을 반환한다', () => {
    writeSource('workbench/notes/legacy-match/note.md', '첫 줄\n둘째 줄\n고른 글\n')
    const original = '# 코멘트 · 예전 노트\n<!-- rw-source: workbench/notes/legacy-match/note.md -->\n\n## c-20261001-1612 · 코멘트 · 전체\n> "고른 글"\n\n메모\n'
    writeRecord('note-legacy-match', original)
    const entry = readComments(root, 'note-legacy-match').comments[0]!
    expect(entry.line).toBe(3)
    expect(entry.lost).toBeUndefined()
    expect(file('note-legacy-match')).toBe(original)
  })

  it('목록과 대기 질문은 노트 본문을 읽지 않고 저장된 줄을 반환한다', () => {
    const source = 'workbench/notes/list/note.md'
    const bodyFile = writeSource(source, '추가된 줄\n추가된 줄\n고른 글\n')
    addComment(root, 'note-list', { kind: '질문', title: '노트', source, text: '왜?', quote: '고른 글', line: 1 }, at)
    addComment(root, 'note-list', { kind: '하이라이트', title: '노트', source, text: '', quote: '고른 글', line: 1, color: 'yellow' }, at)
    const reads = vi.spyOn(fs, 'readFileSync')
    try {
      const [listed] = listComments(root)
      expect(listed!.comments[0]).toMatchObject({ line: 1, quote: '고른 글' })
      expect(listed!.highlights[0]).toMatchObject({ line: 1, quote: '고른 글' })
      expect(pendingQuestions(root)).toHaveLength(1)
      expect(reads.mock.calls.some(([file]) => String(file) === bodyFile)).toBe(false)
    } finally { reads.mockRestore() }
    expect(readComments(root, 'note-list').comments[0]!.line).toBe(3)
  })

  it.each([{ folder: 'notes', target: 'note-anchor' }, { folder: 'calc', target: 'calc-anchor' }])('$folder: 앞뒤 문맥으로 선택을 찾고 위에 줄이 늘어도 기록과 본문은 고치지 않는다', ({ folder, target }) => {
    const source = `workbench/${folder}/anchor/note.md`
    const sourceFile = writeSource(source, '머리\n앞 선택 뒤\n다른 선택 글\n')
    addComment(root, target, { kind: '하이라이트', title: '노트', source, text: '', color: 'yellow', line: 2, quote: '선택', prefix: '앞 ', suffix: ' 뒤' }, at)
    const originalRecord = file(target)
    const changedSource = '새 줄\n다른 선택 글\n머리\n앞 선택 뒤\n다른 선택 글\n'
    fs.writeFileSync(sourceFile, changedSource)
    expect(readComments(root, target).highlights[0]).toMatchObject({ line: 4, quote: '선택', prefix: '앞 ', suffix: ' 뒤' })
    expect(readComments(root, target).highlights[0]!.lost).not.toBe(true)
    expect(listComments(root)[0]!.highlights[0]!.line).toBe(2)
    expect(file(target)).toBe(originalRecord)
    expect(fs.readFileSync(sourceFile, 'utf8')).toBe(changedSource)
  })

  it('문맥이 사라지면 인용만 찾고 같은 인용 중 저장한 줄에 가까운 것을 고른다', () => {
    const source = 'workbench/notes/fallback/note.md'
    writeSource(source, '선택\n둘\n셋\n넷\n선택\n')
    addComment(root, 'note-fallback', { kind: '메모', title: '노트', source, text: '연결된 메모', line: 4, quote: '선택', prefix: '지워진 앞', suffix: '지워진 뒤' }, at)
    expect(readComments(root, 'note-fallback').comments[0]).toMatchObject({ line: 5, quote: '선택' })
    expect(readComments(root, 'note-fallback').comments[0]!.lost).not.toBe(true)
  })

  it('같은 문맥이 반복되어도 저장한 줄에 가까운 것을 고른다', () => {
    const source = 'workbench/notes/repeated/note.md'
    writeSource(source, '앞 선택 뒤\n둘\n셋\n넷\n앞 선택 뒤\n')
    addComment(root, 'note-repeated', { kind: '메모', title: '노트', source, text: '메모', line: 4, quote: '선택', prefix: '앞 ', suffix: ' 뒤' }, at)
    expect(readComments(root, 'note-repeated').comments[0]!.line).toBe(5)
  })

  it('짧은 인용이 긴 노트에 수천 번 나와도 빨리 다시 찾는다 (일치마다 앞부분을 다시 세지 않음)', () => {
    const source = 'workbench/notes/long/note.md'
    writeSource(source, Array.from({ length: 3000 }, (_, i) => `the line ${i} of the note with the word the`).join('\n') + '\n')
    for (let i = 0; i < 10; i++) addComment(root, 'note-long', { kind: '메모', title: '노트', source, text: `메모 ${i}`, line: 2500, quote: 'the', prefix: '사라진 ', suffix: ' 문맥' }, at)
    const t0 = performance.now()
    const { comments } = readComments(root, 'note-long')
    expect(performance.now() - t0).toBeLessThan(1000)
    expect(comments.map((c) => c.line)).toEqual(Array(10).fill(2500))
  })

  it('여러 줄 선택은 줄바꿈을 보존해 다시 찾는다', () => {
    const source = 'workbench/notes/multiline/note.md'
    writeSource(source, '추가\n앞 첫 줄\n둘째 줄 뒤\n')
    addComment(root, 'note-multiline', { kind: '메모', title: '노트', source, text: '메모', line: 1, quote: '첫 줄\n둘째 줄', prefix: '앞 ', suffix: ' 뒤' }, at)
    expect(readComments(root, 'note-multiline').comments[0]).toMatchObject({ line: 2, quote: '첫 줄\n둘째 줄' })
  })

  it('여러 줄 선택의 따옴표가 예전 줄별 인용과 닮아도 원문 그대로 다시 찾는다', () => {
    const source = 'workbench/notes/quoted-lines/note.md'
    const quote = 'a"\n"b'
    writeSource(source, `첫 줄\n${quote}\n`)
    addComment(root, 'note-quoted-lines', { kind: '하이라이트', title: '노트', source, text: '', color: 'blue', line: 1, quote }, at)
    const entry = readComments(root, 'note-quoted-lines').highlights[0]!
    expect(entry).toMatchObject({ line: 2, quote })
    expect(entry.lost).toBeUndefined()
  })

  it('인용이 사라지면 원래 줄과 항목을 유지하고 lost를 돌려준다', () => {
    const source = 'workbench/notes/lost/note.md'
    writeSource(source, '모두 바뀐 본문\n')
    addComment(root, 'note-lost', { kind: '하이라이트', title: '노트', source, text: '', color: 'blue', line: 7, quote: '사라진 인용' }, at)
    const before = file('note-lost')
    expect(readComments(root, 'note-lost').highlights).toEqual([expect.objectContaining({ line: 7, quote: '사라진 인용', lost: true })])
    expect(file('note-lost')).toBe(before)
  })

  it('본문을 읽을 수 없으면 줄과 lost를 바꾸지 않는다', () => {
    addComment(root, 'note-unreadable', { kind: '메모', title: '노트', source: 'workbench/notes/missing/note.md', text: '메모', line: 9, quote: '인용' }, at)
    const entry = readComments(root, 'note-unreadable').comments[0]!
    expect(entry.line).toBe(9)
    expect(entry.lost).toBeUndefined()
  })

  it.each(['md', 'tex'])('보조 노트의 %s 본문에서 선택을 찾는다', (extension) => {
    writeSource(`workbench/blocks/anchor.${extension}`, '첫 줄\n둘째 줄\n고른 글\n')
    addComment(root, 'block-anchor', { kind: '메모', title: '보조 노트', source: 'anchor', text: '메모', line: 1, quote: '고른 글' }, at)
    expect(readComments(root, 'block-anchor').comments[0]!.line).toBe(3)
  })

  it('PDF 선택은 본문 재탐색 없이 쪽과 좌표를 유지한다', () => {
    const source = 'workbench/notes/pdf/note.md'
    writeSource(source, 'PDF 인용은 본문에 없음\n')
    addComment(root, 'note-pdf', { kind: '하이라이트', title: '노트', source, text: '', color: 'pink', page: 2, line: 8, rects: [[1, 2, 3, 4]], quote: 'PDF 선택' }, at)
    const entry = readComments(root, 'note-pdf').highlights[0]!
    expect(entry).toMatchObject({ page: 2, line: 8, rects: [[1, 2, 3, 4]] })
    expect(entry.lost).toBeUndefined()
  })
})

describe('기록 API', () => {
  useSampleApp()

  it('글 PATCH도 해시가 필요하며 모은 기록과 API 안내에 반영된다', async () => {
    const url = `${R}/comments/project`
    const added = await app.inject({ method: 'POST', url, payload: { kind: '메모', title: '프로젝트 기록', text: '예전 글' } })
    expect(added.statusCode).toBe(200)
    const { entry, hash } = added.json()
    expect((await app.inject({ method: 'PATCH', url: `${url}/${entry.id}`, payload: { text: '새 글' } })).statusCode).toBe(400)
    const changed = await app.inject({ method: 'PATCH', url: `${url}/${entry.id}`, payload: { text: '새 글', baseHash: hash } })
    expect(changed.statusCode).toBe(200)
    expect(changed.json().comments[0].body).toBe('새 글')
    const stale = await app.inject({ method: 'PATCH', url: `${url}/${entry.id}`, payload: { text: '덮어쓰기', baseHash: hash } })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().currentHash).toBe(changed.json().hash)
    const grouped = await app.inject(`${R}/records`)
    expect(grouped.statusCode).toBe(200)
    expect(grouped.json().files[0]).toMatchObject({ target: 'project', title: '프로젝트 기록', hash: changed.json().hash, comments: [expect.objectContaining({ body: '새 글' })] })
    expect(grouped.json().files.every((item: object) => !('highlights' in item))).toBe(true)
    const index = (await app.inject('/api')).json()
    expect(index.start).toContainEqual(expect.objectContaining({ method: 'GET', url: '/api/researches/:rid/records' }))
    expect(index.routes).toContainEqual({ method: 'GET', url: '/api/researches/:rid/records' })
  })

  it.each([
    { target: 'project', source: undefined, journalTarget: RESEARCH_TARGET },
    { target: 'calc-api-todo', source: 'calc/api-todo.tex', journalTarget: 'calc/api-todo.tex' },
  ])('$target 할 일을 일지에서 끝내도 원래 기록을 함께 바꾼다', async ({ target, source, journalTarget }) => {
    const url = `${R}/comments/${target}`
    const added = await app.inject({ method: 'POST', url, payload: { kind: '할 일', title: '할 일 대상', source, text: `${target}의 할 일` } })
    expect(added.statusCode).toBe(200)
    const journal = (await app.inject(`${R}/journal`)).json().entries.find((item: { text: string }) => item.text === `${target}의 할 일`)
    expect(journal).toMatchObject({ target: journalTarget, done: false })
    const done = await app.inject({ method: 'PATCH', url: `${R}/journal/${journal.date}/${journal.index}`, payload: { done: true, was: journal.text, link: journal.link } })
    expect(done.statusCode).toBe(200)
    expect((await app.inject(url)).json().comments.find((item: { id: string }) => item.id === added.json().entry.id).state).toBe('끝냄')
    const reopened = await app.inject({ method: 'PATCH', url: `${R}/journal/${journal.date}/${journal.index}`, payload: { done: false, was: journal.text, link: journal.link } })
    expect(reopened.statusCode).toBe(200)
    expect((await app.inject(url)).json().comments.find((item: { id: string }) => item.id === added.json().entry.id).state).toBe('대기')
  })

  it('색 PATCH와 삭제에도 baseHash를 요구하고 충돌에는 현재 해시를 준다', async () => {
    const url = `${R}/comments/note-api-highlight`
    const added = await app.inject({ method: 'POST', url, payload: { kind: '하이라이트', title: '노트', color: 'yellow', quote: '선택', text: '' } })
    expect(added.statusCode).toBe(200)
    const { entry, hash } = added.json()
    const missingHash = await app.inject({ method: 'PATCH', url: `${url}/${entry.id}`, payload: { color: 'blue' } })
    expect(missingHash.statusCode).toBe(400)
    const changed = await app.inject({ method: 'PATCH', url: `${url}/${entry.id}`, payload: { color: 'blue', baseHash: hash } })
    expect(changed.statusCode).toBe(200)
    expect(changed.json().highlights[0]).toMatchObject({ id: entry.id, color: 'blue' })
    expect(changed.json().comments).toEqual([])
    const stale = await app.inject({ method: 'PATCH', url: `${url}/${entry.id}`, payload: { color: 'pink', baseHash: hash } })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().currentHash).toBe(changed.json().hash)
    const staleDelete = await app.inject({ method: 'DELETE', url: `${url}/${entry.id}?baseHash=${hash}` })
    expect(staleDelete.statusCode).toBe(409)
    expect(staleDelete.json().currentHash).toBe(changed.json().hash)
    const index = (await app.inject(`${R}/comments`)).json()
    expect(index.files.find((item: { target: string }) => item.target === 'note-api-highlight').count).toBe(0)
    expect(index.pending.some((item: { target: string }) => item.target === 'note-api-highlight')).toBe(false)
    const deleted = await app.inject({ method: 'DELETE', url: `${url}/${entry.id}?baseHash=${changed.json().hash}` })
    expect(deleted.statusCode).toBe(200)
    expect(deleted.json().highlights).toEqual([])
  })
})

describe('기록 자동 분류 API', () => {
  let a: ReturnType<typeof buildApp>
  let runner: ReturnType<typeof vi.fn<AskRunner>>
  let answer: ReturnType<typeof vi.fn<AskRunner>>
  let apiRoot: string

  beforeEach(async () => {
    fs.cpSync(fixture, repository, { recursive: true, filter: (src) => !src.includes('.build') })
    fs.mkdirSync(path.join(repository, '.git'), { recursive: true })
    runner = vi.fn<AskRunner>(async () => { throw new Error('가짜 분류 결과가 필요함') })
    answer = vi.fn<AskRunner>(async () => { throw new Error('분류는 답변을 요청하지 않음') })
    a = buildApp({ configDir: path.join(repository, '.test-config'), classify: runner, ask: answer })
    const registered = await a.inject({ method: 'POST', url: '/api/researches', payload: { path: repository } })
    expect(registered.statusCode).toBe(200)
    apiRoot = `/api/researches/${registered.json().id}`
  })
  afterEach(async () => { await a.close() })

  const result = (id: string, kind: '메모' | '할 일' | '질문', text: string) => ({ id, items: [{ kind, text }] })
  const journalFiles = () => {
    const wb = new Workbench(root)
    return wb.journalDates().map((date) => [date, fs.readFileSync(path.join(wb.logDir, `${date}.md`), 'utf8')])
  }
  const deferred = () => {
    let resolve!: (text: string) => void
    const promise = new Promise<string>((done) => { resolve = done })
    return { promise, resolve }
  }

  it.each([
    { target: 'note-classify', source: 'workbench/notes/classify/note.md', journalTarget: 'workbench/notes/classify/note.md' },
    { target: 'project', source: undefined, journalTarget: RESEARCH_TARGET },
  ])('$target의 분류 전만 한 번 보내고 할 일로 바꾸며 원문과 일지 연결을 지킨다', async ({ target, source, journalTarget }) => {
    const sourceText = '노트의 원문  \n고른 글\n'
    const sourceFile = writeSource('workbench/notes/classify/note.md', sourceText)
    const originalBody = '식 (3)을 확인하기\n\n부호를 그대로 적어 둘 것'
    const original = addComment(root, target, { kind: '자동', title: '분류할 노트', source, text: originalBody, quote: '고른 글', color: 'green', line: 2 }, at).entry
    const other = addComment(root, 'note-outside', { kind: '자동', title: '다른 노트', source: 'workbench/notes/outside/note.md', text: '다른 노트에만 있는 기록' }, at).entry
    const unchanged = addComment(root, target, { kind: '메모', title: '분류할 노트', text: '이미 분류한 메모' }, at).entry
    addComment(root, target, { kind: '하이라이트', title: '분류할 노트', color: 'pink', quote: '하이라이트만', text: '' }, at)
    const raw = file(target).replace(originalBody, originalBody.replace('확인하기', '확인하기  '))
    writeRecord(target, raw)
    const untouchedSuffix = raw.slice(raw.indexOf(`## ${unchanged.id} · `))
    const outsideBefore = file('note-outside')
    runner.mockResolvedValue(JSON.stringify([result(original.id, '할 일', '모델이 바꿔 쓴 문장')]))
    const before = readComments(root, target)

    const response = await a.inject({ method: 'POST', url: `${apiRoot}/comments/${target}/classify`, payload: { baseHash: before.hash } })

    expect(response.statusCode).toBe(200)
    const next = response.json<CommentFile>()
    const entry = next.comments.find((entry) => entry.id === original.id)!
    expect(entry).toMatchObject({ id: original.id, kind: '할 일', state: '대기', body: before.comments[0]!.body, color: 'green', quote: '고른 글', line: 2 })
    expect(entry.unsorted).toBeUndefined()
    expect(next.comments).toHaveLength(2)
    expect(file(target)).toContain(originalBody.replace('확인하기', '확인하기  '))
    expect(file(target).slice(file(target).indexOf(`## ${unchanged.id} · `))).toBe(untouchedSuffix)
    expect(file(target)).toContain(`## ${original.id} · 할 일 · L2\n`)
    expect(file(target)).toContain('- 상태: 대기\n')
    expect(file(target)).not.toContain('모델이 바꿔 쓴 문장')
    expect(file('note-outside')).toBe(outsideBefore)
    expect(fs.readFileSync(sourceFile, 'utf8')).toBe(sourceText)
    expect(runner).toHaveBeenCalledTimes(1)
    expect(runner.mock.calls[0]![0].cwd).toBe(fs.realpathSync(repository))
    expect(runner.mock.calls[0]![0].prompt).toContain(original.id)
    expect(runner.mock.calls[0]![0].prompt).toContain('고른 글')
    expect(runner.mock.calls[0]![0].prompt).not.toContain(other.body)
    expect(runner.mock.calls[0]![0].prompt).not.toContain('이미 분류한 메모')
    expect(runner.mock.calls[0]![0].prompt).not.toContain('하이라이트만')
    expect(answer).not.toHaveBeenCalled()
    const journal = new Workbench(root).recentJournal().find((item) => item.kind === 'todo' && item.target === journalTarget && item.text.startsWith('식 (3)을 확인하기'))!
    expect(journal).toMatchObject({ done: false, text: '식 (3)을 확인하기 부호를 그대로 적어 둘 것' })
    expect(entry.journal).toBe(`${journal.date} ${journal.time}`)
    expect(entry.journalIndex).toBe(journal.index)
    const done = await a.inject({ method: 'PATCH', url: `${apiRoot}/journal/${journal.date}/${journal.index}`, payload: { done: true, was: journal.text, link: journal.link } })
    expect(done.statusCode).toBe(200)
    expect(readComments(root, target).comments.find((item) => item.id === original.id)!.state).toBe('끝냄')
    expect((await a.inject('/api')).json().routes).toContainEqual({ method: 'POST', url: '/api/researches/:rid/comments/:target/classify' })
  })

  it.each([false, true])('두 종류로 나눌 때 원문과 앵커를 남기고 새 기록에 물려준다 (PDF: %j)', async (pdf) => {
    const target = 'note-split'
    const source = 'workbench/notes/split/note.md'
    const sourceText = '첫 줄\n앞 고른 글 뒤\n'
    const sourceFile = writeSource(source, sourceText)
    const body = '식 (3)을 확인하기.\n왜 부호가 바뀌는가?'
    const anchors = { color: 'blue' as const, line: 2, prefix: '앞 ', suffix: ' 뒤', quote: '고른 글', ...(pdf && { page: 4, rects: [[1, 2, 3, 4]] }) }
    const original = addComment(root, target, { kind: '자동', title: '나눌 노트', source, text: body, ...anchors }, at).entry
    const rawBody = body.replace('확인하기.', '확인하기.  ')
    writeRecord(target, file(target).replace(body, rawBody))
    const originalEntry = readComments(root, target).comments[0]!
    runner.mockResolvedValue(JSON.stringify([{ id: original.id, items: [{ kind: '할 일', text: '식 (3)을 확인하기.' }, { kind: '질문', text: '왜 부호가 바뀌는가?' }] }]))

    const response = await a.inject({ method: 'POST', url: `${apiRoot}/comments/${target}/classify`, payload: { baseHash: readComments(root, target).hash } })

    expect(response.statusCode).toBe(200)
    const next = response.json<CommentFile>()
    expect(next.comments).toHaveLength(3)
    expect(next.comments[0]).toMatchObject({ id: original.id, kind: '메모', body: originalEntry.body, split: true, ...anchors })
    expect(next.comments[0]!.unsorted).toBeUndefined()
    expect(file(target)).toContain(rawBody)
    expect(new Set(next.comments.map((entry) => entry.id)).size).toBe(3)
    expect(next.comments.slice(1)).toEqual([
      expect.objectContaining({ kind: '할 일', state: '대기', body: '식 (3)을 확인하기.', ...anchors }),
      expect.objectContaining({ kind: '질문', state: '대기', body: '왜 부호가 바뀌는가?', ...anchors }),
    ])
    for (const entry of next.comments.slice(1)) {
      expect(entry.unsorted).toBeUndefined()
      expect(entry.split).toBeUndefined()
    }
    const journal = new Workbench(root).recentJournal().filter((item) => item.kind === 'todo' && item.target === source)
    expect(journal).toEqual([expect.objectContaining({ text: '식 (3)을 확인하기.', done: false })])
    expect(next.comments[1]!.journal).toBe(`${journal[0]!.date} ${journal[0]!.time}`)
    expect(next.comments[1]!.journalIndex).toBe(journal[0]!.index)
    expect(fs.readFileSync(sourceFile, 'utf8')).toBe(sourceText)
    expect(runner).toHaveBeenCalledTimes(1)
    expect(answer).not.toHaveBeenCalled()
  })

  it('밖에서 적은 PDF 기록을 나눌 때 긴 인용·문맥과 정밀한 좌표를 줄이지 않는다', async () => {
    const target = 'paper-external-split'
    const id = 'c-external-split'
    const quote = '원문 인용을 그대로 지킵니다. '.repeat(50)
    const anchors = {
      page: 7, line: 9, color: 'pink' as const, quote,
      prefix: '선택 바로 앞의 긴 문맥 '.repeat(5), suffix: '선택 바로 뒤의 긴 문맥 '.repeat(5),
      rects: Array.from({ length: 65 }, (_, index) => [index + 0.12345, 20.56789, 30.34567, 4.56789]),
    }
    const rawBody = '나중에 참고할 관찰.  \r\n\r\n왜 이 식이 성립하는가?  '
    const original = `# 코멘트 · 바깥에서 적은 PDF 기록\r\n<!-- rw-source: external.pdf -->\r\n\r\n## ${id} · 메모 · p.7\r\n<!-- rw: ${JSON.stringify({ unsorted: true, color: anchors.color, line: anchors.line, prefix: anchors.prefix, suffix: anchors.suffix, rects: anchors.rects })} -->\r\n> "${quote}"\r\n\r\n${rawBody}\r\n`
    writeRecord(target, original)
    const before = readComments(root, target)
    expect(before.comments[0]).toMatchObject(anchors)
    runner.mockResolvedValue(JSON.stringify([{ id, items: [{ kind: '메모', text: '나중에 참고할 관찰.' }, { kind: '질문', text: '왜 이 식이 성립하는가?' }] }]))

    const response = await a.inject({ method: 'POST', url: `${apiRoot}/comments/${target}/classify`, payload: { baseHash: before.hash } })

    expect(response.statusCode).toBe(200)
    const next = response.json<CommentFile>()
    expect(next.comments).toHaveLength(3)
    expect(next.comments[0]).toMatchObject({ id, body: before.comments[0]!.body, split: true, ...anchors })
    expect(next.comments[0]!.unsorted).toBeUndefined()
    expect(file(target)).toContain(rawBody)
    expect(next.comments.slice(1)).toEqual([
      expect.objectContaining({ kind: '메모', body: '나중에 참고할 관찰.', ...anchors }),
      expect.objectContaining({ kind: '질문', state: '대기', body: '왜 이 식이 성립하는가?', ...anchors }),
    ])
    expect(runner).toHaveBeenCalledTimes(1)
    expect(answer).not.toHaveBeenCalled()
  })

  it.each(['runner', 'json', 'kind'])('%s 실패면 기록·일지·노트 바이트를 전혀 바꾸지 않는다', async (failure) => {
    const target = 'note-failure'
    const source = 'workbench/notes/failure/note.md'
    const sourceText = '지켜야 하는 본문\r\n끝 공백  \r\n'
    const sourceFile = writeSource(source, sourceText)
    const first = addComment(root, target, { kind: '자동', title: '노트', source, text: '첫 할 일' }, at).entry
    const second = addComment(root, target, { kind: '자동', title: '노트', source, text: '두 번째 기록' }, at).entry
    addComment(root, 'project', { kind: '할 일', title: '프로젝트', text: '이미 있는 할 일' }, at)
    const before = file(target)
    const journals = journalFiles()
    if (failure === 'runner') runner.mockRejectedValue(new Error('provider detail must stay private'))
    else if (failure === 'json') runner.mockResolvedValue('분류 결과를 읽을 수 없습니다')
    else runner.mockResolvedValue(JSON.stringify([result(first.id, '할 일', first.body), { id: second.id, items: [{ kind: '기타', text: second.body }] }]))

    const response = await a.inject({ method: 'POST', url: `${apiRoot}/comments/${target}/classify`, payload: { baseHash: readComments(root, target).hash } })

    expect(response.statusCode).toBe(502)
    expect(response.json().error).toMatch(/[가-힣]/)
    expect(response.json().error).not.toContain('provider detail')
    expect(file(target)).toBe(before)
    expect(journalFiles()).toEqual(journals)
    expect(fs.readFileSync(sourceFile, 'utf8')).toBe(sourceText)
    expect(readComments(root, target).comments.every((entry) => entry.unsorted)).toBe(true)
  })

  it.each(['\n', '\r\n'])('모델을 기다리는 동안 붙은 답과 새 기록 바이트를 그대로 둔다 (%j)', async (newline) => {
    const target = 'project'
    const selected = addComment(root, target, { kind: '자동', title: '프로젝트', text: '분류할 원문' }, at).entry
    const question = addComment(root, target, { kind: '질문', title: '프로젝트', text: '이미 있는 질문' }, at).entry
    const pending = deferred()
    runner.mockReturnValue(pending.promise)
    const response = a.inject({ method: 'POST', url: `${apiRoot}/comments/${target}/classify`, payload: { baseHash: readComments(root, target).hash } }).then((response) => response)
    await vi.waitFor(() => expect(runner).toHaveBeenCalledTimes(1))
    appendAnswer(root, target, selected.id, 'agent', '분류 중 원래 기록에 붙인 답  \n두 번째 줄', at)
    appendAnswer(root, target, question.id, 'agent', '기존 질문의 답', at)
    const outside = addComment(root, target, { kind: '자동', title: '프로젝트', text: '분류 중 밖에서 새로 적은 글' }, at).entry
    const during = file(target).replace(/\n/g, newline)
    writeRecord(target, during)
    const answerBytes = during.slice(during.indexOf('### 답 · agent'), during.indexOf(`## ${question.id}`))
    const outsideBytes = during.slice(during.indexOf(`## ${question.id}`))
    pending.resolve(JSON.stringify([result(selected.id, '질문', selected.body)]))

    const completed = await response

    expect(completed.statusCode).toBe(200)
    const next = completed.json<CommentFile>()
    expect(next.comments.find((entry) => entry.id === selected.id)).toMatchObject({ kind: '질문', state: '답함', body: selected.body, answers: [{ by: 'agent', body: '분류 중 원래 기록에 붙인 답  \n두 번째 줄' }] })
    expect(next.comments.find((entry) => entry.id === selected.id)!.unsorted).toBeUndefined()
    expect(next.comments.find((entry) => entry.id === outside.id)).toMatchObject({ kind: '메모', unsorted: true, body: outside.body })
    expect(file(target).slice(file(target).indexOf('### 답 · agent'), file(target).indexOf(`## ${question.id}`))).toBe(answerBytes)
    expect(file(target).slice(file(target).indexOf(`## ${question.id}`))).toBe(outsideBytes)
  })

  it('모델을 기다리는 동안 글을 고치거나 분류 전을 떼거나 지운 기록은 건너뛴다', async () => {
    const target = 'project'
    const common = { kind: '자동' as const, title: '프로젝트' }
    const changed = addComment(root, target, { ...common, text: '바깥에서 고칠 글' }, at).entry
    const classified = addComment(root, target, { ...common, text: '바깥에서 분류할 글' }, at).entry
    const removed = addComment(root, target, { ...common, text: '바깥에서 지울 글' }, at).entry
    const selected = addComment(root, target, { ...common, text: '그대로 둔 글' }, at).entry
    const pending = deferred()
    runner.mockReturnValue(pending.promise)
    const response = a.inject({ method: 'POST', url: `${apiRoot}/comments/${target}/classify`, payload: { baseHash: readComments(root, target).hash } }).then((response) => response)
    await vi.waitFor(() => expect(runner).toHaveBeenCalledTimes(1))
    updateComment(root, target, changed.id, { text: '밖에서 고친 새 글' }, readComments(root, target).hash)
    const beforeMeta = file(target)
    const classifiedHead = beforeMeta.indexOf(`## ${classified.id} · `)
    writeRecord(target, beforeMeta.slice(0, classifiedHead) + beforeMeta.slice(classifiedHead).replace('"unsorted":true', '"custom":"already classified"'))
    deleteComment(root, target, removed.id, readComments(root, target).hash)
    const outsideBytes = file(target).slice(0, file(target).indexOf(`## ${selected.id} · `))
    const journals = journalFiles()
    pending.resolve(JSON.stringify([result(changed.id, '할 일', changed.body), result(classified.id, '할 일', classified.body), result(removed.id, '할 일', removed.body), result(selected.id, '질문', selected.body)]))

    const completed = await response

    expect(completed.statusCode).toBe(200)
    const next = completed.json<CommentFile>()
    expect(next.comments.find((entry) => entry.id === changed.id)).toMatchObject({ kind: '메모', body: '밖에서 고친 새 글', unsorted: true })
    expect(next.comments.find((entry) => entry.id === classified.id)).toMatchObject({ kind: '메모', body: classified.body })
    expect(next.comments.find((entry) => entry.id === classified.id)!.unsorted).toBeUndefined()
    expect(next.comments.some((entry) => entry.id === removed.id)).toBe(false)
    expect(next.comments.find((entry) => entry.id === selected.id)).toMatchObject({ kind: '질문', state: '대기', body: selected.body })
    expect(file(target).slice(0, file(target).indexOf(`## ${selected.id} · `))).toBe(outsideBytes)
    expect(journalFiles()).toEqual(journals)
  })

  it('해시가 없으면 400, 요청 전에 바뀐 해시에는 409이며 모델을 부르지 않는다', async () => {
    const target = 'project'
    const original = addComment(root, target, { kind: '자동', title: '프로젝트', text: '분류 전' }, at)
    const url = `${apiRoot}/comments/${target}/classify`
    expect((await a.inject({ method: 'POST', url, payload: {} })).statusCode).toBe(400)
    addComment(root, target, { kind: '메모', title: '프로젝트', text: '뒤에서 더한 글' }, at)
    const before = file(target)

    const response = await a.inject({ method: 'POST', url, payload: { baseHash: original.hash } })

    expect(response.statusCode).toBe(409)
    expect(response.json().currentHash).toBe(readComments(root, target).hash)
    expect(runner).not.toHaveBeenCalled()
    expect(file(target)).toBe(before)
  })

  it('분류 전 기록이 없으면 400이고 모델을 부르지 않는다', async () => {
    addComment(root, 'project', { kind: '메모', title: '프로젝트', text: '이미 분류한 기록' }, at)
    const response = await a.inject({ method: 'POST', url: `${apiRoot}/comments/project/classify`, payload: { baseHash: readComments(root, 'project').hash } })
    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('분류할 기록이 없습니다')
    expect(runner).not.toHaveBeenCalled()
  })

  it('같은 대상의 동시 분류를 거절하고 실패하면 다시 분류할 수 있다', async () => {
    const target = 'project'
    const added = addComment(root, target, { kind: '자동', title: '프로젝트', text: '분류할 글' }, at)
    const pending = deferred()
    runner.mockReturnValueOnce(pending.promise)
    const url = `${apiRoot}/comments/${target}/classify`
    const payload = { baseHash: added.hash }
    const first = a.inject({ method: 'POST', url, payload }).then((response) => response)
    await vi.waitFor(() => expect(runner).toHaveBeenCalledTimes(1))

    const duplicate = await a.inject({ method: 'POST', url, payload })

    expect(duplicate.statusCode).toBe(409)
    expect(runner).toHaveBeenCalledTimes(1)
    pending.resolve('invalid JSON')
    expect((await first).statusCode).toBe(502)
    runner.mockResolvedValueOnce(JSON.stringify([result(added.entry.id, '메모', added.entry.body)]))
    const retried = await a.inject({ method: 'POST', url, payload })
    expect(retried.statusCode).toBe(200)
    expect(retried.json<CommentFile>().comments[0]!.unsorted).toBeUndefined()
    expect(runner).toHaveBeenCalledTimes(2)
  })
})
