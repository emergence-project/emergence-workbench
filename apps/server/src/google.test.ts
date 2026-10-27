import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { Google, mockGoogleFetch, toEvent } from './google.js'
import { localDate } from './fsutil.js'
import { publicRemote } from './routes/google.js'
import { mergeGoogleAuthor } from './googleProfile.js'

// 진짜 구글 코드 경로(로그인 주소, 토큰 교환, 달력, 드라이브)를 가짜 fetch로 돈다
let tmp: string
let app: ReturnType<typeof buildApp>
let fake: ReturnType<typeof mockGoogleFetch>
const host = { host: '127.0.0.1:8130' }

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-google-'))
  fake = mockGoogleFetch()
  const configDir = path.join(tmp, 'config')
  app = buildApp({ configDir, google: new Google(configDir, fake) })
})
afterAll(async () => { await app.close(); fs.rmSync(tmp, { recursive: true, force: true }) })

async function connect() {
  const go = await app.inject({ url: '/api/google/connect?return=/%23/', headers: host })
  expect(go.statusCode).toBe(302)
  const url = new URL(go.headers.location as string)
  const state = url.searchParams.get('state')!
  const back = await app.inject({ url: `/api/google/callback?code=abc&state=${state}`, headers: host })
  expect(back.statusCode).toBe(302)
  expect(back.headers.location).toBe('/#/')
}

