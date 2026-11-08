import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { getFallbackIdentity, gitRun, setFallbackIdentity, setGithubToken } from './git.js'
import { GithubAccount, noreplyEmail } from './githubAccount.js'
import { memorySecretStore } from './secretStore.js'

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-account-')) })
afterEach(() => {
  setGithubToken(null)
  setFallbackIdentity(null)
  fs.rmSync(dir, { recursive: true, force: true })
})

const USER = { login: 'friend', id: 42, name: 'Friend', avatar_url: 'https://avatars.example/42' }
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } })

/** 가짜 GitHub: 기기 코드 → 차례대로 polls의 답 → /user. 받은 요청을 적어 둔다 */
function fakeGitHub(polls: unknown[], user: { status: number; body: unknown } = { status: 200, body: USER }) {
  const asked: Array<{ url: string; body: string; auth: string }> = []
  let i = 0
  const f: typeof fetch = async (input, init) => {
    const url = String(input)
    const headers = new Headers(init?.headers)
    asked.push({ url, body: typeof init?.body === 'string' ? init.body : '', auth: headers.get('authorization') ?? '' })
    if (url.endsWith('/login/device/code')) return json({ device_code: 'dev-1', user_code: 'ABCD-1234', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 })
    if (url.endsWith('/login/oauth/access_token')) return json(polls[Math.min(i++, polls.length - 1)])
    if (url.endsWith('/user')) return json(user.body, user.status)
    if (url.endsWith('/user/repos')) {
      const name: unknown = JSON.parse(typeof init?.body === 'string' ? init.body : '{}').name
      return name === 'taken' ? json({ message: 'Validation Failed' }, 422) : json({ html_url: `https://github.com/friend/${String(name)}` }, 201)
    }
    return json({}, 404)
  }
  return { f, asked }
}

/** 기다리는 시간을 적기만 하고 바로 돌아온다 */
function instant() {
  const waits: number[] = []
  return { waits, sleep: async (ms: number) => { waits.push(ms) } }
}

const header = () => gitRun(['config', '--get', 'http.https://github.com/.extraheader']).then((s) => s.trim(), () => null)

