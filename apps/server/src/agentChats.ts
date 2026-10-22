/**
 * 에이전트 대화 (프로젝트 관리 1단계, 2026-10-21 사용자 결정): 앱이 맥의 에이전트를 띄워 프로젝트 하나 · 일 하나의 대화를 돌린다.
 *
 * - 대화마다 범위(프로젝트 · 주제 · 노트)와 고치기 단계(읽기만 · 노트 고치기)가 있다. 범위 밖은 읽을 수 있지만(대화에 「범위 밖」으로 보임)
 *   고치지 못하고, 노트는 앱 MCP(edit_note)로만 고친다(수정 검토가 걸린다). 파일을 바로 쓰는 도구는 막는다.
 * - 고치는 동안 그 파일을 「잡은 파일」로 적어, 다른 대화가 같은 파일을 고치지 못하게 한다. 차례가 끝나면 푼다.
 * - 셸 명령 · 웹 · 모르는 도구는 허락 카드로 묻는다(사용자 차례). 「이 대화에서 늘」은 같은 명령에만.
 * - 동시에 도는 대화는 limit개(맥 메모리, 10/14)까지이고 넘치면 줄을 선다.
 * - 앱 고치기 대화(범위 app, 2단계 10/21, 10/22 사용자 결정 "권한 넓히기"): 앱 저장소의 따로 둔 작업 폴더(appWorktree.ts)에서
 *   파일을 고치고 명령(시험 · 형식 검사 · 화면 그림)도 돌린다. 올리기 · PR · 합치기와 앱 서비스는 앱이 맡는다(app_submit · app_checks).
 *   대화마다 자기 브랜치 · PR이라 다른 PR이 열려 있어도 올린다. 연구 프로젝트는 읽기만 한다.
 * 대화 기록은 앱 설정 폴더 agent-chats/<id>.json. 계약은 @rw/core/contract/agentChats.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { APP_RID } from '@rw/core/contract/agentChats'
import type { AppChecks, AppSubmitBody, AppSubmitted, FeedbackAnswerBody, FeedbackAnswered, AskAnswer, Attach, Chat, ChatEffort, ChatItem, ChatMessageBody, ChatMode, ChatModel, ChatRow, ChatScope, ChatSettings, ChatWrite, ImageIn, ModelChoice, NewChatBody, Todo, WorkState } from '@rw/core/contract/agentChats'
import type { AppWork } from './appWorktree.js'
import { agentTurnReasons, agentTurns, localDate, localTime, type AgentSettings } from '@rw/core'
import { listAllFeedback, writeFeedbackAnswer, type FeedbackListItem } from './feedback.js'
import { isInside } from './fsutil.js'
import { t } from './i18n.js'
import { WorkbenchError } from './workbench.js'

// ---------- 에이전트 실행기 (실제는 agentRunner.ts의 Claude Agent SDK, 테스트는 가짜) ----------

export type ToolDecision = { allow: true } | { allow: false; message: string }

export interface RunInput {
  prompt: string
  /** 붙여 넣은 그림 (이번 지시에만) */
  images?: ImageIn[]
  /** plan이면 계획을 승인할 때까지 SDK의 계획 모드로 시작한다 */
  mode: ChatMode
  model: ChatModel
  effort: ChatEffort
  /** 이어서 지시할 때: 앞 차례의 세션 */
  sessionId?: string
  cwd: string
  /** 읽어도 묻지 않는 폴더 (공용 라이브러리) */
  extraDirs: string[]
  /** 대화를 열 때 주는 짧은 안내 (범위 · 단계 · 다른 대화가 잡은 파일) */
  brief: string
  write: ChatWrite
  /** 앱 고치기 대화: 그 대화 id (앱 MCP에 app_submit · app_checks를 붙이고, 파일 고치기 도구와 명령을 연다) */
  appChat?: string
  /** 에이전트 프로세스에 더할 환경 변수 (앱 고치기 대화: 화면 그림 포트 등) */
  env?: Record<string, string>
  canUseTool: (tool: string, input: Record<string, unknown>) => Promise<ToolDecision>
  signal: AbortSignal
}

export type RunEvent =
  | { type: 'session'; id: string }
  | { type: 'text'; text: string; sub?: boolean }
  | { type: 'tool'; tool: string; input: Record<string, unknown>; sub?: boolean }
  | { type: 'result'; ok: boolean; cost?: number; seconds?: number; error?: string }

/** 실행기. models = 고를 수 있는 모델 (맥의 Claude Code에게 묻는다, 모르면 없음) */
export type AgentRunner = ((input: RunInput) => AsyncIterable<RunEvent>) & { models?: () => Promise<ModelChoice[]> }

// ---------- 허락 규칙 (순수 함수) ----------

/** 앱 MCP 서버 이름 (도구 이름 mcp__workbench__<도구>) */
export const MCP_NAME = 'workbench'
const MCP = `mcp__${MCP_NAME}__`

const READ_TOOLS = new Set(['Read', 'Glob', 'Grep', 'LS', 'NotebookRead'])
/** 묻지 않고 두는 것: 할 일 목록 · 서브에이전트(그 도구 호출도 같은 규칙을 거친다) · 도구 찾기 · 셸 결과 보기 */
const FREE_TOOLS = new Set(['TodoWrite', 'Task', 'Agent', 'ToolSearch', 'BashOutput', 'KillBash', 'KillShell', 'EnterPlanMode'])
/** 계획 모드에서 계획을 보이는 도구: 계획 승인 카드가 된다 */
export const PLAN_TOOL = 'ExitPlanMode'
/** 파일을 바로 쓰는 도구: 1단계에서는 막는다 (노트는 edit_note로) */
export const FILE_WRITE_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'] as const
const MCP_WRITES = new Set(['edit_note', 'edit_concept', 'add_record', 'answer_record', 'flow_add', 'flow_update', 'flow_review'])
/** 앱 고치기 대화가 막는 연구 쪽 쓰기 (위 + 맡긴 일 · 일지) */
const RESEARCH_WRITES = new Set([...MCP_WRITES, 'add_task', 'report_task', 'add_journal'])
/** 앱 고치기 대화만 쓰는 앱 MCP 도구: 커밋해 PR 열기 · CI 결과 */
export const APP_SUBMIT = 'app_submit'
export const APP_CHECKS = 'app_checks'
/** 맡은 피드백의 처리 기록 (앱이 status.yaml에 적는다) */
export const FEEDBACK_ANSWER = 'feedback_answer'

export interface PolicyCtx {
  rid: string
  write: ChatWrite
  mode: ChatMode
  /** 계획 먼저 모드에서 이번 차례의 계획을 승인했는지 */
  planOk: boolean
  scope: ChatScope
  repo: string
  /** 묻지 않고 읽는 다른 폴더 (공용 라이브러리 · 등록한 다른 프로젝트) */
  readable: string[]
  /** 다른 대화가 잡은 파일이면 그 대화 이름 */
  claimedBy: (file: string) => string | undefined
}

export type Verdict =
  | { kind: 'allow'; claim?: string }
  /** label = 「늘 허락」했을 때 보일 이름, claim = 허락하면 잡을 파일, plan = 계획 승인 카드 */
  | { kind: 'ask'; summary: string; key: string; label: string; claim?: string; plan?: string }
  /** reason = 사용자에게 보일 말, message = 에이전트에게 돌려줄 말 (영어) */
  | { kind: 'deny'; reason: string; message: string }

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const clip = (s: string, n = 300) => (s.length > n ? `${s.slice(0, n)}…` : s)
const posix = (p: string) => p.split(path.sep).join('/')

/** 범위가 차지하는 저장소 안 폴더 (저장소 기준, 끝에 / 없음). 프로젝트면 '' */
export function scopeDir(scope: ChatScope): string {
  if (scope.kind === 'topic' && scope.target) return `workbench/topics/${scope.target}`
  if (scope.kind === 'note' && scope.target) {
    // 노트 폴더(…/<노트>/note.md)면 그 폴더, 파일 하나짜리 노트(workbench/blocks/<id>.tex 등)면 그 파일만
    const d = path.posix.dirname(scope.target)
    return /^note\.[a-z]+$/.test(path.posix.basename(scope.target)) && d !== '.' ? d : scope.target
  }
  return ''
}

