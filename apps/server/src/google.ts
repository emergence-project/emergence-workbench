import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { localDate, writeAtomic } from './fsutil.js'
import { WorkbenchError } from './workbench.js'
import { t as tx } from './i18n.js'

/**
 * 구글 계정 연결 (R81 달력, R83 어디서든 이어서 작업).
 *
 * - 로그인: 이 맥의 앱 서버가 직접 OAuth를 한다 (데스크톱 앱 클라이언트, 127.0.0.1로 돌아오는 주소, PKCE).
 *   클라이언트 ID·비밀값은 사용자가 Google Cloud에서 만들어 설정 화면에 넣는다 → ~/.config/research-workspace/google.yaml
 * - 받은 토큰은 google-token.json (이 컴퓨터에만, 600).
 * - 권한: 달력 읽기, 드라이브의 앱 전용 폴더(appDataFolder, 사용자의 다른 파일은 못 봄), 이메일.
 * - 연구 파일 내용은 구글로 보내지 않는다. 동기화하는 것은 앱 설정과 프로젝트 목록(GitHub 주소·태그)뿐이다.
 *
 * mock: 개발용 예제 모드와 테스트. 구글 대신 같은 모양의 답을 주는 가짜 fetch를 쓰고, 로그인 화면을 건너뛴다.
 */

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
]
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'
const CAL = 'https://www.googleapis.com/calendar/v3'
const DRIVE = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
export const SYNC_FILE = 'research-workspace.json'

interface ClientConfig { clientId: string; clientSecret: string }
interface TokenFile {
  access_token: string
  refresh_token?: string
  /** ms */
  expires_at: number
  email?: string
  /** 동기화를 한 번이라도 맞췄는지 (불러오기 또는 올리기). 그 전에는 저절로 올리지 않는다: 새 컴퓨터의 빈 설정이 구글의 설정을 덮지 않게 */
  synced?: boolean
}

export interface GoogleStatus {
  /** 클라이언트 ID가 설정되어 있는지 */
  configured: boolean
  connected: boolean
  email?: string
  /** 예제 모드의 가짜 구글 */
  mock: boolean
  synced: boolean
  clientId?: string
}

export interface CalendarEvent {
  id: string
  calendar: string
  title: string
  /** 시작하는 날 (YYYY-MM-DD, 이 컴퓨터 시간대) */
  date: string
  /** 끝나는 날 (포함). 하루짜리면 date와 같다 */
  endDate: string
  /** 종일 일정이면 없음. HH:MM */
  time?: string
  endTime?: string
  location?: string
  link?: string
}

/** 구글 드라이브의 앱 전용 폴더에 두는 설정 */
export interface SyncedSettings {
  version: 1
  savedAt: string
  /** 올린 컴퓨터의 이름 */
  machine: string
  ui: unknown
  engine?: string
  /** LaTeX 서식 모음과 저자 (예전에 올린 설정에는 없다) */
  latexTemplates?: unknown
  latexDefault?: unknown
  authors?: unknown
  /** 네트워킹에 더한 사람 */
  people?: unknown
  researches: SyncedResearch[]
}
export interface SyncedResearch { id: string; title: string; tags: string[]; remote: string | null; folder: string }

interface Pending { verifier: string; redirectUri: string; returnTo: string; at: number }

export class Google {
  private readonly clientFile: string
  private readonly tokenFile: string
  private readonly pending = new Map<string, Pending>()
  private cache = new Map<string, { at: number; events: CalendarEvent[] }>()

  constructor(configDir: string, private readonly fetchImpl: typeof fetch = fetch, readonly mock = false) {
    this.clientFile = path.join(configDir, 'google.yaml')
    this.tokenFile = path.join(configDir, 'google-token.json')
  }

  private client(): ClientConfig | null {
    if (this.mock) return { clientId: 'mock-client.apps.googleusercontent.com', clientSecret: 'mock' }
    if (!fs.existsSync(this.clientFile)) return null
    const raw = YAML.parse(fs.readFileSync(this.clientFile, 'utf8')) ?? {}
    const clientId = typeof raw.clientId === 'string' ? raw.clientId.trim() : ''
    const clientSecret = typeof raw.clientSecret === 'string' ? raw.clientSecret.trim() : ''
    return clientId && clientSecret ? { clientId, clientSecret } : null
  }

  private tokens(): TokenFile | null {
    try { return JSON.parse(fs.readFileSync(this.tokenFile, 'utf8')) as TokenFile } catch { return null }
  }

  private saveTokens(t: TokenFile): void {
    writeAtomic(this.tokenFile, JSON.stringify(t, null, 2))
    fs.chmodSync(this.tokenFile, 0o600)
  }

