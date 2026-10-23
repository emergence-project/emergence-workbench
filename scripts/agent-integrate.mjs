// pnpm agent:integrate <연구 저장소 폴더> <점 id> (--into <문서> [--section "<절>"] | --skip "<이유>") [--by <이름>]
// 끝난 점의 결과를 이해 문서에 반영했다고(그 문서는 점 id를 적어 가리킨다), 또는 반영하지 않는 이유를 적는다 (docs/repo-format.md §14 "반영 기록", 10/23).
// agent:check의 flow-integration이 반영 기록 없이 끝난 점을 잡는다. 앱·서버 없이 돈다.
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { tsxApi } from './ci/tsx-api.mjs'

const usage = '사용법: pnpm agent:integrate <연구 저장소 폴더> <점 id> (--into <저장소 기준 문서 경로> [--section "<절 이름>"] | --skip "<반영하지 않는 이유>") [--by <이름, 기본 claude>]'
let parsed
try {
  parsed = parseArgs({ allowPositionals: true, options: { into: { type: 'string' }, section: { type: 'string' }, skip: { type: 'string' }, by: { type: 'string', default: 'claude' } } })
} catch (e) { console.error(`${e.message}\n${usage}`); process.exit(1) }
const { values: v, positionals } = parsed
if (positionals.length !== 2) { console.error(usage); process.exit(1) }
const dir = path.resolve(process.env.INIT_CWD ?? process.cwd(), /** @type {string} */ (positionals[0]))
const root = path.basename(dir) === 'workbench' ? dir : path.join(dir, 'workbench')
if (!fs.existsSync(path.join(root, 'research.yaml'))) { console.error(`연구 작업대 폴더가 아닙니다 (research.yaml 없음): ${root}`); process.exit(1) }
process.env.RW_LANG ??= 'ko'

const { tsImport } = await tsxApi()
const opts = { parentURL: import.meta.url, tsconfig: false }
const { Workbench } = await tsImport('../apps/server/src/workbench.ts', opts)
const { integrateFlow } = await tsImport('../apps/server/src/flowStart.ts', opts)
try {
  const node = integrateFlow(new Workbench(root), { dot: positionals[1], into: v.into, section: v.section, skip: v.skip, by: v.by })
  console.log(`반영 기록을 썼습니다: ${node.file} → ${node.integration.into ? `${node.integration.into}${node.integration.section ? ` › ${node.integration.section}` : ''}` : `반영 안 함 (${node.integration.skip})`}`)
} catch (e) {
  console.error(e.message)
  process.exit(1)
}