describe('GithubAccount', () => {
  it('signs in with the device code, keeps the key only in the secret store and hands it to git', async () => {
    const secrets = memorySecretStore()
    const { f, asked } = fakeGitHub([{ error: 'authorization_pending' }, { access_token: 'gho_friend', token_type: 'bearer' }])
    const { sleep, waits } = instant()
    let changed = 0
    setFallbackIdentity({ name: 'pc-user', email: 'pc-user@this-pc' })
    const account = new GithubAccount(dir, secrets, f, () => { changed++ }, sleep)
    const first = await account.start()
    expect(first.pending).toMatchObject({ userCode: 'ABCD-1234', uri: 'https://github.com/login/device' })
    expect(asked[0]!.body).toContain('client_id=Ov23liIXuLtjdKQKBXh3')
    expect(asked[0]!.body).toContain('scope=repo')
    // 다시 눌러도 새 코드를 받지 않는다
    expect((await account.start()).pending?.userCode).toBe('ABCD-1234')
    await account.settled()
    expect(waits).toEqual([5000, 5000])
    expect(changed).toBe(1)
    expect(account.view()).toEqual({ github: { login: 'friend', name: 'Friend', avatar: 'https://avatars.example/42', email: '42+friend@users.noreply.github.com' }, pending: null })
    expect(await secrets.get('github-token')).toBe('gho_friend')
    expect(await account.token()).toBe('gho_friend')
    const saved = fs.readFileSync(path.join(dir, 'account.json'), 'utf8')
    expect(saved).toContain('"login": "friend"')
    expect(saved).not.toContain('gho_friend')
    // 이 서버가 부르는 git은 github.com에 그 열쇠로 붙는다 (git 설정 파일은 그대로)
    expect(await header()).toBe(`AUTHORIZATION: basic ${Buffer.from('x-access-token:gho_friend').toString('base64')}`)
    // git 이름이 비어 대신 쓰던 것은 GitHub 계정으로
    expect(getFallbackIdentity()).toEqual({ name: 'Friend', email: noreplyEmail({ login: 'friend', id: 42 }) })

    await account.logout()
    expect(account.view()).toEqual({ github: null, pending: null })
    expect(await secrets.get('github-token')).toBeNull()
    expect(fs.existsSync(path.join(dir, 'account.json'))).toBe(false)
    expect(await header()).toBeNull()
    expect(getFallbackIdentity()).toEqual({ name: 'pc-user', email: 'pc-user@this-pc' })
  })

  it('leaves a git name the user set alone', async () => {
    const { f } = fakeGitHub([{ access_token: 'gho_friend' }])
    const account = new GithubAccount(dir, memorySecretStore(), f, () => undefined, instant().sleep)
    await account.start()
    await account.settled()
    expect(getFallbackIdentity()).toBeNull()
  })

  it('waits longer when GitHub says slow_down', async () => {
    const { f } = fakeGitHub([{ error: 'slow_down', interval: 12 }, { error: 'authorization_pending' }, { access_token: 'gho_friend' }])
    const { sleep, waits } = instant()
    const account = new GithubAccount(dir, memorySecretStore(), f, () => undefined, sleep)
    await account.start()
    await account.settled()
    expect(waits).toEqual([5000, 12000, 12000])
    expect(account.account?.login).toBe('friend')
  })

  it('shows why when the sign-in is declined, and keeps nothing', async () => {
    const secrets = memorySecretStore()
    const { f } = fakeGitHub([{ error: 'access_denied' }])
    const account = new GithubAccount(dir, secrets, f, () => undefined, instant().sleep)
    await account.start()
    await account.settled()
    const v = account.view()
    expect(v.github).toBeNull()
    expect(v.pending).toBeNull()
    expect(v.error).toContain('거절')
    expect(await secrets.get('github-token')).toBeNull()
  })

  it('stops waiting when cancelled', async () => {
    const { f, asked } = fakeGitHub([{ access_token: 'gho_friend' }])
    let account: GithubAccount | null = null
    account = new GithubAccount(dir, memorySecretStore(), f, () => undefined, async () => { account!.cancel() })
    await account.start()
    await account.settled()
    expect(account.view()).toEqual({ github: null, pending: null })
    expect(asked.some((a) => a.url.endsWith('/access_token'))).toBe(false)
  })

  it('restores the sign-in on start, and signs out if the key was revoked on GitHub', async () => {
    const secrets = memorySecretStore()
    await secrets.set('github-token', 'gho_old')
    fs.writeFileSync(path.join(dir, 'account.json'), JSON.stringify({ login: 'friend', id: 42, name: 'Friend', avatar: '' }))
    const ok = new GithubAccount(dir, secrets, fakeGitHub([]).f, () => undefined, instant().sleep)
    await ok.load()
    expect(ok.account?.login).toBe('friend')
    expect(await header()).toContain('basic ')

    let changed = 0
    const revoked = new GithubAccount(dir, secrets, fakeGitHub([], { status: 401, body: { message: 'Bad credentials' } }).f, () => { changed++ }, instant().sleep)
    await revoked.load()
    await expect.poll(() => changed).toBe(1)
    expect(revoked.view().github).toBeNull()
    expect(revoked.view().error).toContain('다시 로그인')
    expect(await secrets.get('github-token')).toBeNull()
    expect(await header()).toBeNull()
  })

  it('creates a private repository on the signed-in account', async () => {
    const { f, asked } = fakeGitHub([{ access_token: 'gho_friend' }])
    const account = new GithubAccount(dir, memorySecretStore(), f, () => undefined, instant().sleep)
    await expect(account.createPrivateRepo('home', 'd')).rejects.toMatchObject({ status: 400 })
    await account.start()
    await account.settled()
    expect(await account.createPrivateRepo('home', 'Emergence Workbench')).toBe('https://github.com/friend/home')
    const made = asked.find((a) => a.url.endsWith('/user/repos'))!
    expect(JSON.parse(made.body)).toEqual({ name: 'home', private: true, auto_init: true, description: 'Emergence Workbench' })
    expect(made.auth).toBe('Bearer gho_friend')
    await expect(account.createPrivateRepo('taken', 'd')).rejects.toMatchObject({ status: 409 })
  })
})

describe('/api/account', () => {
  it('signs in from the settings screen and creates the personal repository with that key', async () => {
    const { f } = fakeGitHub([{ access_token: 'gho_friend' }])
    const account = new GithubAccount(path.join(dir, 'config'), memorySecretStore(), f, () => undefined, instant().sleep)
    const app = buildApp({ configDir: path.join(dir, 'config'), account })
    try {
      expect((await app.inject({ method: 'GET', url: '/api/account' })).json()).toEqual({ github: null, pending: null, sync: null })
      const started = await app.inject({ method: 'POST', url: '/api/account/login' })
      expect(started.statusCode).toBe(200)
      expect(started.json().pending.userCode).toBe('ABCD-1234')
      await account.settled()
      expect((await app.inject({ method: 'GET', url: '/api/account' })).json().github.login).toBe('friend')
      const made = await app.inject({ method: 'POST', url: '/api/setup/personal/create', payload: { name: 'workbench-home' } })
      expect(made.statusCode).toBe(200)
      expect(made.json().personal.remote).toBe('https://github.com/friend/workbench-home')
      const out = await app.inject({ method: 'POST', url: '/api/account/logout' })
      expect(out.json()).toEqual({ github: null, pending: null, sync: null })
    } finally {
      await app.close()
    }
  })

  it('reports a GitHub outage as 502 with a plain reason', async () => {
    const down: typeof fetch = async () => { throw new Error('offline') }
    const account = new GithubAccount(path.join(dir, 'config'), memorySecretStore(), down, () => undefined, instant().sleep)
    const app = buildApp({ configDir: path.join(dir, 'config'), account })
    try {
      const res = await app.inject({ method: 'POST', url: '/api/account/login' })
      expect(res.statusCode).toBe(502)
      expect(res.json().error).toContain('인터넷')
    } finally {
      await app.close()
    }
  })
})
