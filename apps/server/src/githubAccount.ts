/**
 * GitHub 계정으로 로그인 (11/8 사용자 "로그인하는 계정이 같으면 어디서든지 동일한 상태로 확인해야해").
 * 터미널 없이 앱 안에서: GitHub의 기기 코드 로그인(device flow)으로 열쇠를 받아 OS 보안 저장소(secretStore.ts)에 둔다.
 * - 앱은 emergence-project 조직에 등록한 OAuth 앱(Device Flow, 비밀 값 없음)의 Client ID만 쓴다. Client ID는 공개 값이다
 * - 권한은 repo: 앱이 그 계정에 비공개 저장소를 만들고 받고 올린다(다음 단계, 계정 동기화)
 * - 로그인하면 이 서버가 부르는 git이 github.com에 그 열쇠로 붙고(git.ts setGithubToken),
 *   git 전체 설정에 이름 · 이메일이 없으면 커밋 이름을 GitHub 계정 이름과 noreply 주소로 적는다
 * - 계정 정보(이름 · 아이디)는 설정 폴더 account.json에, 열쇠는 보안 저장소에만 둔다
 */
import fs from 'node:fs'
import path from 'node:path'
import type { AccountView } from '@rw/core/contract/account'
import { writeAtomic } from './fsutil.js'
import { getFallbackIdentity, setFallbackIdentity, setGithubToken } from './git.js'
import { t } from './i18n.js'
import type { SecretStore } from './secretStore.js'
import { WorkbenchError } from './workbench.js'

/** emergence-project 조직의 OAuth 앱 (11/8 사용자 등록, Device Flow 켬). 공개 값 */
export const GITHUB_CLIENT_ID = process.env.RW_GITHUB_CLIENT_ID || 'Ov23liIXuLtjdKQKBXh3'
export const GITHUB_SCOPE = 'repo'
const TOKEN_KEY = 'github-token'

export interface GithubUser { login: string; id: number; name: string; avatar: string }

type Fetch = typeof fetch
const UA = { 'user-agent': 'Emergence Workbench', accept: 'application/json' }

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** 커밋에 적을 GitHub noreply 주소 (이메일을 공개하지 않아도 그 계정의 커밋으로 묶인다) */
export const noreplyEmail = (u: { login: string; id: number }) => `${u.id}+${u.login}@users.noreply.github.com`

interface Pending { userCode: string; uri: string; expiresAt: number; deviceCode: string; interval: number; started: number }

export class GithubAccount {
  private user: GithubUser | null = null
  private pending: Pending | null = null
  private error = ''
  private loop: Promise<void> | null = null
  /** 로그인 전 커밋 이름 (로그아웃하면 되돌린다) */
  private before = getFallbackIdentity()

