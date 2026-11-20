// 서버로 정한 컴퓨터 (설정 › 기기 관리): 이 컴퓨터가 서버가 아니면 그 서버를 돌려준다.
// 대화를 서버에서 돌리기(routes/chatPlace.ts)와 피드백 자동 처리를 서버 한 곳에서 (11/20 「피드백 자동 처리 설정은 동기화」)가 함께 쓴다
import { machineName } from './backup.js'
import type { AgentSettings } from '@rw/core'
import { DEVICE_KEY_HEADER, readServerConfig, type ServerConfig } from './deviceServer.js'
import { t } from './i18n.js'

export interface RelayOptions { sandbox?: boolean; personalDir?: string; backup?: { dir: string } }

/** 지금 넘길 서버 (없거나 이 컴퓨터가 서버면 null) */
export function remoteServer(opts: RelayOptions): ServerConfig | null {
  if (opts.sandbox) return null
  const cfg = readServerConfig([opts.backup?.dir, opts.personalDir])
  return cfg && cfg.machine !== machineName() ? cfg : null
}

/** 화면에 보이는 서버 이름 */
export const serverName = (cfg: ServerConfig): string => cfg.label ?? cfg.machine

/** 서버에 JSON으로 묻는다 (기기 열쇠를 붙여서). 닿지 않거나 서버가 오류로 답하면 던진다 */
export async function askServer(cfg: ServerConfig, path: string, init: { method?: string; body?: unknown; lang?: string } = {}, doFetch: typeof fetch = fetch): Promise<unknown> {
  const headers: Record<string, string> = { [DEVICE_KEY_HEADER]: cfg.secret }
  if (init.body !== undefined) headers['content-type'] = 'application/json'
  if (init.lang) headers['x-rw-lang'] = init.lang
  const r = await doFetch(`${cfg.url}${path}`, { method: init.method ?? 'GET', headers, body: init.body === undefined ? undefined : JSON.stringify(init.body), signal: AbortSignal.timeout(8_000) })
  const text = await r.text()
  const json: unknown = text ? JSON.parse(text) : null
  if (!r.ok) {
    const msg = json && typeof json === 'object' && 'error' in json && typeof json.error === 'string' ? json.error : `HTTP ${r.status}`
    throw new Error(msg)
  }
  return json
}

/** 서버의 값 하나를 쓰는 설정 › 에이전트의 칸: 피드백을 언제 맡기나 · 언제 합치나 · 한 차례 한도 */
export const FEEDBACK_KEYS = ['feedback', 'merge', 'minutes'] as const
type FeedbackPart = Pick<AgentSettings, (typeof FEEDBACK_KEYS)[number]>
export const pickFeedback = (s: AgentSettings): FeedbackPart => ({ feedback: s.feedback, merge: s.merge, minutes: s.minutes })
/** 바꿀 값을 서버로 보낼 것(shared)과 이 맥에 둘 것(rest)으로 나눈다 */
export function splitFeedback<T extends object>(body: T): { shared: Record<string, unknown>; rest: Record<string, unknown> } {
  const shared: Record<string, unknown> = {}
  const rest: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) ((FEEDBACK_KEYS as readonly string[]).includes(k) ? shared : rest)[k] = v
  return { shared, rest }
}

export const unreachable = (server: string, e: unknown): string =>
  t(`서버(${server})에 닿지 않아 피드백 자동 처리 설정을 읽거나 바꾸지 못했습니다: ${e instanceof Error ? e.message : String(e)}`, `Could not reach the server (${server}) to read or change feedback handling: ${e instanceof Error ? e.message : String(e)}`)
