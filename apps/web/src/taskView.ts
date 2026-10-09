import { todoDue, type BlockStatus, type JournalEntry } from '@rw/core'
import type { Task, TaskAsk, TaskState } from './api/tasks'
import { stripDue } from './homeData'
import { plural, t as tr } from './i18n'

/**
 * 맡긴 일(작업 탭, 10/7)을 화면에 보이는 말과 묶음으로 바꾸는 순수 함수들.
 * 형식과 규칙: docs/agent-delegated-work.md
 */

/** 상태 점: 사용자 차례(판단 대기 · 종결 조건 승인 대기)와 멈춤은 주황, 진행 파랑, 해결 청록, 폐기 회색 고리 */
export const TASK_DOT: Record<TaskState, BlockStatus> = {
  working: 'in-progress', proposed: 'blocked', result: 'blocked', done: 'solved', paused: 'blocked', stopped: 'stopped',
}
export const TASK_STATE_LABEL: Record<TaskState, string> = {
  working: tr('진행', 'In progress'), proposed: tr('종결 조건 승인 대기', 'Awaiting criteria approval'), result: tr('판단 대기', 'Awaiting decision'), done: tr('해결', 'Solved'), paused: tr('멈춤', 'Blocked'), stopped: tr('폐기', 'Dropped'),
}

/** 탭 이름에 쓰는 맡긴 일 제목 (id → 제목). 목록을 읽을 때마다 채운다 */
export const taskTitles = new Map<string, string>()

/** 판단할 것: 결과가 왔거나 종결 조건을 제안한 일 */
export const needsJudgment = (t: Task) => t.state === 'result' || t.state === 'proposed'

const AGENT_NAMES: Record<string, string> = { 'claude-code': 'Claude Code', codex: 'Codex', mcp: 'MCP' }
export const agentName = (agent: string) => AGENT_NAMES[agent] ?? agent

/** "2026-10-05 09:10" → 그 시각(ms). 읽을 수 없으면 null */
export function stampMs(stamp: string | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(stamp ?? '')
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0)).getTime()
}

/** "2026-10-05 09:10" → "10/5 09:10" */
export function shortStamp(stamp: string | undefined): string {
  const m = /^\d{4}-(\d{2})-(\d{2})(?:[ T](\d{1,2}:\d{2}))?/.exec(stamp ?? '')
  return m ? `${Number(m[1])}/${Number(m[2])}${m[3] ? ` ${m[3]}` : ''}` : stamp ?? ''
}

/** 걸린 시간: "35분", "27시간 49분", "3일 4시간" */
export function durationText(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000))
  if (min < 60) return tr(`${min}분`, `${min} min`)
  const h = Math.floor(min / 60)
  if (h < 48) return min % 60 ? tr(`${h}시간 ${min % 60}분`, `${h} h ${min % 60} min`) : tr(`${h}시간`, `${h} h`)
  const d = Math.floor(h / 24)
  return h % 24 ? tr(`${d}일 ${h % 24}시간`, `${plural(d, 'day')} ${h % 24} h`) : tr(`${d}일`, plural(d, 'day'))
}

/** 작업 시간의 끝: 결과를 낸 시각, 없으면 진행 중이면 지금, 아니면 파일을 마지막으로 고친 시각 */
export function taskEnd(t: Task, now = Date.now()): number {
  return stampMs(t.resultAt) ?? (t.state === 'working' ? now : t.mtime)
}

/** 카드 접힌 줄의 시각: "10/5 09:10 시작 · 27시간 49분"과 툴팁 */
export function taskTiming(t: Task, now = Date.now()): { text: string; tip: string } {
  const start = stampMs(t.created)
  const end = taskEnd(t, now)
  const span = start === null ? '' : ` · ${durationText(end - start)}`
  const endLabel = t.resultAt ? tr(`결과 ${shortStamp(t.resultAt)}`, `Result ${shortStamp(t.resultAt)}`) : t.state === 'working' ? tr('진행 중', 'In progress') : tr(`마지막 고침 ${shortStamp(localStamp(t.mtime))}`, `Last edited ${shortStamp(localStamp(t.mtime))}`)
  return { text: tr(`${shortStamp(t.created)} 시작${span}`, `Started ${shortStamp(t.created)}${span}`), tip: tr(`시작 ${shortStamp(t.created)} → ${endLabel}`, `Started ${shortStamp(t.created)} → ${endLabel}`) }
}

