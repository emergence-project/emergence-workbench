import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { Google, mockGoogleFetch } from './google.js'
import { localDate } from './fsutil.js'

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
    expect(events.map((e) => e.title)).toEqual(['그룹 미팅', '세미나: 그래프 마이너', '지도교수 면담', '학회 초록 마감'])
    expect(events[0]).toMatchObject({ date: localDate(mon), time: '10:00' })
    const allDay = events[3]!
    expect(allDay.time).toBeUndefined()
    expect(allDay.endDate).toBe(allDay.date)
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
      version: 1, savedAt: '2026-10-03T00:00:00Z', machine: 'david', ui: { theme: 'light', fontSize: 'large' },
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
