import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { memorySecretStore, secretStore, type Runner } from './secretStore.js'

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-secret-')) })
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

/** 부른 명령을 적어 두는 가짜 실행기 */
function recorder(answer: (file: string, args: string[], input: string) => string) {
  const calls: Array<{ file: string; args: string[]; input: string }> = []
  const run: Runner = async (file, args, input) => { calls.push({ file, args, input }); return answer(file, args, input) }
  return { run, calls }
}

describe('secretStore', () => {
  it('keeps the value in the macOS keychain, passing it on stdin and never as an argument', async () => {
    let saved = ''
    const { run, calls } = recorder((_f, args, input) => {
      if (args[0] === '-i') { saved = input; return '' }
      if (args[0] === 'find-generic-password') return 'tok-"\\1\n'
      return ''
    })
    const store = secretStore(dir, 'darwin', run)
    await store.set('github-token', 'tok-"\\1')
    expect(saved).toBe('add-generic-password -U -s "emergence-workbench" -a "github-token" -w "tok-\\"\\\\1"\n')
    expect(calls.every((c) => !c.args.join(' ').includes('tok-'))).toBe(true)
    // 쓴 값은 기억해서 키체인을 다시 부르지 않는다
    expect(await store.get('github-token')).toBe('tok-"\\1')
    expect(calls.filter((c) => c.args[0] === 'find-generic-password')).toHaveLength(0)
    // 새로 켠 서버는 키체인에서 읽는다
    expect(await secretStore(dir, 'darwin', run).get('github-token')).toBe('tok-"\\1')
    await store.remove('github-token')
    expect(calls.at(-1)?.args.slice(0, 1)).toEqual(['delete-generic-password'])
    expect(await store.get('github-token')).toBeNull()
    await expect(store.set('github-token', 'a\nb')).rejects.toThrow('line break')
    expect(fs.existsSync(path.join(dir, 'secrets'))).toBe(false)
  })

  it('answers null when the keychain has nothing', async () => {
    const { run } = recorder(() => { throw new Error('not found') })
    expect(await secretStore(dir, 'darwin', run).get('github-token')).toBeNull()
  })

  it('seals the value with DPAPI on Windows and never writes it in plain text', async () => {
    // 가짜 DPAPI: 봉인 = 'sealed:'를 붙여 base64, 풀기 = 떼어 내 base64
    const { run, calls } = recorder((file, args, input) => {
      expect(file).toBe('powershell.exe')
      const script = args.at(-1)!
      if (script.includes('::Protect(')) return Buffer.from(`sealed:${input}`).toString('base64') + '\r\n'
      const opened = Buffer.from(input.trim(), 'base64').toString('utf8')
      return Buffer.from(opened.replace(/^sealed:/, '')).toString('base64')
    })
    const store = secretStore(dir, 'win32', run)
    await store.set('github-token', 'gho_secret')
    const file = path.join(dir, 'secrets', 'github-token.dpapi')
    expect(fs.readFileSync(file, 'utf8')).not.toContain('gho_secret')
    expect(calls[0]!.input).toBe('gho_secret')
    expect(calls[0]!.args.join(' ')).not.toContain('gho_secret')
    expect(await secretStore(dir, 'win32', run).get('github-token')).toBe('gho_secret')
    await store.remove('github-token')
    expect(fs.existsSync(file)).toBe(false)
    expect(await secretStore(dir, 'win32', run).get('github-token')).toBeNull()
  })

  it('refuses to save what DPAPI did not seal', async () => {
    const { run } = recorder(() => 'Exception: something went wrong')
    await expect(secretStore(dir, 'win32', run).set('github-token', 'x')).rejects.toThrow('DPAPI')
    expect(fs.existsSync(path.join(dir, 'secrets', 'github-token.dpapi'))).toBe(false)
  })

  it.skipIf(process.platform === 'win32')('uses an owner-only file elsewhere', async () => {
    const store = secretStore(dir, 'linux')
    await store.set('github-token', 'abc')
    const file = path.join(dir, 'secrets', 'github-token')
    expect(fs.statSync(file).mode & 0o777).toBe(0o600)
    expect(await secretStore(dir, 'linux').get('github-token')).toBe('abc')
  })

  it('rejects key names that could leave the folder', async () => {
    const store = secretStore(dir, 'linux')
    await expect(store.get('../x')).rejects.toThrow('bad secret key')
    await expect(store.set('A B', 'v')).rejects.toThrow('bad secret key')
  })

  it('memory store for tests and the sample mode', async () => {
    const m = memorySecretStore()
    await m.set('k', 'v')
    expect(await m.get('k')).toBe('v')
    await m.remove('k')
    expect(await m.get('k')).toBeNull()
  })
})