  constructor(
    private readonly configDir: string,
    private readonly secrets: SecretStore,
    private readonly f: Fetch = fetch,
    /** 상태가 바뀌면 (화면에 알림) */
    private readonly changed: () => void = () => undefined,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  private get file() { return path.join(this.configDir, 'account.json') }

  /** 앱을 켤 때: 저장한 계정과 열쇠를 읽어 git에 건다. 열쇠가 GitHub에서 취소됐으면 로그아웃 상태로 */
  async load(): Promise<void> {
    let saved: GithubUser | null = null
    try {
      const v: unknown = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      if (isRec(v) && typeof v.login === 'string' && typeof v.id === 'number') saved = { login: v.login, id: v.id, name: str(v.name), avatar: str(v.avatar) }
    } catch { /* 로그인한 적 없음 */ }
    const token = saved ? await this.secrets.get(TOKEN_KEY) : null
    if (!saved || !token) return
    this.apply(saved, token)
    // 열쇠가 아직 맞는지는 뒤에서 확인한다 (네트워크가 없어도 앱은 바로 켜지게)
    void this.fetchUser(token).then((u) => { if (u) this.save(u, token) }, (e: unknown) => {
      if (e instanceof Unauthorized) void this.logout().then(() => { this.error = t('GitHub 로그인이 풀렸습니다. 다시 로그인해 주세요', 'GitHub sign-in expired. Sign in again'); this.changed() })
    })
  }

  view(): AccountView {
    return {
      github: this.user ? { login: this.user.login, name: this.user.name, avatar: this.user.avatar, email: noreplyEmail(this.user) } : null,
      pending: this.pending ? { userCode: this.pending.userCode, uri: this.pending.uri, expiresAt: new Date(this.pending.expiresAt).toISOString() } : null,
      ...(this.error && { error: this.error }),
    }
  }

  /** 로그인한 계정 (없으면 null) */
  get account(): GithubUser | null { return this.user }
  /** 로그인 열쇠 (다른 모듈이 GitHub API를 부를 때). 없으면 null */
  token(): Promise<string | null> { return this.user ? this.secrets.get(TOKEN_KEY) : Promise.resolve(null) }

  /** 기기 코드 받기: 화면에 코드와 주소를 보이고, 뒤에서 사용자가 승인할 때까지 기다린다 */
  async start(): Promise<AccountView> {
    if (this.pending && this.pending.expiresAt > Date.now()) return this.view()
    const res = await this.f('https://github.com/login/device/code', {
      method: 'POST', headers: { ...UA, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: GITHUB_CLIENT_ID, scope: GITHUB_SCOPE }).toString(), signal: AbortSignal.timeout(20_000),
    }).catch(() => null)
    const body: unknown = res ? await res.json().catch(() => null) : null
    if (!res?.ok || !isRec(body) || !str(body.device_code) || !str(body.user_code)) {
      const why = isRec(body) ? str(body.error_description) || str(body.error) : ''
      throw new WorkbenchError(502, t(`GitHub에서 로그인 코드를 받지 못했습니다${why ? `: ${why}` : ''}. 인터넷 연결을 확인해 주세요`, `Could not get a sign-in code from GitHub${why ? `: ${why}` : ''}. Check the internet connection`))
    }
    const now = Date.now()
    this.error = ''
    this.pending = {
      userCode: str(body.user_code), uri: str(body.verification_uri) || 'https://github.com/login/device', deviceCode: str(body.device_code),
      expiresAt: now + (Number(body.expires_in) || 900) * 1000, interval: Math.max(5, Number(body.interval) || 5), started: now,
    }
    const mine = this.pending
    this.loop = this.poll(mine).catch((e: unknown) => {
      if (this.pending === mine) { this.pending = null; this.error = e instanceof Error ? e.message : String(e); this.changed() }
    })
    return this.view()
  }

  /** 기다리기를 그만둔다 (창을 닫음) */
  cancel(): AccountView { this.pending = null; return this.view() }

  /** 시험이 기다리기가 끝날 때까지 기다린다 */
  settled(): Promise<void> { return this.loop ?? Promise.resolve() }

