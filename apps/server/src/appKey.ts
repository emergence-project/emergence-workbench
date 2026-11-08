import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'

/**
 * 설치 파일로 깐 앱의 서버 열쇠 (11/8 점검 "공용 PC에서 남의 앱이 열린다").
 * 창(desktop/src-tauri)이 켤 때마다 빈 포트와 열쇠를 새로 만들어 서버에 넘긴다(RW_PORT · RW_KEY).
 * 열쇠가 있으면 서버는 열쇠를 가진 요청만 받는다.
 * - 창: 처음 한 번 `/__open?k=<열쇠>&to=<화면>`으로 들어와 쿠키를 받고, 그 뒤로는 쿠키가 따라간다.
 * - MCP 입구 · 앱이 띄운 에이전트: 머리 `x-rw-key`. 앱 밖에서 등록한 에이전트는 설정 폴더의 server.json에서 주소와 열쇠를 읽는다.
 * 같은 컴퓨터의 다른 사용자 계정이나 다른 프로그램은 열쇠를 모르므로 이 서버를 쓰지 못한다.
 * 저장소에서 돌리는 맥 서비스(5174)와 예제 모드는 열쇠 없이 그대로다.
 */
export const KEY_HEADER = 'x-rw-key'
export const OPEN_PATH = '/__open'
export const keyCookie = (port: number): string => `rw_k_${port}`

function same(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

function cookieValue(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return undefined
}

/** 이 요청이 열쇠를 가졌는지 (머리나 쿠키) */
export function hasKey(headers: Record<string, string | string[] | undefined>, key: string, port: number): boolean {
  const h = headers[KEY_HEADER]
  if (typeof h === 'string' && same(h, key)) return true
  const cookie = headers.cookie
  const c = cookieValue(typeof cookie === 'string' ? cookie : undefined, keyCookie(port))
  return c !== undefined && same(c, key)
}

/** `/__open`이 넘겨 보낼 곳: 이 서버 안의 경로만 (`//다른곳`이나 주소는 첫 화면으로) */
export function openTarget(to: unknown): string {
  return typeof to === 'string' && to.startsWith('/') && !to.startsWith('//') && !to.startsWith('/\\') ? to : '/'
}

/**
 * 열쇠 검사와 `/__open`. 다른 훅보다 먼저 건다. 화면 글은 고르지 않고 두 말로 적는다(열쇠 없는 요청은 언어 설정도 모른다)
 * 쿠키는 SameSite=Lax: 창의 여는 중 쪽(tauri://)에서 넘어오는 첫 이동에도 실려야 한다. 다른 사이트의 요청은 hostGuard가 막는다
 */
export function registerKeyGate(app: FastifyInstance, key: string, port: number): void {
  app.addHook('onRequest', async (req, reply) => {
    const pathOnly = req.url.split('?')[0] ?? ''
    // Codex · Gemini 대화의 MCP 입구는 주소에 대화마다 만든 긴 열쇠가 들어 있다 (agentMcpHttp.ts)
    if (pathOnly === OPEN_PATH || pathOnly.startsWith('/api/agent-mcp/') || hasKey(req.headers, key, port)) return
    const msg = '앱 창에서만 열 수 있습니다 · Open this from the app window'
    return pathOnly === '/api' || pathOnly.startsWith('/api/') ? reply.status(401).send({ error: msg }) : reply.status(401).type('text/plain; charset=utf-8').send(msg)
  })
  app.get<{ Querystring: { k?: string; to?: string } }>(OPEN_PATH, async (req, reply) => {
    const q = req.query
    if (typeof q.k !== 'string' || !hasKey({ [KEY_HEADER]: q.k }, key, port)) return reply.status(401).type('text/plain; charset=utf-8').send('열쇠가 맞지 않습니다 · Wrong key')
    reply.header('set-cookie', `${keyCookie(port)}=${key}; Path=/; HttpOnly; SameSite=Lax`)
    reply.header('cache-control', 'no-store')
    return reply.redirect(openTarget(q.to), 303)
  })
}

export interface ServerInfo { url: string; key: string; pid: number }
const infoFile = (configDir: string) => path.join(configDir, 'server.json')

/** 앱 밖의 MCP 입구가 지금 서버를 찾게 주소와 열쇠를 적어 둔다 (이 사용자만 읽게) */
export function writeServerInfo(configDir: string, info: ServerInfo): void {
  fs.mkdirSync(configDir, { recursive: true })
  const file = infoFile(configDir)
  fs.writeFileSync(file, `${JSON.stringify(info, null, 2)}\n`, { mode: 0o600 })
  try { fs.chmodSync(file, 0o600) } catch { /* 윈도우: 사용자 폴더의 권한을 따른다 */ }
}

export function readServerInfo(configDir: string): ServerInfo | null {
  try {
    const v: unknown = JSON.parse(fs.readFileSync(infoFile(configDir), 'utf8'))
    if (!v || typeof v !== 'object' || !('url' in v) || !('key' in v) || typeof v.url !== 'string' || typeof v.key !== 'string') return null
    return { url: v.url, key: v.key, pid: 'pid' in v ? Number(v.pid) || 0 : 0 }
  } catch { return null }
}

/** 서버(server.ts)와 같은 설정 폴더 */
export const defaultConfigDir = (): string => process.env.RW_CONFIG_DIR ?? path.join(os.homedir(), '.config/research-workspace')

/**
 * 부를 서버와 그 열쇠 (MCP 입구 mcp.ts가 쓴다). 차례대로: RW_URL(예제 모드 pnpm dev는 8130) → 앱이 띄운 에이전트가 물려받은 RW_PORT · RW_KEY →
 * 설치 파일로 깐 앱이 켤 때마다 적어 두는 server.json(포트와 열쇠가 매번 바뀐다) → 맥의 실사용 서버(scripts/serve.sh, 5174)
 */
export function serverTarget(env: NodeJS.ProcessEnv = process.env, configDir = defaultConfigDir()): { url: string; key?: string } {
  const key = env.RW_KEY ? { key: env.RW_KEY } : {}
  if (env.RW_URL) return { url: env.RW_URL, ...key }
  if (env.RW_PORT) return { url: `http://127.0.0.1:${env.RW_PORT}`, ...key }
  const info = readServerInfo(configDir)
  return info ? { url: info.url, key: info.key } : { url: 'http://127.0.0.1:5174' }
}
