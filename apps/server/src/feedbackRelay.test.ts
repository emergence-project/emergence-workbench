import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { appendFeedback } from './feedback.js'
import { bundleFeedback, importFeedback } from './feedbackBundle.js'
import { relayStatus, sendToRelay, senderId } from './feedbackRelay.js'

const tmp: string[] = []
const mk = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fbr-')); tmp.push(d); return d }
afterEach(() => { vi.unstubAllGlobals(); for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true }) })
const ME = { from: '친구', named: true }
const PNG = 'data:image/png;base64,' + Buffer.from('fake-png').toString('base64')

interface Worker {
  unpack(b: unknown): Promise<{ folder: string; count: number; files: { path: string; utf8?: string; base64?: string }[] }>
  default: { fetch(r: Request, env: Record<string, string>): Promise<Response> }
}
// 타입 검사가 relay/의 JS를 따라가지 않게 경로를 값으로 둔다
const WORKER = new URL('../../../relay/feedback-worker.js', import.meta.url).href
const worker = (): Promise<Worker> => import(WORKER)

describe('feedback relay', () => {
  it('worker writes the same files as the app importer', async () => {
    const friend = mk(), config = mk(), admin = mk()
    appendFeedback(friend, { kind: '질문', target: '논문', text: '그림 있는 질문', image: PNG })
    const bundle = bundleFeedback(friend, '박 친구', new Date(), senderId(config))
    const w = await worker()
    const out = await w.unpack(JSON.parse(JSON.stringify(bundle)))
    importFeedback(admin, JSON.parse(JSON.stringify(bundle)))
    expect(out.folder).toMatch(/^박 친구-[0-9a-f]{6}$/)
    for (const f of out.files) {
      const disk = fs.readFileSync(path.join(admin, f.path))
      expect(f.utf8 !== undefined ? disk.toString('utf8') : disk.toString('base64')).toBe(f.utf8 ?? f.base64)
    }
    expect(out.files).toHaveLength(2)
  })

  it('app sends only changed days and new pictures, and keeps one sender id', async () => {
    const dir = mk(), config = mk()
    appendFeedback(dir, { kind: '수정', target: '노트', text: '첫째', image: PNG })
    const seen: { days: Record<string, string>; pictures: Record<string, string>; id?: string }[] = []
    const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => { seen.push(JSON.parse(String(init?.body))); return new Response('{"count":1}', { status: 200 }) })
    expect(relayStatus(dir, config, ME).pending).toBe(1)
    expect((await sendToRelay(dir, config, '친구', 'https://relay.example/', fetchFn)).count).toBe(1)
    expect(fetchFn.mock.calls[0]![0]).toBe('https://relay.example/feedback')
    expect(Object.keys(seen[0]!.pictures)).toHaveLength(1)
    expect(relayStatus(dir, config, ME)).toMatchObject({ pending: 0, error: null })
    expect((await sendToRelay(dir, config, '친구', 'https://relay.example', fetchFn)).count).toBe(0)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    appendFeedback(dir, { kind: '질문', target: '홈', text: '둘째' })
    await sendToRelay(dir, config, '친구', 'https://relay.example', fetchFn)
    expect(Object.keys(seen[1]!.pictures)).toHaveLength(0)
    expect(seen[1]!.id).toBe(seen[0]!.id)
  })

  it('keeps sending a day under the name it was first sent with, and new days under the new name', async () => {
    const dir = mk(), config = mk()
    const seen: { from: string; days: Record<string, string> }[] = []
    const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => { seen.push(JSON.parse(String(init?.body))); return new Response('{}', { status: 200 }) })
    appendFeedback(dir, { kind: '수정', target: '노트', text: '첫째' }, new Date('2026-11-09T08:13:00Z'))
    await sendToRelay(dir, config, 'USER', 'https://relay.example', fetchFn)
    // 이름을 넣은 뒤 같은 날 하나 더, 다음 날 하나
    appendFeedback(dir, { kind: '질문', target: '홈', text: '둘째' }, new Date('2026-11-09T09:00:00Z'))
    appendFeedback(dir, { kind: '질문', target: '홈', text: '셋째' }, new Date('2026-11-10T09:00:00Z'))
    expect((await sendToRelay(dir, config, '박 친구', 'https://relay.example', fetchFn)).count).toBe(3) // 바뀐 날짜의 항목 모두
    expect(seen.slice(1).map((b) => [b.from, Object.keys(b.days)])).toEqual([['USER', ['2026-11-09']], ['박 친구', ['2026-11-10']]])
    expect(relayStatus(dir, config, ME).pending).toBe(0)
  })

  it('records a refusal and tries again next time', async () => {
    const dir = mk(), config = mk()
    appendFeedback(dir, { kind: '수정', target: '노트', text: '하나' })
    const refuse = vi.fn(async () => new Response('{"error":"wrong invite code"}', { status: 403 }))
    await expect(sendToRelay(dir, config, '친구', 'https://relay.example', refuse)).rejects.toThrow(/wrong invite code/)
    expect(relayStatus(dir, config, ME)).toMatchObject({ pending: 1, error: expect.stringContaining('403') })
  })

  it('worker commits all files in one commit through the GitHub API', async () => {
    const calls: { method: string; url: string; body?: { tree?: unknown[] } }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      const method = init.method ?? 'GET'
      calls.push({ method, url, ...(init.body && { body: JSON.parse(String(init.body)) }) })
      const ok = (data: object) => new Response(JSON.stringify(data), { status: method === 'POST' ? 201 : 200 })
      if (url.endsWith('/git/blobs')) return ok({ sha: `blob${calls.length}` })
      if (url.includes('/git/ref/heads/')) return ok({ object: { sha: 'head1' } })
      if (url.endsWith('/git/commits/head1')) return ok({ tree: { sha: 'tree0' } })
      if (url.endsWith('/git/trees')) return ok({ sha: 'tree1' })
      if (url.endsWith('/git/commits')) return ok({ sha: 'abcdef1234' })
      if (url.includes('/git/refs/heads/')) return ok({})
      return new Response('{}', { status: 404 })
    }))
    const w = await worker()
    const env = { GITHUB_TOKEN: 'x', REPO: 'me/private' }
    const bundle = { format: 'emergence-workbench-feedback', version: 1, from: '친구', id: 'abc123def', days: { '2026-11-08': '## 10:00 · 질문 · 홈\n\n안녕\n' }, pictures: {} }
    const res = await w.default.fetch(new Request('https://relay.example/feedback', { method: 'POST', body: JSON.stringify(bundle) }), env)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ from: '친구-abc123', count: 1, commit: 'abcdef1' })
    const tree = calls.find((c) => c.url.endsWith('/git/trees'))!.body!.tree
    expect(tree).toEqual([{ path: 'feedback/from/친구-abc123/2026-11-08.md', mode: '100644', type: 'blob', sha: 'blob1' }])
    const coded = await w.default.fetch(new Request('https://relay.example/feedback', { method: 'POST', body: '{}' }), { ...env, INVITE_CODE: 'k' })
    expect(coded.status).toBe(403)
  })
})
