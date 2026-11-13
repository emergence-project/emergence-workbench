// 흐름의 이어받기 요약(MCP problem_brief)과 STATUS의 "흐름" 절.
// 이어받기는 다음 세션이 그 흐름을 이어 가는 데 필요한 것만 싣는다: 질문 · 메시지 · 폐기 사유 · 주장과 그 근거 · 다음 · 한도. 2KB를 넘지 않는다 (BRIEF_MAX).
// STATUS와 이어받기는 연구 파일 쪽 글이라 한국어로 쓴다.
import { BRIEF_MAX } from '@rw/core'
import type { Attempt, Claim, Problem, ProblemStop } from '@rw/core/contract/problems'
import { listProblemIds, readProblem } from './problems.js'
import type { Workbench } from './workbench.js'

const STOP: Record<ProblemStop, string> = {
  decision: '방향 보고가 사용자의 결정을 기다린다. 결정 전에는 새 시도를 시작하지 않는다',
  limit: '시도 한도에 닿았다. 다음 시도 대신 방향 보고를 낸다 (direction_report)',
  stuck: '폐기가 이어졌다. 다음 시도 대신 방향 보고를 낸다 (direction_report)',
  exhausted: '남은 후보가 없다. 후보를 더 늘어놓거나 방향 보고를 낸다',
}
const STATE = { proposed: '제안', draft: '쓰는 중', open: '진행', closed: '종료' } as const

const one = (s: string, max: number) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > max ? `${t.slice(0, max - 1)}…` : t }
const bytes = (lines: string[]) => Buffer.byteLength(lines.join('\n'), 'utf8')
const line = (a: Attempt, more = '') => `- ${a.label} ${one(a.method, 90)}${more}`
const SIDE = { for_yes: '예 근거', for_no: '아니오 근거', neither: '무관' } as const
const CLAIM_STATE = { candidate: '후보', active: '진행', reported: '판정 대기', holds: '성립', dropped: '폐기' } as const
/** 주장 한 줄: 번호 · 상태 · 받치는 쪽(질문 바로 아래) 또는 위 주장 · 진술 · 조건 · 근거가 된 시도 */
const claimLine = (p: Problem, c: Claim) => {
  const where = c.under ? `${c.under}의 근거` : SIDE[c.side ?? 'neither']
  const marks = [c.waiting && '아래 주장 대기', c.stale && '판정 후 변경', c.accepted && '승인', c.rejected && '기각'].filter(Boolean).join(' · ')
  const tries = c.attempts.map((id) => { const a = p.attempts.find((x) => x.id === id); return a ? `${a.label} ${CLAIM_STATE[a.state]}` : id }).join(', ')
  return `- ${'  '.repeat(Math.min(c.depth, 3))}${c.id} [${CLAIM_STATE[c.state]}${marks ? ` · ${marks}` : ''} · ${where}] ${one(c.statement, 110)}${c.condition ? ` (조건: ${one(c.condition, 50)})` : ''}${tries ? ` ← 시도 ${tries}` : ''}`
}
/** 시도 한 줄에 붙이는 겨눈 곳 */
const aim = (a: Attempt) => (a.claim ? ` → 주장 ${a.claim}` : ' → 질문')

/** 줄 묶음들을 중요한 순서로 받아, 한도를 넘으면 뒤 묶음의 줄부터 줄인다 */
function fit(head: string[], groups: { title: string; lines: string[] }[], tail: string[]): string {
  const shown = groups.map((g) => g.lines.length)
  const build = () => [...head, ...groups.flatMap((g, i) => {
    if (!g.lines.length) return []
    const cut = g.lines.length - shown[i]!
    return [g.title, ...g.lines.slice(0, shown[i]), ...(cut ? [`- … 그 밖 ${cut}개 (problem_read)`] : []), '']
  }), ...tail]
  for (let i = groups.length - 1; i >= 0 && bytes(build()) > BRIEF_MAX; i--) while (shown[i]! > 0 && bytes(build()) > BRIEF_MAX) shown[i]!--
  const out = build().join('\n')
  // 머리만으로 넘치면(아주 긴 질문 · 메시지) 글자 수로 자른다
  return Buffer.byteLength(out, 'utf8') <= BRIEF_MAX ? out : `${Buffer.from(out, 'utf8').subarray(0, BRIEF_MAX - 4).toString('utf8').replace(/�+$/, '')}…`
}

