import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { isPluginOn, SERVER_PLUGINS, type ServerPlugin } from './plugins/index.js'

// 설정 › 기능 (11/27 사용자 결정 "실험 기능을 플러그인으로, 컴퓨터마다"): 설치 상태는 이 컴퓨터의 config.yaml plugins:에만
const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-plugins-'))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

const text = { ko: '가', en: 'a' }
const plugins: ServerPlugin[] = [
  { manifest: { id: 'group-room', name: text, summary: text, stage: 'experiment', rule: 'group-room', installedByDefault: true } },
  { manifest: { id: 'debate', name: text, summary: text, stage: 'experiment', installedByDefault: true, requires: ['group-room'], keeps: ['workbench/problems/'] } },
]

describe('내장 플러그인 API', () => {
  it('뼈대 단계에서는 등록된 플러그인이 없다', async () => {
    expect(SERVER_PLUGINS).toEqual([])
    const app = buildApp({ configDir: path.join(tmp, 'empty') })
    expect((await app.inject({ method: 'GET', url: '/api/plugins' })).json()).toEqual({ plugins: [] })
    await app.close()
  })

  it('제거 · 설치를 저장하고 다시 켜도 남으며, 쓰는 것이 있으면 막는다', async () => {
    const dir = path.join(tmp, 'a')
    let app = buildApp({ configDir: dir, plugins })
    const get = async () => (await app.inject({ method: 'GET', url: '/api/plugins' })).json()
    const put = (id: string, installed: unknown) => app.inject({ method: 'PUT', url: `/api/plugins/${id}`, payload: { installed } })
    expect((await get()).plugins.map((p: { id: string; installed: boolean; requiredBy: string[] }) => [p.id, p.installed, p.requiredBy])).toEqual([['group-room', true, ['debate']], ['debate', true, []]])
    expect((await put('group-room', false)).statusCode).toBe(409)
    expect((await put('nope', false)).statusCode).toBe(404)
    expect((await put('debate', 'no')).statusCode).toBe(400)
    const off = (await put('debate', false)).json()
    expect(off.plugins[1]).toMatchObject({ id: 'debate', installed: false, keeps: ['workbench/problems/'] })
    expect(off.plugins[1].at).toMatch(/^\d{4}-/)
    expect(fs.readFileSync(path.join(dir, 'config.yaml'), 'utf8')).toMatch(/plugins:\n {2}debate:\n {4}installed: false/)
    await app.close()

    app = buildApp({ configDir: dir, plugins })
    expect((await get()).plugins[1].installed).toBe(false)
    expect((await put('group-room', false)).statusCode).toBe(200)
    const on = (await put('debate', true)).json()
    expect(on.plugins.map((p: { installed: boolean }) => p.installed)).toEqual([true, true])
    await app.close()
  })

  it('isPluginOn: 모르는 id는 꺼짐', () => {
    expect(isPluginOn(plugins, {}, 'debate')).toBe(true)
    expect(isPluginOn(plugins, { debate: { installed: false, at: '2026-11-27T00:00:00Z' } }, 'debate')).toBe(false)
    expect(isPluginOn(plugins, {}, 'nope')).toBe(false)
  })
})
