// 릴리스 관문 (docs/release-contract.md): 사람이 받을 파일 그대로를 CI의 새 기계에서 검사한다. .github/workflows/desktop.yml이 부른다.
//   node scripts/ci/release-gate.mjs --dmg <파일.dmg> | --app <…app> | --dir <윈도우 설치 폴더>
//        [--version 0.3.3] [--arch arm64|x64] [--require-trusted] [--launch] [--out gate.json]
// 검사 (번호는 계약의 절):
//   1. 판 번호: build.json과 앱 정보(맥 Info.plist, 윈도우 실행 파일 정보)가 --version과 같은지 (계약 2). --version이 없으면 시험판으로 적기만 한다
//   2. 만든 기계의 경로가 묶음의 글 파일에 없는지: 이 기계의 집 폴더와 저장소 폴더 (계약 1)
//   2-1. (맥, --arch) 칩: 묶은 Node · 네이티브 부품 · 창 실행 파일이 모두 그 칩용인지 (x64 dmg에 arm64 부품이 들면 인텔 맥에서 서버가 뜨지 못한다)
//   3. 서명: 맥은 묶음 서명이 온전한지(codesign --verify --deep --strict)를 늘 보고, 공증 · 스테이플이 됐는지를 trusted로 적는다.
//      --require-trusted면 trusted가 아닐 때 실패한다. 윈도우는 Authenticode 서명 여부를 적기만 한다 (계약 3)
//   4. (--launch) 묶은 서버를 빈 집 폴더로 켜 보는 desktop-smoke.mjs를 그 묶음에 돌린다.
//      맥에서 trusted면 내려받은 것처럼 격리 표시(com.apple.quarantine)를 붙인 사본으로 돌린다 (계약 1 · 7).
//      이 기계가 그 칩을 돌릴 수 없을 때(arm64 기계에 Rosetta가 없는 x64)만 건너뛰고, 그 밖의 실패는 모두 관문 실패다
// 결과를 표로 알리고(GitHub이면 작업 요약에도) --out에 JSON으로 남긴다. 릴리스 작업은 trusted가 아닌 맥 묶음을 붙이지 않는다.
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const APP_NAME = 'Emergence Workbench.app'

/** "0.3.3.0"과 "0.3.3"은 같은 판이다 (윈도우 실행 파일 정보는 네 자리) */
export function sameVersion(a, b) {
  if (!a || !b) return false
  const parts = (v) => String(v).trim().replace(/^v/, '').split('.')
  const [x, y] = [parts(a), parts(b)]
  while (x.length > 3 && x.at(-1) === '0') x.pop()
  while (y.length > 3 && y.at(-1) === '0') y.pop()
  return x.join('.') === y.join('.')
}

/** 묶음 안에서 사람이 읽는 파일만 (실행 파일 · 네이티브 부품은 그 부품을 만든 쪽의 경로를 담을 수 있어 빼다) */
const TEXT = /\.(m?js|cjs|json|html|css|md|txt|yaml|yml|tex|cls|sty|bib|plist|svg)$/i

