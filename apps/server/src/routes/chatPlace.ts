// 대화를 서버에서 (11/20 사용자 "맥북/맥미니 어디서든 대화가 메인 서버에서 동기화" → 「A 서버에서 돌리기」):
// 서버로 정한 컴퓨터가 있고 이 컴퓨터가 서버가 아니면, 이 컴퓨터의 대화 · 중앙 · 방 요청을 서버로 넘기고 서버의 대화 알림을 받아 화면에 다시 알린다.
// 그래서 어느 맥에서 열든 서버에서 도는 같은 대화를 보고 이어 쓴다.
// 이 컴퓨터에서 돈 대화(예전 대화 · 새 대화에서 「이 맥」을 고른 것)는 이 컴퓨터에서 그대로 돌고, 목록에 「이 맥」(local)으로 함께 보인다 (11/20 「그렇게하자」)
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import WebSocket from 'ws'
import { ChatList as ChatListShape, type ChatList, type ChatRow } from '@rw/core/contract/agentChats'
import * as C from '@rw/core/contract/devices'
import { replies } from '../contract.js'
import { machineName } from '../backup.js'
import { DEVICE_KEY_HEADER, readServerConfig, type ServerConfig } from '../deviceServer.js'
import { remoteServer } from '../serverRelay.js'
import { t } from '../i18n.js'
import { repeat } from '../scheduler.js'
import type { WorkbenchEvent } from '../watcher.js'
import type { RouteContext } from './context.js'

/** 서버로 넘기는 경로: 에이전트 대화 · 중앙 · 방 · 토론 · 지금 도는 일 · 대화가 만든 시안 (토론이 빠져 있어 서버의 토론을 끝내거나 설정하면 이 컴퓨터가 받아 「대화가 없음」이 됐다, 11/21) */
export const CHAT_PREFIXES = ['/api/agent-chats', '/api/agent-central', '/api/agent-room', '/api/agent-debate', '/api/agent-work', '/api/agent-mockups']
/** 서버로 넘기는 낱 경로: 피드백을 에이전트에게 맡기기 (맡기는 것은 서버 한 곳에서, 11/20) */
export const CHAT_PATHS = ['/api/feedback/hand-off']
/** 서버 알림 가운데 대화 알림만 모양을 확인해 꺼낸다 */
export function relayed(v: unknown): WorkbenchEvent | null {
  if (!v || typeof v !== 'object') return null
  const o = Object.fromEntries(Object.entries(v))
  const research = typeof o.research === 'string' ? o.research : null
  const id = typeof o.id === 'string' ? o.id : null
  if (research === null || id === null) return null
  if (o.type === 'agent-chat') return { type: 'agent-chat', research, id }
  if (o.type === 'agent-draft' && typeof o.text === 'string') return { type: 'agent-draft', research, id, text: o.text }
  return null
}
/** 넘길 때 함께 보내는 머리 */
const PASS_HEADERS = ['content-type', 'x-rw-lang', 'accept']

export const isChatPath = (url: string): boolean => {
  const p = url.split('?')[0] ?? ''
  return CHAT_PATHS.includes(p) || CHAT_PREFIXES.some((x) => p === x || p.startsWith(`${x}/`))
}

/** 이 컴퓨터의 대화 (routes/agentChats.ts가 알린다): 그 대화의 요청은 넘기지 않는다 */
export interface LocalChats { has(id: string): boolean; list(rid?: string): ChatRow[] }
const locals = new WeakMap<FastifyInstance, LocalChats>()
export function setLocalChats(app: FastifyInstance, l: LocalChats): void { locals.set(app, l) }

/** 경로의 대화 id (/api/agent-chats/<id>/… · /api/agent-mockups/<id>/… · /api/agent-debate/<id>/…) */
function chatIdOf(url: string): string | null {
  const m = /^\/api\/agent-(?:chats|mockups|debate)\/([^/?]+)/.exec(url)
  const id = m?.[1] ? decodeURIComponent(m[1]) : null
  return id && !['agents', 'models', 'extras', 'host'].includes(id) ? id : null
}

/** 서버 목록에 이 컴퓨터의 대화를 「이 맥」으로 더한다. 서버가 개인 저장소로 받은 이 컴퓨터의 대화(읽기만)는 빼서 두 번 보이지 않게 */
export function mergeLists(server: ChatList, local: ChatRow[], me: string): ChatList {
  const mine = new Set(local.map((c) => c.id))
  const rows = [...server.chats.filter((c) => !mine.has(c.id) && c.machine !== me), ...local.filter((c) => !c.machine).map((c) => ({ ...c, local: true }))]
  return { ...server, chats: rows.sort((a, b) => b.updated.localeCompare(a.updated)) }
}

export interface ChatPlaceDeps {
  /** 다른 컴퓨터에 닿는 방법 (시험에서 바꾼다) */
  fetch?: typeof fetch
  socket?: (url: string, headers: Record<string, string>) => { on(ev: string, fn: (...a: unknown[]) => void): void; close(): void }
}

/**
 * app.ts에서 라우트보다 먼저 건다 (preHandler가 모든 라우트에 걸리게).
 * 서버 쪽에서는 따로 할 일이 없다: 넘어온 요청은 기기 열쇠로 들어와(appKey.ts) 평소 라우트가 받는다
 */
