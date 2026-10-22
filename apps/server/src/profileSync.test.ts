import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { adoptOtherProfiles } from './profileSync.js'
import { Registry } from './registry.js'

// 10/22 09:44: 맥북에서 완료로 바꾼 프로젝트가 맥미니에서 진행으로 남았다. 컴퓨터 사이에 진행 상태 · 띠 · 색을 맞춘다
const REMOTE = 'https://github.com/someone/gamc.git'
const tmps: string[] = []
afterEach(() => { for (const d of tmps.splice(0)) fs.rmSync(d, { recursive: true, force: true }) })

function setup(mine: Record<string, unknown>, theirs: Record<string, unknown>[]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-profile-'))
  tmps.push(root)
  const config = path.join(root, 'config')
  fs.mkdirSync(config)
  fs.writeFileSync(path.join(config, 'config.yaml'), YAML.stringify({ researches: [{ id: 'gamc', path: path.join(root, 'gamc'), kind: 'research', fields: ['Bootstrap'], ...mine }] }))
  const personal = path.join(root, 'personal')
  fs.mkdirSync(path.join(personal, '_settings', 'MacBook'), { recursive: true })
  fs.writeFileSync(path.join(personal, '_settings', 'MacBook', 'projects.yaml'), YAML.stringify(theirs.map((t) => ({ id: 'gamc', title: 'GAMC', remote: REMOTE, folder: 'gamc', tags: [], ...t }))))
  const registry = new Registry(config)
  const deps = { remoteOf: async () => REMOTE, sameRepo: (a: string | null, b: string | null) => a === b, machine: 'Macmini' }
  return { registry, run: () => adoptOtherProfiles(registry, personal, deps) }
}

describe('컴퓨터 사이 프로젝트 설정 맞추기', () => {
  it('다른 컴퓨터에서 더 늦게 고친 진행 상태 · 띠 · 색을 따른다', async () => {
    const { registry, run } = setup({ profileAt: '2026-10-21T10:00:00.000Z' }, [
      { state: 'done', profile: { kind: 'research', fields: ['Bootstrap'], state: 'done', rail: true, color: 'teal' }, profileAt: '2026-10-22T00:00:00.000Z' },
    ])
    expect(await run()).toEqual(['gamc'])
    const r = registry.list()[0]!
    expect([r.state, r.rail, r.color]).toEqual(['done', true, 'teal'])
    expect(registry.sharedProfile('gamc')?.profileAt).toBe('2026-10-22T00:00:00.000Z')
    expect(await run()).toEqual([])
  })

  it('이 컴퓨터에서 더 늦게 고쳤으면 그대로 둔다', async () => {
    const { registry, run } = setup({ state: 'paused', profileAt: '2026-10-22T05:00:00.000Z' }, [
      { profile: { kind: 'research', fields: [], state: 'done', rail: false }, profileAt: '2026-10-22T00:00:00.000Z' },
    ])
    expect(await run()).toEqual([])
    expect(registry.list()[0]!.state).toBe('paused')
  })

  it('고친 때가 없는 예전 기록끼리는 멈춤 · 완료를 따른다 (진행은 기본값)', async () => {
    const { registry, run } = setup({}, [{ state: 'done' }])
    expect(await run()).toEqual(['gamc'])
    expect(registry.list()[0]!.state).toBe('done')
    expect(registry.list()[0]!.fields).toEqual(['Bootstrap'])
  })

  it('앱에서 고치면 고친 때를 적는다', () => {
    const { registry } = setup({}, [])
    registry.setProfile('gamc', { state: 'paused' })
    expect(Date.parse(registry.sharedProfile('gamc')!.profileAt!)).toBeGreaterThan(Date.now() - 60_000)
  })
})
