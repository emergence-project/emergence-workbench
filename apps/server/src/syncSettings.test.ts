import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'

// 설정 › 동기화 (10/19 결정): 수동 | 자동과 간격을 config.yaml sync:에 두고 바로 적용한다
const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-sync-'))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe('동기화 설정', () => {
  it('처음에는 앱을 켤 때 정한 값, 바꾸면 그 칸만 저장하고 범위 밖 값은 무시한다', async () => {
    const app = buildApp({ configDir: path.join(tmp, 'a'), researchAutoPullMs: 600_000, recordsAutoPublishMs: 30_000 })
    const get = async () => (await app.inject({ method: 'GET', url: '/api/settings/sync' })).json()
    expect(await get()).toMatchObject({ publish: { mode: 'auto', every: 30 }, pull: { mode: 'auto', every: 600 }, available: { publish: true, pull: true, update: false } })
    const put = (payload: Record<string, unknown>) => app.inject({ method: 'PUT', url: '/api/settings/sync', payload })
    expect((await put({ pull: { every: 900 } })).json().pull).toEqual({ mode: 'auto', every: 900 })
    expect((await put({ publish: { mode: 'manual' } })).json().publish).toEqual({ mode: 'manual', every: 30 })
    expect((await put({ pull: { every: 5 } })).json().pull).toEqual({ mode: 'auto', every: 900 })
    expect((await app.inject({ method: 'GET', url: '/api/researches/x/records/publish' })).statusCode).toBeGreaterThanOrEqual(200)
    const saved = fs.readFileSync(path.join(tmp, 'a', 'config.yaml'), 'utf8')
    expect(saved).toMatch(/sync:/)
    expect(saved).toMatch(/every: 900/)
    await app.close()
  })

  it('저장한 값은 다시 켜도 남는다', async () => {
    const app = buildApp({ configDir: path.join(tmp, 'a'), researchAutoPullMs: 600_000 })
    expect((await app.inject({ method: 'GET', url: '/api/settings/sync' })).json().pull).toEqual({ mode: 'auto', every: 900 })
    await app.close()
  })
})
