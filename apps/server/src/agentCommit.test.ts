import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { agentAuthor, cleanBeforeAgent, commitAgentWrite } from './agentCommit.js'

let tmp: string
beforeAll(() => { tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-agentcommit-')) })
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

const g = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
const write = (dir: string, file: string, text: string) => { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), text) }

function setup(name: string) {
  const remote = path.join(tmp, `${name}.git`)
  const mac = path.join(tmp, `${name}-mac`)
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
  execFileSync('git', ['clone', '-q', remote, mac], { stdio: 'ignore' })
  g(mac, 'config', 'user.name', 'Researcher'); g(mac, 'config', 'user.email', 'me@example.com')
  write(mac, 'workbench/topics/t/n/note.md', '# Note\n\nMine.\n'); write(mac, 'workbench/topics/t/m/note.md', '# Other\n')
  g(mac, 'add', '.'); g(mac, 'commit', '-qm', 'init'); g(mac, 'push', '-q', '-u', 'origin', 'main')
  return { remote, mac }
}

describe('에이전트 저장은 에이전트 이름으로 커밋 (11/8 15:16 ①)', () => {
  it('에이전트 이름을 git 작성자로', () => {
    expect(agentAuthor('claude')).toEqual({ name: 'Claude', email: 'claude@agents.emergence-workbench' })
    expect(agentAuthor('codex').name).toBe('Codex')
    expect(agentAuthor(undefined).name).toBe('Agent')
  })

  it('깨끗한 파일을 고치면 그 파일만 에이전트 이름으로 커밋해 올리고, 사람의 다른 고침은 그대로 둔다', async () => {
    const { remote, mac } = setup('clean')
    const note = path.join(mac, 'workbench/topics/t/n/note.md')
    write(mac, 'workbench/topics/t/m/note.md', '# Other\n\nhuman draft\n') // 다른 노트: 사람이 고치는 중
    const at = await cleanBeforeAgent(note)
    expect(at).toEqual({ top: fs.realpathSync(mac), rel: 'workbench/topics/t/n/note.md' })
    write(mac, 'workbench/topics/t/n/note.md', '# Note\n\nMine.\n\nAgent paragraph.\n')
    const r = await commitAgentWrite(at!, 'claude', 'add a paragraph')
    expect(r?.pushed).toBe(true)
    expect(g(remote, 'log', '-1', '--format=%an <%ae>|%s', 'main')).toBe('Claude <claude@agents.emergence-workbench>|Claude: add a paragraph')
    expect(g(remote, 'show', '--name-only', '--format=', 'main')).toBe('workbench/topics/t/n/note.md')
    expect(fs.readFileSync(path.join(mac, 'workbench/topics/t/m/note.md'), 'utf8')).toContain('human draft')
    expect(g(mac, 'status', '--porcelain')).toBe('M workbench/topics/t/m/note.md')
    // blame: 사람 줄과 에이전트 줄이 갈린다
    const blame = g(mac, 'blame', '--line-porcelain', 'workbench/topics/t/n/note.md').split('\n').filter((l) => l.startsWith('author ')).map((l) => l.slice(7))
    expect(blame).toEqual(['Researcher', 'Researcher', 'Researcher', 'Claude', 'Claude'])
  })

  it('사람이 커밋하지 않은 고침이 있는 파일은 섞이므로 커밋하지 않는다', async () => {
    const { mac } = setup('dirty')
    write(mac, 'workbench/topics/t/n/note.md', '# Note\n\nMine, edited.\n')
    expect(await cleanBeforeAgent(path.join(mac, 'workbench/topics/t/n/note.md'))).toBeNull()
    write(mac, 'workbench/topics/t/n/new.md', 'untracked\n')
    expect(await cleanBeforeAgent(path.join(mac, 'workbench/topics/t/n/new.md'))).toBeNull()
    expect(await cleanBeforeAgent('')).toBeNull()
  })
})
