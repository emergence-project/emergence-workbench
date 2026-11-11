import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkChanges } from './agentChanges.js'
import { checkWorkbench } from './agentCheck.js'
import { withLang } from './i18n.js'
import { addAttempts, createProblem, directionReport, openProblem, patchProblem, readProblem, reportAttempt, startAttempt, verdictAttempt } from './problems.js'
import { Workbench } from './workbench.js'

let dir: string
let wb: Workbench
const g = (...args: string[]) => execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8' })
const P = 'workbench/problems/chain'
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
  fs.writeFileSync(path.join(dir, file), text)
}
const edit = (file: string, from: string | RegExp, to: string) => {
  const text = fs.readFileSync(path.join(dir, file), 'utf8')
  const next = text.replace(from, to)
  if (next === text) throw new Error(`바꿀 곳이 없습니다: ${file} ${from}`)
  fs.writeFileSync(path.join(dir, file), next)
}
const commit = () => { g('add', '-A'); g('commit', '-qm', 'base') }
const found = () => withLang('ko', () => checkChanges(wb))!.diagnostics.map((d) => [d.level, d.check, d.file])
const said = () => withLang('ko', () => checkChanges(wb))!.diagnostics.map((d) => d.message).join('\n')
const hash = () => readProblem(wb, 'chain').hash

