/**
 * 비밀 값 보관 (11/8 점검 "비밀 값을 평문 파일에 둡니다"): GitHub 로그인 열쇠처럼 남이 보면 안 되는 값을 OS의 보안 저장소에 둔다.
 * - 맥: 키체인 (`security`). 값은 명령 인자가 아니라 표준 입력(`security -i`)으로 넘겨 다른 프로그램의 ps에 보이지 않게
 * - 윈도우: DPAPI(그 윈도우 사용자만 풀 수 있는 암호화)로 감싼 파일. PowerShell에 값을 표준 입력으로 넘긴다.
 *   공용 PC에서 다른 윈도우 사용자는 파일을 가져가도 풀지 못한다
 * - 그 밖(리눅스 · 시험): 설정 폴더 secrets/의 0600 파일
 * 한 번 읽은 값은 서버가 도는 동안 기억한다(윈도우의 PowerShell은 부를 때마다 느리다).
 */
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { writeAtomic } from './fsutil.js'

export interface SecretStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

/** 키체인 · 파일 이름에 쓰는 앱 이름 */
const SERVICE = 'emergence-workbench'
const KEY_RE = /^[a-z0-9-]{1,40}$/

export type Runner = (file: string, args: string[], input: string) => Promise<string>
const runner: Runner = (file, args, input) => new Promise((resolve, reject) => {
  const p = execFile(file, args, { timeout: 30_000, windowsHide: true, maxBuffer: 1024 * 1024 }, (e, out, err) => (e ? reject(Object.assign(e, { stderr: err })) : resolve(out)))
  p.stdin?.end(input)
})

/** 키체인 명령 한 줄의 따옴표 (security -i는 셸처럼 큰따옴표 안의 \와 "를 \로 막는다) */
const q = (s: string) => `"${s.replace(/[\\"]/g, (c) => `\\${c}`)}"`

function keychain(run: Runner): SecretStore {
  return {
    async get(key) {
      try { return (await run('security', ['find-generic-password', '-s', SERVICE, '-a', key, '-w'], '')).replace(/\n$/, '') || null } catch { return null }
    },
    async set(key, value) {
      if (/[\r\n]/.test(value)) throw new Error('secret has a line break')
      await run('security', ['-i'], `add-generic-password -U -s ${q(SERVICE)} -a ${q(key)} -w ${q(value)}\n`)
    },
    async remove(key) {
      try { await run('security', ['delete-generic-password', '-s', SERVICE, '-a', key], '') } catch { /* 없음 */ }
    },
  }
}

const PS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command']
const PROTECT = "Add-Type -AssemblyName System.Security; $v=[Console]::In.ReadToEnd(); $b=[Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($v),$null,'CurrentUser'); [Convert]::ToBase64String($b)"
const UNPROTECT = "Add-Type -AssemblyName System.Security; $v=[Console]::In.ReadToEnd().Trim(); $b=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($v),$null,'CurrentUser'); [Console]::Out.Write([Convert]::ToBase64String($b))"

function dpapi(dir: string, run: Runner): SecretStore {
  const file = (key: string) => path.join(dir, `${key}.dpapi`)
  return {
    async get(key) {
      let sealed: string
      try { sealed = fs.readFileSync(file(key), 'utf8') } catch { return null }
      try { return Buffer.from((await run('powershell.exe', [...PS, UNPROTECT], sealed)).trim(), 'base64').toString('utf8') || null } catch { return null }
    },
    async set(key, value) {
      const sealed = (await run('powershell.exe', [...PS, PROTECT], value)).trim()
      if (!/^[A-Za-z0-9+/=]+$/.test(sealed)) throw new Error('DPAPI did not return a sealed value')
      writeAtomic(file(key), `${sealed}\n`)
    },
    async remove(key) { fs.rmSync(file(key), { force: true }) },
  }
}

function plainFiles(dir: string): SecretStore {
  const file = (key: string) => path.join(dir, key)
  return {
    async get(key) { try { return fs.readFileSync(file(key), 'utf8').trim() || null } catch { return null } },
    async set(key, value) { writeAtomic(file(key), `${value}\n`, { mode: 0o600 }) },
    async remove(key) { fs.rmSync(file(key), { force: true }) },
  }
}

/** 이 OS의 보관소. 값은 서버가 도는 동안 기억한다 */
export function secretStore(configDir: string, platform: NodeJS.Platform = process.platform, run: Runner = runner): SecretStore {
  const dir = path.join(configDir, 'secrets')
  const base = platform === 'darwin' ? keychain(run) : platform === 'win32' ? dpapi(dir, run) : plainFiles(dir)
  const cache = new Map<string, string | null>()
  const check = (key: string) => { if (!KEY_RE.test(key)) throw new Error(`bad secret key: ${key}`) }
  return {
    async get(key) {
      check(key)
      if (!cache.has(key)) cache.set(key, await base.get(key))
      return cache.get(key) ?? null
    },
    async set(key, value) { check(key); await base.set(key, value); cache.set(key, value) },
    async remove(key) { check(key); await base.remove(key); cache.set(key, null) },
  }
}

/** 시험 · 예제 모드: 메모리에만 */
export function memorySecretStore(): SecretStore {
  const m = new Map<string, string>()
  return {
    async get(key) { return m.get(key) ?? null },
    async set(key, value) { m.set(key, value) },
    async remove(key) { m.delete(key) },
  }
}
