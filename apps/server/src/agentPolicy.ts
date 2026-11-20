/**
 * 에이전트 대화의 허락 규칙 (순수 함수): 도구 · 명령 하나를 허락 · 묻기 · 막기로 판정한다.
 * agentChats.ts에서 떼어 냄 (10/30, 구조 래칫). agentChats.ts가 다시 내보내므로 가져오는 곳은 그대로다.
 */
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { CENTRAL_RID, type ChatMode, type ChatScope, type ChatWrite } from '@rw/core/contract/agentChats'
import { autoOf, commandKind, LIBRARY_RID, neverBypass, runProgram, stateOnlyCommand, type ChatAutoValues, type ChatKind, type NeverBypass } from '@rw/core'
import { isInside } from './fsutil.js'
import { t } from './i18n.js'

// ---------- 허락 규칙 (순수 함수) ----------

/** 탐색을 맡는 하위 에이전트 (작은 모델, 읽기만): 큰 파일 · 넓은 찾기의 결과만 본 대화에 돌려준다 */
export const EXPLORE_AGENT = 'explore'

/** 앱 MCP 서버 이름 (도구 이름 mcp__workbench__<도구>) */
export const MCP_NAME = 'workbench'
export const MCP = `mcp__${MCP_NAME}__`

export const READ_TOOLS = new Set(['Read', 'Glob', 'Grep', 'LS', 'NotebookRead'])
/** 묻지 않고 두는 것: 스킬 읽기(스킬이 시키는 명령 · 고치기는 같은 규칙을 거친다) · 할 일 목록 · 서브에이전트(그 도구 호출도 같은 규칙을 거친다) · 도구 찾기 · 셸 결과 보기 */
export const FREE_TOOLS = new Set(['Skill', 'TodoWrite', 'Task', 'Agent', 'ToolSearch', 'BashOutput', 'KillBash', 'KillShell', 'EnterPlanMode'])
/** 계획 모드에서 계획을 보이는 도구: 계획 승인 카드가 된다 */
export const PLAN_TOOL = 'ExitPlanMode'
/** 파일을 바로 쓰는 도구: 1단계에서는 막는다 (노트는 edit_note로) */
export const FILE_WRITE_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'] as const
export const MCP_WRITES = new Set(['new_note', 'edit_note', 'edit_concept', 'add_record', 'answer_record', 'problem_propose', 'problem_prepare', 'attempt_add', 'attempt_start', 'attempt_report', 'attempt_verdict', 'direction_report'])
/** 앱 고치기 대화가 막는 연구 쪽 쓰기 (위 + 맡긴 일 · 일지) */
export const RESEARCH_WRITES = new Set([...MCP_WRITES, 'add_task', 'report_task', 'add_journal'])
/** 앱 고치기 대화만 쓰는 앱 MCP 도구: 커밋해 PR 열기 · CI 결과 */
export const APP_SUBMIT = 'app_submit'
export const APP_CHECKS = 'app_checks'
/** 앱 고치기 대화가 자기 PR을 CI 통과 뒤 squash로 합친다 (11/19). gh pr merge를 바로 쓰는 것은 APP_OWNED가 계속 막는다 */
export const APP_MERGE = 'app_merge'
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
  claimedBy: (file: string, project?: string) => string | undefined
  /** 「자동 허용」 토글 (읽기 · 실행 · 웹 보기, 지금 값: 차례 중에 「늘」로 켜면 바로) */
  auto?: () => ChatAutoValues
  /** 「늘」로 허락한 실행 프로그램 열쇠 (run:<프로그램>) */
  always?: (key: string) => boolean
}

export type Verdict =
  | { kind: 'allow'; claim?: string }
  /**
   * label = 「늘 허락」했을 때 보일 이름, claim = 허락하면 잡을 파일, plan = 계획 승인 카드,
   * does = 명령이 하는 일, once = 「늘」 없이 (삭제 · 외부), turnOn = 「늘」이 켜는 토글(편집은 맡기는 정도),
   * bypass = 중앙 대화가 막힌 명령을 사용자 허락으로 돌리는 우회 (허락하면 대화에 기록한다)
   */
  | { kind: 'ask'; summary: string; key: string; label: string; claim?: string; plan?: string; does?: ChatKind; once?: boolean; turnOn?: 'read' | 'web' | 'edit'; bypass?: string }
  /** reason = 사용자에게 보일 말, message = 에이전트에게 돌려줄 말 (영어) */
  | { kind: 'deny'; reason: string; message: string }

