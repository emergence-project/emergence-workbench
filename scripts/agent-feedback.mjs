// pnpm agent:feedback <피드백 폴더> — 에이전트 차례인 피드백 항목과 그 이유를 보이고, 그 항목을 이 에이전트가 맡는다.
// 차례 계산은 피드백 화면과 같다(packages/core/src/feedback-buckets.ts). 처리 규칙은 docs/feedback/agent.md(피드백 규약), 앱마다 더한 규칙은 그 앱의 CLAUDE.md.
// 최근 돌려받은 까닭과 교훈(status.yaml revised의 miss · lesson)을 먼저 보인다(feedback-lessons.ts).
// 맡음 (11/8 사용자 결정 "둘 다, 맡음 표시로 나누기", 11/9 "앱도 고치자"): 정기 작업과 대화가 함께 처리하므로, 지시문에 빠져도
// 겹치지 않게 기본으로 맡는다. 받고(git pull --rebase) → 차례인 항목을 feedback/handoff.yaml에 이 이름으로 적고 → 그 파일만 올린다.
// 올리기가 밀리면(다른 곳이 먼저 올림) 되돌리고 다시 받아 처음부터. 다른 이름이 이번 차례에 맡은 항목은 "다른 곳이 맡음"으로 빼서 보인다
// (앱의 바로 맡기기와 같은 파일 · 같은 판단, feedbackClaims.ts). 보기만 하려면 --peek(아무것도 쓰거나 올리지 않음).
// 이름은 --me, 없으면 FEEDBACK_AGENT, 없으면 agent-<컴퓨터 이름>. 시간대는 TZ, 없고 UTC면 cloud.yaml의 timezone(앱이 적는다).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { tsxApi } from './ci/tsx-api.mjs'

const argv = process.argv.slice(2)
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? (argv.splice(i, 2)[1] ?? '') : undefined }
const bool = (name) => { const i = argv.indexOf(name); return i >= 0 && !!argv.splice(i, 1) }
const me = flag('--me') || process.env.FEEDBACK_AGENT || `agent-${os.hostname()}`
bool('--claim') // 11/8 이름: 이제 기본이라 받기만 한다
const peek = bool('--peek')
const arg = argv[0]
if (!arg) {
  console.error('사용법: pnpm agent:feedback <피드백 폴더 또는 개인 저장소 폴더> [--me <이름>] [--peek]   (예: pnpm agent:feedback ~/.config/research-workspace/personal)\n  차례인 항목을 handoff.yaml에 이 이름으로 맡고 올린다. --me <이름>: 맡는 이름(기본 FEEDBACK_AGENT 또는 agent-<컴퓨터 이름>). --peek: 보기만')
  process.exit(1)
}
// 개인 저장소 맨 위나 그 안의 feedback 폴더 둘 다 받는다. pnpm은 저장소 맨 위에서 돌리므로 상대 경로는 부른 곳 기준
const given = path.resolve(process.env.INIT_CWD ?? process.cwd(), arg)
const dir = fs.existsSync(path.join(given, 'feedback', 'status.yaml')) ? path.join(given, 'feedback') : given
if (!fs.existsSync(path.join(dir, 'status.yaml'))) {
  console.error(`피드백 폴더가 아닙니다 (status.yaml 없음): ${dir}`)
  process.exit(1)
}
// 처리 기록의 시각은 앱이 도는 컴퓨터의 시간대로 적혀 있다. 클라우드(UTC)에서는 앱이 cloud.yaml에 적은 시간대를 쓴다
const cloudTz = (() => { try { return /^timezone:\s*([\w/+-]+)\s*$/m.exec(fs.readFileSync(path.join(dir, 'cloud.yaml'), 'utf8'))?.[1] } catch { return undefined } })()
if (!process.env.TZ && new Date().getTimezoneOffset() === 0 && cloudTz) process.env.TZ = cloudTz
const { tsImport } = await tsxApi()
const opts = { parentURL: import.meta.url, tsconfig: false }
const { listAllFeedback, feedbackStatusError, feedbackStatusWarnings } = await tsImport('../apps/server/src/feedback.ts', opts)
const { agentTurnReasons, feedbackBucket } = await tsImport('../packages/core/src/feedback-buckets.ts', opts)
const { feedbackLessons, feedbackLessonsText } = await tsImport('../packages/core/src/feedback-lessons.ts', opts)
const { readClaims, writeClaim, lastTouched, HANDOFF_FILE } = await tsImport('../apps/server/src/feedbackClaims.ts', opts)

if (new Date().getTimezoneOffset() === 0 && !process.env.TZ) console.log('⚠ 시간대가 UTC입니다. 처리 기록은 앱이 도는 컴퓨터의 시간대라, 그 시간대로 돌리세요 (예: TZ=<그 시간대> pnpm agent:feedback …). 앱에서 클라우드 처리를 한 번 껐다 켜면 cloud.yaml에 시간대가 적힙니다\n')