describe('구글 연결', () => {
  it('클라이언트 ID가 없으면 연결하지 않는다', async () => {
    expect((await app.inject({ url: '/api/google' })).json()).toMatchObject({ configured: false, connected: false })
    expect((await app.inject({ url: '/api/google/connect', headers: host })).statusCode).toBe(409)
  })

  it('클라이언트 ID 모양을 확인하고, 비밀번호는 화면에 돌려주지 않는다', async () => {
    expect((await app.inject({ method: 'PUT', url: '/api/google/client', payload: { clientId: 'nope', clientSecret: 'x'.repeat(20) } })).statusCode).toBe(400)
    const res = await app.inject({ method: 'PUT', url: '/api/google/client', payload: { clientId: '123-abc.apps.googleusercontent.com', clientSecret: 'GOCSPX-secret-value' } })
    expect(res.statusCode).toBe(200)
    expect(JSON.stringify(res.json())).not.toContain('GOCSPX')
    expect((fs.statSync(path.join(tmp, 'config/google.yaml')).mode & 0o777)).toBe(0o600)
  })

  it('이 컴퓨터 밖의 주소로는 로그인을 시작하지 않는다 (주소 확인이 먼저 막는다)', async () => {
    expect((await app.inject({ url: '/api/google/connect', headers: { host: 'evil.example.com' } })).statusCode).toBe(403)
  })

  it('구글 로그인 주소에 PKCE와 읽기 권한을 담는다', async () => {
    const go = await app.inject({ url: '/api/google/connect', headers: host })
    const url = new URL(go.headers.location as string)
    expect(url.origin).toBe('https://accounts.google.com')
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:8130/api/google/callback')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('scope')).toContain('calendar.readonly')
    expect(url.searchParams.get('scope')).not.toMatch(/calendar(\s|$)|auth\/drive(\s|$)/)
  })

  it('모르는 state로 돌아오면 거절한다', async () => {
    const res = await app.inject({ url: '/api/google/callback?code=abc&state=zzz', headers: host })
    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('다시 연결')
  })

  it('로그인 뒤 돌아갈 주소는 이 앱 안의 경로만 받는다 (/\\evil.com 같은 바깥 주소는 설정으로)', async () => {
    for (const [ret, expected] of [['/%5Cevil.com', '/#/settings'], ['//evil.com', '/#/settings'], ['/%23/home', '/#/home']] as const) {
      const go = await app.inject({ url: `/api/google/connect?return=${ret}`, headers: host })
      const state = new URL(go.headers.location as string).searchParams.get('state')!
      const back = await app.inject({ url: `/api/google/callback?code=abc&state=${state}`, headers: host })
      expect(back.headers.location).toBe(expected)
    }
  })

  it('구글에 올리는 원격 주소에서 로그인 정보(토큰)를 뺀다', () => {
    expect(publicRemote('https://someone:ghp_secret@github.com/someone/alpha.git')).toBe('https://github.com/someone/alpha.git')
    expect(publicRemote('https://user:tok@gitlab.example.com/a/b.git')).toBe('https://gitlab.example.com/a/b.git')
    expect(publicRemote('git@github.com:someone/alpha.git')).toBe('https://github.com/someone/alpha.git')
    expect(publicRemote('')).toBeNull()
  })

  it('연결하면 이메일과 이번 주 일정을 보여 준다', async () => {
    await connect()
    expect((await app.inject({ url: '/api/google' })).json()).toMatchObject({ connected: true, email: 'researcher@example.com', synced: false })
    const now = new Date()
    // 한 일 달력의 주는 일요일에 시작한다 (10/5 피드백)
    const sun = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
    const mon = new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + 1)
    const sat = new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + 6)
    const res = await app.inject({ url: `/api/google/events?from=${localDate(sun)}&to=${localDate(sat)}` })
    const { events } = res.json() as { events: { title: string; date: string; endDate: string; time?: string }[] }
    expect(events.map((e) => e.title)).toEqual(['그룹 미팅', '겨울 학교', '세미나: 그래프 마이너', '지도교수 면담', '학회 초록 마감'])
    expect(events[0]).toMatchObject({ date: localDate(mon), time: '10:00' })
    expect(events[1]!.endDate > events[1]!.date).toBe(true)
    const allDay = events[4]!
    expect(allDay.time).toBeUndefined()
    expect(allDay.endDate).toBe(allDay.date)
  })

  it('자정에 끝나는 일정은 다음 날에 걸치지 않고, 여러 날 종일 일정은 마지막 날까지 간다', () => {
    const late = toEvent({ id: 'a', summary: '늦은 회의', start: { dateTime: '2026-10-26T23:00:00' }, end: { dateTime: '2026-10-27T00:00:00' } }, '기본')!
    expect(late).toMatchObject({ date: '2026-10-26', endDate: '2026-10-26', time: '23:00', endTime: '00:00' })
    const trip = toEvent({ id: 'b', summary: '학회', start: { date: '2026-10-26' }, end: { date: '2026-10-29' } }, '기본')!
    expect(trip).toMatchObject({ date: '2026-10-26', endDate: '2026-10-28' })
  })

  it('로그인하면 구글 계정의 이름 · 이메일 · 사진으로 저자와 네트워킹 내 페이지를 채운다', async () => {
    const st = (await app.inject({ url: '/api/google' })).json()
    expect(st).toMatchObject({ name: 'Ada Researcher', filled: { items: ['name', 'email', 'photo'] } })
    const { people } = (await app.inject({ url: '/api/network' })).json() as { people: { id: string; name: string; author: boolean; email?: string; photo?: number }[] }
    expect(people.find((p) => p.id === 'ada-researcher')).toMatchObject({ author: true, email: 'researcher@example.com', photo: expect.any(Number) })
    // 다시 로그인해도 같은 사람을 또 더하지 않고, 이미 채운 것은 그대로
    await connect()
    expect(((await app.inject({ url: '/api/network' })).json() as { people: unknown[] }).people).toHaveLength(people.length)
  })

  it('구글 정보는 빈 칸만 채우고 사용자가 적은 값은 바꾸지 않는다', () => {
    const typed = [{ name: 'Ada Researcher', email: 'ada@uni.example', affiliations: ['Example University'] }, { name: 'Ben Collaborator', affiliations: [] }]
    // 이메일이 같은 저자가 있으면 아무것도 바꾸지 않는다 (이름이 달라도)
    expect(mergeGoogleAuthor(typed, { name: 'A. Researcher', email: 'ADA@uni.example' })).toMatchObject({ authors: typed, items: [] })
    // 이름이 같으면 이메일만 더한다 (적어 둔 이메일은 첫째로 남김)
    const r = mergeGoogleAuthor(typed, { name: 'Ada Researcher', email: 'ada@gmail.example' })
    expect(r.authors[0]).toEqual({ name: 'Ada Researcher', email: 'ada@uni.example', emails: ['ada@gmail.example'], affiliations: ['Example University'] })
    // 없으면 맨 앞에, 소속은 빈 채로
    const n = mergeGoogleAuthor(typed, { name: 'Cy New', email: 'cy@gmail.example' })
    expect(n.authors.map((a) => a.name)).toEqual(['Cy New', 'Ada Researcher', 'Ben Collaborator'])
    expect(n.authors[0]).toEqual({ name: 'Cy New', email: 'cy@gmail.example', affiliations: [] })
    // 이름을 받지 못하면 (profile 권한 전에 연결한 경우) 더하지 않는다
    expect(mergeGoogleAuthor(typed, { email: 'cy@gmail.example' }).items).toEqual([])
  })

  it('처음에는 저절로 올리지 않고, 올리거나 불러온 뒤부터 올린다', async () => {
    await app.inject({ method: 'PUT', url: '/api/settings', payload: { ui: { theme: 'dark' } } })
    expect(fake.files.size).toBe(0)
    const push = await app.inject({ method: 'POST', url: '/api/google/sync/push' })
    expect(push.statusCode).toBe(200)
    const saved = JSON.parse([...fake.files.values()][0]!)
    expect(saved).toMatchObject({ version: 1, ui: { theme: 'dark' }, researches: [] })
    expect((await app.inject({ url: '/api/google' })).json().synced).toBe(true)
  })

  it('다른 컴퓨터의 설정을 불러오면 화면 설정을 되살리고 없는 프로젝트를 알려 준다', async () => {
    const id = [...fake.files.keys()][0]!
    fake.files.set(id, JSON.stringify({
      version: 1, savedAt: '2026-10-03T00:00:00Z', machine: 'example-mac', ui: { theme: 'light', fontSize: 'large' },
      researches: [{ id: 'alpha', title: 'Alpha project', tags: ['연구'], remote: 'https://github.com/someone/alpha.git', folder: 'alpha' }],
    }))
    const cmp = (await app.inject({ url: '/api/google/sync' })).json()
    expect(cmp.missing.map((r: { id: string }) => r.id)).toEqual(['alpha'])
    const res = await app.inject({ method: 'POST', url: '/api/google/sync/restore' })
    expect(res.json()).toMatchObject({ ok: true, restored: 0 })
    expect((await app.inject({ url: '/api/settings' })).json().ui).toMatchObject({ theme: 'light', fontSize: 'large' })
  })

  it('연결을 끊으면 토큰을 지운다', async () => {
    await app.inject({ method: 'POST', url: '/api/google/disconnect' })
    expect(fs.existsSync(path.join(tmp, 'config/google-token.json'))).toBe(false)
    expect((await app.inject({ url: '/api/google/events?from=2026-10-01&to=2026-10-07' })).json()).toEqual({ connected: false, events: [] })
  })
})