  status(): GoogleStatus {
    const c = this.client()
    const t = this.tokens()
    return {
      configured: !!c, connected: !!t, mock: this.mock, synced: !!t?.synced,
      ...(t?.email && { email: t.email }),
      ...(c && !this.mock && { clientId: c.clientId }),
    }
  }

  /** 설정 화면에서 넣은 클라이언트 ID·비밀값. 비밀값은 다시 화면에 보내지 않는다 */
  setClient(clientId: unknown, clientSecret: unknown): GoogleStatus {
    if (typeof clientId !== 'string' || !/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId.trim()))
      throw new WorkbenchError(400, tx('클라이언트 ID는 ….apps.googleusercontent.com 으로 끝납니다.', 'A client ID ends with ….apps.googleusercontent.com.'))
    if (typeof clientSecret !== 'string' || clientSecret.trim().length < 8) throw new WorkbenchError(400, tx('클라이언트 비밀번호가 필요합니다.', 'A client secret is required.'))
    writeAtomic(this.clientFile, `# 구글 OAuth 클라이언트 (Google Cloud에서 만든 데스크톱 앱). 이 컴퓨터에만 둔다.\n${YAML.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() })}`)
    fs.chmodSync(this.clientFile, 0o600)
    return this.status()
  }

  /**
   * 구글 로그인 화면 주소. redirectUri는 이 앱 서버의 /api/google/callback (127.0.0.1).
   * returnTo: 로그인 뒤 돌아갈 화면 주소(같은 컴퓨터의 앱)
   */
  authUrl(redirectUri: string, returnTo: string): string {
    const c = this.client()
    if (!c) throw new WorkbenchError(409, tx('먼저 설정에서 구글 클라이언트 ID를 넣으세요.', 'Enter a Google client ID in Settings first.'))
    const state = randomBytes(16).toString('hex')
    const verifier = randomBytes(32).toString('base64url')
    for (const [k, p] of this.pending) if (Date.now() - p.at > 15 * 60_000) this.pending.delete(k)
    this.pending.set(state, { verifier, redirectUri, returnTo, at: Date.now() })
    if (this.mock) return `${redirectUri}?code=mock-code&state=${state}`
    const q = new URLSearchParams({
      client_id: c.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GOOGLE_SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    })
    return `${AUTH_URL}?${q}`
  }

  /** 구글이 돌려보낸 code를 토큰으로 바꾼다. 돌아갈 화면 주소를 돌려준다 */
  async finish(code: string, state: string): Promise<string> {
    const p = this.pending.get(state)
    if (!p) throw new WorkbenchError(400, tx('로그인 요청이 오래되었거나 이 앱에서 시작한 것이 아닙니다. 다시 연결해 주세요.', 'The sign-in request is too old or did not start in this app. Connect again.'))
    this.pending.delete(state)
    const c = this.client()
    if (!c) throw new WorkbenchError(409, tx('구글 클라이언트 ID가 없습니다.', 'No Google client ID.'))
    const tok = await this.tokenRequest({
      grant_type: 'authorization_code', code, redirect_uri: p.redirectUri, code_verifier: p.verifier,
      client_id: c.clientId, client_secret: c.clientSecret,
    })
    const t: TokenFile = {
      access_token: tok.access_token, expires_at: Date.now() + (tok.expires_in ?? 3600) * 1000,
      ...(tok.refresh_token && { refresh_token: tok.refresh_token }),
    }
    const prev = this.tokens()
    if (!t.refresh_token && prev?.refresh_token) t.refresh_token = prev.refresh_token
    this.saveTokens(t)
    try {
      const info = await this.api<{ email?: string }>(USERINFO_URL)
      if (info.email) this.saveTokens({ ...this.tokens()!, email: info.email })
    } catch { /* 이메일은 없어도 된다 */ }
    this.cache.clear()
    return p.returnTo
  }

  async disconnect(): Promise<void> {
    const t = this.tokens()
    if (t && !this.mock) {
      try { await this.fetchImpl(`${REVOKE_URL}?token=${encodeURIComponent(t.refresh_token ?? t.access_token)}`, { method: 'POST' }) } catch { /* 지우기는 계속 */ }
    }
    fs.rmSync(this.tokenFile, { force: true })
    this.cache.clear()
  }

  markSynced(): void {
    const t = this.tokens()
    if (t && !t.synced) this.saveTokens({ ...t, synced: true })
  }

  private async tokenRequest(body: Record<string, string>): Promise<{ access_token: string; expires_in?: number; refresh_token?: string }> {
    const res = await this.fetchImpl(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() })
    const data = await res.json().catch(() => ({})) as { access_token?: string; expires_in?: number; refresh_token?: string; error?: string; error_description?: string }
    if (!res.ok || !data.access_token) throw new WorkbenchError(502, tx(`구글 로그인에 실패했습니다: ${data.error_description ?? data.error ?? res.status}`, `Google sign-in failed: ${data.error_description ?? data.error ?? res.status}`))
    return data as { access_token: string; expires_in?: number; refresh_token?: string }
  }

  private async accessToken(): Promise<string> {
    const t = this.tokens()
    if (!t) throw new WorkbenchError(409, tx('구글 계정이 연결되어 있지 않습니다.', 'No Google account is connected.'))
    if (t.expires_at - 60_000 > Date.now()) return t.access_token
    const c = this.client()
    if (!t.refresh_token || !c) throw new WorkbenchError(401, tx('구글 로그인이 끝났습니다. 설정에서 다시 연결해 주세요.', 'The Google sign-in expired. Connect again in Settings.'))
    const tok = await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: c.clientId, client_secret: c.clientSecret })
    this.saveTokens({ ...t, access_token: tok.access_token, expires_at: Date.now() + (tok.expires_in ?? 3600) * 1000 })
    return tok.access_token
  }

  private async api<T>(url: string, init: RequestInit = {}): Promise<T> {
    const res = await this.raw(url, init)
    return await res.json() as T
  }

  private async raw(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.accessToken()
    const res = await this.fetchImpl(url, { ...init, headers: { ...init.headers as Record<string, string>, authorization: `Bearer ${token}` } })
    if (res.status === 401) throw new WorkbenchError(401, tx('구글 로그인이 끝났습니다. 설정에서 다시 연결해 주세요.', 'The Google sign-in expired. Connect again in Settings.'))
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: { message?: string } }
      throw new WorkbenchError(502, tx(`구글에서 오류가 났습니다: ${body.error?.message ?? res.status}`, `Google returned an error: ${body.error?.message ?? res.status}`))
    }
    return res
  }

  // ---------- 달력 (읽기만) ----------

  /** from~to(포함, YYYY-MM-DD)의 일정. 달력 화면에서 켜 둔 달력만. 2분 동안 기억한다 */
  async events(from: string, to: string): Promise<CalendarEvent[]> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new WorkbenchError(400, tx('날짜는 YYYY-MM-DD', 'Dates must be YYYY-MM-DD'))
    const key = `${from}/${to}`
    const hit = this.cache.get(key)
    if (hit && Date.now() - hit.at < 120_000) return hit.events
    const timeMin = new Date(`${from}T00:00:00`).toISOString()
    const end = new Date(`${to}T00:00:00`); end.setDate(end.getDate() + 1)
    const list = await this.api<{ items?: { id: string; summary?: string; selected?: boolean; hidden?: boolean }[] }>(`${CAL}/users/me/calendarList?minAccessRole=reader`)
    const cals = (list.items ?? []).filter((c) => c.selected !== false && !c.hidden)
    const out: CalendarEvent[] = []
    for (const cal of cals) {
      const q = new URLSearchParams({ timeMin, timeMax: end.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '250' })
      const data = await this.api<{ items?: RawEvent[] }>(`${CAL}/calendars/${encodeURIComponent(cal.id)}/events?${q}`)
      for (const e of data.items ?? []) {
        const ev = toEvent(e, cal.summary ?? cal.id)
        if (ev) out.push(ev)
      }
    }
    out.sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
    this.cache.set(key, { at: Date.now(), events: out })
    return out
  }

  // ---------- 설정 동기화 (드라이브의 앱 전용 폴더) ----------

  private async syncFileId(): Promise<string | null> {
    const q = new URLSearchParams({ spaces: 'appDataFolder', q: `name='${SYNC_FILE}'`, fields: 'files(id,modifiedTime)' })
    const data = await this.api<{ files?: { id: string }[] }>(`${DRIVE}/files?${q}`)
    return data.files?.[0]?.id ?? null
  }

  async readSettings(): Promise<SyncedSettings | null> {
    const id = await this.syncFileId()
    if (!id) return null
    const res = await this.raw(`${DRIVE}/files/${id}?alt=media`)
    try { return JSON.parse(await res.text()) as SyncedSettings } catch { return null }
  }

  async writeSettings(s: SyncedSettings): Promise<void> {
    const id = await this.syncFileId()
    const body = JSON.stringify(s, null, 2)
    if (id) {
      await this.raw(`${DRIVE_UPLOAD}/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body })
    } else {
      const boundary = `rw${randomBytes(8).toString('hex')}`
      const multipart = [
        `--${boundary}`, 'content-type: application/json; charset=UTF-8', '', JSON.stringify({ name: SYNC_FILE, parents: ['appDataFolder'] }),
        `--${boundary}`, 'content-type: application/json', '', body, `--${boundary}--`, '',
      ].join('\r\n')
      await this.raw(`${DRIVE_UPLOAD}/files?uploadType=multipart`, { method: 'POST', headers: { 'content-type': `multipart/related; boundary=${boundary}` }, body: multipart })
    }
    this.markSynced()
  }
}

interface RawEvent {
  id: string; status?: string; summary?: string; location?: string; htmlLink?: string
  start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string }
}

function toEvent(e: RawEvent, calendar: string): CalendarEvent | null {
  if (e.status === 'cancelled' || !e.start) return null
  const base = { id: e.id, calendar, title: e.summary?.trim() || tx('(제목 없음)', '(untitled)'), ...(e.location && { location: e.location }), ...(e.htmlLink && { link: e.htmlLink }) }
  if (e.start.date) {
    // 종일: end.date는 다음 날(포함하지 않음)
    const last = e.end?.date ? new Date(`${e.end.date}T00:00:00`) : new Date(`${e.start.date}T00:00:00`)
    if (e.end?.date) last.setDate(last.getDate() - 1)
    const endDate = localDate(last)
    return { ...base, date: e.start.date, endDate: endDate < e.start.date ? e.start.date : endDate }
  }
  if (!e.start.dateTime) return null
  const s = new Date(e.start.dateTime)
  const en = e.end?.dateTime ? new Date(e.end.dateTime) : s
  return { ...base, date: localDate(s), endDate: localDate(en), time: hm(s), endTime: hm(en) }
}

const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/**
 * 예제 모드·테스트용 가짜 구글. 구글 API와 같은 주소·모양으로 답한다.
 * 일정은 이번 주를 기준으로 몇 개, 드라이브는 메모리에 둔다.
 */
export function mockGoogleFetch(now = () => new Date()): typeof fetch & { files: Map<string, string> } {
  const files = new Map<string, string>()
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  const day = (offset: number) => {
    const d = now()
    // offset 0은 이번 주(일요일에 시작) 월요일
    const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay() + 1 + offset)
    return localDate(m)
  }
  const at = (offset: number, h: number, min = 0) => {
    const [y, mo, dd] = day(offset).split('-').map(Number)
    return new Date(y!, mo! - 1, dd!, h, min).toISOString()
  }
  const f = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const method = init?.method ?? 'GET'
    if (url.href.startsWith(TOKEN_URL)) return ok({ access_token: 'mock-access', expires_in: 3600, refresh_token: 'mock-refresh' })
    if (url.href.startsWith(USERINFO_URL)) return ok({ email: 'researcher@example.com' })
    if (url.pathname.endsWith('/users/me/calendarList')) return ok({ items: [{ id: 'primary', summary: tx('내 달력', 'My calendar'), selected: true }] })
    if (url.pathname.startsWith('/calendar/v3/calendars/')) {
      const items: RawEvent[] = [
        { id: 'm1', summary: tx('그룹 미팅', 'Group meeting'), location: tx('수학관 512', 'Math 512'), start: { dateTime: at(0, 10) }, end: { dateTime: at(0, 11) } },
        { id: 'm2', summary: tx('세미나: 그래프 마이너', 'Seminar: graph minors'), start: { dateTime: at(2, 16) }, end: { dateTime: at(2, 17, 30) } },
        { id: 'm3', summary: tx('지도교수 면담', 'Meeting with advisor'), start: { dateTime: at(3, 14) }, end: { dateTime: at(3, 14, 30) } },
        { id: 'm4', summary: tx('학회 초록 마감', 'Conference abstract deadline'), start: { date: day(4) }, end: { date: day(5) } },
      ]
      const min = url.searchParams.get('timeMin'), max = url.searchParams.get('timeMax')
      return ok({ items: items.filter((e) => {
        const s = e.start!.dateTime ?? new Date(`${e.start!.date}T00:00:00`).toISOString()
        return (!min || s >= min) && (!max || s < max)
      }) })
    }
    if (url.pathname === '/drive/v3/files' && method === 'GET') return ok({ files: [...files.keys()].map((id) => ({ id })) })
    if (url.pathname.startsWith('/drive/v3/files/') && method === 'GET') {
      const id = url.pathname.split('/').pop()!
      return files.has(id) ? new Response(files.get(id), { status: 200 }) : ok({})
    }
    if (url.pathname === '/upload/drive/v3/files' && method === 'POST') {
      const text = String(init?.body ?? '')
      const parts = text.split(/--rw[0-9a-f]+/).map((p) => p.split('\r\n\r\n').slice(1).join('\r\n\r\n').trim()).filter(Boolean)
      files.set('mock-file', parts[1] ?? '')
      return ok({ id: 'mock-file' })
    }
    if (url.pathname.startsWith('/upload/drive/v3/files/') && method === 'PATCH') {
      files.set(url.pathname.split('/').pop()!, String(init?.body ?? ''))
      return ok({})
    }
    if (url.href.startsWith(REVOKE_URL)) return ok({})
    return new Response('{}', { status: 404 })
  }
  return Object.assign(f as typeof fetch, { files })
}
