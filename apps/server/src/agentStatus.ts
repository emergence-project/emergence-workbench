import fs from 'node:fs'
import path from 'node:path'
import { awaitsUserReview, buildTree, STATUS_LABEL_KO, isValidBlockId, RESEARCH_TARGET, sameNoteFile, todoDue, type JournalEntry, frontMatter } from '@rw/core'
import YAML from 'yaml'
import type { EditList } from '@rw/core/contract/agentEdits'
import { AgentEditStore, listEdits } from './agentEdits.js'
import { isLatexSafePath, localDate, writeAtomic } from './fsutil.js'
import { appPath, homeShort } from './agentPaths.js'
import { localSyncState } from './gitSyncState.js'
import { allManuscripts, groundsOf, lastCompile } from './manuscript.js'
import { listMaterials } from './materials.js'
import { listStatements } from './statements.js'
import { listNotes, noteRecordTarget, topicsOverview, type TopicStats } from './noteList.js'
import { pendingQuestions, unsortedRecords, userReplies } from './comments.js'
import { legacyJournalTodos, openTodos } from './todos.js'
import { RULES_DOC, statusSection } from './tasks.js'
import { flowStatusSections } from './flowStatus.js'
import { commonRules, type RuleFile } from './agentRules.js'
import { DECISIONS_DIR, folderMap, listDecisions, listRules, RULES_DIR, usesStandardLayout } from './projectFolders.js'
import type { ProjectSources, Workbench } from './workbench.js'
import type { Registry } from './registry.js'
import type { TaskTable, ReviewDoc } from '@rw/core/contract/research'
export type { TaskTable, ReviewDoc }

/**
 * 프로젝트가 이미 가진 정본을 읽어 모은 것과, 에이전트가 먼저 읽을 요약 workbench/STATUS.md.
 * STATUS.md는 앱이 쓰는 생성 파일이다 — 사람·에이전트가 고치지 않는다. 정본은 각 원본 파일.
 */

export function readTaskTable(repo: string, sources: ProjectSources): TaskTable | null {
  if (!sources.tasks) return null
  const lines = fs.readFileSync(path.join(repo, sources.tasks), 'utf8').split('\n')
  const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
  // 작업 표는 '상태' 열과 '내용'(작업·항목·task) 열이 함께 있는 첫 표다. 작업 표 위에 일정표(날짜·일정·상태)가 먼저 오는 파일이 있다.
  // 그런 표가 없으면 '상태' 열이 있는 첫 표, 그것도 없으면 첫 표.
  const tables: TaskTable[] = []
  for (let i = 0; i + 1 < lines.length; i++) {
    if (lines[i]!.trim().startsWith('|') && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1]!)) {
      const columns = cells(lines[i]!)
      const rows: string[][] = []
      let j = i + 2
      for (; j < lines.length && lines[j]!.trim().startsWith('|'); j++) rows.push(cells(lines[j]!))
      tables.push({ file: sources.tasks, columns, rows })
      i = j - 1
    }
  }
  const has = (tb: TaskTable, re: RegExp) => tb.columns.some((c) => re.test(c))
  const status = /^(상태|status)$/i, what = /^(내용|작업|할 일|항목|task|tasks|item|title)$/i
  return tables.find((tb) => has(tb, status) && has(tb, what)) ?? tables.find((tb) => has(tb, status)) ?? tables[0] ?? { file: sources.tasks, columns: [], rows: [] }
}

export function listReviews(repo: string, sources: ProjectSources): ReviewDoc[] {
  const out: ReviewDoc[] = []
  const walk = (dir: string) => {
    for (const n of fs.readdirSync(dir)) {
      if (n.startsWith('.')) continue
      const p = path.join(dir, n)
      const st = fs.statSync(p)
      if (st.isDirectory()) { if (n !== 'sources' && n !== 'archive') walk(p); continue }
      if (!n.endsWith('.md')) continue
      const text = fs.readFileSync(p, 'utf8')
      const f = frontMatter(text)
      if (!f) continue
      let fm: Record<string, unknown> = {}
      try { fm = YAML.parse(f.yaml) ?? {} } catch { continue }
      if (typeof fm.status !== 'string') continue
      const h1 = /^#\s+(.+)$/m.exec(f.body)?.[1]
      out.push({ file: path.relative(repo, p), title: String(fm.title ?? h1 ?? n), status: fm.status, updated: fm.updated ? String(fm.updated) : undefined })
    }
  }
  // workbench/의 프로젝트 규칙·결정도 검토 문서다: in-review면 사용자 차례 (10/13 R2). sources.reviews가 이미 덮는 폴더는 두 번 읽지 않는다
  const dirs = [...sources.reviews.map((d) => path.join(repo, d)), ...[RULES_DIR, DECISIONS_DIR].map((d) => path.join(repo, 'workbench', d)).filter((d) => fs.existsSync(d))]
  const seen = new Set<string>()
  for (const abs of dirs) if (fs.statSync(abs).isDirectory()) walk(abs)
  return out.filter((r) => { if (seen.has(r.file)) return false; seen.add(r.file); return true }).sort((a, b) => a.file.localeCompare(b.file))
}

