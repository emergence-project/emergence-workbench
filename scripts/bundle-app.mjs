// 내려받는 앱(서버를 품은 데스크톱 앱)에 넣을 것을 한 폴더로 모은다. scripts/make-desktop.sh --standalone이 부른다.
//   node scripts/bundle-app.mjs [--arch arm64|x64] [--platform darwin|win32] [--node <node 실행 파일>]
// 윈도우용(--platform win32, 윈도우에서 돌리면 기본)은 GitHub Actions 윈도우 기계가 만든다(.github/workflows/desktop.yml).
// 만드는 것 (desktop/standalone/, git에 넣지 않는다):
//   app/apps/server/dist/server.mjs   서버 한 파일 (esbuild, 의존성 포함)
//   app/scripts/mcp.mjs               에이전트용 MCP 입구 한 파일
//   app/apps/web/dist                 화면 (pnpm --filter @rw/web build)
//   app/templates · app/docs/*.md     서버가 읽는 서식과 에이전트에게 알려 주는 형식 문서
//   node/bin/node                     Node 22 (nodejs.org에서 받아 SHA-256을 맞춘다. --node면 그 파일). 윈도우는 node/node.exe
//   git/                              윈도우만: MinGit(앱에 넣으라고 Git for Windows가 내는 작은 git). git이 없는 윈도우에서도 프로젝트를 만들고 올리게 한다
// 서버는 자기 파일 위치에서 세 단계 위를 앱 폴더로 본다(server.ts의 repoRoot). 그래서 저장소와 같은 모양으로 둔다.
// Claude Code 실행 파일(플랫폼마다 200MB 남짓)은 넣지 않는다: 에이전트는 이 컴퓨터에 깐 claude를 쓴다(agentRunner.ts).
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const NODE_VERSION = '22.22.0'
// MinGit: 올릴 때는 https://github.com/git-for-windows/git/releases 의 새 MinGit-<번호>-64-bit.zip을 받아 SHA-256을 다시 잰다
export const MINGIT = {
  url: 'https://github.com/git-for-windows/git/releases/download/v2.56.0.windows.4/MinGit-2.56.0.4-64-bit.zip',
  sha256: 'e3bf78351fe777fba47ddee5950082f8a98bb0f02604fdc7ba3ee2cb68ffa877',
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'desktop/standalone')

const args = process.argv.slice(2)
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const arch = opt('--arch') ?? process.arch
const platform = opt('--platform') ?? (process.platform === 'win32' ? 'win32' : 'darwin')
const localNode = opt('--node')
if (!['arm64', 'x64'].includes(arch)) { console.error(`모르는 --arch: ${arch} (arm64 또는 x64)`); process.exit(1) }
if (!['darwin', 'win32'].includes(platform)) { console.error(`모르는 --platform: ${platform} (darwin 또는 win32)`); process.exit(1) }
const win = platform === 'win32'

const step = (s) => console.log(`· ${s}`)
fs.rmSync(out, { recursive: true, force: true })
const app = path.join(out, 'app')

// 1. 서버와 MCP 입구: TypeScript를 그대로 묶는다 (tsx 없이 node로 돈다)
const esbuild = await import(pathToFileURL(pathToEsbuild()).href)
const common = {
  bundle: true, platform: 'node', format: 'esm', target: 'node22', logLevel: 'warning',
  // 묶은 파일 안의 CommonJS 의존성이 require를 쓴다
  banner: { js: "import { createRequire as __rwRequire } from 'node:module'; const require = __rwRequire(import.meta.url);" },
}
step('서버 묶기')
await esbuild.build({ ...common, entryPoints: [path.join(root, 'apps/server/src/server.ts')], outfile: path.join(app, 'apps/server/dist/server.mjs') })
step('MCP 입구 묶기')
await esbuild.build({
  ...common,
  stdin: { contents: "import { startStdio } from './apps/server/src/mcp.ts'\nawait startStdio()\n", resolveDir: root, sourcefile: 'mcp-entry.ts', loader: 'ts' },
  outfile: path.join(app, 'scripts/mcp.mjs'),
})

