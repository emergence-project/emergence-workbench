import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { readAiKey } from './aiKey.js'
import { questionRunner } from './ask.js'
import { codexAsk, codexStatus, codexTriple, installCodex, ownCodexBin, REGISTRY } from './codexCli.js'

const tmps: string[] = []
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-codex-')); tmps.push(d); return d }
const env = { ...process.env }
beforeEach(() => { process.env.CODEX_HOME = tmp(); delete process.env.RW_CODEX_BIN })
afterEach(() => { process.env = { ...env }; for (const d of tmps.splice(0)) fs.rmSync(d, { recursive: true, force: true }) })

/** 가짜 codex: --version, login status(0), exec(stdin을 받아 --output-last-message 파일에 답) */
function fakeCodex(): string {
  const bin = path.join(tmp(), 'codex')
  fs.writeFileSync(bin, `#!/bin/sh
if [ "$1" = "--version" ]; then echo "codex-cli 9.9.9"; exit 0; fi
if [ "$1" = "login" ]; then exit 0; fi
out=""; prev=""
for a in "$@"; do [ "$prev" = "--output-last-message" ] && out="$a"; prev="$a"; done
input=$(cat)
case "$input" in *"Kempe"*) echo "PDF 글을 읽고 답함" > "$out";; *) echo "글 없이 답함" > "$out";; esac
`, { mode: 0o755 })
  return bin
}

describe.skipIf(process.platform === 'win32')('ChatGPT로 답하기 (Codex)', () => {
  it('이 컴퓨터용 Codex 묶음을 받아 SHA-512를 맞추고 음성 파일은 빼고 푼다', async () => {
    const triple = codexTriple()!
    const src = tmp()
    const binDir = path.join(src, 'package/vendor', triple, 'bin')
    fs.mkdirSync(binDir, { recursive: true })
    fs.copyFileSync(fakeCodex(), path.join(binDir, 'codex'))
    fs.mkdirSync(path.join(src, 'package/vendor', triple, 'codex-resources/voice'), { recursive: true })
    fs.writeFileSync(path.join(src, 'package/vendor', triple, 'codex-resources/voice/big.bin'), 'x')
    const tgz = path.join(tmp(), 'codex.tgz')
    execFileSync('tar', ['-czf', tgz, '-C', src, 'package'])
    const data = fs.readFileSync(tgz)
    const integrity = `sha512-${crypto.createHash('sha512').update(data).digest('base64')}`
    const key = `${process.platform}-${process.arch}`
    const seen: string[] = []
    const fetchFn = (async (url: string) => {
      seen.push(url)
      if (url === `${REGISTRY}/latest`) return Response.json({ version: '9.9.9' })
      if (url === `${REGISTRY}/9.9.9-${key}`) return Response.json({ dist: { tarball: 'https://example.test/codex.tgz', integrity } })
      if (url === 'https://example.test/codex.tgz') return new Response(data, { headers: { 'content-length': String(data.length) } })
      return new Response('', { status: 404 })
    }) as typeof fetch
    const configDir = tmp()
    const bin = await installCodex(configDir, fetchFn)
    expect(bin).toBe(ownCodexBin(configDir))
    expect(fs.existsSync(path.join(configDir, 'codex/package/vendor', triple, 'codex-resources/voice/big.bin'))).toBe(false)
    expect(codexStatus(configDir)).toMatchObject({ installed: true, version: 'codex-cli 9.9.9', busy: null, error: null })

    // 맞지 않는 파일은 버리고 쓰던 것을 그대로 둔다
    const bad = (async (url: string) => url === 'https://example.test/codex.tgz' ? new Response('nope') : fetchFn(url)) as typeof fetch
    await expect(installCodex(configDir, bad)).rejects.toThrow(/SHA-512/)
    expect(ownCodexBin(configDir)).toBe(bin)
    expect(codexStatus(configDir).error).toMatch(/SHA-512/)
  })

  it('codex exec에 PDF의 글을 붙여 묻고 마지막 답을 받는다', async () => {
    process.env.RW_CODEX_BIN = fakeCodex()
    const pdf = path.resolve('../../fixtures/sandbox-papers/pdf/doeStructurePlanar2004.pdf')
    const cwd = tmp()
    expect(await codexAsk(tmp(), cwd, '이 논문의 결론은?', pdf)).toBe('PDF 글을 읽고 답함')
    expect(await codexAsk(tmp(), cwd, '그냥 질문')).toBe('글 없이 답함')
  })

  it('Codex를 받고 로그인해야 ChatGPT를 고를 수 있고, 고르면 질문이 Codex로 간다', async () => {
    const configDir = tmp()
    const app = buildApp({ configDir })
    try {
      process.env.PATH = '/nonexistent'
      expect((await app.inject({ method: 'PUT', url: '/api/settings/ai-key', payload: { provider: 'chatgpt' } })).statusCode).toBe(409)
      expect((await app.inject({ method: 'PUT', url: '/api/settings/ai-key', payload: { provider: 'chatgpt', key: 'abcdefghij' } })).statusCode).toBe(400)
      process.env.RW_CODEX_BIN = fakeCodex()
      expect((await app.inject({ method: 'GET', url: '/api/settings/codex' })).json()).toMatchObject({ installed: true, login: true })
      const put = await app.inject({ method: 'PUT', url: '/api/settings/ai-key', payload: { provider: 'chatgpt' } })
      expect(put.json()).toEqual({ key: { provider: 'chatgpt', model: 'Codex', hint: '' } })
      expect(readAiKey(configDir)).toEqual({ provider: 'chatgpt', key: '' })
      expect(await questionRunner(configDir)({ cwd: tmp(), prompt: '질문' })).toBe('글 없이 답함')
    } finally { await app.close() }
  })
})