export const STATUS_FILE = 'STATUS.md'
/** STATUS.md 첫 안내 줄의 앞부분 (뒤에 쓴 시각이 붙는다). 같은 내용을 다시 쓰지 않으려고 비교할 때 이 줄을 뺀다 */
const STATUS_HEAD = '> 연구 작업대 앱이 자동으로 쓰는 요약이다'
const GLYPH: Record<string, string> = { 'in-progress': '●', blocked: '⏸︎', stopped: '■', solved: '✓' }
/** STATUS.md에 쓰는 상태 이름 (한국어 저장 값, core의 표 하나) */
const LABEL: Record<string, string> = STATUS_LABEL_KO
/** 표 칸 안의 마크다운 링크를 글자만 남긴다 */
const plain = (s: string) => s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/`/g, '')
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** 앱 설정의 고침 기록을 읽기만 한다. CLI는 등록 경로로 프로젝트 id를 찾는다. */
export function readStatusEdits(wb: Workbench, configDir: string, rid?: string, lib?: string): EditList {
  const empty = { reviews: [], attempts: [] }
  try {
    if (!rid) {
      const config = YAML.parse(fs.readFileSync(path.join(configDir, 'config.yaml'), 'utf8'))
      rid = config?.researches?.find((r: { path: string }) => {
        try { return fs.realpathSync(r.path) === fs.realpathSync(wb.repo) } catch { return false }
      })?.id
      if (typeof config?.library === 'string' && fs.existsSync(config.library)) {
        const real = fs.realpathSync(config.library)
        if (isLatexSafePath(real)) lib = real
      }
    }
    if (!rid) return empty
    // 앱의 GET /api/agent-edits와 같은 현재 라이브러리 기록을 읽는다.
    const store = new AgentEditStore(AgentEditStore.fileFor(configDir, lib))
    return listEdits({ lib, wbOf: () => wb }, store, rid, true)
  } catch { return empty }
}

/**
 * 연구 공통 규칙 절의 본문: 머리말 · 맨 위 제목 · 첫 절 앞의 머리 글(어디서 읽는지와 우선순위, 안내 줄이 대신한다)을 떼고,
 * 절 제목을 한 단계 내린다 (STATUS.md의 ## 아래에 들어가게). 절이 없으면 제목 뒤 전부
 */
function commonRulesBody(text: string): { status: string; body: string } {
  const f = frontMatter(text)
  let status = ''
  try { const v = f ? (YAML.parse(f.yaml) as { status?: unknown } | null)?.status : undefined; if (typeof v === 'string') status = v } catch { /* 머리말을 읽지 못하면 상태 없이 */ }
  let body = (f ? f.body : text).replace(/^\s*#\s+.*\n+/, '')
  const first = body.search(/^## /m)
  if (first > 0) body = body.slice(first)
  return { status, body: body.replace(/^(#{2,5}) /gm, '#$1 ').trim() }
}

/** common: 연구 공통 규칙 (agentRules.ts commonRules). 있으면 정본 위치 바로 뒤에 붙인다 (R1) */
export async function generateStatus(wb: Workbench, now = new Date(), edits?: EditList, common?: RuleFile | null): Promise<string> {
  const info = wb.readResearch()
  const repo = wb.repo
  const src = info.sources
  const blocks = wb.listBlocks()
  const notes = listNotes(wb).filter((n) => n.type !== 'block')
  const tree = buildTree(blocks)
  const byId = new Map(blocks.map((b) => [b.id, b]))
  const statements = listStatements(wb.root)
  const journal: JournalEntry[] = wb.recentJournal(365)
  const today = localDate(now)
  const out: string[] = []
  const p = (...l: string[]) => out.push(...l)
  const sync = await localSyncState(repo)
  const warnings: string[] = []
  if (sync?.behind) {
    const checked = sync.fetchedAt ? `(마지막 확인 ${localDate(sync.fetchedAt)} ${sync.fetchedAt.toTimeString().slice(0, 5)})` : ''
    const more = sync.conflictCount - sync.conflicts.length
    const conflicts = sync.conflictCount ? ` 커밋하지 않은 변경과 겹치는 파일: ${sync.conflicts.join(', ')}${more ? ` 외 ${more}개` : ''}.` : ''
    warnings.push(`> ⚠ 이 사본은 GitHub보다 ${sync.behind}커밋 뒤다${checked}. 일하기 전에 받는다: 앱 홈의 받기 또는 \`git pull --ff-only\`.${conflicts}`)
  }
  if (sync?.ahead) warnings.push(`> ⚠ 이 컴퓨터에만 있는 커밋 ${sync.ahead}개가 GitHub에 없다.`)

  p(`# STATUS — ${info.title}`, '',
    `${STATUS_HEAD} (${today} ${now.toTimeString().slice(0, 5)}). **고치지 말 것** — 고칠 것은 아래 정본 파일에서.`,
    ...warnings,
    // MCP를 맨 앞에 (10/21): 이 파일(40KB 남짓)을 통째로 읽고 workbench 파일을 직접 고치던 에이전트가 도구를 쓰게
    '> MCP 입구 `emergence-workbench`가 연결돼 있으면 이 파일 대신 `project_status`(짧은 요약, 절은 하나씩)로 보고, workbench 파일도 도구로 쓴다: 노트 `edit_note` · 개념노트 `edit_concept`(사용자가 바뀐 문단마다 검토한다) · 기록 `add_record`·`answer_record` · 흐름 `flow_add`·`flow_update` · 맡긴 일 `add_task`·`report_task` · 일지 `add_journal`.',
    '> 이 저장소의 에이전트는 이 요약을 먼저 보고 지금 어디까지 왔는지 파악한 뒤, 저장소 자체 규칙(AGENTS.md·CLAUDE.md)을 따른다.',
    `> 사용자가 맡긴 일(\`workbench/tasks/\`)은 공통 규칙 \`${RULES_DOC}\`을 따른다: 종결 조건을 먼저, 결과는 같은 파일에(MCP가 있으면 \`report_task\`로), 승인은 사용자만.`,
    `> MCP가 없거나 도구가 다루지 않는 파일을 직접 고칠 때는 형식 문서 \`${appPath('docs/repo-format.md')}\`를 따르고, 고친 뒤 \`pnpm --dir ${appPath()} agent:check ${homeShort(repo)}\`로 검사한다.`,
    '> 사용자가 확인한 것(✓ 해결 노트, `checked` 개념노트)은 고치기 전에 대화에서 허락을 받는다. 원고(`research.yaml` `sources.manuscript`의 `.tex`)는 사용자가 요청할 때만 고치고, `locked: true` 개념노트는 고치지 않는다.', '')
  if (info.question) p(`**목표.** ${info.question}`, '')

  p('## 정본 위치', '')
  for (const c of src.canon) p(`- \`${c.path}\`${c.note ? ` — ${c.note}` : ''}`)
  if (blocks.length) p(`- \`workbench/blocks/*.md\` (예전 것은 \`*.tex\`) — 블록 노트 ${blocks.length}개 (과정 기록: 상태·다음 할 일·멈춘 이유)`)
  if (wb.usesTopicFolders()) p(`- \`workbench/topics/<주제>/topic.yaml\` — 주제 ${wb.topicFolders().length}개의 정보 (순서는 \`research.yaml\` \`topics:\`)`)
  if (notes.length) p(`- ${noteDirs(notes).map((d) => `\`${d}\``).join(' · ')} — 노트 ${notes.length}개 (본문 \`note.md\` 또는 \`main.tex\`, 정보는 \`note.yaml\`)`)
  if (statements.length) p(`- \`${statements[0]!.file.split('/')[0]}/\` — 진술 ${statements.length}개 (정의·정리; uses·proofs 관계)`)
  const rules = listRules(wb)
  const decisions = listDecisions(wb)
  if (rules.length) p(`- \`workbench/rules/<이름>.md\` — 프로젝트 규칙 ${rules.length}개 (아래 "프로젝트 규칙"을 먼저 읽는다)`)
  if (decisions.length) p(`- \`workbench/decisions/<날짜-이름>.md\` — 결정 ${decisions.length}개 (규칙이 왜 그런지)`)
  p('- `workbench/log/날짜.md` — 할 일과 기록', '')

  // ---------- 연구 공통 규칙 (10/13 연구 저장소 폴더, R1) ----------
  if (common) {
    const { status, body } = commonRulesBody(common.text)
    p('## 공통 규칙', '', `> 모든 연구 저장소에 통하는 규칙 \`${common.file}\`${status ? ` (${status})` : ''}. 이 저장소의 규칙(\`AGENTS.md\`, 아래 프로젝트 규칙)은 이 위에 더하거나 더 엄하게만 정한다. 그 일에 대해 사용자가 직접 정한 것은 둘보다 앞선다.`, '', body, '')
    if (common.truncated) p('(잘림)', '')
  }

  // ---------- 폴더와 편집 규칙 (10/13 연구 저장소 폴더, D7) ----------
  const folders = folderMap(wb)
  if (folders.standard.some((f) => f.name !== 'workbench') || folders.own.length || usesStandardLayout(wb)) {
    p('## 폴더와 편집 규칙', '', '> 맨 위 폴더마다 무엇을 두고 에이전트가 어떻게 고치는지. 저장소 규칙(`AGENTS.md`)이 더 엄하면 그것을 따른다.', '')
    for (const f of folders.standard) p(`- \`${f.name}/\` — ${f.role} · ${f.edit}`)
    for (const f of folders.own) p(`- \`${f.name}/\` (고유 폴더)${f.note ? ` — ${f.note}` : ''} · ${f.edit}`)
    if (folders.other.length) p(`- 표준 밖: ${folders.other.map((n) => `\`${n}/\``).join(', ')} — 저장소 규칙대로. 옮기는 것은 사용자가 허락한 뒤`)
    p('')
  }
  if (rules.length) {
    p(`## 프로젝트 규칙 ${rules.length}`, '', '> 이 프로젝트에만 해당하는 규칙. 일을 시작하기 전에 읽는다. in-review인 규칙은 사용자 검토 대기다(따르되 승인된 것으로 보고하지 않는다).', '')
    for (const r of rules) p(`- \`${r.file}\` · ${r.title}${r.status ? ` · ${r.status}` : ''}`)
    p('')
  }

  // ---------- 할 일 ----------
  // 정본은 기록 파일의 할 일 기록 (2026-10-16). 대상마다 묶어 한 줄씩, 주소는 기록 도구(read_records 등)에 그대로 쓴다
  const open = openTodos(wb.root)
  const legacy = legacyJournalTodos(wb)
  const table = readTaskTable(repo, src)
  p('## 할 일', '')
  if (table && table.rows.length) {
    p(`### 프로젝트 작업 목록 — \`${table.file}\` (정본, 순서대로)`, '')
    const keep = table.columns.map((c, i) => [c, i] as const).filter(([c]) => !/파일|file/i.test(c))
    p(`| ${keep.map(([c]) => c).join(' | ')} |`, `|${keep.map(() => '---').join('|')}|`)
    for (const r of table.rows) p(`| ${keep.map(([, i]) => clip(plain(r[i] ?? ''), 140).replace(/\|/g, '/')).join(' | ')} |`)
    p('')
  }
  p(`### 앱 할 일 — \`workbench/comments/\` (사용자가 할 일. 에이전트는 대신하지 않는다)${open.length ? '' : ' (없음)'}`, '')
  if (legacy) p(`> 예전 일지(\`workbench/log/\`)에 끝내지 않은 할 일 ${legacy}개가 남아 있다. 앱이 이 프로젝트를 다음에 열 때 기록으로 옮긴다.`, '')
  const groups = new Map<string, typeof open>()
  for (const todo of open) groups.set(todo.target, [...(groups.get(todo.target) ?? []), todo])
  for (const [target, todos] of [...groups].sort(([a], [b]) => (a === 'project' ? -1 : b === 'project' ? 1 : 0))) {
    p(target === 'project' ? '- 이 프로젝트' : `- ${todos[0]!.where} (\`${target}\`)`)
    for (const todo of todos) p(`  - [ ] ${clip(todo.text, 200)}${todo.due ? ` — 마감 ${todo.due}` : ''} · \`${target}/${todo.id}\``)
  }
  if (open.length) p('')

  // ---------- 맡긴 일 (작업 탭) ----------
  p(...statusSection(wb))

  // ---------- 흐름 (점이 있을 때만) ----------
  p(...flowStatusSections(wb))

  // ---------- 에이전트 수정 검토 대기 ----------
  const editReviews = edits?.reviews.filter((r) => r.target.kind === 'note') ?? []
  const editAttempts = edits?.attempts.filter((a) => a.target.kind === 'note') ?? []
  if (editReviews.length || editAttempts.length) {
    p(`## 에이전트 수정 검토 대기 ${editReviews.length + editAttempts.length}`, '',
      '> 사용자 차례: 앱의 검토 화면(#/review)에서 바뀐 문단마다 승인 · 되돌리기 · 직접 고치기. 검토 전에 같은 노트를 또 고칠 때는 사용자가 되돌린 문단을 다시 넣지 않는다.', '')
    for (const r of editReviews) if (r.target.kind === 'note') {
      const first = new Date(r.since)
      p(`- **${r.title}** — \`${r.target.file}\` · 바뀐 곳 ${r.changes} · 에이전트 ${r.agents.join(', ') || '—'} · 첫 고침 ${localDate(first)} ${first.toTimeString().slice(0, 5)}`)
    }
    for (const a of editAttempts) if (a.target.kind === 'note') p(`- 허락 대기: **${a.title}** — \`${a.target.file}\` · 에이전트 ${a.agent || '—'}`)
    p('')
  }

  // ---------- 대기 중인 질문 (에이전트 함) ----------
  const asked = pendingQuestions(wb.root)
  if (asked.length) {
    p(`## 대기 중인 질문 ${asked.length}`, '',
      '> 사용자가 노트 · PDF · 프로젝트에 남긴 질문. 답은 그 파일의 해당 질문 아래에 `### 답 · <이름> · YYYY-MM-DD HH:MM`과 답을 적고 끝에 `- 상태: 답함`을 덧붙인다(MCP `answer_record`, 클라우드는 `pnpm agent:answer`). 첫 줄에 결론, 몇 줄로 쓰고 근거는 파일:줄로 남긴다.', '')
    for (const q of asked) {
      p(`- \`${q.file}\` · ${q.id} · ${q.title}${q.where !== '전체' ? ` ${q.where}` : ''}${q.quote ? ` — "${clip(q.quote, 120)}"` : ''}`)
      if (q.body) p(`  - ${clip(q.body.split('\n')[0]!, 200)}`)
      if (q.lastAnswer) p(`  - 마지막 글 (${q.lastAnswer.by}): ${clip(q.lastAnswer.body.replace(/\s+/g, ' ').trim(), 200)}`)
    }
    p('')
  }

  // ---------- 대기 중인 지시 (에이전트가 하고 답한다, 10/15) ----------
  const told = pendingQuestions(wb.root, '지시')
  if (told.length) {
    p(`## 대기 중인 지시 ${told.length}`, '',
      '> 사용자가 에이전트에게 해 달라고 남긴 작은 일. 한 일을 마친 뒤 그 지시 아래에 `### 답 · <이름> · YYYY-MM-DD HH:MM`과 무엇을 했는지 적고 끝에 `- 상태: 답함`을 덧붙인다(MCP `answer_record`, 클라우드는 `pnpm agent:answer`가 같은 일을 한다). 노트는 `edit_note`로 고쳐 사용자가 검토하게 한다. 종결 조건과 보고서가 필요한 큰 일이면 하지 말고 맡긴 일로 옮기자고 답한다.', '')
    for (const q of told) {
      p(`- \`${q.file}\` · ${q.id} · ${q.title}${q.where !== '전체' ? ` ${q.where}` : ''}${q.quote ? ` — "${clip(q.quote, 120)}"` : ''}`)
      if (q.body) p(`  - ${clip(q.body.split('\n')[0]!, 200)}`)
      if (q.lastAnswer) p(`  - 마지막 글 (${q.lastAnswer.by}): ${clip(q.lastAnswer.body.replace(/\s+/g, ' ').trim(), 200)}`)
    }
    p('')
  }

  // ---------- 사용자가 답한 에이전트 질문 (10/16) ----------
  const replied = userReplies(wb.root)
  if (replied.length) {
    p(`## 사용자가 답한 질문 ${replied.length}`, '',
      '> 에이전트가 물은 질문에 사용자가 답했다. 답을 읽고 반영한 뒤 그 질문에 무엇을 했는지 답하면 끝냄이 된다(MCP `answer_record`, 클라우드는 `pnpm agent:answer`).', '')
    for (const q of replied) p(`- \`${q.file}\` · ${q.id} · ${q.title} — 사용자: ${clip(q.body.split('\n')[0]!, 200)}`)
    p('')
  }

  // ---------- 분류 전 기록 (10/16) ----------
  const unsorted = unsortedRecords(wb.root)
  if (unsorted.length) {
    p(`## 분류 전 기록 ${unsorted.length}`, '',
      '> 사용자가 종류를 "자동"으로 남기고 아직 분류하지 않은 기록(분류 전에는 메모). 부탁으로 읽혀도 바로 하지 말고 사용자에게 종류를 묻는다.', '')
    for (const q of unsorted) p(`- \`${q.file}\` · ${q.id} · ${q.title} — ${clip(q.body.split('\n')[0]!, 200)}`)
    p('')
  }

  // ---------- 검토 대기 ----------
  const reviewDocs = listReviews(repo, src)
  const reviews = reviewDocs.filter((r) => awaitsUserReview(r.status))
  if (reviews.length) {
    const writing = reviewDocs.filter((r) => !awaitsUserReview(r.status) && !/^(accepted|closed|superseded)$/.test(r.status)).length
    p(`## 사용자 검토 대기 문서 ${reviews.length}`, '', `> frontmatter \`status\`가 in-review인 문서. 물리·수학 검토는 사용자만 한다 — 에이전트는 acceptance를 대신하지 않는다.${writing ? ` 아직 쓰는 중인 문서(draft·in-progress 등) ${writing}개는 세지 않는다.` : ''}`, '')
    const by = new Map<string, ReviewDoc[]>()
    for (const r of reviews) by.set(r.status, [...(by.get(r.status) ?? []), r])
    for (const [st, list] of by) {
      p(`- **${st}** ${list.length}: ${list.map((r) => `\`${r.file}\``).join(', ')}`)
    }
    p('')
  }

  // ---------- research.yaml에 명시한 .tex 원고만 ----------
  const mss = allManuscripts(wb)
  const ms = mss[0] ?? null
  const partLabel = (id: string) => {
    const m = mss.find((x) => x.parts.some((y) => y.id === id))
    if (!m) return id
    const i = m.parts.findIndex((x) => x.id === id)
    const part = m.parts[i]!
    const n = m.parts.slice(0, i + 1).filter((x) => x.appendix === part.appendix).length
    return `${mss.length > 1 ? `${m.name} ` : ''}${part.appendix ? `부록 ${String.fromCharCode(64 + n)}` : `${n}장`} ${part.title}`
  }
  const declared = new Set(src.manuscripts.filter((m) => m.declared && m.path.endsWith('.tex')).map((m) => m.path))
  for (const m of mss.filter((m) => declared.has(m.main))) {
    p(`## 원고 — ${m.name} (\`${m.main}\`)`, '')
    if (m.parts.every((part) => part.file === m.main)) {
      const chapters = m.parts.filter((part) => !part.appendix).length
      const appendices = m.parts.length - chapters
      p(`장 ${chapters}${appendices ? ` · 부록 ${appendices}` : ''}`)
    } else for (const part of m.parts) p(`- ${partLabel(part.id)} — \`${part.file}${part.line ? `:${part.line}` : ''}\``)
    const last = lastCompile(wb, m.key)
    p('', last
      ? `마지막 앱 컴파일: ${last.at.slice(0, 16).replace('T', ' ')} UTC · ${last.ok ? '오류 없음' : `오류 ${last.problems.length}`} · ${(last.durationMs / 1000).toFixed(0)}초 (결과는 workbench/.build/${m.key ? `manuscript-${m.key}` : 'manuscript'}/, 공식 출력물 아님)`
      : '앱에서 아직 컴파일하지 않음 (공식 PDF는 프로젝트 자체 내보내기로 만든다)')
    for (const pr of last?.problems.slice(0, 5) ?? []) p(`  - \`${pr.file}:${pr.line}\` ${clip(pr.message, 120)}`)
    p('')
  }

  // ---------- 주제 (10/5 "주제와 노트") ----------
  const overview = topicsOverview(wb)
  if (overview.topics.length || overview.loose.notes) {
    const counts = (t: TopicStats) => t.notes
      ? (['in-progress', 'blocked', 'solved', 'stopped'] as const).filter((k) => t.byStatus[k]).map((k) => `${LABEL[k]} ${t.byStatus[k]}`).join(' · ')
      : '노트 없음'
    p(`## 주제 ${overview.topics.length}`, '', '> 노트의 주제는 노트 머리말 `topics:`에 적는다 (첫째 = 주 주제). 폴더 노트는 `note.yaml`, 블록 노트는 파일 맨 위 머리말.', '')
    for (const t of [...overview.topics].sort((a, b) => Number(b.star) - Number(a.star))) {
      const first = t.description?.split('\n')[0]?.replace(/^-\s+/, '')
      p(`- ${t.star ? '★ ' : ''}**${t.title}** (\`${t.id}\`)${t.done ? ' · 완결' : ''} — ${counts(t)}${first ? ` — ${clip(first, 120)}` : ''}`)
    }
    if (overview.loose.notes) p(`- **노트들** (주제 없음) — ${counts(overview.loose)}`)
    p('')
  }

  if (notes.length) {
    p(`## 노트 ${notes.length}`, '', '> 상태: ● 진행 · ⏸︎ 멈춤 · ✓ 해결(사용자가 확인함 — 고치기 전에 허락) · ■ 폐기. 상태는 `note.yaml`의 `state:`(paused · stopped · done, 진행이면 키를 두지 않는다)에 적는다.', '')
    const order = ['in-progress', 'blocked', 'solved', 'stopped']
    for (const n of [...notes].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))) {
      const target = noteRecordTarget(n)
      const manuscript = mss.find((m) => m.main === n.file)
      const last = manuscript ? lastCompile(wb, manuscript.key) : null
      const problems = last && !last.ok ? last.problems : []
      p(`- ${GLYPH[n.status]} **${n.title}** — ${LABEL[n.status]} · \`${n.file}\`${target ? ` · 기록 \`${target}\`` : ''}${n.topics.length ? ` · 주제 ${n.topics.join(', ')}` : ''}${n.kind ? ` · ${n.kind}` : ''}${problems.length ? ` · 컴파일 오류 ${problems.length}` : ''}`)
      for (const pr of problems.slice(0, 3)) p(`  - \`${pr.file}:${pr.line}\` ${clip(pr.message, 120)}`)
      if (n.description) p(`  - ${clip(n.description.split('\n')[0]!.replace(/^-\s+/, ''), 160)}`)
      if (n.status === 'blocked' || n.status === 'stopped') p(`  - 다시 시작할 조건: ${n.resume ?? '—'} · 정본: \`${path.posix.join(path.posix.dirname(n.file), 'note.yaml')}\``)
    }
    p('')
  }

  // ---------- 유도 ----------
  if (blocks.length) p(`## 블록 노트 ${blocks.length}${ms ? ' — 원고 밖의 열린 문제 (결론은 원고의 해당 장으로 옮긴다)' : ''}`, '')
  for (const { id, depth } of tree.order) {
    const b = byId.get(id)!.meta
    const s = b.status ?? 'in-progress'
    const proves = statements.filter((x) => x.proofs.includes(id)).map((x) => x.label ?? x.id)
    p(`${'  '.repeat(depth)}- ${GLYPH[s] ?? '●'} **${b.title ?? id}** — ${LABEL[s] ?? s}${proves.length ? ` · 증명: ${proves.join(', ')}` : ''} · \`workbench/blocks/${id}.${byId.get(id)!.format}\``)
    if (b.next) p(`${'  '.repeat(depth)}  - 다음: ${b.next}`)
    if (s === 'blocked') p(`${'  '.repeat(depth)}  - 멈춘 이유: ${b.blockedReason ?? '—'} / 다시 시작할 조건: ${b.resumeCondition ?? '—'}`)
    const content = byId.get(id)!.content
    const grounds = mss.length ? groundsOf(content, mss.flatMap((m) => m.parts)) : []
    if (grounds.length) p(`${'  '.repeat(depth)}  - 원고: ${grounds.map(partLabel).join(' · ')}`)
    else {
      const ref = /^(?:%\s*(?:근거|grounds)|grounds):\s*(.+)$/m.exec(content)?.[1]
      if (ref) p(`${'  '.repeat(depth)}  - 근거: ${ref}`)
    }
  }
  p('')

  // ---------- 진술 ----------
  if (statements.length) {
    const given = (k: string) => k === 'axiom' || k === 'definition'
    const status = (x: (typeof statements)[number]) => {
      if (given(x.kind)) return 'given'
      const ps = x.proofs.map((id) => byId.get(id)?.meta.status ?? 'in-progress')
      return ps.includes('solved') ? 'solved' : ps.length ? 'working' : 'none'
    }
    const count = (k: string) => statements.filter((x) => status(x) === k).length
    p(`## 진술 ${statements.length}`, '', `공리·정의 ${count('given')} · 증명됨 ${count('solved')} · 증명 작업 중 ${count('working')} · 증명 작업 없음 ${count('none')}`, '')
    for (const x of statements.filter((y) => status(y) === 'working')) p(`- 작업 중: ${x.label ?? x.id} ${x.title ?? ''} ← 블록 노트 ${x.proofs.join(', ')}`)
    p('')
  }

  // ---------- 자료 ----------
  const mats = listMaterials(wb.root, src)
  if (mats.bib.length || mats.files.length) {
    p('## 자료', '')
    if (mats.bib.length) p(`- 논문 ${mats.bib.length}편 (${[...new Set(mats.bib.map((b) => b.source))].map((s) => `\`${s}\``).join(', ')}), PDF 있음 ${mats.bib.filter((b) => b.file).length}`)
    const loose = mats.files.filter((f) => !f.bibKey)
    if (loose.length) p(`- 파일 ${loose.length}: ${loose.slice(0, 12).map((f) => `\`${f.name}\``).join(', ')}${loose.length > 12 ? ' …' : ''}`)
    p('')
  }

  // ---------- 최근 기록 ----------
  const since = localDate(new Date(now.getTime() - 7 * 86_400_000))
  // 끝낸 할 일은 '완료' 기록으로 따로 남으므로 할 일 줄 자체는 빼고 본다
  const recent = journal.filter((e) => e.date >= since && e.kind !== 'todo')
  p('## 최근 7일 기록', '')
  if (!recent.length) p('(없음)')
  for (const e of recent) p(`- ${e.date} ${e.time} · ${e.kind === 'done' ? '끝냄' : e.kind === 'status' ? '상태' : e.kind === 'memo' ? '메모' : e.kind} · ${e.target === RESEARCH_TARGET ? '' : `${byId.get(e.target)?.meta.title ?? e.target}: `}${clip(e.text.split('\n')[0]!, 160)}`)
  p('')
  return out.join('\n')
}

/** workbench/STATUS.md를 다시 쓴다. 내용이 같으면 쓰지 않는다 (파일 감시·git에 불필요한 변경을 만들지 않게) */
export async function writeStatus(wb: Workbench, now = new Date(), edits?: EditList, common?: RuleFile | null): Promise<{ written: boolean; file: string }> {
  const file = path.join(wb.root, STATUS_FILE)
  const body = await generateStatus(wb, now, edits, common)
  // 첫 안내 줄의 시각만 다르면 같은 내용이다
  const strip = (s: string) => s.split('\n').filter((l) => !l.startsWith(STATUS_HEAD)).join('\n')
  if (fs.existsSync(file) && strip(fs.readFileSync(file, 'utf8')) === strip(body)) return { written: false, file }
  writeAtomic(file, body)
  return { written: true, file }
}

type StatusRegistry = Pick<Registry, 'get' | 'configDir' | 'libraryPath'>

/** 앱의 STATUS: 고침 기록과 공통 규칙을 늘 같이 넣는다 (미리보기 · 쓰기 · 파일 감시 · 받기 뒤가 같은 내용이 되게) */
export function statusFor(registry: StatusRegistry, rid: string, now = new Date()): Promise<string> {
  const wb = registry.get(rid)
  return generateStatus(wb, now, readStatusEdits(wb, registry.configDir, rid, registry.libraryPath), commonRules(registry.configDir))
}

/** STATUS.md 쓰기. agent-status를 켜지 않은 프로젝트는 쓰지 않고 null */
export async function writeStatusFor(registry: StatusRegistry, rid: string, now = new Date()): Promise<{ written: boolean; file: string } | null> {
  const wb = registry.get(rid)
  if (!wb.readResearch().agentStatus) return null
  return writeStatus(wb, now, readStatusEdits(wb, registry.configDir, rid, registry.libraryPath), commonRules(registry.configDir))
}

/** 노트가 놓인 폴더 모양: 주제 폴더 안 노트는 주제 폴더, 나머지는 notes/·calc/ */
function noteDirs(notes: { file: string }[]): string[] {
  const dirs = new Set<string>()
  for (const n of notes) {
    if (n.file.startsWith('workbench/topics/')) dirs.add('workbench/topics/<주제>/<폴더>/')
    else if (n.file.startsWith('workbench/notes/')) dirs.add('workbench/notes/<폴더>/')
    else if (n.file.startsWith('workbench/calc/')) dirs.add('workbench/calc/<폴더>/')
  }
  return [...dirs]
}

// ---------- 에이전트용 짧은 요약 (10/15 "에이전트가 읽는 양 줄이기") ----------
// STATUS 전부는 11–18KB라 일 하나에도 수천 토큰을 쓴다. 요약은 머리 · 목표 · 지금 할 것(짧은 절)만 싣고,
// 나머지 절은 이름과 크기만 적어 필요할 때 그 절만 받게 한다(MCP project_status section, pnpm agent:status --section).

/** 요약에 그대로 싣는 절: 지금 누가 무엇을 해야 하는지. 이보다 긴 절은 이름만 남긴다 */
const ACTIONABLE = ['프로젝트 규칙', '작업 파일 오류', '할 일', '맡긴 일', '흐름 지금', '흐름 요약', '에이전트 수정 검토 대기', '대기 중인 질문', '대기 중인 지시', '사용자가 답한 질문', '분류 전 기록', '사용자 검토 대기 문서']
const INLINE_MAX = 1500

interface StatusPart { name: string; heading: string; text: string }

/** '## 노트 15' → '노트', '## 원고 — 이름 (`main.tex`)' → '원고 — 이름', '## 블록 노트 3 — …' → '블록 노트' */
export function sectionName(heading: string): string {
  const h = heading.replace(/^##\s+/, '').trim()
  if (h.startsWith('원고 — ')) return h.replace(/\s*\(`[^`]*`\)\s*$/, '')
  return h.split(' — ')[0]!.replace(/\s+\d+$/, '').trim()
}

