// pnpm agent:check-tasks <연구 저장소 폴더> — 제출 전에 작업 파일을 검사한다. 파일은 고치지 않는다.
import fs from 'node:fs'
import path from 'node:path'
import { tsxApi } from './ci/tsx-api.mjs'

const arg = process.argv[2]
if (!arg) {
  console.error('사용법: pnpm agent:check-tasks <연구 저장소 폴더 또는 workbench 폴더>')
  process.exit(1)
}
const given = path.resolve(process.env.INIT_CWD ?? process.cwd(), arg)
const root = path.basename(given) === 'workbench' ? given : path.join(given, 'workbench')
if (!fs.existsSync(path.join(root, 'research.yaml'))) {
  console.error(`연구 작업대 폴더가 아닙니다 (research.yaml 없음): ${root}`)
  process.exit(1)
}
const { tsImport } = await tsxApi()
const opts = { parentURL: import.meta.url, tsconfig: false }
const { Workbench } = await tsImport('../apps/server/src/workbench.ts', opts)
const { scanTasks } = await tsImport('../apps/server/src/tasks.ts', opts)
const { tasks, diagnostics } = scanTasks(new Workbench(root))
for (const d of diagnostics) console.error(`${d.file}:${d.line}${d.column ? `:${d.column}` : ''} — ${d.message}`)
console.log(`작업 파일 ${tasks.length}개 정상 · 오류 ${diagnostics.length}건`)
process.exitCode = diagnostics.length ? 1 : 0
