// workbench/가 git에 없을 때의 안내와 「커밋하고 올리기」 (routes/sync.ts, 10/30 "워크벤치 폴더를 만들자")
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'

let tmp: string
beforeAll(() => { tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-wbup-')) })
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

const g = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()

function setup(name: string) {
  const remote = path.join(tmp, `${name}.git`)
  const mac = path.join(tmp, `${name}-mac`)
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
  execFileSync('git', ['clone', '-q', remote, mac], { stdio: 'ignore' })
  g(mac, 'config', 'user.name', 't'); g(mac, 'config', 'user.email', 't@t')
  fs.writeFileSync(path.join(mac, 'paper.tex'), 'v1\n')
  g(mac, 'add', '.'); g(mac, 'commit', '-qm', 'init'); g(mac, 'push', '-q', '-u', 'origin', 'main')
  return { remote, mac }
}

describe('workbench/ 올리기', () => {
  it('등록으로 만든 workbench/는 git에 없다고 알리고, 올리면 workbench/ 안만 커밋해 GitHub에 둔다', async () => {
    const { remote, mac } = setup('up')
    const app = buildApp({ configDir: path.join(tmp, 'up-config') })
    try {
      const id = (await app.inject({ method: 'POST', url: '/api/researches', payload: { path: mac, createWorkbench: true } })).json().id
      const repo = async () => (await app.inject({ method: 'GET', url: `/api/researches/${id}/repo` })).json().repo
      expect(await repo()).toMatchObject({ state: 'ok', workbenchUnpublished: true })
      fs.writeFileSync(path.join(mac, 'paper.tex'), 'editing\n') // workbench/ 밖의 고치는 중인 파일
      fs.writeFileSync(path.join(mac, 'workbench', 'STATUS.md'), '# 자동 요약\n')
      const r = await app.inject({ method: 'POST', url: `/api/researches/${id}/repo/workbench` })
      expect(r.statusCode).toBe(200)
      expect(r.json()).toMatchObject({ pushed: true })
      const files = g(remote, 'ls-tree', '-r', '--name-only', 'main').split('\n')
      expect(files).toContain('workbench/research.yaml')
      expect(files).not.toContain('workbench/STATUS.md')
      expect(g(remote, 'show', 'main:workbench/.gitignore').split('\n')).toEqual(expect.arrayContaining(['.build/', 'STATUS.md']))
      expect(g(remote, 'show', 'main:paper.tex')).toBe('v1')
      expect(g(mac, 'status', '--porcelain')).toBe('M paper.tex')
      expect((await repo()).workbenchUnpublished).toBeUndefined()
    } finally { await app.close() }
  })

  it('예전 .gitignore에 STATUS.md를 더해 올린다', async () => {
    const { remote, mac } = setup('old')
    const app = buildApp({ configDir: path.join(tmp, 'old-config') })
    try {
      const id = (await app.inject({ method: 'POST', url: '/api/researches', payload: { path: mac, createWorkbench: true } })).json().id
      fs.writeFileSync(path.join(mac, 'workbench', '.gitignore'), '.build/')
      expect((await app.inject({ method: 'POST', url: `/api/researches/${id}/repo/workbench` })).statusCode).toBe(200)
      expect(g(remote, 'show', 'main:workbench/.gitignore')).toBe('.build/\nSTATUS.md')
    } finally { await app.close() }
  })
})