export const str = (v: unknown) => (typeof v === 'string' ? v : '')
export const clip = (s: string, n = 300) => (s.length > n ? `${s.slice(0, n)}…` : s)
export const posix = (p: string) => p.split(path.sep).join('/')

/** 범위가 차지하는 저장소 안 폴더 (저장소 기준, 끝에 / 없음). 프로젝트면 '' */
export function scopeDir(scope: ChatScope): string {
  if (scope.kind === 'topic' && scope.target) return `workbench/topics/${scope.target}`
  if (scope.kind === 'note' && scope.target) {
    // 노트 폴더(…/<노트>/note.md)면 그 폴더, 파일 하나짜리 노트면 그 파일만
    const d = path.posix.dirname(scope.target)
    return /^note\.[a-z]+$/.test(path.posix.basename(scope.target)) && d !== '.' ? d : scope.target
  }
  return ''
}

/** 새 대화의 범위: 함께 고칠 프로젝트(also)는 겹치지 않게, 이 대화의 프로젝트는 빼고, 하나씩 check(등록 안 했으면 던짐)로 본다 (11/19) */
export function withAlso(asked: ChatScope, rid: string, check: (rid: string) => unknown): ChatScope {
  const also = asked.kind === 'project' ? [...new Set(asked.also ?? [])].filter((r) => r !== rid) : []
  for (const r of also) check(r)
  const { also: _drop, ...scope } = asked
  return also.length ? { ...scope, also } : scope
}

/** 저장소 기준 경로가 범위 안인지 */
export function inScope(scope: ChatScope, rel: string): boolean {
  const d = scopeDir(scope)
  if (!d) return true
  if (scope.kind === 'note' && scope.target === rel) return true
  return rel === d || rel.startsWith(`${d}/`)
}

/** 도구 입력의 파일 경로 (읽기 도구) */
export const pathOf = (input: Record<string, unknown>) => str(input.file_path) || str(input.notebook_path) || str(input.path)

/** 에이전트가 쓴 도구 한 줄 요약과 범위 밖인지 (대화에 보일 것) */
/** 이 대화가 고칠 수 있는 프로젝트: 제 프로젝트와 함께 고른 것 (11/19 사용자 결정, 그 밖은 읽기만) */
export function changeable(ctx: Pick<PolicyCtx, 'rid' | 'scope'>): string[] {
  return [ctx.rid, ...(ctx.scope.kind === 'project' ? ctx.scope.also ?? [] : [])]
}
function canChange(ctx: Pick<PolicyCtx, 'rid' | 'scope'>, project: string): boolean {
  return changeable(ctx).includes(project)
}
/** 범위 밖 일 · 앱 버그를 중앙 대화에 넘기는 도구 (mcp.ts) */
export const HELP_TOOL = 'central_help'

