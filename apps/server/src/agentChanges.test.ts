import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkChanges, checkLevels, type CheckLevels } from './agentChanges.js'
import { withLang } from './i18n.js'
import { Workbench } from './workbench.js'

let dir: string
let wb: Workbench
const g = (...args: string[]) => execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8' })
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
  fs.writeFileSync(path.join(dir, file), text)
}
const commit = (msg = 'base') => { g('add', '-A'); g('commit', '-qm', msg) }
const check = (opts: { base?: string; levels?: CheckLevels } = {}) => withLang('ko', () => checkChanges(wb, opts))
const found = (opts?: { base?: string; levels?: CheckLevels }) => check(opts)!.diagnostics.map((d) => [d.level, d.check, d.file])

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-changes-'))
  write('workbench/research.yaml', 'title: 연구\nfolders: []\n')
  wb = new Workbench(path.join(dir, 'workbench'))
  g('init', '-q', '-b', 'main')
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('바뀐 것 검사', () => {
  it('git 기록이 없으면 null, 바뀐 것이 없으면 빈 목록', () => {
    expect(check()).toBeNull()
    commit()
    expect(check()).toEqual({ base: 'HEAD', commits: 0, files: 0, diagnostics: [] })
  })

  it('원자료·보존본의 있는 파일을 고치거나 지우면 오류, 새로 넣으면 바깥 경고만', () => {
    write('sources/paper.tex', 'a\n')
    write('archive/old/note.md', 'a\n')
    write('archive/README.md', '# 보존본\n')
    commit()
    write('sources/paper.tex', 'b\n')
    fs.rmSync(path.join(dir, 'archive/old/note.md'))
    write('sources/new.pdf', 'x')
    write('archive/README.md', '# 보존본\n\n| 옛 경로 | 새 경로 |\n')
    expect(found()).toEqual([
      ['error', 'frozen-folder', 'archive/old/note.md'],
      ['error', 'frozen-folder', 'sources/paper.tex'],
      ['warning', 'outside-workbench', 'archive/'],
      ['warning', 'outside-workbench', 'sources/'],
    ])
  })

  it('잠긴 파일을 고치면 오류', () => {
    write('workbench/rules/style.md', '---\nlocked: true\n---\n# 문체\n')
    commit()
    write('workbench/rules/style.md', '---\nlocked: true\n---\n# 문체 고침\n')
    expect(found()).toEqual([['error', 'locked', 'workbench/rules/style.md']])
  })

  it('노트·블록 노트를 해결로 바꾸면 오류, 해결 노트를 고치면 경고', () => {
    write('workbench/notes/a/note.yaml', 'name: A\n')
    write('workbench/notes/a/note.md', '# A\n')
    write('workbench/topics/t/b/note.yaml', 'name: B\nstate: done\n')
    write('workbench/topics/t/b/note.md', '# B\n')
    write('workbench/blocks/c.md', '---\nid: c\nstatus: in-progress\n---\n본문\n')
    write('workbench/blocks/d.md', '---\nid: d\nstatus: solved\n---\n본문\n')
    commit()
    write('workbench/notes/a/note.yaml', 'name: A\nstate: done\n')
    write('workbench/topics/t/b/note.md', '# B 고침\n')
    write('workbench/blocks/c.md', '---\nid: c\nstatus: solved\n---\n본문\n')
    write('workbench/blocks/d.md', '---\nid: d\nstatus: solved\n---\n본문 고침\n')
    expect(found()).toEqual([
      ['error', 'approval', 'workbench/blocks/c.md'],
      ['warning', 'confirmed-edit', 'workbench/blocks/d.md'],
      ['error', 'approval', 'workbench/notes/a/note.yaml'],
      ['warning', 'confirmed-edit', 'workbench/topics/t/b/note.md'],
      ['warning', 'flow-skipped', 'workbench/blocks/c.md'],
    ])
  })

  it('맡긴 일을 done으로 바꾸거나 판단·답 기록을 쓰면 오류', () => {
    write('workbench/tasks/2026-10-15-a.md', '---\ntitle: 일\ntask: 하기\nstate: working\n---\n')
    commit()
    write('workbench/tasks/2026-10-15-a.md', '---\ntitle: 일\ntask: 하기\nstate: done\njudged:\n  - { verdict: approve }\n---\n')
    const d = check()!.diagnostics
    expect(d.map((x) => x.check)).toEqual(['approval', 'approval'])
    expect(d[0]!.message).toContain('state: result')
  })

  it('흐름: 사람 확인 기록은 오류, 질문 문장·발단 선·갈래 폐기는 오류, 이유 없이 끝내면 오류 (새 점은 10/20부터 검사하지 않음)', () => {
    write('workbench/flow/q.yaml', 'format: 1\nkind: question\nprogress: open\nfields:\n  question: 왜?\nfrom:\n  - { id: a }\n')
    write('workbench/flow/f.yaml', 'format: 1\nkind: finding\nprogress: active\nevidence:\n  - kind: proof\n    file: x\n    checks:\n      - { at: 2026-10-02T15:00, by: claude, role: agent }\n')
    write('workbench/flow/layout.yaml', 'dots: {}\n')
    commit()
    write('workbench/flow/q.yaml', 'format: 1\nkind: question\nprogress: done\nresult: dropped\nfields:\n  question: 어떻게?\nfrom:\n  - { id: b }\n')
    write('workbench/flow/f.yaml', 'format: 1\nkind: finding\nprogress: active\nevidence:\n  - kind: proof\n    file: x\n    checks:\n      - { at: 2026-10-02T15:00, by: claude, role: agent }\n      - { at: 2026-10-03T09:00, by: claude, role: human }\n')
    write('workbench/flow/layout.yaml', 'dots: { f: { c: 1, r: 0 } }\n')
    write('workbench/flow/new.yaml', 'format: 1\nkind: finding\nprogress: open\n')
    expect(found()).toEqual([
      ['error', 'approval', 'workbench/flow/f.yaml'],
      ['error', 'flow-form', 'workbench/flow/q.yaml'],
      ['error', 'flow-human', 'workbench/flow/q.yaml'],
      ['error', 'flow-human', 'workbench/flow/q.yaml'],
      ['error', 'flow-human', 'workbench/flow/q.yaml'],
    ])
  })

  it('흐름: 판단 기록(judgments)을 쓰면 오류, 카드 칸만 바꾸면 통과 (10/23)', () => {
    write('workbench/flow/g.yaml', 'format: 1\nkind: finding\nprogress: done\nresult: solved\nfields:\n  statement: 가\nintegration: { at: 2026-10-23T10:00, skip: 시험 }\n')
    write('workbench/flow/q.yaml', 'format: 1\nkind: question\nprogress: open\nfields:\n  question: 왜?\n')
    commit()
    write('workbench/flow/g.yaml', 'format: 1\nkind: finding\nprogress: done\nresult: solved\nfields:\n  statement: 가\nintegration: { at: 2026-10-23T10:00, skip: 시험 }\njudgments:\n  - { at: 2026-10-23T11:00, by: user, verdict: approve }\n')
    write('workbench/flow/q.yaml', 'format: 1\nkind: question\nprogress: open\nfields:\n  question: 왜?\n  value: 다음 카드\ncard:\n  givens: [g]\n')
    expect(found()).toEqual([['error', 'approval', 'workbench/flow/g.yaml']])
  })

  it('흐름: 상한을 넘긴 새 명제, 시작하지 않은 카드 아래 새 일, 시작한 카드의 잠긴 칸, 정의 없는 용어 (10/23)', () => {
    const finding = (id: string) => write(`workbench/flow/${id}.yaml`, `format: 1\nkind: finding\nprogress: open\ndate: 2026-10-24\nby: codex\nfields: { statement: ${id} }\n`)
    finding('a'); finding('b')
    write('workbench/flow/q.yaml', 'format: 1\nkind: question\nprogress: open\nfields: { question: 왜?, criterion: 맞으면 }\ncard: { givens: [] }\njudgments:\n  - { at: 2026-10-23T10:00, by: user, verdict: start }\n')
    write('workbench/flow/w.yaml', 'format: 1\nkind: question\nprogress: open\nfields: { question: 어디?, criterion: 찾으면 }\ncard: { givens: [a] }\n')
    commit()
    finding('c'); finding('d')
    write('workbench/flow/q.yaml', 'format: 1\nkind: question\nprogress: open\nfields: { question: 왜?, criterion: 더 맞으면 }\ncard: { givens: [], terms: [κ′, { word: J, def: 결합 }] }\njudgments:\n  - { at: 2026-10-23T10:00, by: user, verdict: start }\n')
    write('workbench/flow/x.yaml', 'format: 1\nkind: calc\nprogress: active\nby: codex\nfrom:\n  - { id: w, type: origin }\nstart: { at: 2026-10-24T10:00, novel: 새것 }\n')
    write('workbench/flow/y.yaml', 'format: 1\nkind: calc\nprogress: active\nby: codex\nfrom:\n  - { id: q, type: origin }\nstart: { at: 2026-10-24T10:00, novel: 새것 }\n')
    const d = check()!.diagnostics.filter((x) => x.check.startsWith('card') || x.check === 'queue-cap')
    expect(d.map((x) => [x.level, x.check, x.file])).toEqual([
      ['error', 'card-locked', 'workbench/flow/q.yaml'],
      ['warning', 'card-terms', 'workbench/flow/q.yaml'],
      ['error', 'card-not-started', 'workbench/flow/x.yaml'],
      ['error', 'queue-cap', 'workbench/flow/c.yaml'],
    ])
    expect(d[1]!.message).toContain('κ′')
    expect(d[1]!.message).not.toContain('J')
    expect(d[2]!.message).toContain('사전 연구가 아직 승인되지 않았습니다')
    expect(d[3]!.message).toContain('4개로 상한 3')
  })

  it('흐름: 계산을 끝남으로 바꿀 때 필수 칸이 비면 오류, 노트만 바꾸고 점은 그대로면 경고', () => {
    write('workbench/flow/c.yaml', 'format: 1\nkind: calc\nprogress: active\ntitle: 계산\nfields:\n  goal: 잰다\n')
    write('workbench/topics/t/n/note.md', '# N\n')
    commit()
    write('workbench/flow/c.yaml', 'format: 1\nkind: calc\nprogress: done\nresult: solved\ntitle: 계산\nfields:\n  goal: 잰다\n')
    const d = check()!.diagnostics
    expect(d.map((x) => x.check)).toEqual(['flow-form', 'flow-integration'])
    expect(d[0]!.message).toContain('판정 기준 · 설정 · 결과 · 근거 · 실행의 코드')
    commit()
    write('workbench/topics/t/n/note.md', '# N 고침\n')
    expect(check()!.diagnostics.map((x) => [x.check, x.file])).toEqual([['flow-skipped', 'workbench/topics/t/n/note.md']])
  })

  it('흐름: 바뀐 점이 그 노트를 가리키거나 같은 주제여야 노트를 바꾼 일로 친다 (10/23)', () => {
    write('workbench/flow/other.yaml', 'format: 1\nkind: calc\nprogress: active\ntitle: 다른 주제\ntopics: [u]\n')
    write('workbench/flow/mine.yaml', 'format: 1\nkind: calc\nprogress: active\ntitle: 이 주제\ntopics: [x]\n')
    write('workbench/topics/t/n/note.md', '# N\n')
    write('workbench/notes/m/note.yaml', 'name: M\ntopics: [v]\n')
    write('workbench/notes/m/note.md', '# M\n')
    write('workbench/notes/loose/note.md', '# L\n')
    commit()
    // 무관한 점만 고치면 통과하지 않는다
    write('workbench/topics/t/n/note.md', '# N 고침\n')
    write('workbench/flow/other.yaml', 'format: 1\nkind: calc\nprogress: active\ntitle: 다른 주제 고침\ntopics: [u]\n')
    let d = check()!.diagnostics
    expect(d.map((x) => [x.check, x.file])).toEqual([['flow-skipped', 'workbench/topics/t/n/note.md']])
    expect(d[0]!.message).toContain('같은 주제인 것이 없습니다 (topics/t/n)')
    // 같은 주제(폴더의 주제)면 된다
    write('workbench/flow/mine.yaml', 'format: 1\nkind: calc\nprogress: active\ntitle: 이 주제\ntopics: [t]\n')
    expect(check()!.diagnostics).toEqual([])
    commit()
    // note.yaml의 주제가 아니어도, 점이 근거로 그 노트를 가리키면 된다. 주제 없는 노트는 주제 없는 점과 짝짓는다
    write('workbench/notes/m/note.md', '# M 고침\n')
    write('workbench/notes/loose/note.md', '# L 고침\n')
    write('workbench/flow/mine.yaml', 'format: 1\nkind: calc\nprogress: active\ntitle: 이 주제\ntopics: [t]\nevidence:\n  - { kind: calc, file: workbench/notes/m/note.md, text: 표 }\n')
    expect(check()!.diagnostics.map((x) => x.message)).toEqual([expect.stringContaining('노트 1개를 바꿨는데 바뀐 흐름 점 가운데 그 노트를 근거로 가리키거나 같은 주제인 것이 없습니다 (notes/loose)')])
    write('workbench/flow/other.yaml', 'format: 1\nkind: calc\nprogress: active\ntitle: 주제 없음\n')
    expect(check()!.diagnostics).toEqual([])
  })

  it('흐름: 에이전트가 만든 새 점에 시작 기록이 없으면, 끝난 점에 반영 기록이 없거나 맞지 않으면 경고 (10/23)', () => {
    write('workbench/flow/c.yaml', 'format: 1\nkind: question\nprogress: active\ntitle: 물음\nfields:\n  question: 왜?\n  motivation: 궁금\n  criterion: 예 아니오\n')
    write('workbench/notes/overview/note.md', '# 개요\n')
    commit()
    write('workbench/flow/a.yaml', 'format: 1\nkind: calc\nprogress: active\ntitle: 에이전트 점\nby: claude\n')
    write('workbench/flow/b.yaml', 'format: 1\nkind: calc\nprogress: active\ntitle: 시작 기록 있음\nby: claude\nstart: { at: 2026-10-23T09:00, novel: 처음 }\n')
    write('workbench/flow/u.yaml', 'format: 1\nkind: calc\nprogress: active\ntitle: 사람 점\nby: user\n')
    write('workbench/flow/f.yaml', 'format: 1\nkind: finding\nprogress: active\ntitle: 노트에서 옮긴 발견\nby: claude\n')
    write('workbench/flow/c.yaml', 'format: 1\nkind: question\nprogress: done\nresult: solved\ntitle: 물음\nfields:\n  question: 왜?\n  motivation: 궁금\n  criterion: 예 아니오\n')
    expect(found()).toEqual([['warning', 'flow-integration', 'workbench/flow/c.yaml'], ['warning', 'flow-start', 'workbench/flow/a.yaml']])
    write('workbench/flow/c.yaml', 'format: 1\nkind: question\nprogress: done\nresult: solved\ntitle: 물음\nfields:\n  question: 왜?\n  motivation: 궁금\n  criterion: 예 아니오\nintegration: { at: 2026-10-23T09:00, into: workbench/notes/overview/note.md }\n')
    expect(check()!.diagnostics.find((x) => x.file === 'workbench/flow/c.yaml')!.message).toContain('반영 기록이 맞지 않습니다')
    write('workbench/notes/overview/note.md', '# 개요\n\n답은 예 (flow-c).\n')
    expect(found()).toEqual([['warning', 'flow-start', 'workbench/flow/a.yaml']])
    write('workbench/flow/c.yaml', 'format: 1\nkind: question\nprogress: done\nresult: solved\ntitle: 물음\nfields:\n  question: 왜?\n  motivation: 궁금\n  criterion: 예 아니오\nintegration: { at: 2026-10-23T09:00, skip: 개요에 넣을 것이 아님 }\n')
    expect(found()).toEqual([['warning', 'flow-start', 'workbench/flow/a.yaml']])
  })

  it('확정한 결정을 고치면 경고, 초안은 넘어간다', () => {
    write('workbench/decisions/2026-10-01-a.md', '---\nstatus: accepted\n---\n# A\n')
    write('workbench/decisions/2026-10-02-b.md', '---\nstatus: draft\n---\n# B\n')
    commit()
    write('workbench/decisions/2026-10-01-a.md', '---\nstatus: accepted\n---\n# A 고침\n')
    write('workbench/decisions/2026-10-02-b.md', '---\nstatus: draft\n---\n# B 고침\n')
    expect(found()).toEqual([['warning', 'confirmed-edit', 'workbench/decisions/2026-10-01-a.md']])
  })

  it('workbench 밖은 맨 위 폴더마다, 표준 밖 폴더의 새 파일, 지우기·옮기기를 묶어 경고한다', () => {
    write('GOVERNMENT/queue.md', 'a\n')
    write('code-space/a.py', 'a\n')
    write('workbench/log/2026-10-14.md', '# 일지\n')
    commit()
    write('GOVERNMENT/new-issue.md', 'a\n')
    write('code-space/a.py', 'b\n')
    write('code-space/b.py', 'b\n')
    write('AGENTS.md', '# 규칙\n')
    g('mv', 'workbench/log/2026-10-14.md', 'workbench/log/2026-10-15.md')
    const d = check()!.diagnostics
    expect(d.map((x) => [x.level, x.check, x.file])).toEqual([
      ['warning', 'nonstandard-new-file', 'GOVERNMENT/new-issue.md'],
      ['warning', 'outside-workbench', 'AGENTS.md'],
      ['warning', 'outside-workbench', 'GOVERNMENT/'],
      ['warning', 'outside-workbench', 'code-space/'],
      ['warning', 'move-delete', 'workbench/log/2026-10-15.md'],
    ])
    expect(d[3]!.message).toContain('2개')
  })

  it('--base를 주면 그 뒤 커밋도 보고, 공통 규칙 머리말의 checks:가 세기를 바꾼다', () => {
    commit()
    g('tag', 'start')
    write('workbench/flow/new.yaml', 'format: 1\nkind: finding\nprogress: open\n')
    write('code-space/a.py', 'a\n')
    commit('dot')
    expect(check()!.diagnostics).toEqual([])
    const levels = checkLevels('---\ntitle: 규칙\nchecks:\n  flow-new-dot: error\n  outside-workbench: off\n  unknown: error\n  approval: loud\n---\n# 규칙\n')
    expect(levels).toEqual({ 'flow-new-dot': 'error', 'outside-workbench': 'off' })
    const r = check({ base: 'start', levels })!
    expect([r.base, r.commits, r.files]).toEqual(['start', 1, 2])
    expect(r.diagnostics.map((x) => [x.level, x.check])).toEqual([['error', 'flow-new-dot']])
    expect(check({ base: 'nope' })).toBeNull()
    expect(checkLevels(undefined)).toEqual({})
    expect(checkLevels('# 머리말 없음\n')).toEqual({})
  })
})
