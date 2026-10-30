import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'

// 저장소 없이 새로 시작 (POST /api/researches/new)
let tmp: string
let app: ReturnType<typeof buildApp>
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-newproj-'))
  app = buildApp({ configDir: path.join(tmp, 'config') })
})
afterAll(async () => {
  await app.close()
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('POST /api/researches/new', () => {
  it('makes the folder, a git repository and workbench/, then registers it', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/researches/new', payload: { title: '그래프 색칠', parent: path.join(tmp, 'projects'), question: '네 색이면 되나?' } })
    expect(res.statusCode).toBe(200)
    const dir = path.join(tmp, 'projects', '그래프-색칠')
    expect(res.json().path).toBe(dir)
    expect(fs.existsSync(path.join(dir, '.git'))).toBe(true)
    expect(fs.readFileSync(path.join(dir, 'workbench', 'research.yaml'), 'utf8')).toContain('그래프 색칠')
    const list = (await app.inject({ method: 'GET', url: '/api/researches' })).json().researches as { path: string }[]
    expect(list.map((r) => r.path)).toContain(dir)
  })

  it('refuses an existing folder and leaves it alone', async () => {
    const dir = path.join(tmp, 'projects', 'kept')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'a.txt'), 'a')
    const res = await app.inject({ method: 'POST', url: '/api/researches/new', payload: { title: 'kept', parent: path.join(tmp, 'projects') } })
    expect(res.statusCode).toBe(409)
    expect(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8')).toBe('a')
  })

  it('removes the folder it just made when registering fails', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/researches/new', payload: { title: 'bad kind', parent: path.join(tmp, 'projects'), kind: 'nope' } })
    expect(res.statusCode).toBe(400)
    expect(fs.existsSync(path.join(tmp, 'projects', 'bad-kind'))).toBe(false)
  })
})