describe('만료된 구글 로그인 (10/20 점검)', () => {
  it('새로 받기를 구글이 거절하면 만료로 적고, 달력은 502 대신 expired를, 그 뒤로는 구글에 묻지 않는다', async () => {
    const configDir = path.join(tmp, 'expired-config')
    fs.mkdirSync(configDir, { recursive: true })
    let tokenCalls = 0
    const g = new Google(configDir, (async (url: string | URL | Request) => {
      if (String(url).includes('oauth2.googleapis.com/token')) { tokenCalls++; return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }), { status: 400 }) }
      return new Response('{}', { status: 500 })
    }) as typeof fetch)
    g.setClient('123-abc.apps.googleusercontent.com', 'secret-123456')
    fs.writeFileSync(path.join(configDir, 'google-token.json'), JSON.stringify({ access_token: 'old', refresh_token: 'r', expires_at: 1, email: 'me@example.com' }))
    const a = buildApp({ configDir, google: g })
    try {
      const ev = await a.inject({ url: '/api/google/events?from=2026-10-01&to=2026-10-07' })
      expect(ev.statusCode).toBe(200)
      expect(ev.json()).toEqual({ connected: true, expired: true, events: [] })
      expect((await a.inject({ url: '/api/google' })).json()).toMatchObject({ connected: true, expired: true })
      await a.inject({ url: '/api/google/events?from=2026-10-01&to=2026-10-07' })
      expect(tokenCalls).toBe(1)
    } finally { await a.close() }
  })
})
