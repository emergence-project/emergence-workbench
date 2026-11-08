// pnpm agent:feedback <피드백 폴더> — 에이전트 차례인 피드백 항목과 그 이유를 보인다. 아무것도 쓰지 않는다.
// 차례 계산은 피드백 화면과 같다(packages/core/src/feedback-buckets.ts). 처리 규칙은 docs/feedback/agent.md(피드백 규약), 앱마다 더한 규칙은 그 앱의 CLAUDE.md.
// 최근 돌려받은 까닭과 교훈(status.yaml revised의 miss · lesson)을 먼저 보인다(feedback-lessons.ts).
// 맡음 (11/8 사용자 결정 "둘 다, 맡음 표시로 나누기"): 정기 작업과 스레드가 함께 처리하므로, 처리를 시작할 때
// `--me <이름> --claim`으로 차례인 항목을 feedback/handoff.yaml에 맡았다고 적고 곧바로 올린다. 다른 이름이 이번 차례에
// 맡은 항목은 차례에서 빼고 "다른 곳이 맡음"으로 보인다(앱의 바로 맡기기와 같은 파일 · 같은 판단, feedbackClaims.ts).
import fs from 'node:fs'
import path from 'node:path'
import { tsxApi } from './ci/tsx-api.mjs'

const argv = process.argv.slice(2)
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? (argv.splice(i, 2)[1] ?? '') : undefined }
const me = flag('--me')
const claimIdx = argv.indexOf('--claim')
const claim = claimIdx >= 0 && !!argv.splice(claimIdx, 1)
const arg = argv[0]
if (!arg || (claim && !me)) {
  console.error('사용법: pnpm agent:feedback <피드백 폴더 또는 개인 저장소 폴더> [--me <이름> [--claim]]   (예: pnpm agent:feedback ~/.config/research-workspace/personal)\n  --me <이름>: 이 이름이 맡은 것은 내 차례로 본다. --claim: 차례인 항목을 handoff.yaml에 이 이름으로 맡았다고 적는다(올리기는 직접)')
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
const { listAllFeedback, feedbackStatusError, feedbackStatusWarnings } = await tsImport('../apps/server/src/feedback.ts', opts)
const { agentTurnReasons, feedbackBucket } = await tsImport('../packages/core/src/feedback-buckets.ts', opts)
const { feedbackLessons, feedbackLessonsText } = await tsImport('../packages/core/src/feedback-lessons.ts', opts)
const { readClaims, writeClaim, lastTouched } = await tsImport('../apps/server/src/feedbackClaims.ts', opts)

const broken = feedbackStatusError(dir)
if (broken) console.log(`⚠ status.yaml을 읽지 못함: ${broken}\n`)
const odd = broken ? [] : feedbackStatusWarnings(dir)
if (odd.length) console.log(`⚠ status.yaml에서 state를 알아보지 못한 항목 ${odd.length}개 (처리 기록 없는 것으로 보임):\n${odd.map((w) => `  - ${w}`).join('\n')}\n`)
const all = listAllFeedback(dir)
// 처리 기록의 시각은 앱이 도는 컴퓨터의 시간대로 적혀 있다. 클라우드(UTC)에서 돌리면 맡음 · 차례 시각이 어긋난다
if (new Date().getTimezoneOffset() === 0 && !process.env.TZ) console.log('⚠ 시간대가 UTC입니다. 처리 기록은 앱이 도는 컴퓨터의 시간대라, 그 시간대로 돌리세요 (예: TZ=<그 시간대> pnpm agent:feedback …)\n')
const now = Date.now()
const turn = all.map((e) => ({ e, why: agentTurnReasons(e, now) })).filter((x) => x.why.length)
// 이번 차례(그 항목을 사용자가 마지막으로 손댄 뒤)에 다른 이름이 맡은 것
const claims = readClaims(dir)
const takenBy = (e) => {
  const c = claims[e.key]
  if (!c || typeof c.machine !== 'string' || c.machine === me) return null
  const at = Date.parse(String(c.at))
  return Number.isFinite(at) && at >= lastTouched(e) ? c : null
}
const mine = turn.filter((x) => !takenBy(x.e))
const elsewhere = turn.filter((x) => takenBy(x.e))
const userTurn = all.filter((e) => feedbackBucket(e, now) === '확인 필요').length
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
console.log(`# 에이전트 차례 ${mine.length} · 사용자 차례 ${userTurn} · 전체 ${all.length}${elsewhere.length ? ` · 다른 곳이 맡음 ${elsewhere.length}` : ''}\n`)
for (const { e } of elsewhere) { const c = takenBy(e); console.log(`- 다른 곳이 맡음: \`${e.key}\` · ${c.machine} · ${c.at}`) }
if (elsewhere.length) console.log('')
if (claim && mine.length) {
  for (const { e } of mine) writeClaim(dir, e.key, me)
  console.log(`> ${me} 이름으로 ${mine.length}개를 맡았다고 handoff.yaml에 적었습니다. 지금 올리고(git pull --rebase → commit → push), 다시 돌려 다른 곳이 먼저 맡지 않았는지 보세요.\n`)
}
if (mine.length) console.log('> 처리 규칙: docs/feedback/agent.md (까닭 → 절: 새 항목 3 · 수정 요청 · 진행 · 고친 글 4 · 코멘트 5)\n')
// 실수에서 배우기 (10/16 실험): 최근 돌려받은 까닭과 교훈을 일 목록보다 먼저 보인다
const lessons = feedbackLessonsText(feedbackLessons(all, now))
if (lessons) console.log(lessons)
for (const { e, why } of mine) {
  console.log(`- \`${e.key}\` · ${e.kind}${e.status ? ` · 지금 ${e.status.state}` : ''}`)
  console.log(`  - ${clip(e.text.replace(/\s+/g, ' ').trim(), 160)}`)
  for (const w of why) console.log(`  - 차례인 이유: ${w}`)
}
