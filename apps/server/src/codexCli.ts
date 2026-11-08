// ChatGPT 계정으로 질문에 답하기 (11/8 사용자 "친구가 chatgpt를 유료로 쓴다", "앱에서 간단히 고를 수만 있으면"):
// OpenAI의 Codex CLI는 ChatGPT 계정(Plus 이상)으로 로그인하면 API 크레딧 없이 그 요금제의 사용량을 쓴다.
// 친구 컴퓨터에는 Node · npm이 없으므로 앱이 npm 저장소에서 이 컴퓨터용 Codex 실행 파일 묶음(@openai/codex의 플랫폼판)을 받아
// 앱 설정 폴더 codex/에 풀고(SHA-512를 맞춘다), `codex login`(브라우저가 열린다)과 `codex exec`(읽기 전용)를 그 파일로 부른다.
// 이미 깐 codex(맥의 npm 전역 등)가 PATH에 있으면 그것을 쓴다. RW_CODEX_BIN이 먼저 (시험은 가짜를 넣는다).
import { spawn, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { t } from './i18n.js'
import { WorkbenchError } from './workbench.js'

export const REGISTRY = 'https://registry.npmjs.org/@openai/codex'
const TIMEOUT_MS = 6 * 60_000
const LOGIN_TIMEOUT_MS = 10 * 60_000

const TRIPLES: Record<string, string> = {
  'win32-x64': 'x86_64-pc-windows-msvc', 'win32-arm64': 'aarch64-pc-windows-msvc',
  'darwin-x64': 'x86_64-apple-darwin', 'darwin-arm64': 'aarch64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-musl', 'linux-arm64': 'aarch64-unknown-linux-musl',
}
const platformKey = () => `${process.platform}-${process.arch}`
/** 이 컴퓨터의 Codex 묶음 안 폴더 이름 (vendor/<이것>/bin/codex) */
export const codexTriple = () => TRIPLES[platformKey()]
const exe = (name: string) => process.platform === 'win32' ? `${name}.exe` : name

const ownDir = (configDir: string) => path.join(configDir, 'codex')
/** 앱이 받아 둔 codex 실행 파일 */
export function ownCodexBin(configDir: string): string | undefined {
  const triple = TRIPLES[platformKey()]
  if (!triple) return undefined
  const p = path.join(ownDir(configDir), 'package', 'vendor', triple, 'bin', exe('codex'))
  return fs.existsSync(p) ? p : undefined
}

const runnable = (p: string) => { try { fs.accessSync(p, fs.constants.X_OK); return fs.statSync(p).isFile() } catch { return false } }

/** 맥의 ChatGPT 앱 안에 든 codex (routes/setup.ts의 BUNDLED_CODEX와 같은 곳) */
const CHATGPT_APP_CODEX = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex'

/** 쓸 codex: RW_CODEX_BIN → 앱이 받은 것 → PATH의 codex → 맥 ChatGPT 앱 안의 codex (윈도우의 npm 껍데기 codex.cmd는 셸이 있어야 해서 쓰지 않는다) */
export function codexBin(configDir: string): string | undefined {
  if (process.env.RW_CODEX_BIN) return process.env.RW_CODEX_BIN
  const own = ownCodexBin(configDir)
  if (own) return own
  const home = os.homedir()
  const dirs = [...(process.env.PATH ?? '').split(path.delimiter), path.join(home, '.npm-global/bin'), '/opt/homebrew/bin', '/usr/local/bin'].filter(Boolean)
  return [...dirs.map((d) => path.join(d, exe('codex'))), ...(process.platform === 'darwin' ? [CHATGPT_APP_CODEX] : [])].find(runnable)
}

/** ChatGPT로 로그인했나: CODEX_HOME(기본 ~/.codex)의 auth.json, 없으면 `codex login status`(키체인에 둔 경우). 5초 동안 기억한다 */
let loginSeen: { bin: string; at: number; ok: boolean } | null = null
export function codexLoggedIn(bin?: string): boolean {
  if (fs.existsSync(path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'auth.json'))) return true
  if (!bin) return false
  if (loginSeen?.bin === bin && Date.now() - loginSeen.at < 5_000) return loginSeen.ok
  const ok = spawnSync(bin, ['login', 'status'], { timeout: 10_000, windowsHide: true, stdio: 'ignore' }).status === 0
  loginSeen = { bin, at: Date.now(), ok }
  return ok
}