// 2. 화면
step('화면 빌드')
// 윈도우의 pnpm은 pnpm.cmd라 셸을 거쳐야 부를 수 있다
execFileSync('pnpm', ['--filter', '@rw/web', 'build'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
fs.cpSync(path.join(root, 'apps/web/dist'), path.join(app, 'apps/web/dist'), { recursive: true })

// 3. 서식과 형식 문서
step('서식 · 문서')
fs.cpSync(path.join(root, 'templates'), path.join(app, 'templates'), { recursive: true })
fs.mkdirSync(path.join(app, 'docs'), { recursive: true })
for (const f of fs.readdirSync(path.join(root, 'docs'))) if (f.endsWith('.md')) fs.copyFileSync(path.join(root, 'docs', f), path.join(app, 'docs', f))
// 어느 커밋으로 만들었는지 (설정 › 업데이트에 보인다: 서버가 git 대신 이 파일을 읽는다)
let commit = ''
try { commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD']).toString().trim() } catch { /* 저장소가 아닌 곳에서 묶음 */ }
fs.writeFileSync(path.join(app, 'build.json'), JSON.stringify({ commit, builtAt: new Date().toISOString() }, null, 2) + '\n')

// 4. Node (tauri의 묶은 서버 자리와 같게: desktop/src-tauri/src/main.rs의 bundled_paths)
const nodeBin = path.join(out, win ? 'node/node.exe' : 'node/bin/node')
fs.mkdirSync(path.dirname(nodeBin), { recursive: true })
if (localNode) {
  step(`Node: ${localNode}`)
  fs.copyFileSync(localNode, nodeBin)
} else {
  const name = `node-v${NODE_VERSION}-${win ? 'win' : 'darwin'}-${arch}`
  const file = `${name}.${win ? 'zip' : 'tar.gz'}`
  step(`Node ${NODE_VERSION} 받기 (${file})`)
  const base = `https://nodejs.org/dist/v${NODE_VERSION}`
  const sums = await (await fetch(`${base}/SHASUMS256.txt`)).text()
  const want = sums.split('\n').find((l) => l.endsWith(`  ${file}`))?.split(/\s+/)[0]
  if (!want) throw new Error(`SHASUMS256.txt에 ${file}이 없습니다`)
  const res = await fetch(`${base}/${file}`)
  if (!res.ok) throw new Error(`Node를 받지 못했습니다 (${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  const got = createHash('sha256').update(buf).digest('hex')
  if (got !== want) throw new Error(`Node 파일의 SHA-256이 다릅니다: ${got} ≠ ${want}`)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-node-'))
  fs.writeFileSync(path.join(tmp, file), buf)
  const inside = win ? `${name}/node.exe` : `${name}/bin/node`
  execFileSync(windowsTar(), ['-xf', file, inside], { cwd: tmp })
  fs.copyFileSync(path.join(tmp, inside), nodeBin)
  fs.rmSync(tmp, { recursive: true, force: true })
}
if (!win) fs.chmodSync(nodeBin, 0o755)

// 5. 윈도우: git (MinGit). 앱이 PATH 맨 뒤에 둬서 이미 깐 git이 있으면 그것을 쓴다(desktop/src-tauri/src/main.rs)
if (win) {
  if (arch !== 'x64') throw new Error('윈도우 묶음은 x64만 만듭니다 (MinGit 64-bit)')
  step('MinGit 받기')
  const res = await fetch(MINGIT.url)
  if (!res.ok) throw new Error(`MinGit을 받지 못했습니다 (${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  const got = createHash('sha256').update(buf).digest('hex')
  if (got !== MINGIT.sha256) throw new Error(`MinGit 파일의 SHA-256이 다릅니다: ${got} ≠ ${MINGIT.sha256}`)
  const gitDir = path.join(out, 'git')
  fs.mkdirSync(gitDir, { recursive: true })
  fs.writeFileSync(path.join(out, 'mingit.zip'), buf)
  execFileSync(windowsTar(), ['-xf', path.join(out, 'mingit.zip')], { cwd: gitDir })
  fs.rmSync(path.join(out, 'mingit.zip'))
  if (!fs.existsSync(path.join(gitDir, 'cmd/git.exe'))) throw new Error('MinGit에 cmd/git.exe가 없습니다')
}

/** 폴더 크기(MB). du가 없는 윈도우에서도 되게 직접 센다 */
const size = (p) => fs.readdirSync(p, { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile()).reduce((n, e) => n + fs.statSync(path.join(e.parentPath, e.name)).size, 0) / 2 ** 20
const gitSize = win ? ` · git ${size(path.join(out, 'git')).toFixed(1)}MB` : ''
console.log(`만듦: ${path.relative(root, out)} (앱 ${size(app).toFixed(1)}MB · Node ${size(path.dirname(nodeBin)).toFixed(1)}MB${gitSize})`)

/** 윈도우의 tar(bsdtar, zip도 푼다). Git의 GNU tar가 PATH 앞에 있을 수 있어 자리를 정해 부른다 */
function windowsTar() {
  return process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
}

/** esbuild는 vite가 이미 쓰는 것을 빌린다 (새 의존성을 더하지 않는다) */
function pathToEsbuild() {
  const vite = fs.realpathSync(path.join(root, 'apps/web/node_modules/vite'))
  const fromVite = path.join(vite, '..', 'esbuild')
  if (fs.existsSync(fromVite)) return path.join(fromVite, 'lib/main.js')
  throw new Error('esbuild를 찾지 못했습니다. pnpm install을 먼저 하세요')
}
