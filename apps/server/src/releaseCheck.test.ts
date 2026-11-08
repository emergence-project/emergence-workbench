import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { newerVersion, pickNew, releaseChecker, RELEASES_API } from './releaseCheck.js'

const rel = (tag: string, extra = {}) => ({
  tag_name: tag, html_url: `https://github.com/x/releases/tag/${tag}`, published_at: '2026-11-10T00:00:00Z',
  assets: [{ name: `Emergence.Workbench_${tag.slice(1)}_x64-setup.exe`, browser_download_url: `https://dl/${tag}.exe` }], ...extra,
})

describe('설치 파일로 깐 앱의 새 버전 알림', () => {
  it('판 번호를 수로 비교하고, 이 OS의 설치 파일을 고른다', () => {
    expect(newerVersion('0.2.10', '0.2.9')).toBe(true)
    expect(newerVersion('v0.2.2', '0.2.2')).toBe(false)
    expect(newerVersion('0.2.1', '0.3.0')).toBe(false)
    expect(pickNew(rel('v0.2.2'), { version: '0.2.1', builtAt: '' }, 'win32')).toEqual({ version: '0.2.2', url: 'https://github.com/x/releases/tag/v0.2.2', download: 'https://dl/v0.2.2.exe' })
    expect(pickNew(rel('v0.2.2'), { version: '0.2.1', builtAt: '' }, 'darwin')?.download).toBeNull()
    expect(pickNew(rel('v0.2.1'), { version: '0.2.1', builtAt: '' }, 'win32')).toBeNull()
    expect(pickNew(rel('v0.3.0', { prerelease: true }), { version: '0.2.1', builtAt: '' }, 'win32')).toBeNull()
    // 번호 없는 시험판: 만든 때보다 하루 넘게 뒤의 릴리스만
    expect(pickNew(rel('v0.2.2'), { builtAt: '2026-11-09T12:00:00Z' }, 'win32')).toBeNull()
    expect(pickNew(rel('v0.2.2'), { builtAt: '2026-11-08T00:00:00Z' }, 'win32')).not.toBeNull()
  })

  it('몇 시간에 한 번만 묻고, 묻지 못하면 알림 없이 지나간다', async () => {
    let calls = 0
    let clock = 0
    let fail = false
    const fetchFn = (async (url: string) => {
      calls++
      expect(url).toBe(RELEASES_API)
      if (fail) throw new Error('offline')
      return Response.json(rel('v0.2.2'))
    }) as typeof fetch
    const check = releaseChecker({ version: '0.2.1', builtAt: '' }, fetchFn, () => clock)
    expect(await check(false)).toBeNull()
    expect(calls).toBe(0)
    expect((await check(true))?.version).toBe('0.2.2')
    expect((await check(true))?.version).toBe('0.2.2')
    expect(calls).toBe(1)
    clock += 7 * 60 * 60_000
    fail = true
    expect((await check(true))?.version).toBe('0.2.2')
    expect(calls).toBe(2)
  })

  it('설치한 앱의 /api/app/status에 새 판이 실린다', async () => {
    const releaseFetch = (async () => Response.json(rel('v9.0.0'))) as typeof fetch
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-release-'))
    const app = buildApp({ configDir, bundled: { commit: 'abc', builtAt: '2026-11-08T00:00:00Z', version: '0.2.2' }, releaseFetch })
    try {
      const r = (await app.inject({ method: 'GET', url: '/api/app/status?fetch=1' })).json()
      expect(r).toMatchObject({ enabled: false, bundled: { version: '0.2.2' }, release: { version: '9.0.0' } })
    } finally { await app.close(); fs.rmSync(configDir, { recursive: true, force: true }) }
  })
})