const versions = new Map<string, string | undefined>()
function versionOf(bin: string): string | undefined {
  if (versions.has(bin)) return versions.get(bin)
  const r = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 10_000, windowsHide: true })
  const v = r.status === 0 ? (r.stdout || '').trim().split('\n')[0]?.slice(0, 60) : undefined
  versions.set(bin, v)
  return v
}

/** 받기 · 로그인 진행 상태 (앱이 도는 동안만, 한 컴퓨터에 하나) */
interface Busy { step: 'install' | 'login'; received: number; total: number }
let busy: Busy | null = null
let lastError: string | null = null

export interface CodexStatus { installed: boolean; version: string | null; login: boolean; busy: Busy | null; error: string | null }
export function codexStatus(configDir: string): CodexStatus {
  const bin = busy?.step === 'install' ? undefined : codexBin(configDir)
  return { installed: !!bin, version: bin ? versionOf(bin) ?? null : null, login: busy?.step === 'login' ? false : codexLoggedIn(bin), busy, error: lastError }
}

interface Dist { tarball: string; integrity: string }
async function platformDist(fetchFn: typeof fetch): Promise<{ version: string; dist: Dist }> {
  const key = platformKey()
  if (!TRIPLES[key]) throw new WorkbenchError(400, t(`이 컴퓨터(${key})용 Codex가 없습니다`, `There is no Codex build for this computer (${key})`))
  const meta = async (v: string): Promise<{ version?: string; dist?: Partial<Dist> }> => {
    const r = await fetchFn(`${REGISTRY}/${v}`, { signal: AbortSignal.timeout(30_000) })
    if (!r.ok) throw new WorkbenchError(502, t(`Codex 정보를 받지 못했습니다 (${r.status})`, `Could not fetch Codex info (${r.status})`))
    return r.json()
  }
  const latest = await meta('latest')
  if (!latest.version) throw new WorkbenchError(502, t('Codex 정보가 비어 있습니다', 'Codex info is empty'))
  const own = await meta(`${latest.version}-${key}`)
  if (!own.dist?.tarball || !own.dist.integrity?.startsWith('sha512-')) throw new WorkbenchError(502, t('Codex 파일 정보가 없습니다', 'Codex file info is missing'))
  return { version: latest.version, dist: { tarball: own.dist.tarball, integrity: own.dist.integrity } }
}