/** 저장소 기준 경로가 범위 안인지 */
export function inScope(scope: ChatScope, rel: string): boolean {
  const d = scopeDir(scope)
  if (!d) return true
  if (scope.kind === 'note' && scope.target === rel) return true
  return rel === d || rel.startsWith(`${d}/`)
}

/** 도구 입력의 파일 경로 (읽기 도구) */
const pathOf = (input: Record<string, unknown>) => str(input.file_path) || str(input.notebook_path) || str(input.path)

/** 에이전트가 쓴 도구 한 줄 요약과 범위 밖인지 (대화에 보일 것) */
export function describeStep(ctx: Pick<PolicyCtx, 'rid' | 'scope' | 'repo'>, tool: string, input: Record<string, unknown>): { tool: string; summary: string; outside?: boolean } {
  if (tool.startsWith(MCP)) {
    const name = tool.slice(MCP.length)
    const project = str(input.project)
    const file = str(input.file)
    const outside = (project && project !== ctx.rid) || (file && project === ctx.rid && !inScope(ctx.scope, file)) ? true : undefined
    const what = [project && project !== ctx.rid ? project : '', file || str(input.id) || str(input.target) || str(input.query) || str(input.section) || str(input.title) || str(input.state)].filter(Boolean).join(' · ')
    return { tool: name, summary: clip(what), ...(outside && { outside }) }
  }
  if (READ_TOOLS.has(tool)) {
    const p = pathOf(input)
    const abs = p ? path.resolve(ctx.repo, p) : ''
    const rel = abs && isInside(ctx.repo, abs) ? posix(path.relative(ctx.repo, abs)) : ''
    const outside = abs ? (!rel && abs !== ctx.repo) || (!!rel && !inScope(ctx.scope, rel)) : false
    const summary = [rel || p, str(input.pattern)].filter(Boolean).join(' · ')
    return { tool, summary: clip(summary), ...(outside && { outside }) }
  }
  if ((FILE_WRITE_TOOLS as readonly string[]).includes(tool)) {
    const abs = path.resolve(ctx.repo, pathOf(input))
    return { tool, summary: clip(isInside(ctx.repo, abs) ? posix(path.relative(ctx.repo, abs)) : pathOf(input)) }
  }
  if (tool === 'Bash') return { tool, summary: clip(str(input.command)) }
  if (tool === 'WebFetch') return { tool, summary: clip(str(input.url)) }
  if (tool === 'WebSearch') return { tool, summary: clip(str(input.query)) }
  if (tool === 'Task' || tool === 'Agent') return { tool, summary: clip(str(input.description) || str(input.prompt), 120) }
  return { tool, summary: clip(JSON.stringify(input), 160) }
}

/**
 * 앱 고치기 대화에서 에이전트가 직접 하지 않는 명령: 올리기 · PR · 합치기는 앱이(app_submit, 합치기 설정),
 * 실사용 앱 서비스는 사용자가 다룬다. 나머지(시험 · 형식 검사 · 화면 그림 · 커밋 · main 받기)는 작업 폴더에서 돌린다.
 */
const APP_OWNED = /\bgit\s+push\b|\bgh\s+(pr|release|repo|workflow|api)\b|\bservice:|\blaunchctl\b|\bgit\s+worktree\b/

/** 앱 고치기 대화의 도구 판정 (judge가 부른다) */
function judgeApp(ctx: PolicyCtx, tool: string, input: Record<string, unknown>): Verdict {
  const gated = ctx.mode === 'plan' && !ctx.planOk
  const readOnly: Verdict = { kind: 'deny', reason: t('읽기만 하는 대화라 고치지 않습니다', 'This conversation is read-only'), message: 'This conversation is read-only: do not change files. Tell the user what you would change instead.' }
  const notYet: Verdict = { kind: 'deny', reason: t('계획을 승인하기 전이라 고치지 않습니다', 'Not changed before the plan is approved'), message: `Plan first: do not change anything yet. Call ${PLAN_TOOL} with the plan; the user approves it in the app, then you can make the changes.` }
  if ((FILE_WRITE_TOOLS as readonly string[]).includes(tool)) {
    const p = pathOf(input)
    const abs = p ? path.resolve(ctx.repo, p) : ''
    const rel = abs && isInside(ctx.repo, abs) ? posix(path.relative(ctx.repo, abs)) : ''
    if (ctx.write === 'read') return readOnly
    if (gated) return notYet
    if (!rel || rel === '.git' || rel.startsWith('.git/')) {
      return { kind: 'deny', reason: t(`작업 폴더 밖이라 고치지 않습니다: ${p}`, `Outside the work folder: ${p}`), message: `${p} is outside this conversation's work folder (${ctx.repo}). Change files only inside it.` }
    }
    if (ctx.mode === 'ask') return { kind: 'ask', summary: t(`파일 고치기: ${rel}`, `Edit file: ${rel}`), key: `edit:${rel}`, label: t(`파일 고치기 · ${rel}`, `Edit file · ${rel}`), claim: rel }
    return { kind: 'allow', claim: rel }
  }
  if (tool === 'Bash') {
    const cmd = str(input.command)
    if (APP_OWNED.test(cmd)) {
      return {
        kind: 'deny',
        reason: t('올리기 · PR · 합치기와 앱 서비스는 앱이 맡습니다', 'Pushing, PRs, merging and the app service are left to the app'),
        message: `The app does this, not you: call ${MCP}${APP_SUBMIT} to commit, push and open or update the pull request, and ${MCP}${APP_CHECKS} for CI. Do not touch the running app service or other worktrees.`,
      }
    }
    if (ctx.write === 'read') return readOnly
    if (gated) return notYet
    if (ctx.mode === 'ask') return { kind: 'ask', summary: clip(cmd), key: `Bash:${cmd}`, label: t(`명령 · ${clip(cmd, 80)}`, `Command · ${clip(cmd, 80)}`) }
    return { kind: 'allow' }
  }
  if (tool.startsWith(MCP)) {
    const name = tool.slice(MCP.length)
    if (name === APP_CHECKS) return { kind: 'allow' }
    if (name === APP_SUBMIT) {
      if (ctx.write === 'read') return readOnly
      if (gated) return notYet
      if (ctx.mode === 'ask') return { kind: 'ask', summary: t(`PR 올리기: ${clip(str(input.title), 120)}`, `Open PR: ${clip(str(input.title), 120)}`), key: APP_SUBMIT, label: t('PR 올리기', 'Open PR') }
      return { kind: 'allow' }
    }
    if (!RESEARCH_WRITES.has(name)) return { kind: 'allow' }
    return { kind: 'deny', reason: t('앱 고치기 대화는 연구 프로젝트를 고치지 않습니다', 'App conversations do not change research projects'), message: 'This conversation fixes the app itself; it does not change research notes, records, tasks or flows. Tell the user what should change there instead.' }
  }
  return { kind: 'ask', summary: `${tool} · ${describeStep(ctx, tool, input).summary}`, key: tool, label: tool }
}

