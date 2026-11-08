import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ACP_AGENTS, acpCommand, agentsHere } from './agentKinds.js'
import { CODEX_ACP, ensureCodexAcp, installCodexAcp, ownAcpJs } from './codexAcp.js'

const tmps: string[] = []
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-codex-acp-t-')); tmps.push(d); return d }
const env = { ...process.env }
beforeEach(() => {
  process.env.CODEX_HOME = tmp()
  for (const k of ['RW_CODEX_BIN', 'RW_CODEX_ACP_BIN', 'RW_CODEX_ACP_JS']) delete process.env[k]
  process.env.RW_CODEX_ACP_JS = path.join(tmp(), 'no-vendor.js') // 앱에 든 연결부가 없는 앱 (저장소에서 도는 맥)
})
afterEach(() => { process.env = { ...env }; for (const d of tmps.splice(0)) fs.rmSync(d, { recursive: true, force: true }) })

/** npm 묶음 모양의 가짜 연결부 (package/dist/index.js) */
function fakeTarball() {
  const src = tmp()
  fs.mkdirSync(path.join(src, 'package/dist'), { recursive: true })
  fs.writeFileSync(path.join(src, 'package/dist/index.js'), '// fake codex-acp\n')
  fs.writeFileSync(path.join(src, 'package/package.json'), '{"type":"module","version":"0.0.1"}')
  const tgz = path.join(tmp(), 'acp.tgz')
  execFileSync('tar', ['-czf', tgz, '-C', src, 'package'])
  const data = fs.readFileSync(tgz)
  const want = { version: '0.0.1', url: 'https://example.test/acp.tgz', integrity: `sha512-${crypto.createHash('sha512').update(data).digest('base64')}` }
  const fetchFn = (async (url: string) => url === want.url ? new Response(data) : new Response('', { status: 404 })) as typeof fetch
  return { want, fetchFn }
}

describe('Codex 연결부를 앱이 받기 (저장소에서 도는 앱도 「ChatGPT로 연결」 하나로 대화까지)', () => {
  it('판 정보는 bundle-app.mjs와 같은 파일 하나', () => {
    expect(CODEX_ACP.url).toContain(`codex-acp-${CODEX_ACP.version}.tgz`)
    expect(CODEX_ACP.integrity).toMatch(/^sha512-/)
  })

  it('받아 설정 폴더에 풀고, 대화는 그 연결부를 앱의 node로 띄워 묻기와 같은 codex를 넘긴다', async () => {
    const configDir = tmp()
    const codex = path.join(tmp(), 'codex')
    fs.writeFileSync(codex, '#!/bin/sh\n[ "$1" = "login" ] && exit 0\necho "codex-cli 9.9.9"\n', { mode: 0o755 })
    process.env.RW_CODEX_BIN = codex
    // 받기 전에도 codex가 있으면 고를 수 있다 (연결부는 대화를 열 때 받는다). 깔 명령은 보이지 않는다
    expect(agentsHere(tmp(), configDir).find((a) => a.id === 'codex')).toMatchObject({ installed: true, bundled: true, login: true })

    const { want, fetchFn } = fakeTarball()
    const js = await installCodexAcp(configDir, fetchFn, want)
    expect(js).toBe(ownAcpJs(configDir))
    expect(fs.existsSync(path.join(configDir, 'codex-acp/package.json'))).toBe(true)
    expect(acpCommand(ACP_AGENTS.codex, configDir)).toEqual({ file: process.execPath, args: [js], shell: false, env: { CODEX_PATH: codex }, bundled: true })
    const row = agentsHere(tmp(), configDir).find((a) => a.id === 'codex')!
    expect(row).toMatchObject({ installed: true, bundled: true, login: true })
    expect(row.install).toBeUndefined()
    // 이미 있으면 다시 받지 않는다
    expect(await installCodexAcp(configDir, (async () => { throw new Error('받으면 안 됨') }) as typeof fetch, want)).toBe(js)
  })

  it('맞지 않는 파일은 풀지 않는다', async () => {
    const configDir = tmp()
    const { want } = fakeTarball()
    const bad = (async () => new Response('nope')) as typeof fetch
    await expect(installCodexAcp(configDir, bad, want)).rejects.toThrow(/SHA-512/)
    expect(ownAcpJs(configDir)).toBeUndefined()
  })

  it('codex는 있는데 연결부가 없으면 뒤에서 한 번 받는다', async () => {
    const configDir = tmp()
    const codex = path.join(tmp(), 'codex')
    fs.writeFileSync(codex, '#!/bin/sh\nexit 0\n', { mode: 0o755 })
    process.env.RW_CODEX_BIN = codex
    const { want, fetchFn } = fakeTarball()
    await ensureCodexAcp(configDir, fetchFn, want)
    expect(ownAcpJs(configDir)).toBeTruthy()
    expect(ensureCodexAcp(configDir, fetchFn, want)).toBeNull()
  })
})
