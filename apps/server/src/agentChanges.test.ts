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
    commit()
    write('sources/paper.tex', 'b\n')
    fs.rmSync(path.join(dir, 'archive/old/note.md'))
    write('sources/new.pdf', 'x')
    expect(found()).toEqual([
      ['error', 'frozen-folder', 'archive/old/note.md'],
      ['error', 'frozen-folder', 'sources/paper.tex'],
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

  it('흐름: 새 점은 경고, 사람 확인 기록은 오류, 질문 문장·발단 선·갈래 폐기는 오류', () => {
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
      ['error', 'flow-human', 'workbench/flow/q.yaml'],
      ['error', 'flow-human', 'workbench/flow/q.yaml'],
      ['error', 'flow-human', 'workbench/flow/q.yaml'],
      ['warning', 'flow-new-dot', 'workbench/flow/new.yaml'],
    ])
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
