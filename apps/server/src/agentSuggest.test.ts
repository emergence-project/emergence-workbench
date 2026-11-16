import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { holdHumanEdits, humanBlocks, takeInto } from './agentSuggest.js'

let dir: string
const file = () => path.join(dir, 'workbench/notes/a/note.md')
const save = (text: string, who: [string, string], body?: string) => {
  fs.mkdirSync(path.dirname(file()), { recursive: true })
  fs.writeFileSync(file(), text)
  const g = (...a: string[]) => execFileSync('git', ['-c', `user.name=${who[0]}`, '-c', `user.email=${who[1]}`, '-c', 'commit.gpgsign=false', ...a], { cwd: dir })
  g('add', '-A'); g('commit', '-qm', 'x', ...(body ? ['-m', body] : []))
}
const ME: [string, string] = ['박성민', 'me@example.com']
const CLAUDE: [string, string] = ['Claude', 'claude@agents.emergence-workbench']

beforeEach(() => { dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-suggest-')); execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir }) })
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('내 문단은 제안으로 (11/16 시안 2절 ②)', () => {
  it('git blame으로 사람이 마지막에 쓴 문단을 안다 (Co-Authored-By 에이전트는 에이전트, 커밋 안 한 줄은 사람)', async () => {
    save('# 제목\n\n내 문단 하나.\n\n내 문단 둘.\n', ME)
    save('# 제목\n\n내 문단 하나.\n\n내 문단 둘.\n\n에이전트 문단.\n', CLAUDE)
    save('# 제목\n\n내 문단 하나.\n\n받은 제안 문단.\n\n에이전트 문단.\n', ME, 'Co-Authored-By: Claude <claude@agents.emergence-workbench>')
    expect([...(await humanBlocks(file()))!].sort()).toEqual(['# 제목', '내 문단 하나.'])
    fs.appendFileSync(file(), '\n아직 안 올린 글.\n')
    expect((await humanBlocks(file()))!.has('아직 안 올린 글.')).toBe(true)
  })

  it('git 밖이면 null (지금처럼 바로 고친다)', async () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-nogit-'))
    fs.writeFileSync(path.join(out, 'n.md'), 'a\n')
    expect(await humanBlocks(path.join(out, 'n.md'))).toBeNull()
    fs.rmSync(out, { recursive: true, force: true })
  })

  it('사람 문단을 바꾸는 곳은 빼고 제안으로, 에이전트 문단 · 새 문단은 그대로 쓴다', () => {
    const text = '## Setup\n\n내 문단.\n\n에이전트 문단.\n'
    const next = '## Setup\n\n내 문단을 고침.\n\n에이전트 문단 고침.\n\n새 문단.\n'
    const r = holdHumanEdits(text, next, new Set(['## Setup', '내 문단.']))
    expect(r.applied).toBe('## Setup\n\n내 문단.\n\n에이전트 문단 고침.\n\n새 문단.\n')
    expect(r.held).toEqual([{ before: '내 문단.', after: '내 문단을 고침.', section: 'Setup' }])
  })

  it('받기는 지금 글에서 한 곳을 찾아 바꾸고, 못 찾으면 null. 지우는 제안은 뒤 빈 줄도', () => {
    expect(takeInto('a\n\n내 문단.\n\nb\n', { before: '내 문단.', after: '고친 문단.' })).toBe('a\n\n고친 문단.\n\nb\n')
    expect(takeInto('a\n\n내 문단.\n\nb\n', { before: '내 문단.', after: '' })).toBe('a\n\nb\n')
    expect(takeInto('a\n\n다른 글.\n', { before: '내 문단.', after: 'x' })).toBeNull()
  })
})
