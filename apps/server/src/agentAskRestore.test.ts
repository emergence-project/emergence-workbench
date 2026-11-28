import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { matchOf, nothingChanged, sinceOf, askBase } from './agentAskRestore.js'
import { AgentChats, type RunEvent, type RunInput } from './agentChats.js'

/** 커밋 하나가 있는 작은 git 저장소 */
function repo(): string {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-ask-repo-'))
  const g = (...a: string[]) => execFileSync('git', a, { cwd: r, stdio: 'ignore' })
  g('init', '-q'); g('config', 'user.email', 'a@b.c'); g('config', 'user.name', 't'); g('config', 'commit.gpgsign', 'false')
  fs.writeFileSync(path.join(r, 'a.txt'), 'one\n')
  g('add', '.'); g('commit', '-qm', 'first')
  return r
}

/** 지시마다: 'bash'로 시작하거나 앱이 다시 켜졌다는 글이면 명령 하나를 묻는다 (같은 명령 · 다른 명령) */
const runs: RunInput[] = []
function runner(cmdAfter = 'python run.py') {
  return async function* (input: RunInput): AsyncIterable<RunEvent> {
    runs.push(input)
    yield { type: 'session', id: 's1' }
    if (input.prompt.startsWith('bash') || input.prompt.includes('restarted')) {
      const d = await input.canUseTool('Bash', { command: input.prompt.startsWith('bash') ? 'python run.py' : cmdAfter })
      if (input.signal.aborted) return
      yield { type: 'text', text: d.allow ? 'ran' : 'declined' }
    }
    yield { type: 'result', ok: true }
  }
}

function open(dir: string, r: string, cmdAfter?: string) {
  return new AgentChats({ dir, runner: runner(cmdAfter), limit: 2, project: () => ({ repo: r, title: 'p' }), readable: () => [], extraDirs: () => [], notify: () => {} })
}

