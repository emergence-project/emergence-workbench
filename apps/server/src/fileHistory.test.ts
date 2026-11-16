import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { coAuthors, fileHistory, fileVersions, isAgent } from './fileHistory.js'

let dir: string
const g = (name: string, email: string, ...args: string[]) => execFileSync('git', ['-c', `user.name=${name}`, '-c', `user.email=${email}`, '-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8' })
const save = (file: string, text: string, msg: string, who: [string, string] = ['박성민', 'me@example.com'], body?: string) => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
  fs.writeFileSync(path.join(dir, file), text)
  g(...who, 'add', '-A')
  g(...who, 'commit', '-qm', msg, ...(body ? ['-m', body] : []))
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-history-'))
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('노트 이력 (11/16 시안 N7ik 2절 ③′)', () => {
  it('에이전트 이름 · 메일과 Co-Authored-By를 읽는다', () => {
    expect(isAgent('Claude')).toBe(true)
    expect(isAgent('누구', 'x@agents.emergence-workbench')).toBe(true)
    expect(isAgent('박성민', 'me@example.com')).toBe(false)
    expect(coAuthors('본문\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n')).toEqual([{ name: 'Claude', email: 'noreply@anthropic.com' }])
  })

  it('그 파일을 고친 커밋만, 최근이 위, 고친 이와 이름 바꾼 이력까지', async () => {
    save('workbench/notes/a/note.md', '하나\n', '처음 씀')
    save('workbench/other.md', '딴 파일\n', '다른 파일')
    save('workbench/notes/a/note.md', '하나 둘\n', 'Claude: 고침', ['Claude', 'claude@agents.emergence-workbench'])
    g('박성민', 'me@example.com', 'mv', 'workbench/notes/a/note.md', 'workbench/notes/a/b.md')
    g('박성민', 'me@example.com', 'commit', '-qm', '옮김')
    save('workbench/notes/a/b.md', '하나 둘 셋\n', '셋 더함', undefined, 'Co-Authored-By: Codex <codex@agents.emergence-workbench>')
    const h = await fileHistory(dir, 'workbench/notes/a/b.md')
    expect(h.commits.map((c) => c.subject)).toEqual(['셋 더함', '옮김', 'Claude: 고침', '처음 씀'])
    expect(h.commits[0]!.authors).toEqual([{ name: '박성민', agent: false }, { name: 'Codex', agent: true }])
    expect(h.commits[2]!.authors).toEqual([{ name: 'Claude', agent: true }])
    expect(h.commits[3]!.path).toBe('workbench/notes/a/note.md')

    const one = await fileVersions(dir, 'workbench/notes/a/b.md', h.commits[2]!.hash)
    expect(one).toEqual({ before: '하나\n', after: '하나 둘\n', found: true })
    const all = await fileVersions(dir, 'workbench/notes/a/b.md', h.commits[0]!.short, h.commits[3]!.hash)
    expect(all).toEqual({ before: '', after: '하나 둘 셋\n', found: true })
    expect((await fileVersions(dir, 'workbench/notes/a/b.md', 'abcdef0')).found).toBe(false)
  })

  it('git이 아니면 빈 목록', async () => {
    fs.rmSync(path.join(dir, '.git'), { recursive: true })
    expect(await fileHistory(dir, 'x.md')).toEqual({ commits: [] })
  })
})