  private async poll(p: Pending): Promise<void> {
    let interval = p.interval
    while (this.pending === p) {
      await this.sleep(interval * 1000)
      if (this.pending !== p) return
      if (Date.now() > p.expiresAt) throw new Error(t('로그인 코드의 시간이 지났습니다. 다시 눌러 주세요', 'The sign-in code expired. Try again'))
      const res = await this.f('https://github.com/login/oauth/access_token', {
        method: 'POST', headers: { ...UA, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: GITHUB_CLIENT_ID, device_code: p.deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }).toString(),
        signal: AbortSignal.timeout(20_000),
      }).catch(() => null)
      const body: unknown = res ? await res.json().catch(() => null) : null
      if (!isRec(body)) continue // 잠깐 끊김: 다음 차례에 다시
      const token = str(body.access_token)
      if (token) {
        const user = await this.fetchUser(token)
        if (this.pending !== p) return
        await this.secrets.set(TOKEN_KEY, token)
        this.save(user, token)
        this.pending = null
        this.changed()
        return
      }
      const err = str(body.error)
      if (err === 'authorization_pending') continue
      if (err === 'slow_down') { interval = Math.max(interval + 5, Number(body.interval) || 0); continue }
      if (err === 'access_denied') throw new Error(t('GitHub에서 로그인을 거절했습니다', 'Sign-in was declined on GitHub'))
      if (err === 'expired_token') throw new Error(t('로그인 코드의 시간이 지났습니다. 다시 눌러 주세요', 'The sign-in code expired. Try again'))
      throw new Error(t(`GitHub 로그인이 멈췄습니다: ${str(body.error_description) || err}`, `GitHub sign-in stopped: ${str(body.error_description) || err}`))
    }
  }

  private async fetchUser(token: string): Promise<GithubUser> {
    const res = await this.f('https://api.github.com/user', { headers: { ...UA, accept: 'application/vnd.github+json', authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) })
    if (res.status === 401) throw new Unauthorized()
    const u: unknown = await res.json().catch(() => null)
    if (!res.ok || !isRec(u) || typeof u.login !== 'string' || typeof u.id !== 'number') throw new Error(t(`GitHub 계정 정보를 받지 못했습니다 (${res.status})`, `Could not read the GitHub account (${res.status})`))
    return { login: u.login, id: u.id, name: str(u.name), avatar: str(u.avatar_url) }
  }

  private save(u: GithubUser, token: string): void {
    writeAtomic(this.file, `${JSON.stringify({ login: u.login, id: u.id, name: u.name, avatar: u.avatar }, null, 2)}\n`)
    this.apply(u, token)
  }

  /** git에 열쇠를 걸고, git 이름이 비어 대신 쓰던 것이 있으면 GitHub 계정으로 바꾼다 */
  private apply(u: GithubUser, token: string): void {
    this.user = u
    setGithubToken(token)
    if (getFallbackIdentity()) setFallbackIdentity({ name: u.name || u.login, email: noreplyEmail(u) })
  }

  /**
   * 로그인한 계정에 비공개 저장소를 만든다 (README 하나로 시작). 돌려주는 것은 https 주소.
   * 같은 이름이 이미 있으면 409로 알린다 (덮어쓰지 않는다)
   */
  async createPrivateRepo(name: string, description: string): Promise<string> {
    const token = await this.token()
    if (!token) throw new WorkbenchError(400, t('먼저 설정 › 계정에서 GitHub로 로그인해 주세요', 'Sign in with GitHub in Settings › Accounts first'))
    const res = await this.f('https://api.github.com/user/repos', {
      method: 'POST', headers: { ...UA, accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name, private: true, auto_init: true, description }), signal: AbortSignal.timeout(30_000),
    })
    const body: unknown = await res.json().catch(() => null)
    if (res.status === 422) throw new WorkbenchError(409, t(`GitHub에 이미 ${name} 저장소가 있습니다. 다른 이름을 적거나 목록에서 고르세요`, `A repository named ${name} already exists on GitHub. Use another name or pick it from the list`))
    if (!res.ok || !isRec(body) || !str(body.html_url)) throw new WorkbenchError(502, t(`GitHub에 만들지 못했습니다 (${res.status}${isRec(body) && str(body.message) ? `: ${str(body.message)}` : ''})`, `Could not create it on GitHub (${res.status}${isRec(body) && str(body.message) ? `: ${str(body.message)}` : ''})`))
    return str(body.html_url)
  }

  async logout(): Promise<AccountView> {
    this.pending = null
    this.user = null
    this.error = ''
    setGithubToken(null)
    if (getFallbackIdentity()) setFallbackIdentity(this.before)
    await this.secrets.remove(TOKEN_KEY)
    fs.rmSync(this.file, { force: true })
    return this.view()
  }
}

class Unauthorized extends Error {}

/**
 * 예제 모드의 가짜 GitHub: 코드를 받고 한 번 기다린 뒤 example-user로 로그인된다 (바깥에 묻지 않고 화면을 볼 수 있게)
 */
export function sampleGithubFetch(): Fetch {
  let asked = 0
  const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } })
  return async (input, init) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url.endsWith('/login/device/code')) { asked = 0; return json({ device_code: 'sample-device', user_code: 'WDJB-MJHT', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 }) }
    if (url.endsWith('/login/oauth/access_token')) return json(asked++ < 1 ? { error: 'authorization_pending' } : { access_token: 'sample-token', token_type: 'bearer', scope: GITHUB_SCOPE })
    if (url.endsWith('/user')) return json({ login: 'example-user', id: 1000001, name: t('예제 사용자', 'Example User'), avatar_url: '' })
    if (url.endsWith('/user/repos')) {
      const sent: unknown = JSON.parse(typeof init?.body === 'string' ? init.body : '{}')
      const name = isRec(sent) ? str(sent.name) : ''
      return json({ html_url: `https://github.com/example-user/${name}`, private: true }, 201)
    }
    return json({ message: 'Not Found' }, 404)
  }
}
