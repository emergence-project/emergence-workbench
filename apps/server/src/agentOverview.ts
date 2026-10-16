// 여러 프로젝트를 한눈에 (10/15): 에이전트가 프로젝트마다 agent:status를 따로 돌리지 않고, 어디에 할 일이 있는지 먼저 본다.
// "사용자 차례"는 홈 화면의 "확인 필요" 점과 왼쪽 띠의 수(/api/research-issues)와 같은 계산이다 (AI와 사용자가 같은 수를 본다).
// 프로젝트 하나를 자세히 보는 것은 generateStatus(agentStatus.ts). 아무것도 쓰지 않는다.
import { localDate } from './fsutil.js'
import { homeShort } from './agentPaths.js'
import { localSyncState } from './gitSyncState.js'
import { pendingQuestions, unsortedRecords, userReplies, userTurnRecords } from './comments.js'
import { listTasks } from './tasks.js'
import { openTodos } from './todos.js'
import type { Workbench } from './workbench.js'

/** 사용자가 판단할 것: 확인이 필요한 노트 · 판단할 맡긴 일(결과 · 종결 조건 제안) · 에이전트 고침 검토 · 에이전트가 물은 기록(10/15) */
export interface UserTurn { notes: number; tasks: number; edits: number; records: number }

/** 홈 화면 "확인 필요"의 내역. edits는 에이전트 고침 기록(AgentEditStore)에서 센 그 프로젝트의 수 */
export function userTurnOf(wb: Workbench, edits = 0): UserTurn {
  return {
    notes: wb.tree().issues.length,
    tasks: listTasks(wb).filter((t) => t.state === 'result' || t.state === 'proposed').length,
    edits,
    records: userTurnRecords(wb.root),
  }
}

export interface OverviewRow {
  title: string
  folder: string
  user: UserTurn
  /** 에이전트가 할 것: 답 없는 질문 · 하지 않은 지시 · 사용자가 답한 에이전트 질문 · 분류 전 기록 · 진행 중인 맡긴 일 · 끝내지 않은 할 일 */
  agent: { questions: number; instructions: number; replies: number; unsorted: number; working: number; todos: number }
  behind: number
  ahead: number
  /** 일지의 마지막 기록 'YYYY-MM-DD HH:MM' */
  last?: string
}

export async function overviewRow(wb: Workbench, edits = 0): Promise<OverviewRow> {
  const journal = wb.recentJournal(365)
  const sync = await localSyncState(wb.repo)
  const lastEntry = journal.reduce<string | undefined>((m, e) => { const k = `${e.date} ${e.time}`; return !m || k > m ? k : m }, undefined)
  return {
    title: wb.readResearch().title,
    folder: homeShort(wb.repo),
    user: userTurnOf(wb, edits),
    agent: {
      questions: pendingQuestions(wb.root).length,
      instructions: pendingQuestions(wb.root, '지시').length,
      replies: userReplies(wb.root).length,
      unsorted: unsortedRecords(wb.root).length,
      working: listTasks(wb).filter((t) => t.state === 'working').length,
      todos: openTodos(wb.root).length,
    },
    behind: sync?.behind ?? 0,
    ahead: sync?.ahead ?? 0,
    ...(lastEntry && { last: lastEntry }),
  }
}

const parts = (xs: [string, number][]) => xs.filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(' · ') || '—'

/** 읽지 못한 폴더는 { folder, problem }으로 넘긴다 (표에 이유와 함께 남긴다) */
export function generateOverview(rows: (OverviewRow | { folder: string; problem: string })[], now = new Date()): string {
  const out = [
    `# 프로젝트 한눈에 (${localDate(now)} ${now.toTimeString().slice(0, 5)})`, '',
    '> 사용자 차례는 앱 홈의 "확인 필요"와 같은 계산이다. 에이전트는 사용자 차례를 대신 처리하지 않는다.',
    '> 프로젝트 하나를 자세히 보려면 `pnpm agent:status <폴더>`(MCP는 project_status).', '',
    '| 프로젝트 | 폴더 | 사용자 차례 | 에이전트 차례 | 저장소 | 최근 기록 |',
    '|---|---|---|---|---|---|',
  ]
  for (const r of rows) {
    if ('problem' in r) { out.push(`| (읽지 못함) | \`${r.folder}\` | ${r.problem.replace(/\|/g, '/')} | | | |`); continue }
    const repo = [r.behind && `${r.behind}커밋 뒤`, r.ahead && `안 올린 커밋 ${r.ahead}`].filter(Boolean).join(' · ') || '—'
    out.push(`| ${r.title.replace(/\|/g, '/')} | \`${r.folder}\` | ${parts([['노트', r.user.notes], ['맡긴 일 판단', r.user.tasks], ['수정 검토', r.user.edits], ['물은 기록', r.user.records]])} | ${parts([['답 없는 질문', r.agent.questions], ['대기 중인 지시', r.agent.instructions], ['사용자가 답한 질문', r.agent.replies], ['분류 전 기록', r.agent.unsorted], ['진행 중 맡긴 일', r.agent.working], ['할 일', r.agent.todos]])} | ${repo} | ${r.last ?? '—'} |`)
  }
  out.push('')
  return out.join('\n')
}
