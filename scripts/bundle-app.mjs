// 내려받는 앱(서버를 품은 데스크톱 앱)에 넣을 것을 한 폴더로 모은다. scripts/make-desktop.sh --standalone이 부른다.
//   node scripts/bundle-app.mjs [--arch arm64|x64] [--node <node 실행 파일>]
// 만드는 것 (desktop/standalone/, git에 넣지 않는다):
//   app/apps/server/dist/server.mjs   서버 한 파일 (esbuild, 의존성 포함)
//   app/scripts/mcp.mjs               에이전트용 MCP 입구 한 파일
//   app/apps/web/dist                 화면 (pnpm --filter @rw/web build)
//   app/templates · app/docs/*.md     서버가 읽는 서식과 에이전트에게 알려 주는 형식 문서
//   node/bin/node                     Node 22 (nodejs.org에서 받아 SHA-256을 맞춘다. --node면 그 파일)
// 서버는 자기 파일 위치에서 세 단계 위를 앱 폴더로 본다(server.ts의 repoRoot). 그래서 저장소와 같은 모양으로 둔다.
// Claude Code 실행 파일(플랫폼마다 200MB 남짓)은 넣지 않는다: 에이전트는 이 컴퓨터에 깐 claude를 쓴다(agentRunner.ts).
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const NODE_VERSION = '22.22.0'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'desktop/standalone')

const args = process.argv.slice(2)
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const arch = opt('--arch') ?? process.arch
const localNode = opt('--node')
if (!['arm64', 'x64'].includes(arch)) { console.error(`모르는 --arch: ${arch} (arm64 또는 x64)`); process.exit(1) }

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
execFileSync('pnpm', ['--filter', '@rw/web', 'build'], { cwd: root, stdio: 'inherit' })
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

// 4. Node
const nodeBin = path.join(out, 'node/bin/node')
fs.mkdirSync(path.dirname(nodeBin), { recursive: true })
if (localNode) {
  step(`Node: ${localNode}`)
  fs.copyFileSync(localNode, nodeBin)
} else {
  const name = `node-v${NODE_VERSION}-darwin-${arch}`
  step(`Node ${NODE_VERSION} 받기 (${name})`)
  const base = `https://nodejs.org/dist/v${NODE_VERSION}`
  const sums = await (await fetch(`${base}/SHASUMS256.txt`)).text()
  const want = sums.split('\n').find((l) => l.endsWith(`  ${name}.tar.gz`))?.split(/\s+/)[0]
  if (!want) throw new Error(`SHASUMS256.txt에 ${name}.tar.gz가 없습니다`)
  const res = await fetch(`${base}/${name}.tar.gz`)
  if (!res.ok) throw new Error(`Node를 받지 못했습니다 (${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  const got = createHash('sha256').update(buf).digest('hex')
  if (got !== want) throw new Error(`Node 파일의 SHA-256이 다릅니다: ${got} ≠ ${want}`)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-node-'))
  fs.writeFileSync(path.join(tmp, 'node.tar.gz'), buf)
  execFileSync('tar', ['-xzf', 'node.tar.gz', `${name}/bin/node`], { cwd: tmp })
  fs.copyFileSync(path.join(tmp, name, 'bin/node'), nodeBin)
  fs.rmSync(tmp, { recursive: true, force: true })
}
fs.chmodSync(nodeBin, 0o755)

const size = (p) => Number(execFileSync('du', ['-sk', p]).toString().split(/\s/)[0]) / 1024
console.log(`만듦: ${path.relative(root, out)} (앱 ${size(app).toFixed(1)}MB · Node ${size(path.dirname(nodeBin)).toFixed(1)}MB)`)

/** esbuild는 vite가 이미 쓰는 것을 빌린다 (새 의존성을 더하지 않는다) */
function pathToEsbuild() {
  const vite = fs.realpathSync(path.join(root, 'apps/web/node_modules/vite'))
  const fromVite = path.join(vite, '..', 'esbuild')
  if (fs.existsSync(fromVite)) return path.join(fromVite, 'lib/main.js')
  throw new Error('esbuild를 찾지 못했습니다. pnpm install을 먼저 하세요')
}
