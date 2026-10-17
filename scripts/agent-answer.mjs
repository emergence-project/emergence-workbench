// pnpm agent:answer <연구 저장소 폴더> <대상> <id> "<답>" [--by <이름>] — 질문 · 지시 기록 아래에 에이전트의 답을 덧붙인다.
// MCP answer_record와 같은 함수(agentAnswer)라 형식과 상태(답함, 에이전트가 물은 질문은 끝냄)가 같다. 답 대신 -를 주면 표준 입력에서 읽는다.
// 앱·서버 없이 돈다(클라우드 에이전트용). 쓴 뒤에는 그 저장소에 커밋해 올린다(맥의 앱이 받아 화면에 보인다).
import fs from 'node:fs'
import path from 'node:path'
import { tsxApi } from './ci/tsx-api.mjs'

const args = process.argv.slice(2)
const bi = args.indexOf('--by')
const by = bi >= 0 ? args[bi + 1] : 'claude'
const given = args.filter((_, i) => bi < 0 || (i !== bi && i !== bi + 1))
if (given.length !== 4 || !by) {
  console.error('사용법: pnpm agent:answer <연구 저장소 폴더> <대상> <id> "<답>" [--by <에이전트 이름, 기본 claude>]   (답 대신 - 이면 표준 입력)')
  process.exit(1)
}
const [repo, target, id, text] = /** @type {[string, string, string, string]} */ (given)
const dir = path.resolve(process.env.INIT_CWD ?? process.cwd(), repo)
const root = path.basename(dir) === 'workbench' ? dir : path.join(dir, 'workbench')
if (!fs.existsSync(path.join(root, 'research.yaml'))) { console.error(`연구 작업대 폴더가 아닙니다 (research.yaml 없음): ${dir}`); process.exit(1) }
const body = text === '-' ? fs.readFileSync(0, 'utf8') : text

const { tsImport } = await tsxApi()
const { agentAnswer } = await tsImport('../apps/server/src/ask.ts', { parentURL: import.meta.url, tsconfig: false })
try {
  const f = agentAnswer(root, target, id, by, body)
  console.log(`답을 썼습니다: workbench/comments/${target}.md · ${id} → ${f.comments.find((c) => c.id === id)?.state}`)
} catch (e) {
  console.error(e.message)
  process.exit(1)
}
