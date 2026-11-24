// 중앙을 저절로 깨우기 (11/18): 하위 대화가 끝나거나 · 허락을 기다리거나 · CI가 실패하거나 · PR이 합쳐지면 앱이 중앙을 깨우고,
// 중앙은 크리티컬하지 않은 허락에 스스로 답한다 (사용자 "허락이 크리티컬한 것이 아니면 자동이면 좋을 것 같아")
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AUTO_SEND_MAX, CENTRAL_BRIEF, CRITICAL, CentralChats, criticalOf } from './agentCentral.js'
import { judge, type AgentRunner, type PolicyCtx, type RunEvent, type RunInput } from './agentChats.js'
import { sampleAppWork, type AppWork } from './appWorktree.js'
import type { Mem } from './appMemory.js'

const GB = 1024 ** 3

const ctx: PolicyCtx = { rid: '_central', write: 'read', mode: 'edit', planOk: false, scope: { kind: 'all' }, repo: '/w/app', readable: [], claimedBy: () => undefined }

describe('중앙을 저절로 깨우기', () => {
  const dirs: string[] = []
  // 남은 메모리 (시험마다 넣는다. 기본은 넉넉하게)
  let mem: Mem = { free: 0.9, total: 32 * GB }
  const seen: RunInput[] = []
  let release: (() => void) | undefined
  // [web] = 웹 읽기 허락을 기다림, [odd] = 모르는 도구 허락을 기다림(자동 모드도 묻는다), [rm] = 지우기 허락을 기다림, [hold] = release까지 일하는 중
  const fake: AgentRunner = async function* (input): AsyncIterable<RunEvent> {
    seen.push(input)
    yield { type: 'session', id: `s${seen.length}` }
    if (input.prompt.includes('[web]')) {
      const d = await input.canUseTool('WebFetch', { url: 'https://example.com/doc', prompt: '읽기' })
      yield { type: 'text', text: d.allow ? 'ran' : 'declined' }
    } else if (input.prompt.includes('[odd]')) {
      const d = await input.canUseTool('Mystery', { what: 'x' })
      yield { type: 'text', text: d.allow ? 'ran' : 'declined' }
    } else if (input.prompt.includes('[rm]')) {
      const d = await input.canUseTool('Bash', { command: 'rm out.txt' })
      yield { type: 'text', text: d.allow ? 'removed' : 'kept' }
    } else if (input.prompt.startsWith('[crash]')) {
      yield { type: 'tool', tool: 'Read', input: { file_path: 'notes/a.md' } }
      throw new Error('Claude Code process exited with code 1. stderr: boom')
    } else {
      if (input.prompt.includes('[hold]')) await new Promise<void>((r) => { release = r })
      if (input.prompt.includes('[report]')) yield { type: 'text', text: `고쳤습니다.\n\n## 보고\n- 바꾼 것: 2절 문장 다듬기\n- 위치: notes/2절\n- 판단: 없음\n- 남은 일: 편집 검토에서 확인 ${'가'.repeat(400)}` }
      else yield { type: 'text', text: `받음: ${input.prompt.split('\n').at(-1)}` }
    }
    yield { type: 'result', ok: true }
  }
  const make = async (wakeMs: number, app: AppWork = sampleAppWork(path.join(os.tmpdir(), 'rw-wake-wt'))) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-wake-'))
    dirs.push(dir)
    const chats = new CentralChats({ dir, runner: fake, limit: 5, project: (rid) => ({ repo: dir, title: rid }), readable: () => [], extraDirs: () => [], notify: () => {}, app })
    chats.wakeMs = wakeMs
    chats.memory = async () => mem
    const c = chats.talk('시작')
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    return { chats, c }
  }
  const centralPrompts = () => seen.filter((s) => s.central).map((s) => s.prompt)
  afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); seen.length = 0; release = undefined })

  it('중앙은 chat_answer를 쓸 수 있다', () => {
    expect(judge(ctx, 'mcp__workbench__chat_answer', {}).kind).toBe('allow')
  })

  it('하위 대화의 차례가 끝나면 중앙을 깨우고, 화면에는 「자동」 표시가 붙은 한 줄만 보인다', async () => {
    const { chats, c } = await make(5)
    const kid = await chats.openKid({ role: 'project', project: 'chiral', title: '2절', task: '다듬어' })
    await vi.waitFor(() => expect(centralPrompts()).toHaveLength(2))
    const p = centralPrompts()[1]!
    expect(p).toContain('[Automatic wake-up from the app, not written by the user.')
    expect(p).toContain(`- ${kid.id} · chiral · "2절"`)
    expect(p).toContain('last text (no report section): 받음: 다듬어')
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    expect(chats.get(c.id).items.find((i) => i.kind === 'user' && i.auto)).toMatchObject({ text: expect.stringContaining('「2절」 차례 끝남') })
    chats.stopAll()
  })

  it('하위 대화가 길어 앞 줄을 잘라 낸 뒤에도(400줄) 차례가 끝날 때마다 중앙을 깨운다', async () => {
    const { chats, c } = await make(5)
    const kid = await chats.openKid({ role: 'project', project: 'chiral', title: '긴 일', task: '시작' })
    await vi.waitFor(() => expect(centralPrompts()).toHaveLength(2))
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    chats.stopAll()
    // 긴 대화를 만든다: 대화 파일에 줄을 채워 다시 읽는다 (앱이 다시 켜진 것처럼)
    const dir = dirs.at(-1)!, file = path.join(dir, `${kid.id}.json`)
    const saved: { items: unknown[] } = JSON.parse(fs.readFileSync(file, 'utf8'))
    saved.items = [...Array.from({ length: 420 }, () => ({ kind: 'text', at: '2026-11-20T00:00:00.000Z', text: '채움', sub: true })), ...saved.items]
    fs.writeFileSync(file, JSON.stringify(saved))
    const again = new CentralChats({ dir, runner: fake, limit: 5, project: (rid) => ({ repo: dir, title: rid }), readable: () => [], extraDirs: () => [], notify: () => {} })
    again.wakeMs = 5
    for (const [n, text] of [[3, '하나 더'], [4, '또 하나']] as const) {
      again.send(kid.id, { text })
      await vi.waitFor(() => expect(centralPrompts()).toHaveLength(n))
      await vi.waitFor(() => expect(again.get(c.id).state).toBe('idle'))
      expect(again.get(kid.id).items).toHaveLength(400)
    }
    again.stopAll()
  })

  it('비정상 종료(11/20): 하위 대화든 아니든 오류 · 하던 일 · 이력을 중앙에게 알리고, 이력은 대화 기록에 남는다', async () => {
    const { chats, c } = await make(5)
    const kid = await chats.openKid({ role: 'project', project: 'chiral', title: '2절', task: '[crash] 다듬어' })
    await vi.waitFor(() => expect(centralPrompts()).toHaveLength(2))
    let p = centralPrompts()[1]!
    expect(p).toContain(`crashed: the agent process ended abnormally (the user did not stop it). Open it: #/agent/${kid.id}`)
    expect(p).toContain('error: Claude Code process exited with code 1. stderr: boom')
    expect(p).toMatch(/last instruction: .*\[crash\] 다듬어/)
    expect(p).toContain('last tool calls: Read')
    expect(p).toContain('history: first crash in this conversation')
    expect(p).not.toContain('ended its turn')
    expect(chats.centralState().kids[0]!.crashes).toBe(1)
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    chats.send(kid.id, { text: '[crash] 다시' })
    await vi.waitFor(() => expect(centralPrompts()).toHaveLength(3))
    p = centralPrompts()[2]!
    expect(p).toMatch(/history: crashed 1 time before in this conversation \(\d{4}-/)
    expect(p).toContain('It crashed again')
    expect(chats.get(kid.id).items.filter((i) => i.kind === 'error' && i.crash)).toHaveLength(2)
    expect(chats.get(c.id).items.some((i) => i.kind === 'user' && i.auto && i.text.includes('「2절」 비정상 종료 (2번째)'))).toBe(true)
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    // 하위 대화가 아닌 대화: 작업 현황의 내 차례 줄과 알림
    const other = chats.create({ rid: 'chiral', text: '[crash] 혼자' })
    await vi.waitFor(() => expect(centralPrompts()).toHaveLength(4))
    expect(centralPrompts()[3]).toContain('not your sub-conversation')
    expect(chats.centralState().crashed).toEqual([expect.objectContaining({ id: other.id, count: 1 })])
    chats.stopAll()
  })

  it('대화가 중재를 청하면(central_help, 11/19) 그 대화가 일하는 중이어도 중앙을 바로 깨운다', async () => {
    const { chats, c } = await make(5)
    const kid = await chats.openKid({ role: 'project', project: 'chiral', title: '2절', task: '[hold] 다듬어' })
    await vi.waitFor(() => expect(chats.get(kid.id).state).toBe('running'))
    expect(chats.help(kid.id, '다른 프로젝트의 3절도 고쳐야 함')).toBe(c.id)
    await vi.waitFor(() => expect(centralPrompts()).toHaveLength(2))
    const p = centralPrompts()[1]!
    expect(p).toContain('asks you to mediate')
    expect(p).toContain('다른 프로젝트의 3절도 고쳐야 함')
    expect(p).not.toContain('ended its turn')
    expect(() => chats.help(c.id, '나')).toThrow()
    release!()
    await vi.waitFor(() => expect(chats.get(kid.id).state).toBe('idle'))
    chats.stopAll()
  })

  it('중앙이 일하는 중이면 그 차례가 끝난 뒤에 깨운다', async () => {
    const { chats, c } = await make(5)
    const kid = await chats.openKid({ role: 'project', project: 'chiral', title: '2절', task: '다듬어' })
    chats.talk('[hold] 기다려')
    await vi.waitFor(() => expect(chats.get(kid.id).state).toBe('idle'))
    await new Promise((r) => setTimeout(r, 30))
    expect(chats.flushWakes()).toBe(false)
    expect(centralPrompts()).toHaveLength(2)
    release!()
    await vi.waitFor(() => expect(centralPrompts()).toHaveLength(3))
    expect(centralPrompts()[2]).toContain('[Automatic wake-up')
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    chats.stopAll()
  })

  it('보내기 전에 사용자가 말하면 깨우기를 그 말 앞에 붙여 한 번에 보낸다', async () => {
    const { chats, c } = await make(60_000)
    await chats.openKid({ role: 'project', project: 'chiral', title: '2절', task: '다듬어' })
    await vi.waitFor(() => expect(chats.centralState().kids[0]!.state).toBe('idle'))
    chats.talk('어때?')
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    const p = centralPrompts().at(-1)!
    expect(p).toContain('[Automatic wake-up')
    expect(p.endsWith('[The user writes:]\n어때?')).toBe(true)
    expect(chats.flushWakes()).toBe(false) // 이미 보냄
    expect(chats.get(c.id).items.filter((i) => i.kind === 'user' && i.auto)).toEqual([])
    chats.stopAll()
  })

  it('크리티컬하지 않은 허락은 중앙이 답하고(카드에 표시), 크리티컬한 것은 막아 사용자에게 남긴다', async () => {
    const { chats } = await make(60_000)
    const run = await chats.openKid({ role: 'app', title: '돌리기', task: '[odd]' })
    const del = await chats.openKid({ role: 'project', project: 'chiral', title: '지우기', task: '[rm]' })
    await vi.waitFor(() => expect(chats.centralState().kids.filter((k) => k.state === 'waiting')).toHaveLength(2))
    const kids = chats.centralState().kids
    const runAsk = kids.find((k) => k.id === run.id)!.ask!
    const delAsk = kids.find((k) => k.id === del.id)!.ask!
    expect(runAsk.critical).toBeUndefined()
    expect(delAsk.critical).toBe(CRITICAL.find((x) => x.key === 'delete')!.ko)
    expect(() => chats.answerKid({ id: del.id, ask: delAsk.id, answer: 'allow' })).toThrow(/크리티컬|Critical/)
    chats.answerKid({ id: run.id, ask: runAsk.id, answer: 'allow' })
    await vi.waitFor(() => expect(chats.get(run.id).state).toBe('idle'))
    expect(chats.get(run.id).items.find((i) => i.kind === 'ask')).toMatchObject({ answer: 'allow', by: 'central' })
    expect(chats.get(chats.get(run.id).parent!).items).toContainEqual(expect.objectContaining({ kind: 'text', text: expect.stringMatching(/자동: 「돌리기」의 .* → 허락/) }))
    expect(chats.get(run.id).items).toContainEqual(expect.objectContaining({ kind: 'text', text: 'ran' }))
    expect(() => chats.answerKid({ id: run.id, ask: runAsk.id, answer: 'allow' })).toThrow(/이미|already/)
    chats.stopAll()
  })

  it('피드백 대화(중앙이 열지 않음)의 허락 기다림도 중앙을 깨우고 중앙이 답한다. 다른 대화는 거절 (11/23 "앞으로 허락 묻지 말고 너가 해")', async () => {
    const { chats, c } = await make(5)
    const fb = chats.create({ rid: '_app', text: '[web]', title: '피드백', mode: 'edit' }, { feedback: '2026-11-23#1' })
    await vi.waitFor(() => expect(chats.get(fb.id).state).toBe('waiting'))
    await vi.waitFor(() => expect(centralPrompts()).toHaveLength(2))
    const ask = chats.get(fb.id).items.find((i) => i.kind === 'ask')!
    expect(centralPrompts()[1]).toContain(`waits for permission: ask ${ask.kind === 'ask' && ask.id}`)
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    chats.answerKid({ id: fb.id, ask: ask.kind === 'ask' ? ask.id : '', answer: 'allow' })
    await vi.waitFor(() => expect(chats.get(fb.id).items).toContainEqual(expect.objectContaining({ kind: 'text', text: 'ran' })))
    expect(chats.get(c.id).items).toContainEqual(expect.objectContaining({ kind: 'text', text: expect.stringMatching(/자동: .* → 허락/) }))
    const mine = chats.create({ rid: '_app', text: '[web]', mode: 'edit' })
    await vi.waitFor(() => expect(chats.get(mine.id).state).toBe('waiting'))
    const a2 = chats.get(mine.id).items.find((i) => i.kind === 'ask')!
    expect(() => chats.answerKid({ id: mine.id, ask: a2.kind === 'ask' ? a2.id : '', answer: 'allow' })).toThrow(/피드백 대화가 아닙니다|feedback conversation/)
    chats.stopAll()
  })

  it(`저절로 깨어난 중앙은 사용자가 말하기 전까지 한 하위 대화에 ${AUTO_SEND_MAX}번까지만 보낸다`, async () => {
    const { chats, c } = await make(60_000)
    const kid = await chats.openKid({ role: 'project', project: 'chiral', title: '2절', task: '다듬어' })
    await vi.waitFor(() => expect(chats.get(kid.id).state).toBe('idle'))
    expect(chats.flushWakes()).toBe(true)
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    for (let i = 0; i < AUTO_SEND_MAX; i++) {
      chats.sendKid(kid.id, `다시 ${i}`)
      await vi.waitFor(() => expect(chats.get(kid.id).state).toBe('idle'))
    }
    expect(() => chats.sendKid(kid.id, '또')).toThrow(new RegExp(`${AUTO_SEND_MAX}`))
    chats.talk('계속해')
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    expect(() => chats.sendKid(kid.id, '이제 됨')).not.toThrow()
    chats.stopAll()
  })

  it('남은 메모리가 모자라면 기다리게 두었다가, 메모리가 풀리면 1분마다 확인할 때 열고 중앙 대화에 적는다', async () => {
    mem = { free: 0.1, total: 32 * GB }
    const { chats, c } = await make(60_000)
    // 메모리가 모자라도 최소 하나는 연다
    expect((await chats.openOrHold({ role: 'app', title: '고침 0', task: '[hold] 고쳐' })).kid).toBeDefined()
    await expect(chats.openKid({ role: 'app', title: '바로', task: '고쳐' })).rejects.toThrow(/chat_send|이어 보내/)
    expect(await chats.openOrHold({ role: 'app', title: '하나 더', task: '고쳐' })).toEqual({ held: 1 })
    expect(chats.get(c.id).items.at(-1)).toMatchObject({ kind: 'text', text: expect.stringMatching(/「하나 더」을 기다리게.*앱 고치기 1개 일함 · 남은 메모리 10%\(3\.2GB\)/) })
    await chats.tickCentral()
    expect(chats.centralState().kids.map((k) => k.title)).not.toContain('하나 더')
    mem = { free: 0.6, total: 32 * GB }
    await chats.tickCentral()
    expect(chats.centralState().kids.map((k) => k.title)).toContain('하나 더')
    expect(chats.get(c.id).items.some((i) => i.kind === 'text' && i.text.includes('기다리던 「하나 더」을 열었습니다'))).toBe(true)
    release!()
    chats.stopAll()
    mem = { free: 0.9, total: 32 * GB }
  })

  it('메모리가 모자라도 앱 고치기가 모두 끝나면 기다리던 일을 연다', async () => {
    mem = { free: 0.1, total: 32 * GB }
    const { chats } = await make(60_000)
    await chats.openOrHold({ role: 'app', title: '고침 0', task: '[hold] 고쳐' })
    expect(await chats.openOrHold({ role: 'app', title: '하나 더', task: '고쳐' })).toEqual({ held: 1 })
    release!()
    await vi.waitFor(() => expect(chats.centralState().kids.map((k) => k.title)).toContain('하나 더'))
    chats.stopAll()
    mem = { free: 0.9, total: 32 * GB }
  })

  it('1분마다 PR의 CI 실패와 합쳐짐을 찾아 깨운다', async () => {
    let merged = false
    const base = sampleAppWork(path.join(os.tmpdir(), 'rw-wake-wt'))
    const app: AppWork = {
      ...base,
      async checks() { return { pr: 234, checks: [{ name: 'check', state: 'FAILURE' }], done: true, ok: false, log: 'expected 1 to be 2' } },
      async prMerged() { return merged ? { number: 234, sha: 'abc' } : undefined },
    }
    const { chats, c } = await make(60_000, app)
    const kid = await chats.openKid({ role: 'app', title: '그림', task: '고쳐' })
    await vi.waitFor(() => expect(chats.get(kid.id).state).toBe('idle'))
    await chats.appSubmit(kid.id, { title: '그림 고침', body: 'b' })
    chats.talk('알겠어') // 끝남 알림을 비운다
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    expect(chats.centralState().kids.find((k) => k.id === kid.id)?.ci).toBe('pending')
    await chats.tickCentral()
    expect(chats.centralState().kids.find((k) => k.id === kid.id)?.ci).toBe('failed') // 작업 현황 줄이 바로 바뀐다
    expect(chats.flushWakes()).toBe(true)
    expect(centralPrompts().at(-1)).toContain('expected 1 to be 2')
    expect(chats.get(c.id).items.at(-1)).toMatchObject({ kind: 'user', auto: true, text: expect.stringContaining('「그림」 CI 실패') })
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    await chats.tickCentral() // 같은 실패는 한 번만
    expect(chats.flushWakes()).toBe(false)
    merged = true
    await chats.tickCentral()
    expect(chats.flushWakes()).toBe(true)
    expect(centralPrompts().at(-1)).toContain('its pull request was merged')
    expect(chats.centralState().kids.find((k) => k.id === kid.id)).toMatchObject({ merged: 'abc' })
    expect(chats.centralState().kids.find((k) => k.id === kid.id)?.ci).toBeUndefined()
    chats.stopAll()
  })

  it('크리티컬 목록: 지우기 · 내보내기 · 연구 노트 고치기 · 합치기 · 다시 시작 · 계정은 크리티컬, 일반 명령 · 앱 계획은 아님', () => {
    const ask = (tool: string, summary: string, does?: 'edit' | 'delete' | 'outside') => ({ kind: 'ask' as const, at: '', id: 'a', tool, summary, ...(does && { does }) })
    expect(criticalOf(ask('Bash', 'pnpm test'), { rid: '_app' })).toBeUndefined()
    expect(criticalOf(ask('ExitPlanMode', '그림 고치기 계획'), { rid: '_app' })).toBeUndefined()
    expect(criticalOf(ask('Edit', 'a.ts', 'edit'), { rid: '_app' })).toBeUndefined()
    expect(criticalOf(ask('Edit', 'notes/a.md', 'edit'), { rid: 'chiral' })?.key).toBe('notes')
    expect(criticalOf(ask('Bash', 'rm -rf out', 'delete'), { rid: '_app' })?.key).toBe('delete')
    expect(criticalOf(ask('Bash', ['gh', 'pr', 'merge', '12'].join(' ')), { rid: '_app' })?.key).toBe('merge')
    expect(criticalOf(ask('Bash', ['pnpm', 'service' + ':restart'].join(' ')), { rid: '_app' })?.key).toBe('restart')
    expect(criticalOf(ask('Bash', 'curl -X POST x'), { rid: '_app' })?.key).toBe('outside')
    expect(criticalOf(ask('Bash', 'gh auth login'), { rid: '_app' })?.key).toBe('money')
    for (const x of CRITICAL) expect(CENTRAL_BRIEF).toContain(x.en)
  })
})