export function registerChatPlace(app: FastifyInstance, ctx: Pick<RouteContext, 'opts' | 'broadcast'>, deps: ChatPlaceDeps = {}): void {
  const { opts, broadcast } = ctx
  const doFetch = deps.fetch ?? fetch
  const openSocket = deps.socket ?? ((url: string, headers: Record<string, string>) => new WebSocket(url, { headers }))
  const dirs = () => [opts.backup?.dir, opts.personalDir]
  let live = false
  let error: string | undefined

  /** 지금 넘길 서버 (없으면 이 컴퓨터에서) */
  const remote = (): ServerConfig | null => remoteServer(opts)

  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!isChatPath(req.url)) return
    // 서버에 온 요청(다른 컴퓨터가 넘긴 것)은 다시 넘기지 않는다
    if (req.headers[DEVICE_KEY_HEADER] !== undefined) return
    const cfg = remote()
    if (!cfg) return
    const local = locals.get(app)
    const pathOnly = req.url.split('?')[0] ?? ''
    // 이 컴퓨터의 대화는 이 컴퓨터에서
    const id = chatIdOf(pathOnly)
    if (id && local?.has(id)) return
    // 새 대화에서 「이 맥」을 고른 것
    if (req.method === 'POST' && pathOnly === '/api/agent-chats' && req.body && typeof req.body === 'object' && 'here' in req.body && req.body.here === true) return
    const headers: Record<string, string> = { [DEVICE_KEY_HEADER]: cfg.secret }
    for (const h of PASS_HEADERS) { const v = req.headers[h]; if (typeof v === 'string') headers[h] = v }
    const body = req.method === 'GET' || req.method === 'HEAD' || req.body === undefined ? undefined
      : Buffer.isBuffer(req.body) ? new Uint8Array(req.body) : typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    try {
      const started = performance.now()
      const r = await doFetch(`${cfg.url}${req.url}`, { method: req.method, headers, body, signal: AbortSignal.timeout(60_000) })
      let buf = Buffer.from(await r.arrayBuffer())
      error = undefined
      // 목록이면 이 컴퓨터의 대화를 함께
      if (req.method === 'GET' && pathOnly === '/api/agent-chats' && r.ok && local) {
        const rid = new URL(req.url, 'http://x').searchParams.get('rid') || undefined
        const parsed = ChatListShape.safeParse(JSON.parse(buf.toString('utf8')))
        if (parsed.success) buf = Buffer.from(JSON.stringify(mergeLists(parsed.data, local.list(rid), machineName())))
      }
      const type = r.headers.get('content-type')
      if (type) void reply.header('content-type', type)
      // 넘기는 데 든 시간(서버까지 오가기 + 서버 처리). 브라우저 개발 도구 › Network › Timing에 relay로 보인다
      void reply.header('server-timing', `relay;dur=${(performance.now() - started).toFixed(1)}`)
      return reply.status(r.status).send(buf)
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
      const name = cfg.label ?? cfg.machine
      return reply.status(503).send({ error: t(`서버(${name})에 닿지 않습니다. 서버가 켜져 있고 Tailscale이 이어졌는지 보세요. 설정 › 기기 관리에서 대화를 이 컴퓨터에서 돌리게 바꿀 수도 있습니다`, `Cannot reach the server (${name}). Check that it is on and Tailscale is connected, or run chats on this computer in Settings › Devices`) })
    }
  })

  // 서버의 대화 알림을 받아 이 컴퓨터 화면에 다시 알린다 (끊기면 1분 안에 다시 잇는다)
  let sock: ReturnType<typeof openSocket> | null = null
  let sockFor: string | null = null
  const close = () => { live = false; sockFor = null; const s = sock; sock = null; try { s?.close() } catch { /* 이미 닫힘 */ } }
  const connect = () => {
    const cfg = remote()
    const key = cfg ? `${cfg.url} ${cfg.secret}` : null
    if (key === sockFor && sock) return
    close()
    if (!cfg || !key) return
    sockFor = key
    const s = openSocket(`${cfg.url.replace(/^http/, 'ws')}/api/events`, { [DEVICE_KEY_HEADER]: cfg.secret })
    sock = s
    s.on('open', () => { if (sock === s) { live = true; error = undefined } })
    s.on('message', (data: unknown) => {
      try {
        const e = relayed(JSON.parse(String(data)))
        if (e) broadcast(e)
      } catch { /* 모르는 글은 버린다 */ }
    })
    s.on('error', (err: unknown) => { if (sock === s) error = err instanceof Error ? err.message : String(err) })
    s.on('close', () => { if (sock === s) { sock = null; live = false; sockFor = null } })
  }
  if (!opts.sandbox) repeat(app, { first: 3_000, every: 60_000, run: async () => connect() })
  app.addHook('onClose', async () => close())

  const view = (): C.ChatPlace => {
    if (opts.sandbox) return { server: { machine: 'studio', label: 'Mac Studio', this: true }, remote: false, live: false }
    const cfg = readServerConfig(dirs())
    const r = remote()
    return {
      server: cfg ? { machine: cfg.machine, ...(cfg.label && { label: cfg.label }), this: cfg.machine === machineName() } : null,
      remote: !!r, live: !!r && live,
      ...(r && error && { error }),
    }
  }
  app.get('/api/chat-place', replies(C.ChatPlace), async (): Promise<C.ChatPlace> => view())
}