/** 도구 한 번을 허락할지: allow · ask(허락 카드) · deny(막고 이유) */
export function judge(ctx: PolicyCtx, tool: string, input: Record<string, unknown>): Verdict {
  if (FREE_TOOLS.has(tool)) return { kind: 'allow' }
  if (tool === PLAN_TOOL) {
    if (ctx.mode !== 'plan' || ctx.planOk) return { kind: 'allow' }
    return { kind: 'ask', summary: t('계획', 'Plan'), plan: clip(str(input.plan), 6000), key: `${PLAN_TOOL}:${crypto.randomBytes(4).toString('hex')}`, label: t('계획', 'Plan') }
  }
  if (READ_TOOLS.has(tool)) {
    const p = pathOf(input)
    const abs = p ? path.resolve(ctx.repo, p) : ctx.repo
    if (isInside(ctx.repo, abs) || abs === ctx.repo || ctx.readable.some((d) => abs === d || isInside(d, abs))) return { kind: 'allow' }
    return { kind: 'ask', summary: t(`등록한 폴더 밖 읽기: ${abs}`, `Read outside registered folders: ${abs}`), key: `${tool}:${abs}`, label: t(`읽기 · ${abs}`, `Read · ${abs}`) }
  }
  if (ctx.scope.kind === 'app') return judgeApp(ctx, tool, input)
  if ((FILE_WRITE_TOOLS as readonly string[]).includes(tool)) {
    return {
      kind: 'deny',
      reason: t('파일을 바로 고치는 것은 막혀 있습니다. 노트는 앱을 거쳐(수정 검토) 고칩니다', 'Editing files directly is blocked; notes are changed through the app (agent edit review)'),
      message: 'Editing files directly is disabled in this conversation. Change notes with the workbench MCP tool edit_note (read_note first, pass its hash as baseHash). For anything else, tell the user what should change and where.',
    }
  }
  if (tool.startsWith(MCP)) {
    const name = tool.slice(MCP.length)
    if (!MCP_WRITES.has(name)) return { kind: 'allow' }
    if (ctx.write === 'read') {
      return { kind: 'deny', reason: t('읽기만 하는 대화라 고치지 않습니다', 'This conversation is read-only'), message: 'This conversation is read-only: do not change notes, records or the flow. Tell the user what you would change instead.' }
    }
    if (ctx.mode === 'plan' && !ctx.planOk) {
      return {
        kind: 'deny',
        reason: t('계획을 승인하기 전이라 고치지 않습니다', 'Not changed before the plan is approved'),
        message: `Plan first: do not change anything yet. When your plan is ready, call ${PLAN_TOOL} with the plan; the user approves it in the app, then you can make the changes.`,
      }
    }
    const project = str(input.project)
    if (name === 'edit_concept' || (project && project !== ctx.rid)) {
      return {
        kind: 'deny',
        reason: t('이 대화의 범위 밖이라 고치지 않습니다', 'Outside this conversation\'s scope'),
        message: `That is outside this conversation's scope (project ${ctx.rid}). Do not change it; tell the user what should change and where, so the conversation that owns it can do it.`,
      }
    }
    if (name === 'edit_note') {
      const file = str(input.file)
      if (!inScope(ctx.scope, file)) {
        return {
          kind: 'deny',
          reason: t(`범위 밖 노트라 고치지 않습니다: ${file}`, `Note outside this conversation's scope: ${file}`),
          message: `${file} is outside this conversation's scope (${scopeDir(ctx.scope)}). Do not change it; tell the user what should change there and why.`,
        }
      }
      const other = ctx.claimedBy(file)
      if (other) {
        return {
          kind: 'deny',
          reason: t(`다른 대화(「${other}」)가 고치는 중인 파일입니다: ${file}`, `Another conversation ("${other}") is changing ${file}`),
          message: `Another conversation ("${other}") is changing ${file} right now. Do not change it; finish what you can and tell the user.`,
        }
      }
      if (ctx.mode === 'ask') return { kind: 'ask', summary: t(`노트 고치기: ${file}`, `Edit note: ${file}`), key: `edit_note:${file}`, label: t(`노트 고치기 · ${file}`, `Edit note · ${file}`), claim: file }
      return { kind: 'allow', claim: file }
    }
    if (ctx.mode === 'ask') return { kind: 'ask', summary: `${name} · ${describeStep(ctx, tool, input).summary}`, key: name, label: name }
    return { kind: 'allow' }
  }
  const step = describeStep(ctx, tool, input)
  if (tool === 'Bash') return { kind: 'ask', summary: step.summary, key: `Bash:${str(input.command)}`, label: t(`명령 · ${clip(str(input.command), 80)}`, `Command · ${clip(str(input.command), 80)}`) }
  return { kind: 'ask', summary: `${tool} · ${step.summary}`, key: tool, label: tool }
}

// ---------- 안내 (대화를 열 때 한 번, 짧게) ----------

/** 앱 고치기 대화의 안내 */
export function appBriefFor(o: { branch: string; write: ChatWrite; mode?: ChatMode; rules?: string; feedback?: boolean }): string {
  const lines = [
    `You are fixing the Emergence Workbench app itself, from inside the app. The current folder is a separate git worktree of the app repository on branch ${o.branch}, made from origin/main. The running app and the user's own checkout are elsewhere.`,
    `Read CLAUDE.md first${o.rules ? `, then the maintainer's personal rules at ${o.rules} (they take precedence)` : ''}. Feedback handling rules: docs/feedback/agent.md.`,
    o.write === 'read'
      ? 'This conversation is read-only: do not change files. Tell the user what you would change.'
      : 'Edit files directly inside this folder (Edit / Write) and run commands here (Bash). Start with `pnpm install --frozen-lockfile --prefer-offline` if node_modules is missing.',
    'Check your own work before submitting: `pnpm type-check`, `pnpm test` (or the one test file you touched, e.g. `pnpm --filter @rw/server exec vitest run src/<file>.test.ts`), and for screen changes `pnpm shots` and look at the pictures in shots/ yourself (SHOTS_PORT is already set for this conversation). Fix what fails before submitting.',
    `Do not push, open or merge PRs yourself and do not touch the running app service: when the change is ready, call ${APP_SUBMIT} with a one-line Korean PR title and a body that follows the PR template; the app commits, pushes this conversation's own branch and opens or updates its pull request (other open PRs do not block it). GitHub CI then runs again. Call ${APP_CHECKS} to read the result; if a check fails, read the log, fix and call ${APP_SUBMIT} again. If the app says the branch conflicts with main, run \`git fetch origin main && git merge origin/main\`, resolve, check again and submit.`,
    'Update tests and docs that the change touches (about section prs, uiNames.en.json, design-system.md) as CLAUDE.md says.',
    'Research projects are read-only here: do not change notes, records, tasks or flows.',
  ]
  if (o.feedback) lines.push(
    `This conversation handles one app feedback item (the first message). Follow docs/feedback/agent.md and the personal rules for its kind: fix only a 수정, answer a 질문 without changing that code, judge a 제안 without building it. Its picture (the screen at the moment the user left it) is attached to the first message, and its spot is the data-ui name: find it with \`grep -rn 'data-ui="<spot>"' apps/web/src\`.`,
    `Do not edit the feedback files. Record the handling with ${FEEDBACK_ANSWER}: state, a note whose first line is one of the fixed answer phrases, understood, cause, and clean (the corrected sentence); ask when the user must decide; miss and lesson when redoing a revision request; replies for unanswered comments. For a fix, call it after ${APP_CHECKS} shows CI green, with after = the screen picture name from scripts/shots/screens.mjs that shows the change, so the app saves the 전/후 pictures.`,
  )
  if (o.mode === 'plan' && o.write !== 'read') lines.push(`Plan first: read what you need, then call ${PLAN_TOOL} with a short numbered plan. Change nothing until the user approves it.`)
  lines.push('Use TodoWrite for work with three or more steps. Write to the user in Korean, briefly: result first.')
  return lines.join('\n')
}

export function briefFor(o: { rid: string; title: string; scope: ChatScope; write: ChatWrite; mode?: ChatMode; others: { title: string; claims: string[] }[] }): string {
  const scope = o.scope.kind === 'project' ? 'the whole project' : `${o.scope.kind} ${o.scope.target} (folder ${scopeDir(o.scope)})`
  const lines = [
    `You are working inside Emergence Workbench on the project "${o.title}" (project id ${o.rid}). The current folder is its repository.`,
    `Scope: ${scope}. Read outside the scope only when the work needs it. You cannot change anything outside the scope: say what should change, where and why, and stop there.`,
    o.write === 'read'
      ? 'This conversation is read-only: do not change notes, records or files. Running a command needs the user\'s approval each time.'
      : 'Change notes only with the workbench MCP tool edit_note (read_note first, pass its hash as baseHash); the user reviews each changed paragraph. Records: add_record / answer_record. Files cannot be edited directly. Running a command needs the user\'s approval.',
    `Start with the workbench MCP tools: rules (project ${o.rid}) and project_status; keep reads short and read more only when needed.`,
  ]
  if (o.mode === 'plan' && o.write !== 'read') lines.push(`Plan first: read what you need, then call ${PLAN_TOOL} with a short numbered plan. Change nothing until the user approves it.`)
  lines.push('Use TodoWrite for work with three or more steps: the user sees the list live. Use subagents (Task) for broad searches so the main conversation stays short.')
  const busy = o.others.filter((c) => c.claims.length)
  if (busy.length) lines.push(`Other conversations are changing these files now; do not change them: ${busy.map((c) => `${c.title}: ${c.claims.join(', ')}`).join('; ')}.`)
  lines.push('Write to the user in Korean, briefly: result first.')
  return lines.join('\n')
}

