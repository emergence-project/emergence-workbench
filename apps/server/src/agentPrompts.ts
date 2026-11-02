/**
 * 에이전트에게 줄 글 (순수 함수): 대화를 열 때의 안내, 지시와 붙인 것, 피드백을 맡길 때의 첫 지시와 그림, 곁 질문 · 기록 초안에 줄 대화 요약.
 * agentChats.ts에서 떼어 냄 (11/2, 구조 래칫). agentChats.ts가 다시 내보내므로 가져오는 곳은 그대로다.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { Attach, Chat, ChatMode, ChatScope, ChatWrite, ImageIn } from '@rw/core/contract/agentChats'
import { APP_CHECKS, APP_SUBMIT, clip, EXPLORE_AGENT, FEEDBACK_ANSWER, PLAN_TOOL, scopeDir } from './agentPolicy.js'
import type { FeedbackListItem } from './feedback.js'
import { t } from './i18n.js'

// ---------- 안내 (대화를 열 때 한 번, 짧게) ----------

/** 앱 고치기 대화의 안내 */
export function appBriefFor(o: { branch: string; write: ChatWrite; mode?: ChatMode; rules?: string; feedback?: boolean; agent?: string }): string {
  const claude = !o.agent || o.agent === 'claude-code'
  const lines = [
    `You are fixing the Emergence Workbench app itself, from inside the app. The current folder is a separate git worktree of the app repository on branch ${o.branch}, made from origin/main. The running app and the user's own checkout are elsewhere.`,
    // 규칙은 그 대화에 필요한 것만 (차례마다 다시 읽는 앞 내용을 줄이려고, 10/22): 개인 규칙 · 피드백 규칙은 피드백을 맡은 대화만
    o.feedback
      ? `Read CLAUDE.md first${o.rules ? `, then the maintainer's personal rules at ${o.rules} (they take precedence)` : ''}. Feedback handling rules: docs/feedback/agent.md.`
      : 'Read CLAUDE.md once at the start (not again). The maintainer\'s personal rules and docs/feedback/ are for feedback conversations; you do not need them here.',
    o.write === 'read'
      ? 'This conversation is read-only: do not change files. Tell the user what you would change.'
      : 'Edit files directly inside this folder (the user sees each change; files changed by commands show up from git diff at the end of your turn) and run commands here. Start with `pnpm install --frozen-lockfile --prefer-offline` if node_modules is missing. Read large files in parts instead of whole.',
    ...(claude ? [`To find something across many files or read several large files, hand it to the ${EXPLORE_AGENT} subagent (Agent tool, subagent_type "${EXPLORE_AGENT}", a small fast model): it returns only what it found, so this conversation stays short.`,
      'This conversation stays open between turns: a long command can run in the background (run_in_background) and you continue when it finishes, even after your turn ends. Never sleep to wait.'] : []),
    'Check your own work before submitting: `pnpm type-check`, `pnpm test` (or the one test file you touched, e.g. `pnpm --filter @rw/server exec vitest run src/<file>.test.ts`), and for screen changes `pnpm shots` and look at the pictures in shots/ yourself (SHOTS_PORT is already set for this conversation). Fix what fails before submitting.',
    `Do not push, open or merge PRs yourself and do not touch the running app service: when the change is ready, call ${APP_SUBMIT} with a one-line Korean PR title and a body that follows the PR template; the app commits, pushes this conversation's own branch and opens or updates its pull request (other open PRs do not block it). GitHub CI then runs again. Call ${APP_CHECKS} with wait (minutes) to wait for the result; if a check fails, read the log, fix and call ${APP_SUBMIT} again. If the app says the branch conflicts with main, run \`git fetch origin main && git merge origin/main\`, resolve, check again and submit.`,
    'Update tests and docs that the change touches (about section prs, uiNames.en.json, design-system.md) as CLAUDE.md says.',
    'Research projects are read-only here: do not change notes, records, tasks or flows.',
  ]
  if (o.feedback) lines.push(
    `This conversation handles one app feedback item (the first message). Follow docs/feedback/agent.md and the personal rules for its kind: fix only a 수정, answer a 질문 without changing that code, judge a 제안 without building it. Its picture (the screen at the moment the user left it) is attached to the first message, and its spot is the data-ui name: find it with \`grep -rn 'data-ui="<spot>"' apps/web/src\`.`,
    `Do not edit the feedback files. Record the handling with ${FEEDBACK_ANSWER}: state, a note whose first line is one of the fixed answer phrases, understood, cause, and clean (the corrected sentence); ask when the user must decide; miss and lesson when redoing a revision request; replies for unanswered comments. For a fix, call it after ${APP_CHECKS} shows CI green, with after = the screen picture name from scripts/shots/screens.mjs that shows the change, so the app saves the 전/후 pictures.`,
  )
  if (claude && o.mode === 'plan' && o.write !== 'read') lines.push(`Plan first: read what you need, then call ${PLAN_TOOL} with a short numbered plan. Change nothing until the user approves it.`)
  lines.push(`${claude ? 'Use TodoWrite' : 'Keep a plan'} for work with three or more steps. Write to the user in Korean, briefly: result first.`)
  return lines.join('\n')
}

