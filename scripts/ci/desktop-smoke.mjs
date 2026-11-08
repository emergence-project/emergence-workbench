// 내려받는 앱에 묶은 서버가 그 OS에서 도는지 본다 (윈도우 설치 파일을 만드는 .github/workflows/desktop.yml이 부른다).
//   node scripts/ci/desktop-smoke.mjs [--shots <폴더>] [--chrome <크롬 실행 파일>]
// desktop/standalone/(scripts/bundle-app.mjs가 만든 것)의 Node로 서버를 빈 설정 폴더에서 켜고:
//   1. 첫 화면 · API 안내가 답하는지
//   2. 「새로 만들기」로 프로젝트를 만들면 폴더 · git 저장소 · workbench/가 생기고 목록에 오르는지
//   3. 그 프로젝트의 요약 · 첫 화면이 서버 오류 없이 열리는지
//   4. (--shots) 크롬으로 첫 화면 · 프로젝트 · 설정을 찍고 콘솔 오류가 없는지
// 하나라도 어긋나면 실패한다. 서버 기록은 끝에 보인다.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const standalone = path.join(root, 'desktop/standalone')
const win = process.platform === 'win32'
const node = path.join(standalone, win ? 'node/node.exe' : 'node/bin/node')
const entry = path.join(standalone, 'app/apps/server/dist/server.mjs')
const args = process.argv.slice(2)
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const shots = opt('--shots')
const chrome = opt('--chrome')
const PORT = 5174
const base = `http://127.0.0.1:${PORT}`

for (const f of [node, entry]) if (!fs.existsSync(f)) { console.error(`없음: ${f} (scripts/bundle-app.mjs를 먼저 돌리세요)`); process.exit(1) }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-smoke-'))
const configDir = path.join(tmp, 'config')
const projects = path.join(tmp, 'projects')
fs.mkdirSync(projects, { recursive: true })
let log = ''
// 윈도우: git이 없는 컴퓨터처럼 PATH에 시스템 폴더와 묶은 git(MinGit)만 둔다 (앱이 PATH 맨 뒤에 묶은 git을 두는 것과 같은 결과)
const sys = process.env.SystemRoot ?? 'C:\\Windows'
const env = { ...process.env, RW_STATIC: '1', RW_PORT: String(PORT), RW_CONFIG_DIR: configDir }
if (win) {
  for (const k of Object.keys(env)) if (k.toLowerCase() === 'path') delete env[k]
  env.Path = [path.join(standalone, 'git/cmd'), path.join(sys, 'System32'), sys, path.join(sys, 'System32/WindowsPowerShell/v1.0')].join(';')
}
const server = spawn(node, [entry], {
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
})
server.stdout.on('data', (d) => { log += d })
server.stderr.on('data', (d) => { log += d })

const fails = []
const check = (ok, what) => { console.log(`${ok ? '✓' : '✗'} ${what}`); if (!ok) fails.push(what) }
const headers = { origin: base, 'content-type': 'application/json' }
const get = (url) => fetch(base + url, { headers: { origin: base } })

try {
  // 서버가 답할 때까지 (처음 켤 때 윈도우 디펜더 검사로 느릴 수 있다)
  let up = false
  for (let i = 0; i < 120 && !up; i++) {
    if (server.exitCode !== null) break
    try { up = (await get('/api')).ok } catch { await new Promise((r) => setTimeout(r, 500)) }
  }
  check(up, '서버가 켜져 /api에 답함')
  if (!up) throw new Error('서버가 답하지 않습니다')

  const home = await get('/')
  check(home.ok && (await home.text()).includes('<div id="root"'), '첫 화면(HTML)이 열림')

  const made = await fetch(base + '/api/researches/new', { method: 'POST', headers, body: JSON.stringify({ parent: projects, title: 'Smoke test' }) })
  const item = made.ok ? await made.json() : undefined
  check(made.ok && typeof item?.id === 'string', `「새로 만들기」가 프로젝트를 만듦 (${made.status}${made.ok ? '' : ' ' + await made.text()})`)
  if (item) {
    const dir = item.path
    check(fs.existsSync(path.join(dir, '.git')), `git 저장소로 시작함${win ? ' (묶은 MinGit)' : ''}`)
    check(fs.existsSync(path.join(dir, 'workbench/research.yaml')), 'workbench/research.yaml이 생김')
    const list = await (await get('/api/researches')).json()
    check(Array.isArray(list) ? list.some((r) => r.id === item.id) : JSON.stringify(list).includes(item.id), '프로젝트 목록에 오름')
    for (const url of [`/api/researches/${item.id}`, '/api/agent-overview']) {
      const r = await get(url)
      check(r.status < 500, `${url} → ${r.status}`)
    }
  }

  if (shots) await takeShots(item?.id)
} catch (e) {
  fails.push(String(e?.message ?? e))
} finally {
  server.kill()
  if (fails.length) console.log(`\n--- 서버 기록 ---\n${log.slice(-6000)}`)
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* 윈도우는 방금 끈 프로세스가 파일을 잠깐 쥐고 있다 */ }
}
if (fails.length) { console.error(`\n실패 ${fails.length}개:\n- ${fails.join('\n- ')}`); process.exit(1) }
console.log('\n묶은 서버가 이 OS에서 돕니다.')

/** 크롬으로 주요 화면을 찍는다. 콘솔 오류 · 페이지 오류가 있으면 실패 */
async function takeShots(rid) {
  const { chromium } = await import('playwright-core')
  fs.mkdirSync(shots, { recursive: true })
  const browser = await chromium.launch({ executablePath: chrome, args: ['--lang=ko-KR'] })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' })
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(e.message))
  const screens = [['home', '/'], ['settings', '/#/settings']]
  if (rid) screens.splice(1, 0, ['project', `/#/r/${rid}`])
  for (const [name, url] of screens) {
    await page.goto(base + url, { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)
    await page.screenshot({ path: path.join(shots, `${name}.png`) })
    check(true, `그림: ${name}.png`)
  }
  await browser.close()
  check(errors.length === 0, `화면 콘솔 오류 없음${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`)
}