/** 지시와 붙인 것을 에이전트에게 줄 글로 (붙인 것은 이름과 읽을 방법만, 고른 글은 그대로) */
export function promptOf(text: string, attach?: Attach[]): string {
  if (!attach?.length) return text
  const how: Record<Attach['kind'], string> = {
    note: 'note (read_note)', topic: 'topic (project_status / list_notes)', file: 'file (Read)', selection: 'selected text', paper: 'paper (library)', record: 'record (read_records)',
  }
  const lines = attach.map((a) => a.kind === 'selection'
    ? `- ${how.selection} from ${a.ref}:\n${(a.text ?? '').split('\n').map((l) => `  > ${l}`).join('\n')}`
    : `- ${how[a.kind]}: ${a.ref}${a.label && a.label !== a.ref ? ` (${a.label})` : ''}`)
  return `${text}\n\nAttached by the user (read these first, nothing else unless needed):\n${lines.join('\n')}`
}

/** 노트 고침 입력에서 보일 것 (앞뒤 글은 줄여서) */
export function editOf(input: Record<string, unknown>): { parts: { old: string; new: string }[]; added: number; removed: number; reason?: string } {
  const edits = Array.isArray(input.edits) ? (input.edits as { old?: unknown; new?: unknown; reason?: unknown }[]) : []
  const lines = (s: string) => (s ? s.split('\n').length : 0)
  let added = 0
  let removed = 0
  const parts = edits.slice(0, 6).map((e) => ({ old: clip(str(e.old), 400), new: clip(str(e.new), 400) }))
  for (const e of edits) { added += lines(str(e.new)); removed += lines(str(e.old)) }
  const reason = str(input.summary) || str(edits[0]?.reason)
  return { parts, added, removed, ...(reason && { reason: clip(reason, 300) }) }
}

/** 파일 고침(Edit · MultiEdit · Write) 입력에서 보일 것 (앱 고치기 대화) */
export function fileEditOf(tool: string, input: Record<string, unknown>): { parts: { old: string; new: string }[]; added: number; removed: number } {
  const lines = (s: string) => (s ? s.split('\n').length : 0)
  const pairs = tool === 'MultiEdit' && Array.isArray(input.edits)
    ? (input.edits as { old_string?: unknown; new_string?: unknown }[]).map((e) => ({ old: str(e.old_string), new: str(e.new_string) }))
    : tool === 'Write' ? [{ old: '', new: str(input.content) }]
      : [{ old: str(input.old_string), new: str(input.new_string) }]
  let added = 0
  let removed = 0
  for (const e of pairs) { added += lines(e.new); removed += lines(e.old) }
  return { parts: pairs.slice(0, 6).map((e) => ({ old: clip(e.old, 400), new: clip(e.new, 400) })), added, removed }
}

const TODO_STATE: Record<string, Todo['state']> = { pending: 'pending', in_progress: 'in_progress', completed: 'completed' }
/** TodoWrite 입력의 할 일 목록 */
export function todosOf(input: Record<string, unknown>): Todo[] {
  const list = Array.isArray(input.todos) ? (input.todos as { content?: unknown; activeForm?: unknown; status?: unknown }[]) : []
  return list.slice(0, 30).map((x) => ({ text: clip(str(x.content), 200), state: TODO_STATE[str(x.status)] ?? 'pending' }))
}

// ---------- 대화들 ----------

/** 파일에 두는 대화 (계약의 Chat에 세션 · 늘 허락한 것을 더함) */
type Stored = Omit<Chat, 'always' | 'added' | 'removed' | 'wait' | 'archived'> & {
  sessionId?: string
  /** 늘 허락한 것: 판정 열쇠와 보일 이름 */
  alwaysKeys?: { key: string; label: string }[]
  /** 일하는 중에 받은 지시 (다음 차례에 함께 읽는다) */
  pending?: { prompt: string; images?: ImageIn[] }[]
  /** 이번 차례의 계획을 승인했는지 */
  planOk?: boolean
  archived?: boolean
  /** 앱 고치기 대화의 작업 폴더 */
  worktree?: string
  /** 피드백 대화: CI가 빨개 실패 기록을 다시 보낸 횟수와 마지막으로 본 실패 (같은 실패를 두 번 보내지 않게) */
  ciRetries?: number
  ciSeen?: string
}

/** 피드백 하나에서 사용자 쪽 마지막 일(남김 · 답 · 코멘트 · 고친 글)의 시각 (이 컴퓨터 시간대). 저절로 맡기기가 같은 일을 두 번 맡지 않게 */
export function lastTouched(e: FeedbackListItem): number {
  const at = [`${e.date}T${e.time}`, e.review?.at, e.review?.edited, ...(e.comments ?? []).flatMap((c) => [c.at, c.edited])]
  return Math.max(...at.filter((x): x is string => !!x).map((x) => new Date(x).getTime()).filter((n) => !Number.isNaN(n)))
}

/** 피드백을 맡길 때 대화의 첫 지시: 그 항목의 글 · 자리 · 그림과 차례인 이유 (처리 규칙은 안내에) */
export function feedbackPrompt(e: FeedbackListItem, reasons: string[], picture?: string): string {
  const lines = [
    t('이 피드백 하나를 피드백 처리 규칙대로 처리해 주세요.', 'Handle this one feedback item by the feedback rules.'),
    '',
    `- key: ${e.key}`,
    `- ${t('유형', 'Kind')}: ${e.status?.kind ?? e.kind}`,
    `- ${t('부위', 'Spot')}: ${e.target}${e.route ? ` (${e.route})` : ''}`,
    ...(e.note ? [`- ${t('열린 노트', 'Open note')}: ${e.note}`] : []),
    ...(e.viewport || e.theme ? [`- ${t('화면', 'Screen')}: ${[e.viewport, e.theme].filter(Boolean).join(' · ')}`] : []),
    ...(e.version ? [`- ${t('남길 때 앱', 'App when left')}: ${e.version}`] : []),
    ...(picture ? [`- ${t('그림', 'Picture')}: ${picture}`] : []),
    ...reasons.map((r) => `- ${t('차례인 이유', 'Why now')}: ${r}`),
    '',
    e.text.trim(),
  ]
  if (e.status) lines.push('', `${t('지금 처리 기록', 'Current record')}: ${e.status.state}${e.status.note ? ` — ${e.status.note}` : ''}`)
  if (e.review) lines.push(`${t('사용자 답', 'User answer')}: ${e.review.verdict} (${e.review.at})${e.review.note ? ` — ${e.review.note}` : ''}`)
  const answered = new Set((e.status?.replies ?? []).map((r) => r.to))
  for (const c of e.comments ?? []) if (!answered.has(c.at)) lines.push(`${t('답 없는 코멘트', 'Unanswered comment')} (at ${c.at}): ${c.note}`)
  return lines.join('\n')
}


/** 카드에 받은 답 (거절의 할 말, 계획 승인 뒤 맡기는 정도) */
type Answer = { answer: AskAnswer; note?: string; mode?: ChatMode }

const MAX_ITEMS = 400
const MAX_TEXT = 8000
const now = () => new Date().toISOString()
const LIVE = new Set(['running', 'waiting', 'queued'])

export interface AgentChatsDeps {
  dir: string
  runner: AgentRunner
  /** 동시에 도는 대화 수 */
  limit: number
  /** 프로젝트의 저장소와 이름 */
  project: (rid: string) => { repo: string; title: string }
  /** 묻지 않고 읽는 폴더 (공용 라이브러리 · 등록한 다른 프로젝트) */
  readable: () => string[]
  /** 에이전트가 처음부터 함께 보는 폴더 (공용 라이브러리) */
  extraDirs: () => string[]
  /** 대화가 바뀌면 (화면 알림) */
  notify: (chat: ChatRow) => void
  /** 앱 고치기 대화의 작업 폴더와 PR (앱 저장소가 있는 맥에서만) */
  app?: AppWork
  /**
   * 앱 피드백 폴더 (맡기기 · 처리 기록). written = 처리 기록을 적은 뒤 (저절로 올리기).
   * claims = 저절로 맡기기를 한 컴퓨터만 (feedbackClaims.ts): taken은 다른 컴퓨터가 이번 차례에 맡았는지, claim은 이 컴퓨터가 맡기 (since = 그 항목을 마지막으로 손댄 때)
   */
  feedback?: { dir: string; written?: () => void; claims?: { taken(key: string, since: number): boolean; claim(key: string, since: number): Promise<boolean> } }
  /** 설정 › 에이전트 (피드백을 언제 맡기고 언제 합치나 · 한 차례 한도) */
  settings?: () => AgentSettings
  /** 합친 커밋이 지금 도는 앱에 들어 있는가 (모르면 undefined) */
  inApp?: (sha: string) => Promise<boolean | undefined>
}

