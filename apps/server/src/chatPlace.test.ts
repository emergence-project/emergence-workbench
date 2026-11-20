// 대화를 서버에서 (11/20 3단계 「A 서버에서 돌리기」): 서버가 아닌 컴퓨터는 대화 요청을 서버로 넘기고, 서버는 기기 열쇠로 받는다
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { machineName } from './backup.js'
import { readServerConfig, writeServerConfig } from './deviceServer.js'
import { isChatPath, mergeLists, relayed, setLocalChats } from './routes/chatPlace.js'

let tmp = ''
afterEach(() => { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }) })
const mk = () => (tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-chatplace-')))
const noSocket = () => ({ on: () => {}, close: () => {} })
/** 계약에 맞는 대화 줄 */
const full = (id: string, title: string, updated: string) => ({ id, rid: 'p', title, agent: 'claude-code', scope: { kind: 'project' }, write: 'notes', state: 'idle', mode: 'edit', model: 'default', effort: 'medium', claims: [], changed: [], added: 0, removed: 0, archived: false, created: updated, updated })

describe('대화를 서버에서', () => {
  it('넘기는 경로와 다시 알리는 알림', () => {
    expect(isChatPath('/api/agent-chats?project=x')).toBe(true)
    expect(isChatPath('/api/agent-central/send')).toBe(true)
    expect(isChatPath('/api/agent-chatsx')).toBe(false)
    expect(isChatPath('/api/claude-accounts')).toBe(false)
    expect(relayed({ type: 'agent-draft', research: 'p', id: 'c1', text: '쓰는 중' })).toEqual({ type: 'agent-draft', research: 'p', id: 'c1', text: '쓰는 중' })
    expect(relayed({ type: 'note', research: 'p', file: 'a.md', hash: null })).toBeNull()
    expect(relayed({ type: 'agent-chat', research: 'p' })).toBeNull()
  })

  it('목록 합치기: 이 컴퓨터의 대화는 「이 맥」으로, 서버가 받아 둔 이 컴퓨터의 대화(읽기만)는 빼고', () => {
    const row = (id: string, updated: string, extra: Record<string, unknown> = {}) => ({ id, rid: 'p', title: id, state: 'idle', agent: 'claude-code', created: updated, updated, ...extra }) as never
    const merged = mergeLists({ chats: [row('s1', '2026-11-20T10:00:00Z'), row('l1', '2026-11-19T10:00:00Z', { machine: 'laptop', archived: true }), row('m1', '2026-11-18T10:00:00Z', { machine: 'mini', archived: true })], limit: 8, app: true, handOff: true } as never, [row('l1', '2026-11-20T11:00:00Z')], 'laptop')
    expect(merged.chats.map((c) => [c.id, !!c.local, c.machine ?? null])).toEqual([['l1', true, null], ['s1', false, null], ['m1', false, 'mini']])
    expect(merged.limit).toBe(8)
  })

  it('서버가 다른 컴퓨터면 대화 요청을 열쇠와 함께 넘기고, 이 컴퓨터의 대화 · 「이 맥」 새 대화는 넘기지 않는다', async () => {
    const dir = mk()
    const backup = path.join(dir, 'backup')
    writeServerConfig(backup, { machine: 'studio', label: 'Mac Studio', url: 'https://studio.example.ts.net' })
    const secret = readServerConfig([backup])!.secret
    const calls: { url: string; method: string; key: string | null; body: unknown }[] = []
    const fake: typeof fetch = async (input, init) => {
      const h = new Headers(init?.headers)
      calls.push({ url: String(input), method: init?.method ?? 'GET', key: h.get('x-rw-device-key'), body: init?.body })
      const list = { chats: [full('s1', '서버 대화', '2026-11-20T10:00:00Z')], limit: 8, app: false, handOff: false }
      return new Response(JSON.stringify(String(input).includes('/api/agent-chats?') || String(input).endsWith('/api/agent-chats') ? list : { from: 'server' }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    const app = buildApp({ configDir: path.join(dir, 'config'), backup: { dir: backup, remote: null }, chatPlace: { fetch: fake, socket: noSocket } })
    const localRow = full('here1', '이 맥 대화', '2026-11-20T11:00:00Z')
    setLocalChats(app, { has: (id) => id === 'here1', list: () => [localRow as never] })
    expect((await app.inject({ method: 'GET', url: '/api/chat-place' })).json()).toMatchObject({ remote: true, server: { machine: 'studio', label: 'Mac Studio', this: false } })
    const list = (await app.inject({ method: 'GET', url: '/api/agent-chats' })).json()
    expect(list.chats.map((c: { id: string; local?: boolean }) => [c.id, !!c.local])).toEqual([['here1', true], ['s1', false]])
    await app.inject({ method: 'POST', url: '/api/agent-central/messages', payload: { text: '안녕' } })
    expect(calls.map((c) => [c.method, c.url, c.key])).toEqual([
      ['GET', 'https://studio.example.ts.net/api/agent-chats', secret],
      ['POST', 'https://studio.example.ts.net/api/agent-central/messages', secret],
    ])
    expect(JSON.parse(String(calls[1]!.body))).toEqual({ text: '안녕' })
    // 이 컴퓨터의 대화 · 「이 맥」 새 대화 · 대화가 아닌 요청은 넘기지 않는다
    await app.inject({ method: 'GET', url: '/api/agent-chats/here1' })
    await app.inject({ method: 'POST', url: '/api/agent-chats', payload: { rid: 'p', text: '이 맥에서', here: true } })
    await app.inject({ method: 'GET', url: '/api/devices' })
    expect(calls).toHaveLength(2)
    await app.inject({ method: 'GET', url: '/api/agent-chats/s1' })
    expect(calls.at(-1)!.url).toBe('https://studio.example.ts.net/api/agent-chats/s1')
    await app.close()
  })

  it('서버에 닿지 않으면 503과 까닭', async () => {
    const dir = mk()
    const backup = path.join(dir, 'backup')
    writeServerConfig(backup, { machine: 'studio', url: 'https://studio.example.ts.net' })
    const app = buildApp({ configDir: path.join(dir, 'config'), backup: { dir: backup, remote: null }, chatPlace: { fetch: async () => { throw new Error('연결 거부') }, socket: noSocket } })
    const r = await app.inject({ method: 'GET', url: '/api/agent-chats' })
    expect(r.statusCode).toBe(503)
    expect(r.json().error).toContain('studio')
    expect((await app.inject({ method: 'GET', url: '/api/chat-place' })).json().error).toBe('연결 거부')
    await app.close()
  })

  it('서버 쪽: 설치판의 창 열쇠 대신 기기 열쇠로 받는다', async () => {
    const dir = mk()
    const backup = path.join(dir, 'backup')
    writeServerConfig(backup, { machine: machineName(), url: 'https://me.example.ts.net' })
    const secret = readServerConfig([backup])!.secret
    const app = buildApp({ configDir: path.join(dir, 'config'), backup: { dir: backup, remote: null }, key: 'window-key', port: 4999, chatPlace: { socket: noSocket } })
    expect((await app.inject({ method: 'GET', url: '/api/chat-place' })).statusCode).toBe(401)
    expect((await app.inject({ method: 'GET', url: '/api/chat-place', headers: { 'x-rw-device-key': 'wrong-key' } })).statusCode).toBe(401)
    const ok = await app.inject({ method: 'GET', url: '/api/chat-place', headers: { 'x-rw-device-key': secret } })
    expect(ok.statusCode).toBe(200)
    expect(ok.json()).toMatchObject({ remote: false, server: { this: true } })
    await app.close()
  })
})
