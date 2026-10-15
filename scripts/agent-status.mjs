// pnpm agent:status <연구 저장소 폴더> — 앱이 맥에서 쓰는 workbench/STATUS.md와 같은 요약을 파일에서 바로 뽑아 보인다.
// 폴더를 여럿 주거나, 연구 저장소들을 담은 폴더를 주거나, --all(이 컴퓨터 앱에 등록한 진행 중 프로젝트)이면
// 프로젝트마다 한 줄씩 "한눈에" 표를 보인다(사용자 차례는 홈의 "확인 필요"와 같은 계산). 자세한 것은 폴더 하나로 다시 부른다.
// 앱·서버 없이 돈다(클라우드 에이전트용). 아무것도 쓰지 않는다.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { tsxApi } from './ci/tsx-api.mjs'

const args = process.argv.slice(2)
const all = args.includes('--all')
const given = args.filter((a) => a !== '--all')
if (!all && !given.length) {
  console.error([
    '사용법: pnpm agent:status <연구 저장소 폴더>            (예: pnpm agent:status ../my-research)',
    '        pnpm agent:status <폴더> <폴더> …  또는 <저장소들을 담은 폴더>   (여러 프로젝트 한눈에)',
    '        pnpm agent:status --all                         (이 컴퓨터 앱에 등록한 진행 중 프로젝트 한눈에)',
  ].join('\n'))
  process.exit(1)
}
const configDir = process.env.RW_CONFIG_DIR ?? path.join(os.homedir(), '.config/research-workspace')
// 저장소 폴더나 그 안의 workbench 폴더 둘 다 받는다. pnpm은 저장소 맨 위에서 돌리므로 상대 경로는 부른 곳 기준
const wbRoot = (dir) => (path.basename(dir) === 'workbench' ? dir : path.join(dir, 'workbench'))
const isResearch = (dir) => fs.existsSync(path.join(wbRoot(dir), 'research.yaml'))
const dirs = given.map((a) => path.resolve(process.env.INIT_CWD ?? process.cwd(), a))

const { tsImport } = await tsxApi()
const opts = { parentURL: import.meta.url, tsconfig: false }
const { Workbench } = await tsImport('../apps/server/src/workbench.ts', opts)

// 폴더 하나 = 지금까지처럼 그 프로젝트의 STATUS 전부
if (!all && dirs.length === 1 && isResearch(dirs[0])) {
  const root = wbRoot(dirs[0])
  const { generateStatus, readStatusEdits } = await tsImport('../apps/server/src/agentStatus.ts', opts)
  const { commonRules } = await tsImport('../apps/server/src/agentRules.ts', opts)
  const wb = new Workbench(root)
  // 연구 공통 규칙: 설정 폴더의 개인 저장소 사본, 또는 RW_COMMON_RULES가 가리키는 파일 (없으면 그 절을 뺀다)
  process.stdout.write(generateStatus(wb, new Date(), fs.existsSync(configDir) ? readStatusEdits(wb, configDir) : undefined, commonRules(configDir)))
  process.exit(0)
}

// 여러 프로젝트 한눈에
const repos = []
for (const d of dirs) {
  if (isResearch(d)) { repos.push(d); continue }
  if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) { console.error(`폴더가 없습니다: ${d}`); process.exit(1) }
  // 연구 저장소들을 담은 폴더: 바로 아래에서 workbench/research.yaml이 있는 것만
  const found = fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => path.join(d, e.name)).filter(isResearch).sort()
  if (!found.length) { console.error(`연구 작업대 폴더가 아니고, 바로 아래에도 없습니다 (research.yaml 없음): ${d}`); process.exit(1) }
  repos.push(...found)
}
const { overviewRow, generateOverview } = await tsImport('../apps/server/src/agentOverview.ts', opts)
const { AgentEditStore } = await tsImport('../apps/server/src/agentEdits.ts', opts)
const { Registry } = await tsImport('../apps/server/src/registry.ts', opts)
const registry = fs.existsSync(configDir) ? new Registry(configDir) : null
if (all) {
  if (!registry) { console.error(`앱 설정 폴더가 없습니다: ${configDir} (--all은 앱이 있는 컴퓨터에서. 클라우드에서는 폴더를 주세요)`); process.exit(1) }
  for (const r of registry.list()) if (r.state === 'active') repos.push(r.path)
}
// 에이전트 고침 검토 수: 앱 설정이 있을 때만 (홈과 같은 기록 파일). 기록은 프로젝트 id로 남으므로 등록한 경로로 잇는다
const editsAt = new Map()
if (registry) {
  const byId = new Map()
  const stored = new AgentEditStore(AgentEditStore.fileFor(configDir, registry.libraryPath)).read()
  for (const x of [...stored.pending, ...stored.attempts]) if (x.target.kind === 'note') byId.set(x.target.rid, (byId.get(x.target.rid) ?? 0) + 1)
  for (const r of registry.list()) editsAt.set(path.resolve(r.path), byId.get(r.id) ?? 0)
}
const repoOf = (r) => path.resolve(path.basename(r) === 'workbench' ? path.dirname(r) : r)
const rows = [...new Set(repos.map(repoOf))].map((r) => {
  try { return overviewRow(new Workbench(wbRoot(r)), editsAt.get(r) ?? 0) } catch (e) { return { folder: r, problem: e.message } }
})
process.stdout.write(generateOverview(rows))