function splitStatus(markdown: string): { head: string; parts: StatusPart[] } {
  const chunks = markdown.split(/^(?=## )/m)
  const head = chunks[0]!.startsWith('## ') ? '' : chunks.shift()!
  return { head, parts: chunks.map((c) => { const heading = c.split('\n', 1)[0]!; return { name: sectionName(heading), heading, text: c } }) }
}

const kb = (s: string) => `${(Buffer.byteLength(s) / 1024).toFixed(1)}KB`

/**
 * STATUS의 짧은 요약. how는 절 하나를 받는 방법을 적는 한 줄 (CLI와 MCP가 다르다).
 * 지금 할 것 절은 짧으면 그대로, 길면 이름만. 나머지 절은 이름 · 크기 목록.
 */
export function statusSummary(markdown: string, how: string): string {
  const { head, parts } = splitStatus(markdown)
  const inline = parts.filter((p) => ACTIONABLE.includes(p.name) && p.text.length <= INLINE_MAX)
  const rest = parts.filter((p) => !inline.includes(p))
  const out = [head.trimEnd(), '', ...inline.map((p) => p.text.trimEnd() + '\n')]
  if (rest.length) {
    out.push('## 다른 절 (필요할 때만 읽는다)', '', `> ${how}`, '')
    for (const p of rest) out.push(`- ${p.heading.replace(/^##\s+/, '')} · ${kb(p.text)}${p.name === '공통 규칙' ? ' — 이 세션에서 아직 읽지 않았으면 일하기 전에 읽는다' : ''}`)
    out.push('')
  }
  return out.join('\n')
}

/** 절 하나 (이름은 sectionName과 같게, 앞부분만 맞아도 된다). 없으면 null */
export function statusPart(markdown: string, name: string): string | null {
  const { parts } = splitStatus(markdown)
  const want = name.replace(/^##\s+/, '').trim()
  const hit = parts.find((p) => p.name === want) ?? parts.find((p) => p.name.startsWith(want) || p.heading.includes(want))
  return hit ? hit.text : null
}

export const statusPartNames = (markdown: string): string[] => splitStatus(markdown).parts.map((p) => p.name)