const pad = (n: number) => String(n).padStart(2, '0')
export function localStamp(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 카드의 결론: 종결 조건 제안이면 그 제안을 한 문장으로 */
export function cardConclusion(t: Task): string {
  if (t.state === 'proposed' && t.proposal) {
    const c = t.proposal.endCondition
    return c.length ? tr(`종결 조건 ${c.length}개를 제안했습니다: ${c.join(', ')}.`, `Proposed ${plural(c.length, 'completion criterion', 'completion criteria')}: ${c.join(', ')}.`) : tr('종결 조건을 제안했습니다.', 'Proposed completion criteria.')
  }
  return t.conclusion ?? ''
}

/** 카드·보고서의 사용자 확인 요청: 종결 조건 제안에는 "이 종결 조건으로 시작할까요?"가 먼저 온다 */
export function cardAsks(t: Task): TaskAsk[] {
  if (t.state === 'proposed' && !t.asks.length) return [{ q: tr('이 종결 조건으로 시작할까요?', 'Start with these completion criteria?'), options: [] }]
  return t.asks
}

/** 확인 요청의 고를 것: 에이전트가 주지 않았으면 예/아니요 (작업 파일에 적는 값이라 한국어 그대로) */
export const askOptions = (a: TaskAsk) => (a.options.length ? a.options : ['예', '아니요'])
/** 고를 것의 화면 이름: 기본 예/아니요만 바꾼다 */
export const askOptionLabel = (o: string) => (o === '예' ? tr('예', 'Yes') : o === '아니요' ? tr('아니요', 'No') : o)

/** 맡긴 일 목록의 묶음 (판단 대기 → 진행 → 멈춤 → 해결 · 폐기) */
export const TASK_GROUPS = [
  { key: 'judge', title: tr('판단 대기', 'Awaiting decision'), states: ['result', 'proposed'] },
  { key: 'working', title: tr('진행', 'In progress'), states: ['working'] },
  { key: 'paused', title: tr('멈춤', 'Blocked'), states: ['paused'] },
  { key: 'closed', title: tr('해결 · 폐기', 'Solved · Dropped'), states: ['done', 'stopped'] },
] as const satisfies readonly { key: string; title: string; states: readonly TaskState[] }[]

/** 맡긴 일 목록 한 줄의 가운데 글: 지금 무엇을 기다리는지 */
export function taskLine(t: Task): string {
  const last = t.judged.at(-1)
  switch (t.state) {
    case 'proposed': return tr('종결 조건 승인 대기', 'Awaiting criteria approval')
    case 'result': return t.endCheck === 'pass' ? tr('종결 조건 통과', 'Criteria met') : t.endCheck === 'fail' ? tr('종결 조건 미달', 'Criteria not met') : tr('결과 도착', 'Result in')
    case 'working':
      if (last?.verdict === 'send-back') return `${tr('수정', 'Revise')}: ${last.note ?? ''}`
      return t.endCondition ? `${tr('종결', 'Done when')}: ${t.endCondition}` : tr('종결 조건 제안을 기다림', 'Waiting for proposed criteria')
    case 'paused': return t.issues[0] ? `${tr('남은 문제', 'Open issue')}: ${t.issues[0].text}` : tr('멈춤', 'Blocked')
    case 'done': return `${tr('해결', 'Solved')}${last?.seconds ? ` · ${tr(`판단 ${Math.max(1, Math.round(last.seconds / 60))}분`, `decided in ${Math.max(1, Math.round(last.seconds / 60))} min`)}` : ''}`
    case 'stopped': return `${tr('폐기', 'Dropped')}${last?.note ? ` · ${last.note}` : ''}`
  }
}

/** 판단 · 맡긴 일 목록의 순서: 사용자 차례는 오래 기다린 것부터, 나머지는 최근 것부터 */
export function judgeOrder(tasks: Task[]): Task[] {
  return tasks.filter(needsJudgment).sort((a, b) => (stampMs(a.resultAt) ?? a.mtime) - (stampMs(b.resultAt) ?? b.mtime))
}

// ---------- 작업 탭의 한 주 달력 ----------

/** result: 결과가 와서 판단을 기다림(사용자 차례, 주황), returned: 결과가 왔고 이미 판단함 */
export type WeekMark = 'given' | 'result' | 'returned' | 'done' | 'memo' | 'status' | 'due'
export interface WeekItem { key: string; time: string; mark: WeekMark; text: string; task?: string }

const timeOf = (stamp: string | undefined) => /\d{1,2}:\d{2}/.exec(stamp ?? '')?.[0] ?? ''

/**
 * 날짜별 항목: 맡김 · 결과 도착(사용자 차례) · 끝낸 할 일 · 메모 · 상태 기록, 앞으로의 날에는 마감.
 * 같은 날 안에서는 시각 순.
 */
export function weekItems(tasks: Task[], entries: JournalEntry[]): Map<string, WeekItem[]> {
  const out = new Map<string, WeekItem[]>()
  const push = (date: string, item: WeekItem) => out.set(date, [...(out.get(date) ?? []), item])
  for (const t of tasks) {
    push(t.created.slice(0, 10), { key: `given-${t.id}`, time: timeOf(t.created), mark: 'given', text: `${tr('맡김', 'Delegated')} · ${t.title}`, task: t.id })
    if (t.resultAt) push(t.resultAt.slice(0, 10), { key: `result-${t.id}`, time: timeOf(t.resultAt), mark: needsJudgment(t) ? 'result' : 'returned', text: `${tr('결과', 'Result')} · ${t.title}`, task: t.id })
  }
  for (const e of entries) {
    const first = e.text.split('\n').find((x) => x.trim()) ?? ''
    if (e.kind === 'todo') {
      const due = e.done ? null : todoDue(e.text, e.date)
      if (due) push(due, { key: `due-${e.date}-${e.index}`, time: '', mark: 'due', text: `${tr('마감', 'Due')} · ${stripDue(first)}` })
      continue
    }
    // 판단 기록은 맡긴 일 항목과 겹치므로 상태 기록으로만 둔다
    push(e.date, { key: `${e.date}-${e.index}`, time: e.time, mark: e.kind === 'done' ? 'done' : e.kind === 'memo' ? 'memo' : 'status', text: e.kind === 'done' ? stripDue(first) : first })
  }
  for (const items of out.values()) items.sort((a, b) => (a.time || '99').localeCompare(b.time || '99'))
  return out
}

/** 브리핑 한 줄: "판단 3 기다림 · 맡긴 일 2 진행 중 · 이번 주 마감 1 · 마지막 결과 1일 전" */
export function briefCounts(tasks: Task[], days: string[], byDay: Map<string, WeekItem[]>) {
  const results = tasks.map((t) => stampMs(t.resultAt)).filter((x): x is number => x !== null)
  return {
    judge: tasks.filter(needsJudgment).length,
    working: tasks.filter((t) => t.state === 'working').length,
    due: days.reduce((n, d) => n + (byDay.get(d) ?? []).filter((i) => i.mark === 'due').length, 0),
    lastResult: results.length ? Math.max(...results) : null,
  }
}

/**
 * 보고서 본문을 두 절로: "## 요약과 결론"은 1절, "## 근거"와 그 밖의 절은 2절(제목을 남긴다).
 * 앱이 맡길 때 넣은 안내 주석(<!-- -->)은 뺀다. 제목이 없는 글은 1절이다.
 */
export function splitReport(body: string): { summary: string; evidence: string } {
  const text = body.replace(/<!--[^]*?-->/g, '')
  const parts = text.split(/^##[ \t]+(.+?)[ \t]*$/m)
  let summary = parts[0]!.trim()
  const evidence: string[] = []
  for (let i = 1; i < parts.length; i += 2) {
    const title = parts[i]!, content = (parts[i + 1] ?? '').trim()
    if (/^요약과 결론$/.test(title)) summary = [summary, content].filter(Boolean).join('\n\n')
    else if (/^근거$/.test(title)) { if (content) evidence.unshift(content) }
    else if (content) evidence.push(`### ${title}\n\n${content}`)
  }
  return { summary, evidence: evidence.join('\n\n') }
}

/**
 * 에이전트에게 줄 말 (맡긴 뒤 · 수정 요청 뒤 에이전트를 깨운다, 10/7): 그 프로젝트 폴더에서 Claude Code나 Codex에 붙여 넣는다.
 * 작업 파일이 곧 지시서이므로 파일과 규칙 문서만 가리킨다.
 */
export function agentPrompt(file: string, rules: string): string {
  return tr(`${file}에 맡긴 일을 해 줘. 먼저 이 파일과 규칙 문서 ${rules}를 읽고, 결과는 같은 파일에 채워.`, `Do the task delegated in ${file}. First read this file and the rules document ${rules}, then fill in the results in the same file.`)
}
