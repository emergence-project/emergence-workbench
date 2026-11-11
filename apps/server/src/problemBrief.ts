// 문제의 이어받기 요약(MCP problem_brief)과 STATUS의 "문제" 절.
// 이어받기는 다음 세션이 그 문제를 이어 가는 데 필요한 것만 싣는다: 질문 · 메시지 · 교훈 · 다음 · 한도. 2KB를 넘지 않는다 (BRIEF_MAX).
// STATUS와 이어받기는 연구 파일 쪽 글이라 한국어로 쓴다 (flowStatus.ts와 같다).
import { BRIEF_MAX } from '@rw/core'
import type { Attempt, Problem, ProblemStop } from '@rw/core/contract/problems'
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
    `# 문제 \`${p.id}\` (${STATE[p.state]}): ${one(p.question, 160)}`, '',
    ...(p.if_yes ? [`- 예이면: ${one(p.if_yes, 140)}`] : []), ...(p.if_no ? [`- 아니오이면: ${one(p.if_no, 140)}`] : []),
    ...(p.reader ? [`- 독자: ${one(p.reader, 60)}`] : []),
    `- 채점: ${p.grading ? one(p.grading, 120) : '없음 (탐색: 결과는 사실로만 적는다)'}`,
    ...(p.first_test ? [`- 첫 시험: ${one(p.first_test, 120)}`] : []),
    `- 시도 ${p.used} / 한도 ${p.limit}${p.needs === 'all' ? ' · 시도가 모두 성립해야 한다 (분해)' : ''}`, '',
  ]
  const next = p.next ? [`다음: ${p.next.label} ${one(p.next.method, 90)} (attempt_start)`] : []
  const tail = p.state !== 'open' ? [p.state === 'closed' ? `종료${p.closed?.reason ? `: ${one(p.closed.reason, 120)}` : ''}` : '사용자가 시작하기 전이다. 시도를 만들거나 시작하지 않는다.']
    : p.stop ? [`멈춤: ${STOP[p.stop]}`] : next.length ? next : ['다음 후보가 없다.']
  return fit(head, [
    { title: '교훈 (폐기한 시도. 같은 길을 다시 가지 않는다):', lines: p.lessons.map((l) => `- ${l.label} ${one(l.lesson, 110)}${l.reopen ? ` (다시 열 조건: ${one(l.reopen, 60)})` : ''}`) },
    { title: '판정 대기 (일한 쪽이 아닌 쪽이 attempt_verdict):', lines: by('reported').map((a) => line(a, a.worker ? ` · 일한 쪽 ${a.worker}` : '')) },
    { title: '진행:', lines: by('active').map((a) => line(a, a.worker ? ` · ${a.worker}` : '')) },
    { title: '성립:', lines: by('holds').map((a) => line(a, a.result ? `: ${one(a.result, 80)}` : '')) },
    { title: '후보 (순서대로):', lines: by('candidate').map((a) => line(a)) },
  ], tail)
}

export const problemBrief = (wb: Workbench, id: string): string => briefOf(readProblem(wb, id))

const STATUS_SHOWN = 5
/** STATUS의 "문제" 절: 진행 중인 문제 한 줄씩과 지금 할 것. 문제가 없으면 빈 배열 */
export function problemStatusSection(wb: Workbench): string[] {
  const all: Problem[] = []
  for (const id of listProblemIds(wb)) { try { all.push(readProblem(wb, id)) } catch { /* 읽지 못한 파일은 화면의 진단에 뜬다 */ } }
  const open = all.filter((p) => p.state === 'open')
  const proposed = all.filter((p) => p.state === 'proposed').length, draft = all.filter((p) => p.state === 'draft').length
  if (!all.length) return []
  const out = ['## 문제 — 원본 `workbench/problems/` · 시도 나무', '',
    [`진행 ${open.length}`, draft && `쓰는 중 ${draft}`, proposed && `제안 ${proposed}`].filter(Boolean).join(' · '), '']
  for (const p of open.slice(0, STATUS_SHOWN)) {
    const c = p.counts
    const now = p.stop ? `멈춤: ${STOP[p.stop]}` : p.next ? `다음 ${p.next.label} ${one(p.next.method, 70)}` : '다음 후보 없음'
    out.push(`- \`${p.id}\` ${one(p.question, 70)} · 시도 ${p.used}/${p.limit} · 성립 ${c.holds} · 폐기 ${c.dropped}${c.reported ? ` · 판정 대기 ${c.reported}` : ''} · ${now}`)
  }
  if (open.length > STATUS_SHOWN) out.push(`- 그 밖 ${open.length - STATUS_SHOWN}개 (MCP \`problems\`)`)
  out.push('', '> 사용자가 시작한 문제에서만 일한다: `problem_brief`로 이어받고 `attempt_add` · `attempt_start` · `attempt_report`. 성립 · 폐기는 일한 쪽이 아닌 쪽이 정한다(`attempt_verdict`). 멈춤이면 `direction_report`를 내고 선다. 새 문제는 제안만 한다(`problem_propose`).', '')
  return out
}