/** 이 컴퓨터용 Codex를 받아 앱 설정 폴더에 푼다 (약 180MB, 풀면 음성 파일을 빼고 400MB 남짓). 끝나면 실행 파일 경로 */
export async function installCodex(configDir: string, fetchFn: typeof fetch = fetch): Promise<string> {
  if (busy) throw new WorkbenchError(409, t('Codex를 받거나 로그인하는 중입니다', 'Codex is already being installed or signed in'))
  busy = { step: 'install', received: 0, total: 0 }
  lastError = null
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-codex-'))
  try {
    const { dist } = await platformDist(fetchFn)
    const res = await fetchFn(dist.tarball, { signal: AbortSignal.timeout(30 * 60_000) })
    if (!res.ok || !res.body) throw new WorkbenchError(502, t(`Codex를 받지 못했습니다 (${res.status})`, `Could not download Codex (${res.status})`))
    busy.total = Number(res.headers.get('content-length')) || 0
    const file = path.join(tmp, 'codex.tgz')
    const hash = crypto.createHash('sha512')
    const b = busy
    const body = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream<Uint8Array>)
    body.on('data', (c: Buffer) => { hash.update(c); b.received += c.length })
    await pipeline(body, fs.createWriteStream(file))
    if (`sha512-${hash.digest('base64')}` !== dist.integrity) throw new WorkbenchError(502, t('받은 Codex 파일이 맞지 않습니다(SHA-512). 다시 받아 주세요', 'The downloaded Codex file did not match (SHA-512). Try again'))
    // 새 폴더에 푼 뒤 바꾼다: 도중에 끊겨도 쓰던 것이 남는다
    const next = `${ownDir(configDir)}.new`
    fs.rmSync(next, { recursive: true, force: true })
    fs.mkdirSync(next, { recursive: true })
    // 윈도우 10부터 tar.exe(bsdtar)가 들어 있다. 음성 기능 파일은 쓰지 않는다
    const r = spawnSync('tar', ['-xzf', file, '-C', next, '--exclude', '*/voice/*'], { encoding: 'utf8', windowsHide: true, timeout: 10 * 60_000 })
    if (r.status !== 0) throw new WorkbenchError(500, t(`Codex 파일을 풀지 못했습니다: ${(r.stderr || r.error?.message || '').slice(0, 300)}`, `Could not unpack Codex: ${(r.stderr || r.error?.message || '').slice(0, 300)}`))
    fs.rmSync(ownDir(configDir), { recursive: true, force: true })
    fs.renameSync(next, ownDir(configDir))
    versions.clear()
    const bin = ownCodexBin(configDir)
    if (!bin) throw new WorkbenchError(500, t('풀었지만 codex 실행 파일이 없습니다', 'Unpacked, but the codex executable is missing'))
    if (process.platform !== 'win32') fs.chmodSync(bin, 0o755)
    return bin
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e)
    throw e
  } finally {
    busy = null
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

/** `codex login`: 브라우저에서 ChatGPT 계정으로 로그인하면 끝난다 (10분 안에) */
export function loginCodex(configDir: string): Promise<void> {
  const bin = codexBin(configDir)
  if (!bin) return Promise.reject(new WorkbenchError(409, t('Codex를 먼저 받아 주세요', 'Install Codex first')))
  if (busy) return Promise.reject(new WorkbenchError(409, t('Codex를 받거나 로그인하는 중입니다', 'Codex is already being installed or signed in')))
  busy = { step: 'login', received: 0, total: 0 }
  lastError = null
  return new Promise<void>((resolve, reject) => {
    const p = spawn(bin, ['login'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let err = ''
    p.stderr.on('data', (d: Buffer) => { err += d.toString() })
    p.stdout.resume()
    const timer = setTimeout(() => p.kill(), LOGIN_TIMEOUT_MS)
    const done = (e?: Error) => { clearTimeout(timer); busy = null; if (e) { lastError = e.message; reject(e) } else resolve() }
    p.on('error', (e) => done(new WorkbenchError(500, t(`codex를 실행하지 못했습니다: ${e.message}`, `Could not run codex: ${e.message}`))))
    p.on('close', (code) => { loginSeen = null; return code === 0 ? done()
      : done(new WorkbenchError(502, t(`ChatGPT 로그인이 끝나지 않았습니다${err.trim() ? `: ${err.trim().slice(-300)}` : ''}`, `ChatGPT sign-in did not finish${err.trim() ? `: ${err.trim().slice(-300)}` : ''}`))) })
  })
}

/** PDF는 글을 뽑아 질문에 붙인다 (친구 컴퓨터에는 PDF를 읽을 도구가 없다). 글은 앞 40만 자까지 */
export async function fileText(file: string): Promise<string> {
  const MAX = 400_000
  if (!/\.pdf$/i.test(file)) return fs.readFileSync(file, 'utf8').slice(0, MAX)
  const { extractText, getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(file)))
  const { text } = await extractText(pdf, { mergePages: false })
  return text.map((p, i) => `[${t(`${i + 1}쪽`, `page ${i + 1}`)}]\n${p}`).join('\n\n').slice(0, MAX)
}

/** `codex exec`로 답 하나: 읽기 전용 샌드박스, 마지막 답만 파일로 받는다 */
export async function codexAsk(configDir: string, cwd: string, prompt: string, file?: string): Promise<string> {
  const bin = codexBin(configDir)
  if (!bin) throw new WorkbenchError(503, t('Codex가 없습니다. 설정 › 에이전트 › AI 키에서 ChatGPT로 다시 연결해 주세요', 'Codex is missing. Connect ChatGPT again in Settings › Agents › AI key'))
  if (!process.env.RW_CODEX_BIN && !codexLoggedIn(bin)) throw new WorkbenchError(401, t('ChatGPT 로그인이 필요합니다. 설정 › 에이전트 › AI 키에서 ChatGPT로 연결해 주세요', 'ChatGPT sign-in is needed. Connect ChatGPT in Settings › Agents › AI key'))
  let full = prompt
  if (file && fs.existsSync(file)) {
    const text = await fileText(file).catch(() => '')
    if (text.trim()) full = `${prompt}\n\n${t(`(위 파일 ${path.basename(file)}의 글을 아래에 붙였습니다. PDF를 열 도구가 없어도 이것을 읽고 답하세요.)`, `(The text of ${path.basename(file)} is attached below. Read it and answer even if you have no tool to open the PDF.)`)}\n--- ${path.basename(file)} ---\n${text}\n--- end ---`
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-codex-ask-'))
  const out = path.join(tmp, 'answer.md')
  try {
    return await new Promise<string>((resolve, reject) => {
      const p = spawn(bin, ['exec', '--skip-git-repo-check', '--ephemeral', '--sandbox', 'read-only', '--color', 'never', '--cd', cwd, '--output-last-message', out, '-'], { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
      let err = ''
      p.stdout.resume()
      p.stderr.on('data', (d: Buffer) => { err = (err + d.toString()).slice(-4000) })
      const timer = setTimeout(() => { p.kill(); reject(new WorkbenchError(504, t(`ChatGPT가 ${TIMEOUT_MS / 60_000}분 안에 답하지 못했습니다`, `ChatGPT did not answer within ${TIMEOUT_MS / 60_000} minutes`))) }, TIMEOUT_MS)
      p.on('error', (e) => { clearTimeout(timer); reject(new WorkbenchError(500, t(`codex를 실행하지 못했습니다: ${e.message}`, `Could not run codex: ${e.message}`))) })
      p.on('close', (code) => {
        clearTimeout(timer)
        const answer = fs.existsSync(out) ? fs.readFileSync(out, 'utf8').trim() : ''
        if (code === 0 && answer) return resolve(answer)
        if (/401|unauthori[sz]ed|log ?in/i.test(err)) return reject(new WorkbenchError(401, t('ChatGPT 로그인이 풀렸습니다. 설정 › 에이전트 › AI 키에서 다시 연결해 주세요', 'The ChatGPT sign-in expired. Connect again in Settings › Agents › AI key')))
        if (/usage limit|rate limit|429/i.test(err)) return reject(new WorkbenchError(429, t('ChatGPT 요금제의 사용 한도에 걸렸습니다. 나중에 다시 해 주세요', 'The ChatGPT plan usage limit was hit. Try again later')))
        reject(new WorkbenchError(502, t(`ChatGPT가 답하지 못했습니다${err.trim() ? `: ${err.trim().slice(-300)}` : ` (종료 코드 ${code})`}`, `ChatGPT could not answer${err.trim() ? `: ${err.trim().slice(-300)}` : ` (exit code ${code})`}`)))
      })
      p.stdin.end(full)
    })
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}