export function briefFor(o: { rid: string; title: string; scope: ChatScope; write: ChatWrite; mode?: ChatMode; others: { title: string; claims: string[] }[]; agent?: string }): string {
  const claude = !o.agent || o.agent === 'claude-code'
  const scope = o.scope.kind === 'project' ? 'the whole project' : o.scope.kind === 'all' ? 'every registered project and the knowledge library (this conversation belongs to this project)' : `${o.scope.kind} ${o.scope.target} (folder ${scopeDir(o.scope)})`
  const lines = [
    `You are working inside Emergence Workbench on the project "${o.title}" (project id ${o.rid}). The current folder is its repository.`,
    `Scope: ${scope}. ${o.scope.kind === 'all' ? 'Read any project when the work needs it. Changing another project or a concept note asks the user each time; change only what the work needs there.' : 'Read outside the scope only when the work needs it. You cannot change anything outside the scope: say what should change, where and why, and stop there.'}`,
    o.write === 'read'
      ? 'This conversation is read-only: do not change notes, records or files. Commands that change files are blocked; reading and running commands follow the user\'s permission switches (the app may ask).'
      : 'Change notes only with the workbench MCP tool edit_note (read_note first, pass its hash as baseHash); the user reviews each changed paragraph. Records: add_record / answer_record. Editing files directly is blocked; prefer edit_note over shell edits so the user can review them. Commands follow the user\'s permission switches: deleting and anything outside the project folders (git push, installs, downloads) always asks.',
    `Start with the workbench MCP tools: rules (project ${o.rid}) and project_status; keep reads short and read more only when needed.`,
  ]
  if (claude && o.mode === 'plan' && o.write !== 'read') lines.push(`Plan first: read what you need, then call ${PLAN_TOOL} with a short numbered plan. Change nothing until the user approves it.`)
  lines.push(`${claude ? 'Use TodoWrite' : 'Keep a plan'} for work with three or more steps: the user sees the list live. `)
  if (claude) lines.push(`To find something across many files or read several large files, hand it to the ${EXPLORE_AGENT} subagent (Agent tool, subagent_type "${EXPLORE_AGENT}", a small fast model): it returns only what it found, so this conversation stays short.`)
  const busy = o.others.filter((c) => c.claims.length)
  if (busy.length) lines.push(`Other conversations are changing these files now; do not change them: ${busy.map((c) => `${c.title}: ${c.claims.join(', ')}`).join('; ')}.`)
  lines.push('Write to the user in Korean, briefly: result first. Write math as $…$ inside a sentence and $$…$$ on its own lines; the conversation renders them.')
  return lines.join('\n')
}

/** 입력란에서 그대로 Claude Code에 넘기는 명령 (맥락 줄이기 · 맥락 보기) */
export const CC_COMMAND = /^\/(compact|context)(\s|$)/

/** 지시와 붙인 것을 에이전트에게 줄 글로 (붙인 것은 이름과 읽을 방법만, 고른 글은 그대로) */
export function promptOf(text: string, attach?: Attach[]): string {
  // Claude Code 명령은 그대로 (붙인 것을 더하면 명령의 인자가 된다)
  if (CC_COMMAND.test(text.trim())) return text.trim()
  if (!attach?.length) return text
  const how: Record<Attach['kind'], string> = {
    note: 'note (read_note)', topic: 'topic (project_status / list_notes)', file: 'file (Read)', selection: 'selected text', paper: 'paper (library)', record: 'record (read_records)', connector: 'connector (MCP server; its tools are mcp__<name>__*, use them for this)',
  }
  const lines = attach.map((a) => a.kind === 'selection'
    ? `- ${how.selection} from ${a.ref}:\n${(a.text ?? '').split('\n').map((l) => `  > ${l}`).join('\n')}`
    : `- ${how[a.kind]}: ${a.ref}${a.label && a.label !== a.ref ? ` (${a.label})` : ''}`)
  return `${text}\n\nAttached by the user (read these first, nothing else unless needed):\n${lines.join('\n')}`
}

