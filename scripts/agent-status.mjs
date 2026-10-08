// pnpm agent:status <연구 저장소 폴더> — 앱이 맥에서 쓰는 workbench/STATUS.md와 같은 요약을 파일에서 바로 뽑아 보인다.
// 앱·서버 없이 돈다(클라우드 에이전트용). 아무것도 쓰지 않는다.
import fs from 'node:fs'
import path from 'node:path'
import { tsxApi } from './ci/tsx-api.mjs'

const arg = process.argv[2]
if (!arg) {
  console.error('사용법: pnpm agent:status <연구 저장소 폴더>   (예: pnpm agent:status ../my-research)')
  process.exit(1)
}
// 저장소 폴더나 그 안의 workbench 폴더 둘 다 받는다. pnpm은 저장소 맨 위에서 돌리므로 상대 경로는 부른 곳 기준
const given = path.resolve(process.env.INIT_CWD ?? process.cwd(), arg)
const root = path.basename(given) === 'workbench' ? given : path.join(given, 'workbench')
if (!fs.existsSync(path.join(root, 'research.yaml'))) {
  console.error(`연구 작업대 폴더가 아닙니다 (research.yaml 없음): ${root}`)
  process.exit(1)
}
const { tsImport } = await tsxApi()
const opts = { parentURL: import.meta.url, tsconfig: false }
const { Workbench } = await tsImport('../apps/server/src/workbench.ts', opts)
const { generateStatus } = await tsImport('../apps/server/src/agentStatus.ts', opts)
process.stdout.write(generateStatus(new Workbench(root)))