/** 허락 카드를 띄운 채 앱을 닫았다가 다시 연다 */
async function restartWithCard(cmdAfter?: string, change?: (r: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-ask-chats-'))
  const r = repo()
  const first = open(dir, r)
  const c = first.create({ rid: 'p', text: 'bash please' })
  await vi.waitFor(() => expect(first.get(c.id).state).toBe('waiting'))
  change?.(r)
  first.stopAll()
  await vi.waitFor(() => expect(first.get(c.id).state).not.toBe('waiting'))
  await new Promise((ok) => setTimeout(ok, 50))
  const stored = JSON.parse(fs.readFileSync(path.join(dir, `${c.id}.json`), 'utf8'))
  const again = open(dir, r, cmdAfter)
  return { dir, r, id: c.id, stored, chats: again }
}

/** 닫고 마지막 쓰기가 끝난 뒤 폴더를 지운다 */
async function shut(chats: AgentChats, dir: string, r: string) {
  chats.stopAll()
  await vi.waitFor(() => expect(chats.work().chats).toEqual([]))
  await new Promise((ok) => setTimeout(ok, 50))
  fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(r, { recursive: true, force: true })
}

describe('앱이 다시 켜져도 남는 허락 카드 (11/28)', () => {
  it('지문은 입력의 키 순서와 상관없고, 내용이 다르면 다르다', () => {
    expect(matchOf('Bash', { a: 1, b: [2, { c: 3, d: 4 }] })).toBe(matchOf('Bash', { b: [2, { d: 4, c: 3 }], a: 1 }))
    expect(matchOf('Bash', { command: 'ls' })).not.toBe(matchOf('Bash', { command: 'ls -a' }))
    expect(matchOf('Bash', { command: 'ls' })).not.toBe(matchOf('Read', { command: 'ls' }))
  })

  it('물은 뒤 바뀐 파일 · 커밋을 센다. 상태가 없으면 셀 수 없다고 한다', async () => {
    const r = repo()
    const base = await askBase(r)
    expect(nothingChanged(await sinceOf(r, base))).toBe(true)
    fs.writeFileSync(path.join(r, 'a.txt'), 'one\ntwo\n')
    expect((await sinceOf(r, base)).files).toEqual([{ file: 'a.txt', added: 1, removed: 0 }])
    execFileSync('git', ['commit', '-qam', 'second'], { cwd: r })
    const s = await sinceOf(r, base)
    expect(s).toMatchObject({ files: [], commits: 1 })
    expect((await sinceOf(r, undefined)).error).toBeTruthy()
    // 줄 수가 같은 고침(+1 −1)과 추적하지 않는 새 파일도 바뀐 것으로 센다
    fs.writeFileSync(path.join(r, 'a.txt'), 'uno\ntwo\n')
    const base2 = await askBase(r)
    fs.writeFileSync(path.join(r, 'a.txt'), 'one\ntwo\n')
    fs.writeFileSync(path.join(r, 'new.txt'), 'x\ny\n')
    expect((await sinceOf(r, base2)).files).toEqual([{ file: 'a.txt', added: 0, removed: 0 }, { file: 'new.txt', added: 2, removed: 0 }])
    fs.rmSync(r, { recursive: true, force: true })
  })

  it('닫을 때 카드를 거절로 닫지 않고, 다시 켜면 그대로 띄운다. 허락하면 같은 세션에서 같은 호출 하나만 묻지 않고 통과한다', async () => {
    const { dir, r, id, stored, chats } = await restartWithCard()
    const ask = stored.items.find((i: { kind: string }) => i.kind === 'ask')
    expect(ask.answer).toBeUndefined()
    expect(Object.keys(stored.askMeta)).toEqual([ask.id])
    const c = chats.get(id)
    expect(c.state).toBe('stopped')
    const card = c.items.find((i) => i.kind === 'ask')!
    expect(card).toMatchObject({ restored: { at: expect.any(String) } })
    await vi.waitFor(() => expect(chats.get(id).items.find((i) => i.kind === 'ask')).toMatchObject({ since: { files: [], commits: 0, main: 0 } }))
    // 남은 카드가 있는 멈춘 대화는 목록에서 허락 기다림, 보관하면 아니다
    expect(chats.list().find((x) => x.id === id)?.wait).toBe('ask')
    chats.archive(id, true)
    expect(chats.list().find((x) => x.id === id)?.wait).toBeUndefined()
    chats.archive(id, false)
    const before = runs.length
    chats.answer(id, ask.id, 'always') // 바뀐 것이 없으면 「늘」도 받는다
    await vi.waitFor(() => expect(chats.get(id).state).toBe('idle'))
    const resumed = runs.slice(before)
    expect(resumed).toHaveLength(1)
    expect(resumed[0]!.sessionId).toBe('s1')
    expect(resumed[0]!.prompt).toContain('Nothing changed')
    const after = chats.get(id)
    expect(after.items.filter((i) => i.kind === 'ask')).toHaveLength(1) // 다시 묻지 않음
    expect(after.items.filter((i) => i.kind === 'text').map((i) => (i as { text: string }).text)).toEqual(['ran'])
    expect(after.items.find((i) => i.kind === 'ask')).toMatchObject({ answer: 'always' })
    expect(JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8')).preAllowed).toBeUndefined()
    await shut(chats, dir, r)
  })

  it('그 사이 바뀐 것이 있으면 「늘」은 한 번으로 받고 바뀐 것을 에이전트에게 알린다. 다른 호출이면 새 카드로 다시 묻는다', async () => {
    const { dir, r, id, stored, chats } = await restartWithCard('python other.py', (repoDir) => fs.writeFileSync(path.join(repoDir, 'a.txt'), 'changed\n'))
    const ask = stored.items.find((i: { kind: string }) => i.kind === 'ask')
    await vi.waitFor(() => expect(chats.get(id).items.find((i) => i.kind === 'ask')).toMatchObject({ since: { files: [{ file: 'a.txt' }] } }))
    const before = runs.length
    chats.answer(id, ask.id, 'always')
    await vi.waitFor(() => expect(chats.get(id).state).toBe('waiting'))
    expect(runs.slice(before)[0]!.prompt).toContain('file a.txt now differs')
    const c = chats.get(id)
    expect(c.items.find((i) => i.kind === 'ask' && i.id === ask.id)).toMatchObject({ answer: 'allow' })
    expect(c.items.filter((i) => i.kind === 'ask')).toHaveLength(2) // 다른 명령은 다시 묻는다
    await shut(chats, dir, r)
  })

  it('거절하면 같은 세션에 거절과 한 말을 알리고, 이미 다시 일하는 대화의 옛 카드에는 답하지 않는다', async () => {
    const { dir, r, id, stored, chats } = await restartWithCard()
    const ask = stored.items.find((i: { kind: string }) => i.kind === 'ask')
    const before = runs.length
    chats.answer(id, ask.id, 'deny', { note: '다른 방법으로' })
    expect(() => chats.answer(id, ask.id, 'allow')).toThrow()
    await vi.waitFor(() => expect(chats.get(id).state).toBe('waiting')) // 이 가짜 에이전트는 다시 묻는다
    expect(runs.slice(before)[0]!.prompt).toContain('The user declined and said: 다른 방법으로')
    await shut(chats, dir, r)
  })

  it('다시 시작이 기다릴 대화: 차례가 도는 대화와 뒤에서 계산이 도는 대화만 센다 (허락을 기다리는 대화는 빼고)', async () => {
    const { dir, r, chats } = await restartWithCard()
    expect(chats.restartHolds()).toEqual({ running: 0, background: 0 })
    const c = chats.create({ rid: 'p', text: 'bash please' })
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('waiting'))
    expect(chats.restartHolds()).toEqual({ running: 0, background: 0 })
    await shut(chats, dir, r)
  })
})