export function describeStep(ctx: Pick<PolicyCtx, 'rid' | 'scope' | 'repo'>, tool: string, input: Record<string, unknown>): { tool: string; summary: string; outside?: boolean } {
  if (tool.startsWith(MCP)) {
    const name = tool.slice(MCP.length)
    const project = str(input.project)
    const file = str(input.file)
    const outside = (project && project !== ctx.rid && ctx.scope.kind !== 'all' && !canChange(ctx, project)) || (file && project === ctx.rid && !inScope(ctx.scope, file)) ? true : undefined
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
 * 앱 고치기 대화에서 에이전트가 직접 하지 않는 명령: 올리기 · PR · 합치기는 앱이(app_submit · app_merge, 합치기 설정),
 * 실사용 앱 서비스는 사용자가 다룬다. 나머지(시험 · 형식 검사 · 화면 그림 · 커밋 · main 받기)는 작업 폴더에서 돌린다.
 */
export const APP_OWNED = /\bgit\s+push\b|\bgh\s+(pr|release|repo|workflow|api)\b|\bservice:|\blaunchctl\b|\bgit\s+worktree\b/

/**
 * 중앙 대화 (11/16 "중앙 에이전트"): 읽기와 하위 대화 열기 · 보내기 · 닫기만. 고치기 · 명령 · 기록 쓰기는 막고,
 * 하위 대화(chat_open)에 맡기라고 돌려준다. 상태만 보는 명령(11/18, stateOnlyCommand)은 묻지 않고 돌리고,
 * 비밀이 든 곳을 보면 한 번 묻는다. git · gh로 커밋 · 브랜치 · 푸시 · PR 만들기 · squash 합치기(11/19 "중앙은 깃 편집 권한")도
 * 묻지 않는다. 강제 푸시 · reset --hard · branch -D 같은 되돌리기 어려운 것과, 실사용 앱 체크아웃(중앙의 작업 폴더)의
 * 파일을 바꾸는 checkout · merge · pull · stash 등은 막힌다. 중앙이 띄운 보조 에이전트도 같은 판정을 거친다.
 * 그 밖(웹 등)은 보통 규칙대로. undefined = 보통 규칙으로.
 * 우회 (11/20 "언제나 막기보다 사용자 허락으로 푸는 길"): 목록에 없는 명령은 막지 않고 명령 · 까닭 · 폴더를 보이며 묻는다.
 * 허락은 한 번, 또는 이 대화에서 바로 그 명령만 늘. 자동 허락 · 시간 초과 기본값은 없고, neverBypass는 허락해도 막는다
 */
function judgeCentral(ctx: PolicyCtx, tool: string, input: Record<string, unknown>): Verdict | undefined {
  const name = tool.startsWith(MCP) ? tool.slice(MCP.length) : ''
  if (tool === 'Bash') {
    const cmd = str(input.command)
    const seen = stateOnlyCommand(cmd, { gitWrites: true })
    if (seen === 'ok') return { kind: 'allow' }
    if (seen === 'sensitive') return { kind: 'ask', summary: clip(cmd), key: `Bash:${cmd}`, label: t(`비밀이 든 곳 읽기 · ${clip(cmd, 80)}`, `Read secrets · ${clip(cmd, 80)}`), does: 'read', once: true }
    const never = neverBypass(cmd)
    if (never) return neverVerdict(never)
    if (cmd.trim()) return bypassAsk(ctx, cmd, str(input.description))
  }
  const writes = name ? RESEARCH_WRITES.has(name) || name === APP_SUBMIT || name === APP_CHECKS || name === APP_MERGE || name === FEEDBACK_ANSWER : tool === 'Bash' || (FILE_WRITE_TOOLS as readonly string[]).includes(tool)
  if (!writes) return name ? { kind: 'allow' } : undefined
  return {
    kind: 'deny',
    reason: t('중앙 대화는 파일을 고치거나 명령을 돌리지 않고 하위 대화에 맡깁니다 (상태 보기와 git · gh 커밋 · 푸시 · PR · 합치기는 됩니다)', 'The central conversation does not edit files or run commands; it hands work to a sub-conversation (looking at state and git/gh commit, push, PR and merge are fine)'),
    message: `You are the central conversation: you read and orchestrate. Commands that only look at state run directly (ls, cat, grep, find (with -exec only for these read commands), which, ps, sysctl -n, vm_stat, top -l 1, git log/status/diff/show, git -C <dir> remote get-url, gh pr view/checks, gh run view --log, gh repo list/view, gh api GET without -f/-F unless -X GET, npm ls, python3 -I -c with read-only code that takes file names from sys.argv, python3 -I -m json.tool <file>), joined with |, && or ; and inside for … in …; do …; done loops over literal words or globs, without writing redirects (> file), heredocs, env-variable prefixes or command-running programs (xargs, sh -c, awk, sed). Git and gh changes also run directly: git add/commit -m/branch/fetch/tag, git push <remote> <branch> (name the branch; not main), gh pr create/edit/ready, gh pr merge --squash. Pushing straight to main (or a push that names no branch) and gh pr comment ask the user first. Blocked: force pushes, deleting remote branches, git branch -D, reset, clean, and anything that changes files in your folder (checkout, switch, merge, rebase, pull, stash, restore), because your folder is the running app's checkout. To change or run anything else, open a sub-conversation with ${MCP}chat_open (role app, project or feedback) or send to an existing one with ${MCP}chat_send.`,
  }
}

const NEVER: Record<NeverBypass, [string, string]> = {
  'force-push': ['강제 푸시', 'force push'],
  'reset-hard': ['git reset --hard', 'git reset --hard'],
  'delete-main': ['main 브랜치 지우기', 'deleting the main branch'],
  'rm-outside-temp': ['임시 폴더 밖 rm -rf', 'rm -rf outside temp folders'],
  'workbench-write': ['연구 저장소 workbench/ 쓰기', 'writing under workbench/ of a research repository'],
}
function neverVerdict(why: NeverBypass): Verdict {
  const [ko, en] = NEVER[why]
  return {
    kind: 'deny',
    reason: t(`허락으로도 풀 수 없는 명령입니다: ${ko}`, `Not allowed even with permission: ${en}`),
    message: `This command never runs from the central conversation, even with the user's permission (${en}). Do not try it another way: tell the user what should be done, or hand it to a sub-conversation whose own rules apply.`,
  }
}

/** 우회 묻기: 명령 · 까닭(Bash의 description) · 폴더를 보인다. 「늘」은 이 대화에서 바로 그 명령만 */
function bypassAsk(ctx: PolicyCtx, cmd: string, reason: string): Verdict {
  const summary = [cmd, `${t('까닭', 'Why')}: ${clip(reason.trim() || t('(적지 않음)', '(not given)'), 600)}`, `${t('폴더', 'Folder')}: ${ctx.repo}`].join('\n')
  return { kind: 'ask', summary, key: `bypass:${cmd}`, label: t(`우회 · ${clip(cmd, 80)}`, `Bypass · ${clip(cmd, 80)}`), bypass: cmd }
}

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
    const other = ctx.claimedBy(rel)
    if (other) {
      return {
        kind: 'deny',
        reason: t(`다른 앱 고치기 대화(「${other}」)가 고친 파일이라 합칠 때 부딪힙니다: ${rel}`, `Another app conversation ("${other}") changed ${rel}; both would collide when merging`),
        message: `Another app conversation ("${other}") has changed ${rel} and its pull request is not merged yet. Do not change this file now: finish without it, or tell the user that it has to wait until that pull request merges.`,
      }
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
        message: `The app does this, not you: call ${MCP}${APP_SUBMIT} to commit, push and open or update the pull request, ${MCP}${APP_CHECKS} for CI, and ${MCP}${APP_MERGE} to squash-merge your own pull request once CI is green. Do not touch the running app service or other worktrees.`,
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
    if (name === APP_MERGE) {
      if (ctx.write === 'read') return readOnly
      if (gated) return notYet
      if (ctx.mode === 'ask') return { kind: 'ask', summary: t('PR 합치기 (squash)', 'Merge PR (squash)'), key: APP_MERGE, label: t('PR 합치기', 'Merge PR') }
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
  if (ctx.rid === CENTRAL_RID) { const v = judgeCentral(ctx, tool, input); if (v) return v }
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
      return { kind: 'deny', reason: t('읽기만 하는 대화라 고치지 않습니다', 'This conversation is read-only'), message: 'This conversation is read-only: do not change notes, records or problems. Tell the user what you would change instead.' }
    }
    if (ctx.mode === 'plan' && !ctx.planOk) {
      return {
        kind: 'deny',
        reason: t('계획을 승인하기 전이라 고치지 않습니다', 'Not changed before the plan is approved'),
        message: `Plan first: do not change anything yet. When your plan is ready, call ${PLAN_TOOL} with the plan; the user approves it in the app, then you can make the changes.`,
      }
    }
    const project = str(input.project)
    const other = !!project && project !== ctx.rid
    // 지식 라이브러리의 대화(개념노트 기록에서 연 대화)는 개념노트가 제 범위다
    if ((name === 'edit_concept' && ctx.rid !== LIBRARY_RID) || (other && !canChange(ctx, project))) {
      // 전체 범위(중앙 대화 · 옛 대화): 이 대화의 프로젝트 밖을 고칠 때마다 묻는다 (고친 것은 여전히 수정 검토를 거친다)
      if (ctx.scope.kind === 'all') {
        const where = name === 'edit_concept' ? t('개념노트', 'Concept note') : project
        const what = describeStep(ctx, tool, input).summary
        return { kind: 'ask', summary: t(`다른 곳 고치기 · ${where} · ${what}`, `Change elsewhere · ${where} · ${what}`), key: `${name}:${project}:${what}`, label: t(`${where} 고치기`, `Change ${where}`), once: true }
      }
      return {
        kind: 'deny',
        reason: t('이 대화가 고치는 프로젝트 밖이라 읽기만 합니다', 'Outside the projects this conversation changes: read only'),
        message: `That is outside the projects this conversation may change (${changeable(ctx).join(', ')}); other projects and concept notes are read-only here. Do not change it. If the work needs it, call ${HELP_TOOL} so the central conversation can hand it to the right conversation, or tell the user what should change and where.`,
      }
    }
    if (name === 'edit_note') {
      const file = str(input.file)
      if (!other && !inScope(ctx.scope, file)) {
        return {
          kind: 'deny',
          reason: t(`범위 밖 노트라 고치지 않습니다: ${file}`, `Note outside this conversation's scope: ${file}`),
          message: `${file} is outside this conversation's scope (${scopeDir(ctx.scope)}). Do not change it; tell the user what should change there and why.`,
        }
      }
      const by = other ? ctx.claimedBy(file, project) : ctx.claimedBy(file)
      if (by) {
        return {
          kind: 'deny',
          reason: t(`다른 대화(「${by}」)가 고치는 중인 파일입니다: ${file}`, `Another conversation ("${by}") is changing ${file}`),
          message: `Another conversation ("${by}") is changing ${file} right now. Do not change it; finish what you can and tell the user.`,
        }
      }
      const claim = other ? `${project}:${file}` : file
      const at = other ? `${project} · ${file}` : file
      if (ctx.mode === 'ask') return { kind: 'ask', summary: t(`노트 고치기: ${at}`, `Edit note: ${at}`), key: `edit_note:${claim}`, label: t(`노트 고치기 · ${at}`, `Edit note · ${at}`), claim }
      return { kind: 'allow', claim }
    }
    if (ctx.mode === 'ask') return { kind: 'ask', summary: `${name} · ${describeStep(ctx, tool, input).summary}`, key: name, label: name }
    return { kind: 'allow' }
  }
  const step = describeStep(ctx, tool, input)
  if (tool === 'Bash') return judgeCommand(ctx, str(input.command), step.summary)
  if (tool === 'WebFetch' || tool === 'WebSearch') {
    if ((ctx.auto?.() ?? autoOf({ write: ctx.write, mode: ctx.mode })).web) return { kind: 'allow' }
    return { kind: 'ask', summary: `${tool} · ${step.summary}`, key: tool, label: t('웹 보기', 'Web'), does: 'web', turnOn: 'web' }
  }
  return { kind: 'ask', summary: `${tool} · ${step.summary}`, key: tool, label: tool }
}

/**
 * 명령 한 줄 (10/28 사용자 결정 "권한을 명령 대신 하는 일로"): 하는 일로 나눠 토글대로.
 * 읽기 · 실행은 토글이 켜져 있으면 묻지 않고, 편집은 맡기는 정도(편집 자동 허용)가, 삭제 · 외부는 늘 한 번씩 묻는다
 */
function judgeCommand(ctx: PolicyCtx, cmd: string, summary: string): Verdict {
  const roots = [ctx.repo, ...ctx.readable]
  const does = commandKind(cmd, { cwd: ctx.repo, home: os.homedir(), inside: (abs) => roots.some((d) => abs === d || isInside(d, abs)) })
  const auto = ctx.auto?.() ?? autoOf({ write: ctx.write, mode: ctx.mode })
  const what = clip(cmd, 80)
  const gated = ctx.mode === 'plan' && !ctx.planOk
  if (does === 'read') {
    if (auto.read) return { kind: 'allow' }
    return { kind: 'ask', summary, key: 'read', label: t('읽기', 'Read'), does, turnOn: 'read' }
  }
  if (does === 'edit' || does === 'delete') {
    if (ctx.write === 'read') return { kind: 'deny', reason: t('읽기만 하는 대화라 고치지 않습니다', 'This conversation is read-only'), message: 'This conversation is read-only: do not change, move or delete files. Tell the user what you would change instead.' }
    if (gated) return { kind: 'deny', reason: t('계획을 승인하기 전이라 고치지 않습니다', 'Not changed before the plan is approved'), message: `Plan first: do not change anything yet. When your plan is ready, call ${PLAN_TOOL} with the plan; the user approves it in the app, then you can make the changes.` }
    if (does === 'delete') return { kind: 'ask', summary, key: `delete:${cmd}`, label: t(`삭제 · ${what}`, `Delete · ${what}`), does, once: true }
    if (ctx.mode === 'edit') return { kind: 'allow' }
    return { kind: 'ask', summary, key: 'edit', label: t('편집', 'Edit'), does, turnOn: 'edit' }
  }
  if (does === 'run') {
    const prog = runProgram(cmd)
    if (auto.run || ctx.always?.(`run:${prog}`)) return { kind: 'allow' }
    return { kind: 'ask', summary, key: `run:${prog}`, label: t(`실행 · ${prog}`, `Run · ${prog}`), does }
  }
  return { kind: 'ask', summary, key: `${does}:${cmd}`, label: t(`외부 · ${what}`, `Outside · ${what}`), does: 'outside', once: true }
}
