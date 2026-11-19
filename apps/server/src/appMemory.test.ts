import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { chatCap, chatRoom, CHAT_MAX, CHAT_MIN, MemoryGauge, type Mem } from './appMemory.js'
import { AgentChats, type RunEvent } from './agentChats.js'

const GB = 1024 ** 3
const mem = (freePct: number, totalGb: number): Mem => ({ free: freePct / 100, total: totalGb * GB })

describe('동시에 도는 대화 수 (11/19)', () => {
  it('상한은 컴퓨터 크기로: 16GB 맥북 3, 32GB · 12코어 맥미니 6, 큰 맥 스튜디오 8', () => {
    expect(chatCap(16 * GB, 8)).toBe(3)
    expect(chatCap(32 * GB, 12)).toBe(6)
    expect(chatCap(128 * GB, 24)).toBe(CHAT_MAX)
    // 코어가 적으면 코어로, 아무리 작아도 예전 고정값 3은 지킨다
    expect(chatCap(64 * GB, 8)).toBe(4)
    expect(chatCap(8 * GB, 4)).toBe(CHAT_MIN)
  })
  it('상한 안에서는 남은 메모리로: 3개까지는 늘, 그 위는 남은 메모리가 25% · 6GB 이상일 때만', () => {
    expect(chatRoom(2, 0, mem(5, 32), 6).ok).toBe(true)
    expect(chatRoom(3, 0, mem(74, 32), 6).ok).toBe(true)
    expect(chatRoom(3, 0, mem(20, 32), 6)).toEqual({ ok: false, why: 'memory' })
    // 막 시작한 대화는 곧 쓸 메모리(3GB씩)를 미리 뺀다: 32GB의 40% = 12.8GB에서 둘이면 6.8GB < 8GB(25%)
    expect(chatRoom(4, 2, mem(40, 32), 6).ok).toBe(false)
    expect(chatRoom(6, 0, mem(90, 32), 6)).toEqual({ ok: false, why: 'cap' })
  })
  it('메모리를 못 읽으면 지난 값을 그대로 둔다', async () => {
    let n = 0
    const g = new MemoryGauge(async () => { if (n++) throw new Error('x'); return mem(50, 32) })
    expect(g.current).toBeUndefined()
    await g.refresh()
    await g.refresh()
    expect(g.current).toEqual(mem(50, 32))
  })

  it('줄 선 대화는 메모리가 풀리면 drain으로 시작하고, 새 대화는 줄 선 대화를 앞지르지 않는다', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-chat-room-'))
    const release: (() => void)[] = []
    const runner = async function* (): AsyncIterable<RunEvent> {
      yield { type: 'session', id: `s${release.length}` }
      await new Promise<void>((res) => release.push(res))
      yield { type: 'result', ok: true }
    }
    let allowed = 1
    const chats = new AgentChats({ dir, runner, limit: 6, room: (live) => live < allowed, project: () => ({ repo: dir, title: 'p' }), readable: () => [], extraDirs: () => [], notify: () => {} })
    const a = chats.create({ rid: 'p', text: '하나' })
    await vi.waitFor(() => expect(chats.get(a.id).state).toBe('running'))
    const b = chats.create({ rid: 'p', text: '둘' })
    expect(chats.get(b.id).state).toBe('queued')
    expect(chats.drain()).toBe(0)
    allowed = 3
    const c = chats.create({ rid: 'p', text: '셋' })
    // 자리가 나도 먼저 줄 선 둘이 먼저 시작한다
    await vi.waitFor(() => expect(chats.get(b.id).state).toBe('running'))
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('running'))
    release.forEach((r) => r())
    for (const x of [a, b, c]) await vi.waitFor(() => expect(chats.get(x.id).state).toBe('idle'))
    chats.stopAll()
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