/** 사용자가 시작한 문제와 후보 A · B · C (한도 2) */
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-problem-changes-'))
  write('workbench/research.yaml', 'title: 연구\nfolders: []\n')
  wb = new Workbench(path.join(dir, 'workbench'))
  g('init', '-q', '-b', 'main')
  const p = createProblem(wb, { question: 'Does the chain argument work?', if_yes: '된다.', if_no: '안 된다.', reader: '대학원생' }, 'user')
  fs.renameSync(path.join(dir, 'workbench/problems', p.id), path.join(dir, P))
  patchProblem(wb, 'chain', { baseHash: hash(), set: { limit: 2 } }, 'user')
  openProblem(wb, 'chain', hash(), 'user')
  addAttempts(wb, 'chain', { attempts: [{ method: '손으로 센다' }, { method: '무작위로 찾는다' }, { method: '극한을 본다' }] }, 'claude')
  commit()
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('바뀐 것 검사: 문제와 시도 나무', () => {
  it('명령 · MCP가 쓰는 길로 한 일은 걸리지 않고, 시도가 가리킨 노트는 그 일의 것으로 본다', () => {
    write('workbench/notes/count/note.yaml', 'title: 세기\n')
    write('workbench/notes/count/note.md', '# 세기\n')
    commit()
    startAttempt(wb, 'chain', 'a', 'claude')
    reportAttempt(wb, 'chain', 'a', { did: '셌다', result: '셋', files: ['workbench/notes/count/note.md'] }, 'claude')
    verdictAttempt(wb, 'chain', 'a', { result: 'dropped', note: '다시 셌다', lesson: '세는 것으로는 부족하다' }, 'codex')
    createProblem(wb, { question: 'Is five enough?', source: '시도 A' }, 'claude')
    patchProblem(wb, 'chain', { baseHash: hash(), set: { literature: [{ ref: 'kempe1879', fact: '사슬을 처음 썼다' }], first_test: '가장 작은 예' } }, 'claude')
    directionReport(wb, 'chain', { neither: '아직 없다' }, 'claude')
    write('workbench/notes/count/note.md', '# 세기\n\n셋.\n')
    expect(found()).toEqual([])
  })

  it('진행 중인 문제가 있는데 시도가 가리키지 않은 노트를 바꾸면 경고', () => {
    write('workbench/notes/count/note.yaml', 'title: 세기\n')
    write('workbench/notes/count/note.md', '# 세기\n')
    commit()
    startAttempt(wb, 'chain', 'a', 'claude')
    write('workbench/notes/count/note.md', '# 세기\n\n셋.\n')
    expect(found()).toEqual([['warning', 'attempt-skipped', 'workbench/notes/count/note.md']])
    expect(said()).toContain('가리키는 시도가 없습니다')
  })

  it('사용자만 정하는 칸(질문 · 메시지 · 독자 · 한도 · 상태)을 바꾸면 오류', () => {
    edit(`${P}/problem.yaml`, '된다.', '언제나 된다.')
    edit(`${P}/problem.yaml`, 'limit: 2', 'limit: 9')
    expect(found()).toEqual([['error', 'problem-human', `${P}/problem.yaml`]])
    expect(said()).toContain('예이면 · 한도')
    g('checkout', '-q', '--', '.')
    edit(`${P}/problem.yaml`, 'state: open', 'state: closed\nclosed:\n  at: 2026-11-11T10:00\n  reason: 끝')
    expect(found()).toEqual([['error', 'problem-human', `${P}/problem.yaml`]])
    expect(said()).toContain('상태 · 종료')
  })

  it('새 문제는 출처가 있는 제안만: 쓰는 중 · 진행으로 만들거나 메시지를 쓰면 오류', () => {
    write('workbench/problems/new-one/problem.yaml', 'format: 1\nquestion: 새 질문인가?\nstate: open\nby: claude\nif_yes: 그렇다.\n')
    write('workbench/problems/bare/problem.yaml', 'format: 1\nquestion: 출처 없는 질문인가?\nstate: proposed\nby: claude\n')
    write('workbench/problems/fine/problem.yaml', 'format: 1\nquestion: 출처 있는 질문인가?\nstate: proposed\nby: claude\nsource: 시도 A\n')
    expect(found()).toEqual([
      ['error', 'problem-work', 'workbench/problems/bare/problem.yaml'],
      ['error', 'problem-human', 'workbench/problems/new-one/problem.yaml'],
      ['error', 'problem-human', 'workbench/problems/new-one/problem.yaml'],
    ])
  })

  it('문제를 지우거나 옮기면 오류', () => {
    fs.rmSync(path.join(dir, P, 'problem.yaml'))
    expect(found().filter(([, c]) => c !== 'move-delete')).toEqual([['error', 'problem-human', `${P}/problem.yaml`]])
  })

  it('방향 보고의 결정을 쓰거나 낸 보고를 고치면 오류', () => {
    directionReport(wb, 'chain', { for_yes: '셋이 맞았다' }, 'claude')
    commit()
    edit(`${P}/problem.yaml`, 'for_yes: 셋이 맞았다', 'for_yes: 넷이 맞았다\n    decision:\n      at: 2026-11-11T10:00\n      verdict: continue\n      limit: 8')
    expect(found()).toEqual([
      ['error', 'problem-human', `${P}/problem.yaml`],
      ['error', 'problem-work', `${P}/problem.yaml`],
    ])
    expect(said()).toContain('결정은 사용자가 앱에서 합니다')
  })

  it('자기 시도 판정, 확인 없는 성립, 폐기 사유 없는 폐기, 판정 기록 없는 성립은 오류', () => {
    startAttempt(wb, 'chain', 'a', 'claude')
    reportAttempt(wb, 'chain', 'a', { did: '셌다', result: '셋', statement: '사슬은 셋이다', side: 'for_yes' }, 'claude')
    commit()
    edit(`${P}/a.yaml`, 'state: reported', 'state: holds\nverdict:\n  at: 2026-11-11T10:00\n  by: claude\n  note: 맞다')
    expect(found()).toEqual([['error', 'problem-verdict', `${P}/a.yaml`], ['error', 'problem-verdict', `${P}/a.yaml`]])
    expect(said()).toMatch(/작업한 쪽\(claude\)이 자기 시도를 판정[\s\S]*교차 검증/)
    edit(`${P}/a.yaml`, 'state: holds', 'state: dropped')
    edit(`${P}/a.yaml`, 'by: claude\n  note', 'by: codex\n  note')
    expect(found()).toEqual([['error', 'problem-verdict', `${P}/a.yaml`]])
    expect(said()).toContain('폐기 사유 한 줄')
    g('checkout', '-q', '--', '.')
    edit(`${P}/a.yaml`, 'state: reported', 'state: holds')
    expect(said()).toContain('판정 기록(verdict: at · by · note) 없이')
    g('checkout', '-q', '--', '.')
    edit(`${P}/a.yaml`, 'state: reported', 'state: holds\nverdict:\n  at: 2026-11-11T10:00\n  by: user\n  note: 맞다\n  check: 다른 크기')
    expect(found()).toEqual([['error', 'problem-human', `${P}/a.yaml`]])
    // 진술 없는 성립, 쪽 없는 진술, 에이전트가 쓴 사용자 승인
    g('checkout', '-q', '--', '.')
    edit(`${P}/a.yaml`, 'statement: 사슬은 셋이다\nside: for_yes\n', '')
    edit(`${P}/a.yaml`, 'state: reported', 'state: holds\nverdict:\n  at: 2026-11-11T10:00\n  by: codex\n  note: 맞다\n  check: 다른 크기')
    expect(found()).toEqual([['error', 'problem-verdict', `${P}/a.yaml`]])
    expect(said()).toContain('진술(statement)이 없는 시도를 성립으로')
    g('checkout', '-q', '--', '.')
    edit(`${P}/a.yaml`, 'side: for_yes\n', 'accepted:\n  at: 2026-11-11T10:00\n  by: user\n')
    expect(found()).toEqual([['error', 'problem-work', `${P}/a.yaml`], ['error', 'problem-human', `${P}/a.yaml`]])
    expect(said()).toMatch(/side: for_yes · for_no · neither[\s\S]*사용자의 승인\(accepted\)/)
  })

  it('시작하지 않은 문제의 시도, 한도를 넘긴 시작, 결정을 기다리는 동안의 시작은 오류', () => {
    write('workbench/problems/draft/problem.yaml', 'format: 1\nquestion: 아직인가?\nstate: draft\nby: user\n')
    write('workbench/problems/draft/a.yaml', 'format: 1\nmethod: 해 본다\nstate: candidate\nby: claude\ncreated: 2026-11-11T10:00\n')
    expect(found()).toEqual([['error', 'problem-work', 'workbench/problems/draft/a.yaml'], ['error', 'problem-human', 'workbench/problems/draft/problem.yaml']])
    fs.rmSync(path.join(dir, 'workbench/problems/draft'), { recursive: true })

    for (const id of ['a', 'b', 'c']) edit(`${P}/${id}.yaml`, 'state: candidate', 'state: active\nworker: claude\nstarted: 2026-11-11T10:00')
    expect(found()).toEqual([['error', 'problem-work', `${P}/a.yaml`]])
    expect(said()).toContain('3개로 한도 2')
    g('checkout', '-q', '--', '.')

    directionReport(wb, 'chain', { neither: '아직 없다' }, 'claude')
    commit()
    edit(`${P}/a.yaml`, 'state: candidate', 'state: active\nworker: claude\nstarted: 2099-01-01T00:00')
    expect(found()).toEqual([['error', 'problem-work', `${P}/a.yaml`]])
    expect(said()).toContain('결정을 기다리는 동안')
  })

  it('세기는 공통 규칙 머리말로 바꾼다', () => {
    edit(`${P}/problem.yaml`, 'limit: 2', 'limit: 9')
    expect(withLang('ko', () => checkChanges(wb, { levels: { 'problem-human': 'warning' } }))!.diagnostics.map((d) => d.level)).toEqual(['warning'])
  })

  it('읽지 못한 문제 · 시도 파일은 형식 검사의 오류', () => {
    write(`${P}/Bad.yaml`, 'method: 이름이 틀렸다\n')
    write(`${P}/d.yaml`, 'state: candidate\n')
    const d = withLang('ko', () => checkWorkbench(wb)).diagnostics.filter((x) => x.file.startsWith(P))
    expect(d.map((x) => [x.level, x.file])).toEqual([['error', `${P}/Bad.yaml`], ['error', `${P}/d.yaml`]])
  })
})
