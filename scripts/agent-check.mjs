// pnpm agent:check <연구 저장소 폴더> — 직접 고친 연구 파일을 검사한다. 파일은 고치지 않는다.
import fs from 'node:fs'
import path from 'node:path'
import { tsxApi } from './ci/tsx-api.mjs'

const arg = process.argv[2]
if (!arg) {
  console.error('사용법: pnpm agent:check <연구 저장소 폴더 또는 workbench 폴더>')
  process.exit(1)
}
const given = path.resolve(process.env.INIT_CWD ?? process.cwd(), arg)
const root = path.basename(given) === 'workbench' ? given : path.join(given, 'workbench')
if (!fs.existsSync(path.join(root, 'research.yaml'))) {
  console.error(`연구 작업대 폴더가 아닙니다 (research.yaml 없음): ${root}`)
  process.exit(1)
}
// 메시지는 한국어 (RW_LANG=en이면 영어). tsImport는 모듈을 따로 불러와 withLang이 검사 코드에 닿지 않으므로 환경 변수로 정한다
process.env.RW_LANG ??= 'ko'
const { tsImport } = await tsxApi()
const opts = { parentURL: import.meta.url, tsconfig: false }
const { Workbench } = await tsImport('../apps/server/src/workbench.ts', opts)
const { checkWorkbench } = await tsImport('../apps/server/src/agentCheck.ts', opts)
const { files, diagnostics } = checkWorkbench(new Workbench(root))
for (const d of diagnostics) console.error(`${d.level === 'error' ? '오류' : '경고'} ${d.file}:${d.line} — ${d.message}`)
const errors = diagnostics.filter((d) => d.level === 'error').length
console.log(`검사한 파일 ${files} · 오류 ${errors} · 경고 ${diagnostics.length - errors}`)
process.exitCode = errors ? 1 : 0