// git: 피드백 폴더가 든 저장소. 저장소가 아니면 맡음은 이 폴더에만 적는다
const git = (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const tryGit = (...a) => { try { git(...a); return true } catch { return false } }
const inGit = tryGit('rev-parse', '--is-inside-work-tree')
const handoff = path.join(dir, HANDOFF_FILE)

const now = Date.now()
const compute = () => {
  const all = listAllFeedback(dir)
  const turn = all.map((e) => ({ e, why: agentTurnReasons(e, now) })).filter((x) => x.why.length)
  // 이번 차례(그 항목을 사용자가 마지막으로 손댄 뒤)에 다른 이름이 맡은 것
  const claims = readClaims(dir)
  const takenBy = (e) => {
    const c = claims[e.key]
    if (!c || typeof c.machine !== 'string' || c.machine === me) return null
    const at = Date.parse(String(c.at))
    return Number.isFinite(at) && at >= lastTouched(e) ? c : null
  }
  return { all, takenBy, mine: turn.filter((x) => !takenBy(x.e)), elsewhere: turn.filter((x) => takenBy(x.e)) }
}

let r = compute()
let claimNote = ''
if (!peek) {
  if (!inGit) {
    for (const { e } of r.mine) writeClaim(dir, e.key, me)
    if (r.mine.length) claimNote = `> ${me} 이름으로 ${r.mine.length}개를 맡았다고 handoff.yaml에 적었습니다(git 저장소가 아니라 올리지 않음).\n`
  } else {
    // 받기 → 적기 → 그 파일만 올리기. 밀리면 그 커밋을 되돌리고 다시 받아 처음부터 (세 번까지)
    let done = false
    for (let i = 0; i < 3 && !done; i++) {
      if (!tryGit('pull', '--rebase', '--autostash', '-q')) { claimNote = '⚠ 받기(git pull --rebase)에 실패해 맡지 못했습니다. 저장소 상태를 보고 다시 돌리세요.\n'; break }
      r = compute()
      if (!r.mine.length) { done = true; break }
      for (const { e } of r.mine) writeClaim(dir, e.key, me)
      if (!tryGit('add', '--', handoff) || !tryGit('commit', '-q', '-m', `피드백 맡음: ${me} ${r.mine.length}개`, '--', handoff)) { claimNote = '⚠ handoff.yaml을 커밋하지 못해 맡지 못했습니다.\n'; tryGit('checkout', '--', handoff); break }
      if (tryGit('push', '-q')) { done = true; claimNote = `> ${me} 이름으로 ${r.mine.length}개를 맡고 올렸습니다(handoff.yaml). 처리 기록을 쓰기 직전에 한 번 더 돌려 차례를 보세요.\n`; break }
      tryGit('reset', '-q', 'HEAD~1'); tryGit('checkout', '--', handoff)
    }
    if (!done && !claimNote) claimNote = '⚠ 올리기가 세 번 밀려 맡지 못했습니다. 잠시 뒤 다시 돌리세요.\n'
    r = compute()
  }
}

const { all, mine, elsewhere, takenBy } = r
const broken = feedbackStatusError(dir)
if (broken) console.log(`⚠ status.yaml을 읽지 못함: ${broken}\n`)
const odd = broken ? [] : feedbackStatusWarnings(dir)
if (odd.length) console.log(`⚠ status.yaml에서 state를 알아보지 못한 항목 ${odd.length}개 (처리 기록 없는 것으로 보임):\n${odd.map((w) => `  - ${w}`).join('\n')}\n`)
const userTurn = all.filter((e) => feedbackBucket(e, now) === '확인 필요').length
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
console.log(`# 에이전트 차례 ${mine.length} · 사용자 차례 ${userTurn} · 전체 ${all.length}${elsewhere.length ? ` · 다른 곳이 맡음 ${elsewhere.length}` : ''}${peek ? ' (보기만)' : ''}\n`)
for (const { e } of elsewhere) { const c = takenBy(e); console.log(`- 다른 곳이 맡음 (처리하지 않음): \`${e.key}\` · ${c.machine} · ${c.at}`) }
if (elsewhere.length) console.log('')
if (claimNote) console.log(claimNote)
if (mine.length) console.log('> 처리 규칙: docs/feedback/agent.md (까닭 → 절: 새 항목 3 · 수정 요청 · 진행 · 고친 글 4 · 코멘트 5)\n')
// 실수에서 배우기 (10/16 실험): 최근 돌려받은 까닭과 교훈을 일 목록보다 먼저 보인다
const lessons = feedbackLessonsText(feedbackLessons(all, now))
if (lessons) console.log(lessons)
for (const { e, why } of mine) {
  console.log(`- \`${e.key}\` · ${e.kind}${e.status ? ` · 지금 ${e.status.state}` : ''}`)
  console.log(`  - ${clip(e.text.replace(/\s+/g, ' ').trim(), 160)}`)
  for (const w of why) console.log(`  - 차례인 이유: ${w}`)
}