/** 만든 기계의 경로가 들어 있는 파일: needles(집 폴더 · 저장소 폴더)를 / · \ · \\ 모양 모두로 찾는다 */
export function findLeaks(dir, needles) {
  const forms = [...new Set(needles.filter((n) => n && n.length > 3).flatMap((n) => [n, n.replace(/\\/g, '/'), n.replace(/\\/g, '\\\\'), n.replace(/\//g, '\\')]))]
  const hits = []
  if (!fs.existsSync(dir)) return hits
  for (const e of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!e.isFile() || !TEXT.test(e.name)) continue
    const file = path.join(e.parentPath, e.name)
    if (fs.statSync(file).size > 64 * 2 ** 20) continue
    const text = fs.readFileSync(file, 'latin1')
    const found = forms.find((f) => text.includes(f))
    if (found) hits.push({ file: path.relative(dir, file), found })
  }
  return hits
}

/** codesign -dv · spctl · stapler의 출력에서 맥이 이 앱을 믿는지 */
export function macTrust({ details, assess, assessOk, stapled }) {
  const authority = details.match(/^Authority=(.+)$/m)?.[1] ?? null
  const team = details.match(/^TeamIdentifier=(.+)$/m)?.[1] ?? null
  const developerId = !!authority?.startsWith('Developer ID Application') && !!team && team !== 'not set'
  const notarized = assessOk && /source=Notarized Developer ID/.test(assess)
  return { signedBy: developerId ? authority : /Signature=adhoc/.test(details) ? 'ad-hoc' : authority ?? 'none', developerId, notarized, stapled, trusted: developerId && notarized && stapled }
}

/** lipo가 쓰는 칩 이름 */
export const LIPO_ARCH = { arm64: 'arm64', x64: 'x86_64' }

/** 이 기계가 그 칩의 실행 파일을 돌릴 수 있는지: 같은 칩이거나, arm64 기계에서 x86_64를 Rosetta로 */
export function hostCanRun(host, archs, rosetta) {
  const list = archs.split(/\s+/).filter(Boolean)
  return list.includes(host) || (host === 'arm64' && list.includes('x86_64') && rosetta)
}

/** 묶음의 실행 파일들이 모두 원하는 칩을 담는지. 어긋난 파일 목록 (빈 목록이면 맞음) */
export function chipMismatches(expected, files) {
  return files.filter((f) => !f.archs.split(/\s+/).includes(expected)).map((f) => `${f.file} (${f.archs || '알 수 없음'})`)
}

/** 관문 판정: 단단한(hard) 검사가 하나라도 어긋나면 실패. 무른 검사는 적기만 한다 */
export const gatePasses = (checks) => checks.every((c) => c.ok || !c.hard)

const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts })

async function main() {
  const args = process.argv.slice(2)
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
  const want = opt('--version')
  const requireTrusted = args.includes('--require-trusted')
  const launch = args.includes('--launch')
  const arch = opt('--arch')
  if (arch && !(arch in LIPO_ARCH)) { console.error(`모르는 --arch: ${arch} (arm64 또는 x64)`); process.exit(2) }
  const outFile = opt('--out')
  const given = ['--dmg', '--app', '--dir'].filter((o) => opt(o))
  if (given.length !== 1) { console.error('사용법: release-gate.mjs --dmg <파일> | --app <앱> | --dir <설치 폴더> [--version x.y.z] [--require-trusted] [--launch] [--out gate.json]'); process.exit(2) }

  const checks = []
  /** hard: 어긋나면 관문 실패. soft: 적기만 한다 */
  const check = (name, ok, detail, hard = true) => { checks.push({ name, ok, detail, hard }); console.log(`${ok ? '✓' : hard ? '✗' : '·'} ${name}: ${detail}`) }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-gate-'))
  const cleanups = [() => fs.rmSync(tmp, { recursive: true, force: true })]
  const dmg = opt('--dmg')
  let app = opt('--app') ?? ''
  const dir = opt('--dir') ?? ''
  const mac = !dir
  let trust = null

  try {
    // 0. dmg면 사람처럼 열어 앱을 꺼낸다 (만든 자리의 앱이 아니라 dmg 안의 앱을 본다)
    if (dmg) {
      const mnt = path.join(tmp, 'mnt')
      fs.mkdirSync(mnt)
      const attach = run('hdiutil', ['attach', '-nobrowse', '-readonly', '-mountpoint', mnt, dmg])
      if (attach.status !== 0) throw new Error(`dmg를 열지 못했습니다: ${(attach.stderr || attach.stdout).trim()}`)
      try {
        check('dmg 안에 Applications 바로가기', fs.existsSync(path.join(mnt, 'Applications')), fs.existsSync(path.join(mnt, 'Applications')) ? '있음' : '없음 (끌어다 놓을 자리가 안 보인다)', false)
        execFileSync('ditto', [path.join(mnt, APP_NAME), path.join(tmp, APP_NAME)])
      } finally { if (run('hdiutil', ['detach', mnt, '-quiet']).status !== 0) run('hdiutil', ['detach', mnt, '-force', '-quiet']) }
      app = path.join(tmp, APP_NAME)
    }
    const base = mac ? app : dir
    const standalone = path.join(base, mac ? 'Contents/Resources/standalone' : 'standalone')
    check('묶은 서버가 들어 있음', fs.existsSync(path.join(standalone, 'app/apps/server/dist/server.mjs')), path.relative(base, standalone))

    // 1. 판 번호
    let build = {}
    try { build = JSON.parse(fs.readFileSync(path.join(standalone, 'app/build.json'), 'utf8')) } catch { /* 아래에서 없음으로 */ }
    const shown = mac ? plistVersion(app) : exeVersion(dir)
    if (want) {
      check('build.json 판 번호', build.version === want, `${build.version ?? '없음'} (릴리스 ${want})`)
      check('앱 정보 판 번호', sameVersion(shown, want), `${shown ?? '없음'} (릴리스 ${want})`)
    } else check('판 번호', true, `시험판: 앱 정보 ${shown ?? '없음'}, build.json ${build.version ?? '없음'}`, false)

    // 2. 만든 기계의 경로
    const leaks = findLeaks(path.join(standalone, 'app'), [os.homedir(), root, process.env.GITHUB_WORKSPACE ?? ''])
    check('만든 기계의 경로가 없음', leaks.length === 0, leaks.length ? leaks.slice(0, 5).map((l) => `${l.file} ← ${l.found}`).join(', ') : '집 폴더 · 저장소 폴더 경로 없음')

    // 3. 서명
    if (mac) {
      const verify = run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app])
      check('묶음 서명이 온전함', verify.status === 0, verify.status === 0 ? 'codesign --verify --deep --strict 통과' : (verify.stderr.trim().split('\n').at(-1) ?? '실패'))
      const details = run('codesign', ['-dv', '--verbose=2', app]).stderr
      const assess = run('spctl', ['-a', '-t', 'exec', '-vv', app])
      const stapled = run('xcrun', ['stapler', 'validate', app]).status === 0
      trust = macTrust({ details, assess: assess.stderr + assess.stdout, assessOk: assess.status === 0, stapled })
      const why = trust.trusted ? `${trust.signedBy}, 공증 · 스테이플 됨` : `${trust.signedBy}${trust.developerId ? '' : ' (Developer ID 아님)'}, 공증 ${trust.notarized ? '됨' : '안 됨'}, 스테이플 ${trust.stapled ? '됨' : '안 됨'}: 받은 사람의 맥이 열기를 막는다`
      check('맥이 믿는 앱 (Gatekeeper)', trust.trusted, why, requireTrusted)
      const binaries = machOFiles(app, standalone).map((file) => ({ file: path.relative(app, file), archs: run('lipo', ['-archs', file]).stdout.trim() }))
      if (arch) {
        const off = chipMismatches(LIPO_ARCH[arch], binaries)
        check(`칩 (${arch})`, off.length === 0 && binaries.length > 0, off.length ? `다른 칩: ${off.slice(0, 5).join(', ')}` : `실행 파일 ${binaries.length}개 모두 ${LIPO_ARCH[arch]}`)
      } else check('칩', true, binaries.map((b) => `${path.basename(b.file)} ${b.archs}`).join(', '), false)
    } else {
      const exe = mainExe(dir)
      const sig = exe ? run('powershell', ['-NoProfile', '-Command', `(Get-AuthenticodeSignature -LiteralPath '${exe.replace(/'/g, "''")}').Status`]).stdout.trim() : 'no exe'
      trust = { signedBy: sig, trusted: sig === 'Valid' }
      check('윈도우 서명 (Authenticode)', trust.trusted, sig === 'Valid' ? '서명됨' : `${sig}: 처음 열 때 "PC 보호" 창이 뜬다 (docs/install-windows.md)`, requireTrusted)
    }

    // 4. 켜 보기
    if (launch) {
      let target = standalone
      if (mac && trust?.trusted) {
        // 내려받은 것처럼: 격리 표시를 붙인 사본에서 묶은 Node를 띄운다 (공증되지 않으면 맥이 여기서 죽인다)
        const copy = path.join(tmp, 'quarantined', APP_NAME)
        execFileSync('ditto', [app, copy])
        const flag = `0083;${Math.floor(Date.now() / 1000).toString(16)};Safari;`
        execFileSync('xattr', ['-w', '-r', 'com.apple.quarantine', flag, copy])
        target = path.join(copy, 'Contents/Resources/standalone')
      } else if (mac) check('격리 표시로 켜 보기', true, '건너뜀: 공증 전이라 맥이 막는 것이 정해져 있다 (위 Gatekeeper 줄)', false)
      const nodeArchs = mac ? run('lipo', ['-archs', path.join(target, 'node/bin/node')]).stdout.trim() : ''
      const host = mac ? run('uname', ['-m']).stdout.trim() : ''
      // 칩을 읽지 못한 Node(망가진 파일)는 건너뛰지 않고 켜 본다: 거기서 실패해야 한다
      const runnable = !mac || !nodeArchs || hostCanRun(host, nodeArchs, run('arch', ['-x86_64', '/usr/bin/true']).status === 0)
      if (!runnable) check('켜 보기', true, `건너뜀: 이 기계(${host})가 묶은 Node의 칩(${nodeArchs || '알 수 없음'})을 돌리지 못한다 (Rosetta 없음)`, false)
      else {
        const smoke = run(process.execPath, [path.join(root, 'scripts/ci/desktop-smoke.mjs'), '--standalone', target], { stdio: 'inherit', env: { ...process.env, SMOKE_CODEX: '0' } })
        check('받은 묶음으로 켜 보기 (빈 집 폴더, 개발 도구 없음)', smoke.status === 0, smoke.status === 0 ? 'desktop-smoke 통과' : `desktop-smoke 실패 (${smoke.status ?? smoke.signal})`)
      }
    }
  } catch (e) {
    check('관문 실행', false, String(e?.message ?? e))
  } finally { for (const c of cleanups.reverse()) { try { c() } catch { /* 지우지 못한 임시 폴더는 다음 실행이 덮는다 */ } } }

  const ok = gatePasses(checks)
  const result = { ok, platform: mac ? 'darwin' : 'win32', version: want ?? null, trusted: trust?.trusted ?? false, signedBy: trust?.signedBy ?? null, checks }
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(result, null, 2) + '\n')
  const summary = [`### 릴리스 관문 (${mac ? '맥' : '윈도우'}${want ? ` ${want}` : ' 시험판'}): ${ok ? '통과' : '실패'}${trust?.trusted ? '' : ' · 서명 · 공증 전'}`, '', '| | 검사 | 결과 |', '| --- | --- | --- |',
    ...checks.map((c) => `| ${c.ok ? '✓' : c.hard ? '✗' : '·'} | ${c.name} | ${String(c.detail).replace(/\|/g, '\\|')} |`), ''].join('\n')
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n')
  console.log(`\n${ok ? '관문 통과' : '관문 실패'}${trust?.trusted ? '' : ' (서명 · 공증 전: 맥 묶음은 릴리스에 붙지 않는다)'}`)
  process.exit(ok ? 0 : 1)
}