export function briefOf(p: Problem): string {
  const by = (s: Attempt['state']) => p.attempts.filter((a) => a.state === s)
  const head = [
    `# 흐름 \`${p.id}\` (${STATE[p.state]}): ${one(p.question, 160)}`, '',
    ...(p.if_yes ? [`- 예이면: ${one(p.if_yes, 140)}`] : []), ...(p.if_no ? [`- 아니오이면: ${one(p.if_no, 140)}`] : []),
    ...(p.reader ? [`- 독자: ${one(p.reader, 60)}`] : []),
    `- 채점: ${p.grading ? one(p.grading, 120) : '없음 (탐색: 결과는 사실로만 적는다)'}`,
    ...(p.first_test ? [`- 첫 시험: ${one(p.first_test, 120)}`] : []),
    `- 시도 ${p.used} / 한도 ${p.limit}`, '',
  ]
  const next = p.next ? [`다음: ${p.next.label} ${one(p.next.method, 90)} (attempt_start)`] : []
  const answer = p.closed?.answer ? ` · 답 ${p.closed.answer === 'yes' ? '예' : '아니오'}` : ''
  const tail = p.state !== 'open' ? [p.state === 'closed' ? `종료${answer}${p.closed?.reason ? `: ${one(p.closed.reason, 120)}` : ''}` : '사용자가 시작하기 전이다. 시도를 만들거나 시작하지 않는다.']
    : p.stop ? [`멈춤: ${STOP[p.stop]}`] : next.length ? next : ['다음 후보가 없다.']
  return fit(head, [
    { title: '폐기 사유 (같은 길을 다시 가지 않는다):', lines: p.lessons.map((l) => `- ${l.label} ${one(l.lesson, 110)}${l.reopen ? ` (다시 열 조건: ${one(l.reopen, 60)})` : ''}`) },
    { title: '사용자가 돌려보낸 시도 (작업한 쪽이 고쳐 다시 보고한다):', lines: by('active').filter((a) => a.returned).map((a) => line(a, `: ${one(a.returned!.note, 90)}`)) },
    { title: '판정 뒤에 파일이나 주장이 바뀐 성립 (다시 확인한다):', lines: p.attempts.filter((a) => a.changed?.length || a.restated).map((a) => line(a, `: ${one([...(a.restated ? ['주장'] : []), ...(a.changed ?? [])].join(', '), 90)}`)) },
    { title: '판정 대기 (작업한 쪽이 아닌 쪽이 attempt_verdict: 겨눈 주장이 이 시도의 근거에서 따라 나오는가):', lines: by('reported').map((a) => line(a, `${aim(a)}${a.result ? `: ${one(a.result, 70)}` : ''}${a.worker ? ` · 작업한 쪽 ${a.worker}` : ''}${a.test ? ` · 검사 \`${one(a.test, 70)}\`` : ''}`)) },
    { title: '진행:', lines: by('active').filter((a) => !a.returned).map((a) => line(a, `${aim(a)}${a.worker ? ` · ${a.worker}` : ''}`)) },
    { title: '주장 (점 하나가 주장 하나. 상태는 근거인 시도와 아래 주장에서 계산된다. 사실로 받아들이는 승인은 사용자가 흐름을 닫을 때 한다):', lines: p.claims.map((c) => claimLine(p, c)) },
    { title: '후보 (순서대로):', lines: by('candidate').map((a) => line(a, aim(a))) },
  ], tail)
}

export const problemBrief = (wb: Workbench, id: string): string => briefOf(readProblem(wb, id))

const STATUS_SHOWN = 5
/** STATUS의 "흐름" 절: 진행 중인 흐름 한 줄씩과 지금 할 것. 흐름이 없으면 빈 배열 */
export function problemStatusSection(wb: Workbench): string[] {
  const all: Problem[] = []
  for (const id of listProblemIds(wb)) { try { all.push(readProblem(wb, id)) } catch { /* 읽지 못한 파일은 화면의 진단에 뜬다 */ } }
  const open = all.filter((p) => p.state === 'open')
  const proposed = all.filter((p) => p.state === 'proposed').length, draft = all.filter((p) => p.state === 'draft').length
  if (!all.length) return []
  const out = ['## 흐름 — 원본 `workbench/problems/` · 질문 › 주장 › 시도', '',
    [`진행 ${open.length}`, draft && `쓰는 중 ${draft}`, proposed && `제안 ${proposed}`].filter(Boolean).join(' · '), '']
  for (const p of open.slice(0, STATUS_SHOWN)) {
    const c = p.counts
    const now = p.stop ? `멈춤: ${STOP[p.stop]}` : p.next ? `다음 ${p.next.label} ${one(p.next.method, 70)}` : '다음 후보 없음'
    out.push(`- \`${p.id}\` ${one(p.question, 70)} · 시도 ${p.used}/${p.limit} · 성립 ${c.holds} · 폐기 ${c.dropped}${c.reported ? ` · 판정 대기 ${c.reported}` : ''} · ${now}`)
  }
  if (open.length > STATUS_SHOWN) out.push(`- 그 밖 ${open.length - STATUS_SHOWN}개 (MCP \`problems\`)`)
  out.push('', '> 사용자가 시작한 흐름에서만 일한다: `problem_brief`로 이어받고 `attempt_add`(겨눌 주장 `claim`) · `attempt_start` · `attempt_report`(새 주장이면 판단할 수 있는 한 문장 `statement`, 질문 바로 아래면 받치는 쪽 `side`). 점 하나는 주장 하나이고 시도는 그 근거다. 성립 · 폐기는 작업한 쪽이 아닌 쪽이 정한다(`attempt_verdict`: 겨눈 주장이 이 시도의 근거에서 따라 나오는가). 멈춤이면 `direction_report`를 내고 선다. 새 흐름은 제안만 한다(`problem_propose`). 규칙대로 되지 않은 일(한 문장으로 적지 못함 · 판정하지 못함 · 사용자의 결정이 필요함 · 규칙을 돌아서 함)은 `problem_exception`으로 한 줄 남긴다. MCP가 없는 곳(클라우드)에서는 `pnpm agent:problem <폴더> …`가 같은 일을 한다.', '')
  return out
}