// ---------- 지시 ----------

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

/** 피드백 그림을 첫 지시에 붙일 그림으로 (너무 크면 붙이지 않고 경로만) */
export function pictureImage(file: string): ImageIn[] | undefined {
  const type = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' } as const)[path.extname(file).toLowerCase() as '.png']
  if (!type) return undefined
  const buf = fs.readFileSync(file)
  return buf.length <= 3_500_000 ? [{ type, data: buf.toString('base64') }] : undefined
}

/** 곁 질문에 줄 글: 대화의 제목 · 범위 · 할 일 · 바뀐 파일과 뒤에서부터 지시 · 에이전트 글 (모두 SIDE_CHARS자 안으로) */
export function sidePrompt(c: Pick<Chat, 'title' | 'scope' | 'items' | 'todos' | 'changed'>, q: string): string {
  return [
    'You answer a quick side question about an ongoing agent conversation in Emergence Workbench, without tools and without interrupting it.',
    'Answer from the conversation below only, briefly (one to four sentences), in the language of the question. If the answer is not in it, say so and suggest asking the agent itself.',
    '',
    ...chatDigest(c),
    '',
    `Side question: ${q}`,
  ].join('\n')
}

/**
 * 「기록으로 남기기」(10/28 시안 QHNCb6oYYUN4FtFLkqh2bJ 2절): 직접 연 대화에서 기록 초안을 쓴다. 초안은 적기 칸에 뜨고 사용자가 고쳐 저장한다.
 * 물은 것 한 줄 · 결론 몇 줄 · 고친 곳 (기록 파일의 글은 한국어)
 */
export function recordDraftPrompt(c: Pick<Chat, 'title' | 'scope' | 'items' | 'todos' | 'changed'>, place: string): string {
  return [
    'From the agent conversation below (Emergence Workbench), write a draft record the researcher will keep, without tools.',
    'Write in Korean, plain text, no heading lines and no preamble: the first line is what was asked, in one line. Then the conclusion in two to five lines, with grounds (section, equation, file:line) when the conversation gives them. If notes or files changed, end with a line "고친 곳:" and one "- <file>" line each. Use only what is in the conversation; mark open points as open.',
    `The record will be attached to: ${place}.`,
    '',
    ...chatDigest(c),
  ].join('\n')
}

/** 대화를 작은 모델에게 줄 글로: 제목 · 범위 · 할 일 · 바뀐 파일과 뒤에서부터 지시 · 에이전트 글 (모두 SIDE_CHARS자 안으로) */
function chatDigest(c: Pick<Chat, 'title' | 'scope' | 'items' | 'todos' | 'changed'>): string[] {
  const lines: string[] = []
  let room = SIDE_CHARS
  for (let i = c.items.length - 1; i >= 0 && room > 0; i--) {
    const it = c.items[i]!
    const line = it.kind === 'user' ? `User: ${it.text}` : it.kind === 'text' && !it.sub ? `Agent: ${it.text}` : it.kind === 'side' && it.answer ? `Side question: ${it.q}\nSide answer: ${it.answer}` : it.kind === 'edit' ? `(changed ${it.file} +${it.added} −${it.removed})` : it.kind === 'result' && it.cost !== undefined ? `(turn cost about $${it.cost.toFixed(2)} at API prices${it.tokens ? `, ${it.tokens.in + it.tokens.out} tokens` : ''})` : undefined
    if (!line) continue
    const cut = clip(line, Math.min(1500, room))
    lines.unshift(cut)
    room -= cut.length
  }
  return [
    `Conversation: ${c.title} (scope: ${c.scope.kind}${c.scope.target ? ` ${c.scope.target}` : ''})`,
    ...(c.todos.length ? [`To-dos: ${c.todos.map((x) => `[${x.state}] ${x.text}`).join('; ')}`] : []),
    ...(c.changed.length ? [`Changed files: ${c.changed.join(', ')}`] : []),
    '',
    ...lines,
  ]
}
const SIDE_CHARS = 12_000
