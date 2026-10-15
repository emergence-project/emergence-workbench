// pnpm agent:check <연구 저장소 폴더> [--base <ref>] — 직접 고친 연구 파일의 형식과, 기준 커밋 이후 바뀐 것을 검사한다. 파일은 고치지 않는다.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { tsxApi } from './ci/tsx-api.mjs'

const args = process.argv.slice(2)
const at = args.indexOf('--base')
const baseRef = at >= 0 ? args.splice(at, 2)[1] : undefined
const arg = args[0]
if (!arg || (at >= 0 && !baseRef)) {
  console.error('사용법: pnpm agent:check <연구 저장소 폴더 또는 workbench 폴더> [--base <ref>]')
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
const { checkChanges, checkLevels } = await tsImport('../apps/server/src/agentChanges.ts', opts)
const { commonRules } = await tsImport('../apps/server/src/agentRules.ts', opts)
const wb = new Workbench(root)
const show = (d) => console.error(`${d.level === 'error' ? '오류' : '경고'} ${d.file}:${d.line} — ${d.message}${d.check ? ` [${d.check}]` : ''}`)
const { files, diagnostics } = checkWorkbench(wb)
diagnostics.forEach(show)
// 바뀐 것: 검사 세기는 공통 규칙 머리말의 checks:가 정한다 (docs/repo-format.md §15)
const configDir = process.env.RW_CONFIG_DIR ?? path.join(os.homedir(), '.config/research-workspace')
const changes = checkChanges(wb, { base: baseRef, levels: checkLevels(commonRules(configDir)?.text) })
if (!changes && baseRef) {
  console.error(`기준을 찾지 못했습니다: ${baseRef}`)
  process.exit(1)
}
const all = [...diagnostics, ...(changes?.diagnostics ?? [])]
if (changes) {
  changes.diagnostics.forEach(show)
  console.log(`바뀐 것: 기준 ${changes.base}${changes.commits ? ` · 올리지 않은 커밋 ${changes.commits}` : ''} · 바뀐 파일 ${changes.files}`)
  if (changes.diagnostics.some((d) => d.level === 'error')) console.log('바뀐 것의 오류는 공통 규칙이 막는 변경입니다. 내가 바꾼 것이면, 사용자가 이 대화에서 직접 시킨 경우 답에 그렇게 적고 아니면 되돌리세요. 내가 바꾸지 않은 것(사용자가 앱에서 한 것)은 그대로 둡니다.')
} else console.log('바뀐 것: git 기록이 없어 보지 않음')
const errors = all.filter((d) => d.level === 'error').length
console.log(`검사한 파일 ${files} · 오류 ${errors} · 경고 ${all.length - errors}`)
process.exitCode = errors ? 1 : 0
