// pnpm agent:feedback <피드백 폴더> — 에이전트 차례인 피드백 항목과 그 이유를 보인다. 아무것도 쓰지 않는다.
// 차례 계산은 피드백 화면과 같다(packages/core/src/feedback-buckets.ts). 처리 규칙은 관리자 개인 저장소 CLAUDE.md 1절.
import fs from 'node:fs'
import path from 'node:path'
import { tsxApi } from './ci/tsx-api.mjs'

const arg = process.argv[2]
if (!arg) {
  console.error('사용법: pnpm agent:feedback <피드백 폴더 또는 개인 저장소 폴더>   (예: pnpm agent:feedback ~/.config/research-workspace/personal)')
  process.exit(1)
}
// 개인 저장소 맨 위나 그 안의 feedback 폴더 둘 다 받는다. pnpm은 저장소 맨 위에서 돌리므로 상대 경로는 부른 곳 기준
const given = path.resolve(process.env.INIT_CWD ?? process.cwd(), arg)
const dir = fs.existsSync(path.join(given, 'feedback', 'status.yaml')) ? path.join(given, 'feedback') : given
if (!fs.existsSync(path.join(dir, 'status.yaml'))) {
  console.error(`피드백 폴더가 아닙니다 (status.yaml 없음): ${dir}`)
  process.exit(1)
}
const { tsImport } = await tsxApi()
const opts = { parentURL: import.meta.url, tsconfig: false }
const { listAllFeedback, feedbackStatusError } = await tsImport('../apps/server/src/feedback.ts', opts)
const { agentTurnReasons, feedbackBucket } = await tsImport('../packages/core/src/feedback-buckets.ts', opts)

const broken = feedbackStatusError(dir)
if (broken) console.log(`⚠ status.yaml을 읽지 못함: ${broken}\n`)
const all = listAllFeedback(dir)
const now = Date.now()
const mine = all.map((e) => ({ e, why: agentTurnReasons(e, now) })).filter((x) => x.why.length)
const userTurn = all.filter((e) => feedbackBucket(e, now) === '확인 필요').length
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
console.log(`# 에이전트 차례 ${mine.length} · 사용자 차례 ${userTurn} · 전체 ${all.length}\n`)
for (const { e, why } of mine) {
  console.log(`- \`${e.key}\` · ${e.kind}${e.status ? ` · 지금 ${e.status.state}` : ''}`)
  console.log(`  - ${clip(e.text.replace(/\s+/g, ' ').trim(), 160)}`)
  for (const w of why) console.log(`  - 차례인 이유: ${w}`)
}
