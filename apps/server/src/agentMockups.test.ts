import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'

describe('시안 (/api/agent-mockups)', () => {
  let tmp: string
  let app: ReturnType<typeof buildApp>
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-mockups-'))
    const configDir = path.join(tmp, 'config')
    const mock = path.join(configDir, 'agent-worktrees', '2026-11-19-abc', 'mockups')
    fs.mkdirSync(mock, { recursive: true })
    fs.writeFileSync(path.join(mock, 'a.png'), 'PNG')
    fs.writeFileSync(path.join(mock, 'a.html'), '<p>hi</p>')
    fs.writeFileSync(path.join(mock, 'notes.md'), 'x')
    fs.writeFileSync(path.join(mock, '.hidden.png'), 'x')
    fs.writeFileSync(path.join(tmp, 'secret.png'), 'SECRET')
    fs.symlinkSync(path.join(tmp, 'secret.png'), path.join(mock, 'out.png'))
    // mockups 폴더 자체가 밖을 가리키는 대화
    fs.mkdirSync(path.join(configDir, 'agent-worktrees', 'linked'), { recursive: true })
    fs.symlinkSync(tmp, path.join(configDir, 'agent-worktrees', 'linked', 'mockups'))
    app = buildApp({ configDir })
  })
  afterAll(async () => {
    await app.close()
    fs.rmSync(tmp, { recursive: true, force: true })
  })
  const get = (url: string) => app.inject({ method: 'GET', url })

  it('그림 · html만 (밖을 가리키는 링크는 빼고) 이름 순으로 보여 주고, 없는 폴더는 빈 목록', async () => {
    expect((await get('/api/agent-mockups/2026-11-19-abc')).json()).toEqual({ files: ['a.html', 'a.png'] })
    expect((await get('/api/agent-mockups/none')).json()).toEqual({ files: [] })
  })
  it('파일을 종류에 맞게 내주고, html은 출처 없는 sandbox로 연다', async () => {
    const png = await get('/api/agent-mockups/2026-11-19-abc/a.png')
    expect(png.statusCode).toBe(200)
    expect(png.headers['content-type']).toContain('image/png')
    expect(png.body).toBe('PNG')
    const html = await get('/api/agent-mockups/2026-11-19-abc/a.html')
    expect(html.headers['content-type']).toContain('text/html')
    expect(html.headers['content-security-policy']).toContain('sandbox')
  })
  it('작업 폴더 밖 · 다른 종류 · 숨은 파일은 막는다', async () => {
    expect((await get('/api/agent-mockups/2026-11-19-abc/out.png')).statusCode).toBe(403)
    expect((await get('/api/agent-mockups/2026-11-19-abc/notes.md')).statusCode).toBe(403)
    expect((await get('/api/agent-mockups/2026-11-19-abc/.hidden.png')).statusCode).toBe(403)
    expect((await get('/api/agent-mockups/2026-11-19-abc/..%2F..%2Fsecret.png')).statusCode).toBe(403)
    expect((await get('/api/agent-mockups/..%2Fx/a.png')).statusCode).toBe(400)
    expect((await get('/api/agent-mockups/linked')).statusCode).toBe(403)
    expect((await get('/api/agent-mockups/2026-11-19-abc/missing.png')).statusCode).toBe(404)
  })
})