export class AgentChats {
  private readonly chats = new Map<string, Stored>()
  private readonly aborts = new Map<string, AbortController>()
  private readonly asks = new Map<string, (a: Answer) => void>()
  /** 줄 선 대화의 지시 (순서대로) */
  private readonly queue: { id: string; prompt: string; images?: ImageIn[] }[] = []

  constructor(private readonly deps: AgentChatsDeps) {
    fs.mkdirSync(deps.dir, { recursive: true })
    for (const f of fs.readdirSync(deps.dir)) {
      if (!f.endsWith('.json')) continue
      try {
        const c = JSON.parse(fs.readFileSync(path.join(deps.dir, f), 'utf8')) as Stored
        c.mode ??= 'edit'
        c.model ??= 'default'
        c.effort ??= 'medium'
        c.changed ??= []
        c.todos ??= []
        if (LIVE.has(c.state)) {
          // 앱이 다시 켜지면 돌던 차례는 이어지지 않는다
          c.state = 'stopped'
          c.claims = []
          c.pending = []
          for (const it of c.items) {
            if (it.kind === 'ask' && !it.answer) it.answer = 'deny'
            if (it.kind === 'user') delete it.queued
          }
          c.items.push({ kind: 'error', at: now(), text: t('앱이 다시 켜져 멈췄습니다. 이어서 지시하면 다시 시작합니다', 'Stopped because the app restarted. Send a message to continue') })
          this.write(c)
        }
        this.chats.set(c.id, c)
      } catch { /* 깨진 파일은 건너뛴다 */ }
    }
  }

  get limit(): number { return this.deps.limit }

  /** 고를 수 있는 모델 (실행기가 모르거나 못 물으면 빈 목록) */
  async models(): Promise<ModelChoice[]> {
    try { return (await this.deps.runner.models?.()) ?? [] } catch { return [] }
  }

  /** 이 맥에서 앱 고치기 대화를 열 수 있는지 */
  get app(): boolean { return !!this.deps.app }

  /** 피드백을 맡길 수 있는지 (피드백 화면의 「에이전트에게 맡기기」) */
  get handOffOk(): boolean { return !!this.deps.app && !!this.deps.feedback && this.deps.settings?.().feedback !== 'off' }

  list(rid?: string): ChatRow[] {
    return [...this.chats.values()].filter((c) => !rid || c.rid === rid).sort((a, b) => b.updated.localeCompare(a.updated)).map(rowOf)
  }

  get(id: string): Chat {
    return wireOf(this.must(id))
  }

  work(): WorkState {
    return { chats: [...this.chats.values()].filter((c) => LIVE.has(c.state)).map((c) => ({ id: c.id, rid: c.rid, title: c.title, state: c.state, scope: c.scope, claims: c.claims })) }
  }

  create(b: NewChatBody, link: { feedback?: string } = {}): Chat {
    const app = b.rid === APP_RID
    if (app && !this.deps.app) throw new WorkbenchError(404, t('이 맥에는 앱 저장소가 없어 앱 고치기 대화를 열 수 없습니다', 'No app repository on this Mac, so app conversations are not available'))
    if (!app && b.scope?.kind === 'app') throw new WorkbenchError(400, t('앱 범위는 앱 고치기 대화에만 씁니다', 'The app scope is only for app conversations'))
    if (!app) this.deps.project(b.rid) // 등록하지 않은 프로젝트면 404
    const scope: ChatScope = app ? { kind: 'app' } : b.scope ?? { kind: 'project' }
    if (scope.kind !== 'project' && scope.kind !== 'app' && !scope.target) throw new WorkbenchError(400, t('주제 · 노트 범위에는 대상이 필요합니다', 'A topic or note scope needs a target'))
    if (scope.target && (scope.target.includes('..') || path.isAbsolute(scope.target))) throw new WorkbenchError(400, t('범위 대상이 맞지 않음', 'Invalid scope target'))
    const at = now()
    const c: Stored = {
      id: `${at.slice(0, 10)}-${crypto.randomBytes(4).toString('hex')}`,
      rid: b.rid,
      title: (b.title || b.text.split('\n')[0]!).trim().slice(0, 60),
      agent: 'claude-code',
      scope,
      write: b.write ?? 'notes',
      state: 'idle',
      mode: b.mode ?? 'edit',
      model: b.model ?? 'default',
      effort: b.effort ?? 'medium',
      claims: [],
      changed: [],
      todos: [],
      created: at,
      updated: at,
      items: [],
      ...(link.feedback && { feedback: link.feedback }),
    }
    this.chats.set(c.id, c)
    this.start(c, b)
    return wireOf(c)
  }

  /** 이어서 지시. 일하는 중이면 다음 차례에 읽는다(줄 선 지시) */
  send(id: string, m: ChatMessageBody): Chat {
    const c = this.must(id)
    if (LIVE.has(c.state)) {
      c.pending = [...(c.pending ?? []), { prompt: promptOf(m.text, m.attach), ...(m.images?.length && { images: m.images }) }]
      this.push(c, userItem(m, true))
      return wireOf(c)
    }
    this.start(c, m)
    return wireOf(c)
  }

  /** 읽기만 · 모드 · 모델 · 생각 깊이 (다음 차례부터) */
  settings(id: string, s: ChatSettings): Chat {
    const c = this.must(id)
    if (s.write) c.write = s.write
    if (s.mode) c.mode = s.mode
    if (s.model) c.model = s.model
    if (s.effort) c.effort = s.effort
    this.touch(c)
    return wireOf(c)
  }

  /** 늘 허락한 것 하나 빼기 */
  forget(id: string, label: string): Chat {
    const c = this.must(id)
    c.alwaysKeys = (c.alwaysKeys ?? []).filter((a) => a.label !== label)
    this.touch(c)
    return wireOf(c)
  }

  /** 허락 · 계획 카드에 답하기. 거절에는 할 말(note), 계획 승인에는 이어 갈 맡기는 정도(mode)를 붙일 수 있다 */
  answer(id: string, ask: string, a: AskAnswer, more: { note?: string; mode?: ChatMode } = {}): Chat {
    const c = this.must(id)
    const it = c.items.find((x): x is Extract<ChatItem, { kind: 'ask' }> => x.kind === 'ask' && x.id === ask)
    const resolve = this.asks.get(ask)
    if (!it || it.answer || !resolve) throw new WorkbenchError(409, t('이미 답했거나 없는 허락 요청입니다', 'This request was already answered or does not exist'))
    if (more.mode === 'plan') throw new WorkbenchError(400, t('계획을 승인하면 묻고 하기 · 고치기 바로 가운데 하나로 이어 갑니다', 'After approving a plan, continue with ask first or edit freely'))
    it.answer = a
    if (a === 'deny' && more.note) it.note = clip(more.note, 2000)
    if (a !== 'deny' && it.plan !== undefined && more.mode) it.mode = more.mode
    this.asks.delete(ask)
    resolve({ answer: a, ...(a === 'deny' && more.note && { note: more.note }), ...(a !== 'deny' && more.mode && { mode: more.mode }) })
    return wireOf(c)
  }

  /** 도는 동안 보내 기다리는 지시 하나 빼기 (고쳐 쓰려면 빼고 다시 보낸다) */
  unqueue(id: string, index: number): Chat {
    const c = this.must(id)
    const pending = c.pending ?? []
    if (index >= pending.length) throw new WorkbenchError(409, t('이미 읽었거나 없는 지시입니다', 'This message was already read or does not exist'))
    pending.splice(index, 1)
    let n = -1
    const at = c.items.findIndex((it) => it.kind === 'user' && it.queued && ++n === index)
    if (at >= 0) c.items.splice(at, 1)
    this.touch(c)
    return wireOf(c)
  }

  /** 보관함에 넣기 · 꺼내기 (지우지 않고 목록에서만 숨긴다) */
  archive(id: string, archived: boolean): Chat {
    const c = this.must(id)
    if (archived && LIVE.has(c.state)) throw new WorkbenchError(409, t('도는 대화는 보관할 수 없습니다. 먼저 멈춰 주세요', 'Stop the conversation before archiving it'))
    c.archived = archived
    this.touch(c)
    return wireOf(c)
  }

