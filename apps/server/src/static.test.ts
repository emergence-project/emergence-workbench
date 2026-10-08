import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Fastify from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { serveStatic } from './static.js'

let tmp: string
const app = Fastify()

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-static-'))
  const dist = path.join(tmp, 'dist')
  fs.mkdirSync(path.join(dist, 'assets'), { recursive: true })
  fs.writeFileSync(path.join(dist, 'index.html'), '<html>앱</html>')
  fs.writeFileSync(path.join(dist, 'assets/app-abc.js'), 'console.log(1)')
  fs.writeFileSync(path.join(dist, 'manifest.webmanifest'), '{}')
  fs.writeFileSync(path.join(tmp, 'secret.txt'), 'secret')
  app.get('/api/ok', async () => ({ ok: true }))
  serveStatic(app, dist)
  await app.ready()
})
afterAll(async () => { await app.close(); fs.rmSync(tmp, { recursive: true, force: true }) })

describe('빌드한 화면 내보내기', () => {
  it('index.html과 해시 붙은 파일을 알맞은 형식과 캐시로 내보낸다', async () => {
    const home = await app.inject({ url: '/' })
    expect(home.headers['content-type']).toContain('text/html')
    expect(home.headers['cache-control']).toBe('no-cache')
    const js = await app.inject({ url: '/assets/app-abc.js' })
    expect(js.headers['content-type']).toContain('javascript')
    expect(js.headers['cache-control']).toContain('immutable')
  })

  it('앱 설치 정보(매니페스트)를 크롬이 알아보는 형식으로 내보낸다', async () => {
    const res = await app.inject({ url: '/manifest.webmanifest' })
    expect(res.headers['content-type']).toBe('application/manifest+json')
  })

  it('화면 안 주소는 index.html로, 없는 API는 404로', async () => {
    expect((await app.inject({ url: '/r/some/research' })).body).toBe('<html>앱</html>')
    expect((await app.inject({ url: '/api/ok' })).json()).toEqual({ ok: true })
    expect((await app.inject({ url: '/api/nope' })).statusCode).toBe(404)
  })

  it('빌드 폴더 밖 파일은 내보내지 않는다', async () => {
    const res = await app.inject({ url: '/../secret.txt' })
    expect(res.body).not.toContain('secret')
    const enc = await app.inject({ url: '/%2e%2e/secret.txt' })
    expect(enc.body).not.toContain('secret')
  })
})
