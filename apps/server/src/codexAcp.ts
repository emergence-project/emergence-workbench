// Codex 연결부(@agentclientprotocol/codex-acp)를 앱이 받아 둔다 (11/8 사용자 "지금 구현과 이 구현을 비교해서 장점만 취하자").
// 설치 파일로 깐 앱은 연결부를 앱 안(vendor/codex-acp, scripts/bundle-app.mjs)에 품고, 저장소에서 도는 앱(맥)은 `npm i -g`가 있어야 했다.
// 이제 둘 다 「ChatGPT로 연결」 하나로 된다: 받은 codex(codexCli.ts) 옆 설정 폴더 codex-acp/에 같은 판(codexAcp.json, SHA-512)을 풀고
// 앱의 node로 띄운다 (agentKinds.ts의 acpCommand). 판과 SHA-512는 bundle-app.mjs와 이 파일이 codexAcp.json 하나를 함께 읽는다.
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { appFile } from './agentPaths.js'
import { codexBin } from './codexCli.js'
import pin from './codexAcp.json' with { type: 'json' }

export const CODEX_ACP = pin

/** 앱에 든 연결부 (설치 파일로 깐 앱). RW_CODEX_ACP_JS가 먼저 (시험) */
export function bundledAcpJs(): string | undefined {
  const p = process.env.RW_CODEX_ACP_JS ?? appFile('vendor/codex-acp/index.js')
  return fs.existsSync(p) ? p : undefined
}
/** 앱이 받아 둔 연결부 (설정 폴더) */
export const ownAcpJs = (configDir: string): string | undefined => {
  const p = path.join(configDir, 'codex-acp', 'index.js')
  return fs.existsSync(p) ? p : undefined
}
/** 쓸 연결부: 앱에 든 것 → 앱이 받은 것 */
export const codexAcpJs = (configDir: string): string | undefined => bundledAcpJs() ?? ownAcpJs(configDir)

/** 연결부를 받아 설정 폴더에 푼다 (2MB, 의존성까지 묶인 한 파일). 이미 있거나 앱에 들어 있으면 하지 않는다 */
export async function installCodexAcp(configDir: string, fetchFn: typeof fetch = fetch, want: typeof CODEX_ACP = CODEX_ACP): Promise<string> {
  const have = codexAcpJs(configDir)
  if (have) return have
  const res = await fetchFn(want.url, { signal: AbortSignal.timeout(5 * 60_000) })
  if (!res.ok) throw new Error(`Codex 연결부를 받지 못했습니다 (${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (`sha512-${crypto.createHash('sha512').update(buf).digest('base64')}` !== want.integrity) throw new Error('받은 Codex 연결부가 맞지 않습니다(SHA-512)')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-codex-acp-'))
  try {
    fs.writeFileSync(path.join(tmp, 'a.tgz'), buf)
    const r = spawnSync('tar', ['-xzf', 'a.tgz'], { cwd: tmp, encoding: 'utf8', windowsHide: true, timeout: 60_000 })
    if (r.status !== 0) throw new Error(`Codex 연결부를 풀지 못했습니다: ${(r.stderr || r.error?.message || '').slice(0, 300)}`)
    // 새 폴더에 모은 뒤 바꾼다. package.json도 둔다: index.js가 ES 모듈("type": "module")이다
    const dest = path.join(configDir, 'codex-acp')
    const next = `${dest}.new`
    fs.rmSync(next, { recursive: true, force: true })
    fs.mkdirSync(next, { recursive: true })
    fs.copyFileSync(path.join(tmp, 'package/dist/index.js'), path.join(next, 'index.js'))
    for (const f of ['LICENSE', 'package.json']) if (fs.existsSync(path.join(tmp, 'package', f))) fs.copyFileSync(path.join(tmp, 'package', f), path.join(next, f))
    fs.rmSync(dest, { recursive: true, force: true })
    fs.renameSync(next, dest)
    return path.join(dest, 'index.js')
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

/**
 * codex는 있는데 연결부가 없으면 뒤에서 한 번 받는다 (11/8 전에 「ChatGPT로 연결」한 맥, PATH에 codex만 있는 맥).
 * 대화 에이전트 목록을 읽을 때 부른다. 실패하면 다음에 읽을 때 다시
 */
let fetching: Promise<unknown> | null = null
export function ensureCodexAcp(configDir: string, fetchFn: typeof fetch = fetch, want: typeof CODEX_ACP = CODEX_ACP): Promise<unknown> | null {
  if (fetching || codexAcpJs(configDir) || !codexBin(configDir)) return fetching
  fetching = installCodexAcp(configDir, fetchFn, want).catch(() => undefined).finally(() => { fetching = null })
  return fetching
}