  stop(id: string): Chat {
    const c = this.must(id)
    const qi = this.queue.findIndex((q) => q.id === id)
    if (qi >= 0) {
      this.queue.splice(qi, 1)
      this.finish(c, 'stopped')
    }
    this.aborts.get(id)?.abort()
    return wireOf(c)
  }

  remove(id: string): void {
    const c = this.must(id)
    if (LIVE.has(c.state)) throw new WorkbenchError(409, t('도는 대화는 지울 수 없습니다. 먼저 멈춰 주세요', 'Stop the conversation before deleting it'))
    this.chats.delete(id)
    fs.rmSync(this.fileOf(id), { force: true })
    if (c.worktree && this.deps.app) void this.deps.app.dispose(c.worktree).catch(() => undefined)
  }

  /**
   * 피드백 하나를 새 앱 고치기 대화에 맡긴다 (피드백 화면의 「에이전트에게 맡기기」). 같은 항목은 한 대화만:
   * 그 피드백을 맡은 대화가 도는 중이면 거절한다. 에이전트 차례가 아닌 항목(사용자 차례 · 완료)도 거절한다.
   */
  handOff(key: string): Chat {
    const fb = this.deps.feedback
    if (!this.deps.app || !fb) throw new WorkbenchError(404, t('이 맥에서는 피드백을 에이전트에게 맡길 수 없습니다 (앱 저장소 · 피드백 폴더가 필요)', 'Feedback cannot be handed to an agent on this Mac (needs the app repository and a feedback folder)'))
    if (this.deps.settings?.().feedback === 'off') throw new WorkbenchError(409, t('설정 › 에이전트에서 피드백 맡기기를 껐습니다', 'Handing feedback to the agent is off in Settings › Agents'))
    const busy = [...this.chats.values()].find((c) => c.feedback === key && LIVE.has(c.state))
    if (busy) throw new WorkbenchError(409, t(`이 피드백을 맡은 대화(「${busy.title}」)가 일하는 중입니다`, `A conversation ("${busy.title}") is already working on this feedback`))
    const e = listAllFeedback(fb.dir).find((x) => x.key === key)
    if (!e) throw new WorkbenchError(404, t('그 피드백을 찾지 못했습니다', 'That feedback was not found'))
    const reasons = agentTurnReasons(e)
    if (!reasons.length) throw new WorkbenchError(400, t('에이전트 차례가 아닌 피드백입니다', 'This feedback is not the agent\'s turn'))
    const picture = e.picture ? path.join(fb.dir, e.picture) : undefined
    const title = `${t('피드백', 'Feedback')} · ${(e.status?.clean ?? e.text).replace(/\s+/g, ' ').trim()}`.slice(0, 60)
    const has = picture && fs.existsSync(picture) ? picture : undefined
    const images = has ? pictureImage(has) : undefined
    return this.create({ rid: APP_RID, text: feedbackPrompt(e, reasons, has), title, mode: 'edit', ...(images && { images }) }, { feedback: key })
  }

  /**
   * 맡은 피드백의 처리 기록을 적는다 (에이전트의 feedback_answer). after가 있으면 그 PR의 CI 그림을 받아
   * 그림 폴더에 두고 pictures: [전(남길 때 그림), 후]. 반영이고 PR이 있으면 commit: "#n".
   */
  async feedbackAnswer(id: string, b: FeedbackAnswerBody): Promise<FeedbackAnswered> {
    const c = this.must(id)
    const fb = this.deps.feedback
    if (!c.feedback || !fb) throw new WorkbenchError(400, t('피드백을 맡은 대화가 아닙니다', 'This conversation has no feedback item'))
    const e = listAllFeedback(fb.dir).find((x) => x.key === c.feedback)
    if (!e) throw new WorkbenchError(404, t('맡은 피드백을 찾지 못했습니다', 'The feedback item was not found'))
    let pictures: string[] | undefined
    if (b.after) {
      if (!this.deps.app || !c.worktree || !c.branch || !c.pr) throw new WorkbenchError(409, t('PR을 연 뒤에 고친 뒤 그림을 받을 수 있습니다', 'Open the PR before asking for the after picture'))
      const png = await this.deps.app.shot(c.worktree, c.branch, b.after)
      if (!png) throw new WorkbenchError(409, t(`CI 그림 ${b.after}을 받지 못했습니다. CI가 끝났는지, 그 화면 이름이 맞는지 확인하세요`, `Could not get the CI picture ${b.after}. Check that CI finished and the screen name is right`))
      const d = new Date()
      const name = `pictures/${localDate(d)}-${localTime(d).replace(':', '')}-${b.after}-after.png`
      fs.mkdirSync(path.join(fb.dir, 'pictures'), { recursive: true })
      fs.writeFileSync(path.join(fb.dir, name), png)
      pictures = e.picture && fs.existsSync(path.join(fb.dir, e.picture)) ? [e.picture, name] : undefined
    }
    const r = writeFeedbackAnswer(fb.dir, c.feedback, {
      ...(b.state && { state: b.state }),
      ...(b.note && { note: b.note }),
      ...(b.understood && { understood: b.understood }),
      ...(b.cause && { cause: b.cause }),
      ...(b.clean && { clean: b.clean }),
      ...(b.ask && { ask: b.ask }),
      ...(b.miss && { miss: b.miss }),
      ...(b.lesson && { lesson: b.lesson }),
      ...(b.state === '반영' && c.pr && { commit: `#${c.pr.number}` }),
      ...(pictures && { pictures }),
      ...(b.replies && { replies: b.replies }),
    })
    fb.written?.()
    this.touch(c)
    return { key: c.feedback, ...(r.state && { state: r.state }), ...(pictures && { pictures }), replies: r.replies }
  }

  /**
   * 피드백 대화 돌보기 (1분마다, 설정 › 에이전트 "앱 피드백"):
   * 1. 맡은 대화의 PR이 CI 빨강이면 실패 기록을 그 대화에 다시 보내 고치게 한다 (두 번까지).
   * 2. CI 초록이면 설정대로 합친다: green = 바로, approved = 사용자가 그 답을 승인한 뒤, never = 합치지 않음.
   * 3. 합친 커밋이 지금 도는 앱에 들어오면 shipped (상단바 "#n 반영됨").
   *    main과 부딪혀 합치지 못하면 그 대화에 main을 받아 풀라고 한 번 보낸다.
   * 4. 저절로 맡기기(instant)면, 도는 대화가 한도보다 적을 때 가장 오래된 에이전트 차례 하나를 맡긴다.
   */
  async tickFeedback(): Promise<void> {
    const app = this.deps.app
    const fb = this.deps.feedback
    const s = this.deps.settings?.()
    if (!app || !fb || !s) return
    const items = new Map(listAllFeedback(fb.dir).map((e) => [e.key, e]))
    for (const c of [...this.chats.values()].filter((x) => x.feedback && !LIVE.has(x.state))) {
      try {
        if (c.merged) {
          if (!c.shipped && this.deps.inApp && (await this.deps.inApp(c.merged))) { c.shipped = true; this.touch(c) }
          continue
        }
        if (!c.pr || !c.worktree || !c.branch) continue
        const ck = await app.checks(c.worktree, c.branch)
        if (!ck.done) continue
        if (!ck.ok) {
          const sig = ck.checks.map((x) => `${x.name}:${x.state}:${x.link ?? ''}`).join('|')
          if (sig === c.ciSeen || (c.ciRetries ?? 0) >= 2) continue
          c.ciSeen = sig
          c.ciRetries = (c.ciRetries ?? 0) + 1
          this.send(c.id, { text: t(`CI가 실패했습니다 (${c.ciRetries}/2). 아래 기록을 읽고 고친 뒤 다시 올려 주세요.\n\n${ck.log ?? ''}`.trim(), `CI failed (${c.ciRetries}/2). Read the log below, fix it and submit again.\n\n${ck.log ?? ''}`.trim()) })
          continue
        }
        const e = items.get(c.feedback!)
        const approved = !!e?.review && e.review.verdict === '승인' && (!e.status?.handled_at || e.review.at > e.status.handled_at)
        if (s.merge === 'never' || (s.merge === 'approved' && !approved)) continue
        if (app.conflicted && (await app.conflicted(c.worktree, c.branch))) {
          const sig = `conflict:${ck.checks.map((x) => x.link ?? x.name).join('|')}`
          if (sig !== c.ciSeen) {
            c.ciSeen = sig
            this.send(c.id, { text: t('PR이 main과 부딪혀 합치지 못했습니다. `git fetch origin main && git merge origin/main`으로 받아 풀고, 확인한 뒤 다시 올려 주세요.', 'The PR conflicts with main, so it was not merged. Run `git fetch origin main && git merge origin/main`, resolve, check and submit again.') })
          }
          continue
        }
        const m = await app.merge(c.worktree, c.branch)
        c.merged = m.sha || 'merged'
        c.items.push({ kind: 'text', at: now(), text: t(`PR #${m.number}을 합쳤습니다. 앱이 새 버전을 받아 쓰지 않는 틈에 다시 시작합니다.`, `Merged PR #${m.number}. The app picks up the new version and restarts when idle.`) })
        this.touch(c)
      } catch { /* gh · git 오류는 다음 차례에 다시 본다 */ }
    }
    if (s.feedback !== 'instant' || this.running() + this.queue.length >= this.deps.limit) return
    const chats = [...this.chats.values()]
    const next = [...items.values()]
      .filter((e) => agentTurns(e).length && !chats.some((c) => c.feedback === e.key && new Date(c.created).getTime() >= lastTouched(e)))
      .filter((e) => !fb.claims?.taken(e.key, lastTouched(e)))
      .sort((a, b) => lastTouched(a) - lastTouched(b))[0]
    if (!next) return
    // 다른 컴퓨터도 저절로 맡기기를 켰으면 먼저 적어 올린 쪽만 맡는다
    if (fb.claims && !(await fb.claims.claim(next.key, lastTouched(next)).catch(() => false))) return
    try { this.handOff(next.key) } catch { /* 다른 대화가 막 시작했으면 다음 차례에 */ }
  }

