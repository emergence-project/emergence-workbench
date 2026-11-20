import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import Fastify from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { serveStatic } from './static.js'

let tmp: string
const BIG = 'const answer = 42\n'.repeat(400)
const app = Fastify()

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-static-'))
  const dist = path.join(tmp, 'dist')
  fs.mkdirSync(path.join(dist, 'assets'), { recursive: true })
  fs.writeFileSync(path.join(dist, 'index.html'), '<html>앱</html>')
  fs.writeFileSync(path.join(dist, 'assets/app-abc.js'), 'console.log(1)')
  fs.writeFileSync(path.join(dist, 'manifest.webmanifest'), '{}')
  fs.writeFileSync(path.join(dist, 'assets/big-abc.js'), BIG)
  fs.writeFileSync(path.join(dist, 'assets/pic-abc.png'), BIG)
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

  it('큰 글 파일은 받는 쪽이 받을 수 있을 때만 줄여 보낸다', async () => {
    const plain = await app.inject({ url: '/assets/big-abc.js' })
    expect(plain.headers['content-encoding']).toBeUndefined()
    expect(plain.headers.vary).toBe('accept-encoding')
    expect(plain.body).toBe(BIG)
    const zipped = await app.inject({ url: '/assets/big-abc.js', headers: { 'accept-encoding': 'gzip, deflate, br' } })
    expect(zipped.headers['content-encoding']).toBe('gzip')
    expect(zipped.headers['cache-control']).toContain('immutable')
    expect(zipped.rawPayload.length).toBeLessThan(BIG.length / 4)
    expect(zlib.gunzipSync(zipped.rawPayload).toString()).toBe(BIG)
    expect(zipped.headers['content-length']).toBe(String(zipped.rawPayload.length))
    // 파일이 바뀌면 줄인 것도 다시 만든다
    fs.writeFileSync(path.join(tmp, 'dist/assets/big-abc.js'), BIG + 'changed()\n')
    const again = await app.inject({ url: '/assets/big-abc.js', headers: { 'accept-encoding': 'gzip' } })
    expect(zlib.gunzipSync(again.rawPayload).toString()).toBe(BIG + 'changed()\n')
    // 작은 파일과 그림은 그대로
    expect((await app.inject({ url: '/assets/app-abc.js', headers: { 'accept-encoding': 'gzip' } })).headers['content-encoding']).toBeUndefined()
    expect((await app.inject({ url: '/assets/pic-abc.png', headers: { 'accept-encoding': 'gzip' } })).headers['content-encoding']).toBeUndefined()
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