function plistVersion(app) {
  const r = run('plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', path.join(app, 'Contents/Info.plist')])
  return r.status === 0 ? r.stdout.trim() : null
}

/** 설치 폴더의 앱 실행 파일 (지우기 프로그램 빼고) */
function mainExe(dir) {
  const exe = fs.existsSync(dir) ? fs.readdirSync(dir).find((f) => f.toLowerCase().endsWith('.exe') && !/^uninstall/i.test(f)) : undefined
  return exe ? path.join(dir, exe) : null
}

function exeVersion(dir) {
  const exe = mainExe(dir)
  if (!exe) return null
  const r = run('powershell', ['-NoProfile', '-Command', `(Get-Item -LiteralPath '${exe.replace(/'/g, "''")}').VersionInfo.ProductVersion`])
  return r.status === 0 ? r.stdout.trim() || null : null
}

/** 칩을 볼 실행 파일: 창(Contents/MacOS), 묶은 Node, 네이티브 부품(.node)과 그 도우미(spawn-helper) */
function machOFiles(app, standalone) {
  const macos = path.join(app, 'Contents/MacOS')
  const files = fs.existsSync(macos) ? fs.readdirSync(macos).map((f) => path.join(macos, f)) : []
  files.push(path.join(standalone, 'node/bin/node'))
  for (const e of fs.readdirSync(standalone, { recursive: true, withFileTypes: true })) {
    if (e.isFile() && (e.name.endsWith('.node') || e.name === 'spawn-helper')) files.push(path.join(e.parentPath, e.name))
  }
  return files.filter((f) => fs.existsSync(f))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