  /** 앱 고치기 대화: 바뀐 것을 커밋해 올리고 PR을 연다 (에이전트의 app_submit. 허락 판정은 judge가 이미 했다) */
  async appSubmit(id: string, b: AppSubmitBody): Promise<AppSubmitted> {
    const { c, w } = this.appOf(id)
    const pr = await w.submit(c.worktree!, c.branch!, { title: b.title, body: b.body })
    c.pr = { number: pr.number, url: pr.url }
    this.touch(c)
    return pr
  }

  /** 앱 고치기 대화: 그 PR의 CI (에이전트의 app_checks) */
  async appChecks(id: string): Promise<AppChecks> {
    const { c, w } = this.appOf(id)
    return w.checks(c.worktree!, c.branch!)
  }

  private appOf(id: string): { c: Stored; w: AppWork } {
    const c = this.must(id)
    if (c.scope.kind !== 'app' || !this.deps.app) throw new WorkbenchError(400, t('앱 고치기 대화가 아닙니다', 'Not an app conversation'))
    if (!c.worktree || !c.branch) throw new WorkbenchError(409, t('작업 폴더를 아직 만들지 않았습니다', 'The work folder is not ready yet'))
    return { c, w: this.deps.app }
  }

  /** 테스트 · 끄기: 도는 차례를 모두 멈춘다 */
  stopAll(): void {
    this.queue.length = 0
    for (const a of this.aborts.values()) a.abort()
  }

  /** 할 일 목록: 이번 차례의 할 일 줄을 그 자리에서 고친다 (없으면 더한다) */
  private setTodos(c: Stored, todos: Todo[]): void {
    c.todos = todos
    let lastUser = -1
    c.items.forEach((it, i) => { if (it.kind === 'user' && !it.queued) lastUser = i })
    const at = c.items.findIndex((it, i) => i > lastUser && it.kind === 'todos')
    if (at >= 0) c.items[at] = { kind: 'todos', at: c.items[at]!.at, todos }
    else c.items.push({ kind: 'todos', at: now(), todos })
    this.touch(c)
  }

  private must(id: string): Stored {
    const c = this.chats.get(id)
    if (!c) throw new WorkbenchError(404, t(`대화가 없음: ${id}`, `No such conversation: ${id}`))
    return c
  }

  private fileOf(id: string): string {
    if (!/^[\w-]+$/.test(id)) throw new WorkbenchError(400, t('대화 id가 맞지 않음', 'Invalid conversation id'))
    return path.join(this.deps.dir, `${id}.json`)
  }

  private write(c: Stored): void {
    if (c.items.length > MAX_ITEMS) c.items.splice(0, c.items.length - MAX_ITEMS)
    fs.writeFileSync(this.fileOf(c.id), JSON.stringify(c, null, 1))
  }

  private touch(c: Stored): void {
    c.updated = now()
    this.write(c)
    this.deps.notify(rowOf(c))
  }

  private push(c: Stored, it: ChatItem): void {
    c.items.push(it)
    this.touch(c)
  }

  private running(): number {
    return [...this.chats.values()].filter((c) => c.state === 'running' || c.state === 'waiting').length
  }

  private start(c: Stored, m: ChatMessageBody): void {
    c.items.push(userItem(m))
    this.begin(c, promptOf(m.text, m.attach), m.images)
  }

  private begin(c: Stored, prompt: string, images?: ImageIn[]): void {
    if (this.running() >= this.deps.limit) {
      c.state = 'queued'
      this.queue.push({ id: c.id, prompt, ...(images?.length && { images }) })
      this.touch(c)
      return
    }
    void this.run(c, prompt, images)
  }

  private finish(c: Stored, state: 'idle' | 'stopped' | 'error'): void {
    c.state = state
    c.claims = []
    const pending = c.pending ?? []
    c.pending = []
    for (const it of c.items) if (it.kind === 'user' && it.queued) delete it.queued
    this.touch(c)
    // 일하는 중에 받은 지시: 차례가 잘 끝났으면 이어서 읽는다 (멈추거나 실패하면 지시로만 남는다)
    if (state === 'idle' && pending.length) {
      this.begin(c, pending.map((p) => p.prompt).join('\n\n'), pending.flatMap((p) => p.images ?? []).slice(0, 4))
      return
    }
    const next = this.queue.shift()
    if (next) {
      const n = this.chats.get(next.id)
      if (n) void this.run(n, next.prompt, next.images)
    }
  }

  private claimedBy(self: string, file: string): string | undefined {
    for (const o of this.chats.values()) if (o.id !== self && LIVE.has(o.state) && o.rid === this.chats.get(self)?.rid && o.claims.includes(file)) return o.title
    return undefined
  }

  private async run(c: Stored, prompt: string, images?: ImageIn[]): Promise<void> {
    const abort = new AbortController()
    this.aborts.set(c.id, abort)
    c.state = 'running'
    c.planOk = false
    this.touch(c)
    let ended: 'idle' | 'stopped' | 'error' = 'idle'
    // 피드백 대화의 한 차례 한도 (설정 › 에이전트): 넘으면 멈춘다
    const minutes = c.feedback ? this.deps.settings?.().minutes : undefined
    let overtime = false
    const limit = minutes ? setTimeout(() => { overtime = true; abort.abort() }, minutes * 60_000) : undefined
    try {
      const app = c.scope.kind === 'app' && this.deps.app ? this.deps.app : undefined
      let p: { repo: string; title: string }
      if (app) {
        const w = await app.prepare(c.id)
        if (c.worktree !== w.dir || c.branch !== w.branch) { c.worktree = w.dir; c.branch = w.branch; this.touch(c) }
        p = { repo: w.dir, title: 'Emergence Workbench' }
      } else p = this.deps.project(c.rid)
      // 앱 고치기 대화는 작업 폴더만, 피드백을 맡았으면 피드백 폴더(그림)도 묻지 않고 읽는다
      const readable = app ? (c.feedback && this.deps.feedback ? [this.deps.feedback.dir] : []) : this.deps.readable().filter((d) => d !== p.repo)
      const mode = c.mode
      const ctx: PolicyCtx = { rid: c.rid, write: c.write, mode, planOk: false, scope: c.scope, repo: p.repo, readable, claimedBy: (f) => this.claimedBy(c.id, f) }
      const claim = (file?: string) => {
        if (!file) return
        if (!c.claims.includes(file)) c.claims.push(file)
        if (!c.changed.includes(file)) c.changed.push(file)
      }
      const edited = (tool: string, input: Record<string, unknown>) => {
        if (app && (FILE_WRITE_TOOLS as readonly string[]).includes(tool)) {
          this.push(c, { kind: 'edit', at: now(), file: posix(path.relative(p.repo, path.resolve(p.repo, pathOf(input)))), ...fileEditOf(tool, input) })
          return
        }
        if (tool !== `${MCP}edit_note`) return
        this.push(c, { kind: 'edit', at: now(), file: str(input.file), ...editOf(input) })
      }
      const others = [...this.chats.values()].filter((o) => o.id !== c.id && o.rid === c.rid && LIVE.has(o.state))
      const canUseTool = async (tool: string, input: Record<string, unknown>): Promise<ToolDecision> => {
        const v = judge(ctx, tool, input)
        if (v.kind === 'allow') {
          if (v.claim) { claim(v.claim); edited(tool, input) }
          return { allow: true }
        }
        if (v.kind === 'deny') {
          this.push(c, { kind: 'blocked', at: now(), tool: tool.replace(MCP, ''), reason: v.reason })
          return { allow: false, message: v.message }
        }
        if (c.alwaysKeys?.some((a) => a.key === v.key)) {
          claim(v.claim)
          edited(tool, input)
          return { allow: true }
        }
        const id = crypto.randomBytes(6).toString('hex')
        const answer = new Promise<Answer>((resolve) => {
          this.asks.set(id, resolve)
          abort.signal.addEventListener('abort', () => resolve({ answer: 'deny' }), { once: true })
        })
        c.state = 'waiting'
        this.push(c, { kind: 'ask', at: now(), id, tool: tool.replace(MCP, ''), summary: v.summary, ...(v.plan !== undefined && { plan: v.plan }) })
        const got = await answer
        const a = got.answer
        this.asks.delete(id)
        const it = c.items.find((x) => x.kind === 'ask' && x.id === id)
        if (it && it.kind === 'ask' && !it.answer) it.answer = a
        // 계획 카드의 「늘」은 이 차례만 (계획마다 다시 본다)
        if (a === 'always' && v.plan === undefined) c.alwaysKeys = [...(c.alwaysKeys ?? []), { key: v.key, label: v.label }]
        if (c.state === 'waiting') c.state = 'running'
        if (a !== 'deny') {
          if (v.plan !== undefined) {
            ctx.planOk = true
            c.planOk = true
            // 승인하며 고른 맡기는 정도로 이어 간다 (묻고 하기 = 노트도 하나씩 묻기, 고치기 바로)
            if (got.mode) { ctx.mode = got.mode; c.mode = got.mode }
          }
          claim(v.claim)
          edited(tool, input)
        }
        this.touch(c)
        const said = got.note ? ` The user said: ${got.note}` : ''
        if (a === 'deny' && v.plan !== undefined) return { allow: false, message: `The user did not approve this plan.${said || ' Ask what to change.'} Revise the plan and call ExitPlanMode again. Change nothing yet.` }
        return a === 'deny' ? { allow: false, message: got.note ? `The user declined this and said what to do instead: ${got.note}` : 'The user declined this. Do not try it again in another way; continue without it or ask the user.' } : { allow: true }
      }
      const input: RunInput = {
        prompt,
        ...(images?.length && { images }),
        mode,
        model: c.model,
        effort: c.effort,
        sessionId: c.sessionId,
        cwd: p.repo,
        extraDirs: app ? [] : this.deps.extraDirs(),
        brief: app
          ? appBriefFor({ branch: c.branch ?? '', write: c.write, mode, rules: app.rules, feedback: !!c.feedback })
          : briefFor({ rid: c.rid, title: p.title, scope: c.scope, write: c.write, mode, others: others.map((o) => ({ title: o.title, claims: o.claims })) }),
        write: c.write,
        ...(app && { appChat: c.id, env: appEnv(c.id) }),
        canUseTool,
        signal: abort.signal,
      }
      for await (const e of this.deps.runner(input)) {
        if (e.type === 'session') { c.sessionId = e.id; this.write(c); continue }
        if (e.type === 'text') { if (e.text.trim()) this.push(c, { kind: 'text', at: now(), text: e.text.slice(0, MAX_TEXT), ...(e.sub && { sub: true }) }); continue }
        if (e.type === 'tool') {
          if (e.tool === 'TodoWrite') { this.setTodos(c, todosOf(e.input)); continue }
          if (e.tool === PLAN_TOOL || e.tool === 'EnterPlanMode') continue
          const s = describeStep(ctx, e.tool, e.input)
          this.push(c, { kind: 'step', at: now(), ...s, tool: s.tool.replace(MCP, ''), ...(e.sub && { sub: true }) })
          continue
        }
        if (e.type === 'result') {
          this.push(c, { kind: 'result', at: now(), ok: e.ok, ...(e.cost !== undefined && { cost: e.cost }), ...(e.seconds !== undefined && { seconds: e.seconds }) })
          if (!e.ok && e.error) this.push(c, { kind: 'error', at: now(), text: e.error.slice(0, MAX_TEXT) })
          if (!e.ok) ended = 'error'
        }
      }
      if (abort.signal.aborted) ended = 'stopped'
    } catch (e) {
      if (abort.signal.aborted) ended = 'stopped'
      else {
        ended = 'error'
        c.items.push({ kind: 'error', at: now(), text: (e as Error).message.slice(0, MAX_TEXT) })
      }
    } finally {
      if (limit) clearTimeout(limit)
      if (overtime) c.items.push({ kind: 'error', at: now(), text: t(`한 차례 한도 ${minutes}분을 넘어 멈췄습니다. 이어서 지시하면 다시 시작합니다`, `Stopped after the ${minutes}-minute limit. Send a message to continue`) })
      this.aborts.delete(c.id)
      for (const it of c.items) if (it.kind === 'ask' && !it.answer) { it.answer = 'deny'; this.asks.delete(it.id) }
      this.finish(c, ended)
    }
  }
}

/** 앱 고치기 대화의 환경: 대화마다 다른 화면 그림 포트, 맥의 Chrome (playwright 브라우저를 받지 않아도 되게) */
export function appEnv(id: string): Record<string, string> {
  const n = parseInt(crypto.createHash('sha1').update(id).digest('hex').slice(0, 6), 16)
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  return { SHOTS_PORT: String(8200 + (n % 600)), ...(!process.env.CHROMIUM_PATH && fs.existsSync(chrome) && { CHROMIUM_PATH: chrome }) }
}

/** 피드백 그림을 첫 지시에 붙일 그림으로 (너무 크면 붙이지 않고 경로만) */
export function pictureImage(file: string): ImageIn[] | undefined {
  const type = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' } as const)[path.extname(file).toLowerCase() as '.png']
  if (!type) return undefined
  const buf = fs.readFileSync(file)
  return buf.length <= 3_500_000 ? [{ type, data: buf.toString('base64') }] : undefined
}

const userItem = (m: ChatMessageBody, queued?: boolean): ChatItem => ({
  kind: 'user', at: now(), text: m.text,
  ...(m.attach?.length && { attach: m.attach.map((a) => ({ ...a, ...(a.text && { text: clip(a.text, 600) }) })) }),
  ...(m.images?.length && { images: m.images.length }),
  ...(queued && { queued: true }),
})
const rowOf = (c: Stored): ChatRow => {
  let added = 0
  let removed = 0
  let wait: ChatRow['wait']
  for (const it of c.items) {
    if (it.kind === 'edit') { added += it.added; removed += it.removed }
    if (it.kind === 'ask' && !it.answer) wait = it.plan !== undefined ? 'plan' : 'ask'
  }
  return {
    id: c.id, rid: c.rid, title: c.title, agent: c.agent, scope: c.scope, write: c.write, state: c.state,
    mode: c.mode, model: c.model, effort: c.effort, claims: [...c.claims], changed: [...c.changed], added, removed,
    ...(c.state === 'waiting' && wait && { wait }), archived: !!c.archived, ...(c.branch && { branch: c.branch }), ...(c.pr && { pr: { ...c.pr } }), ...(c.feedback && { feedback: c.feedback }), ...(c.merged && { merged: c.merged }), ...(c.shipped && { shipped: true }), created: c.created, updated: c.updated,
  }
}
const wireOf = (c: Stored): Chat => ({ ...rowOf(c), items: c.items.map((i) => ({ ...i })), always: (c.alwaysKeys ?? []).map((a) => a.label), todos: c.todos.map((x) => ({ ...x })) })
