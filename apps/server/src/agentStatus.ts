import fs from 'node:fs'
import path from 'node:path'
import { buildTree, isValidBlockId, RESEARCH_TARGET, todoDue, type JournalEntry, frontMatter } from '@rw/core'
import YAML from 'yaml'
import type { EditList } from '@rw/core/contract/agentEdits'
import { AgentEditStore, listEdits } from './agentEdits.js'
import { isLatexSafePath, localDate, writeAtomic } from './fsutil.js'
import { appPath, homeShort } from './agentPaths.js'
import { allManuscripts, groundsOf, lastCompile } from './manuscript.js'
import { listMaterials } from './materials.js'
import { listStatements } from './statements.js'
import { listNotes, noteRecordTarget, topicsOverview, type TopicStats } from './noteList.js'
import { pendingQuestions } from './comments.js'
import { RULES_DOC, statusSection } from './tasks.js'
import type { ProjectSources, Workbench } from './workbench.js'
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
  for (let i = 0; i + 1 < lines.length; i++) {
    if (lines[i]!.trim().startsWith('|') && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1]!)) {
      const columns = cells(lines[i]!)
      const rows: string[][] = []
      for (let j = i + 2; j < lines.length && lines[j]!.trim().startsWith('|'); j++) rows.push(cells(lines[j]!))
      return { file: sources.tasks, columns, rows }
    }
  }
  return { file: sources.tasks, columns: [], rows: [] }
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
  for (const d of sources.reviews) { const abs = path.join(repo, d); if (fs.statSync(abs).isDirectory()) walk(abs) }
  return out.sort((a, b) => a.file.localeCompare(b.file))
}

export const STATUS_FILE = 'STATUS.md'
/** STATUS.md 첫 안내 줄의 앞부분 (뒤에 쓴 시각이 붙는다). 같은 내용을 다시 쓰지 않으려고 비교할 때 이 줄을 뺀다 */
const STATUS_HEAD = '> 연구 작업대 앱이 자동으로 쓰는 요약이다'
const GLYPH: Record<string, string> = { 'in-progress': '●', blocked: '⏸︎', stopped: '■', solved: '✓' }
const LABEL: Record<string, string> = { 'in-progress': '진행', blocked: '멈춤', stopped: '폐기', solved: '해결' }
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

export function generateStatus(wb: Workbench, now = new Date(), edits?: EditList): string {
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

  p(`# STATUS — ${info.title}`, '',
    `${STATUS_HEAD} (${today} ${now.toTimeString().slice(0, 5)}). **고치지 말 것** — 고칠 것은 아래 정본 파일에서.`,
    '> 이 저장소의 에이전트는 이 파일을 먼저 읽어 지금 어디까지 왔는지 파악한 뒤, 저장소 자체 규칙(AGENTS.md·CLAUDE.md)을 따른다.',
    `> 사용자가 맡긴 일(\`workbench/tasks/\`)은 공통 규칙 \`${RULES_DOC}\`을 따른다: 종결 조건을 먼저, 결과는 같은 파일에, 승인은 사용자만.`,
    `> 파일을 직접 고칠 때는 형식 문서 \`${appPath('docs/repo-format.md')}\`를 따르고, 고친 뒤 \`pnpm --dir ${appPath()} agent:check ${homeShort(repo)}\`로 검사한다.`,
    '> 사용자가 확인한 것(✓ 해결 노트, `checked` 개념노트)은 고치기 전에 대화에서 허락을 받는다. 원고(`research.yaml` `sources.manuscript`의 `.tex`)는 사용자가 요청할 때만 고치고, `locked: true` 개념노트는 고치지 않는다.',
    '> MCP 입구 `emergence-workbench`가 연결돼 있으면 노트·개념노트는 `edit_note`·`edit_concept`로 고친다(사용자가 바뀐 문단마다 검토한다).', '')
  if (info.question) p(`**목표.** ${info.question}`, '')

  p('## 정본 위치', '')
  for (const c of src.canon) p(`- \`${c.path}\`${c.note ? ` — ${c.note}` : ''}`)
  if (blocks.length) p(`- \`workbench/blocks/*.md\` (예전 것은 \`*.tex\`) — 블록 노트 ${blocks.length}개 (과정 기록: 상태·다음 할 일·멈춘 이유)`)
  if (notes.length) p(`- ${['note', 'calc'].filter((type) => notes.some((n) => n.type === type)).map((type) => `\`workbench/${type === 'note' ? 'notes' : 'calc'}/<폴더>/\``).join(' · ')} — 연구노트·계산 노트 ${notes.length}개 (본문 \`note.md\` 또는 \`main.tex\`, 정보는 \`note.yaml\`)`)
  if (statements.length) p(`- \`${statements[0]!.file.split('/')[0]}/\` — 진술 ${statements.length}개 (정의·정리; uses·proofs 관계)`)
  p('- `workbench/log/날짜.md` — 할 일과 기록', '')

  // ---------- 할 일 ----------
  const open = journal.filter((e) => e.kind === 'todo' && !e.done).reverse()
    .map((e) => ({ e, due: todoDue(e.text, e.date) }))
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
  const table = readTaskTable(repo, src)
  p('## 할 일', '')
  if (table && table.rows.length) {
    p(`### 프로젝트 작업 목록 — \`${table.file}\` (정본, 순서대로)`, '')
    const keep = table.columns.map((c, i) => [c, i] as const).filter(([c]) => !/파일|file/i.test(c))
    p(`| ${keep.map(([c]) => c).join(' | ')} |`, `|${keep.map(() => '---').join('|')}|`)
    for (const r of table.rows) p(`| ${keep.map(([, i]) => clip(plain(r[i] ?? ''), 140).replace(/\|/g, '/')).join(' | ')} |`)
    p('')
  }
  p(`### 앱 할 일 — \`workbench/log/\`${open.length ? '' : ' (없음)'}`, '')
  const todoLabel = (target: string) => {
    if (target === RESEARCH_TARGET) return ''
    if (isValidBlockId(target)) return ` (블록 노트: ${byId.get(target)?.meta.title ?? target})`
    const note = notes.find((n) => n.file === target)
    if (note || /^workbench\/(notes|calc)\/[^/]+\/(note\.md|main\.tex)$/.test(target)) return ` (노트: ${note?.title || target})`
    return ` (${target})`
  }
  for (const { e, due } of open) p(`- [ ] ${e.text.split('\n')[0]}${todoLabel(e.target)}${due ? ` — 마감 ${due}` : ''}`)
  if (open.length) p('')

  // ---------- 맡긴 일 (작업 탭) ----------
  p(...statusSection(wb))

  // ---------- 에이전트 고침 검토 대기 ----------
  const editReviews = edits?.reviews.filter((r) => r.target.kind === 'note') ?? []
  const editAttempts = edits?.attempts.filter((a) => a.target.kind === 'note') ?? []
  if (editReviews.length || editAttempts.length) {
    p(`## 에이전트 고침 검토 대기 ${editReviews.length + editAttempts.length}`, '',
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
      '> 사용자가 PDF를 읽다 남긴 질문. 답은 그 파일의 해당 질문 아래에 `### 답 · <이름> · YYYY-MM-DD HH:MM`과 답을 적고 끝에 `- 상태: 답함`을 덧붙인다. 블록·원고에 반영했으면 답에 파일과 줄을 남긴다.', '')
    for (const q of asked) {
      p(`- \`${q.file}\` · ${q.id} · ${q.title}${q.where !== '전체' ? ` ${q.where}` : ''}${q.quote ? ` — "${clip(q.quote, 120)}"` : ''}`)
      if (q.body) p(`  - ${clip(q.body.split('\n')[0]!, 200)}`)
    }
    p('')
  }

  // ---------- 검토 대기 ----------
  const reviews = listReviews(repo, src).filter((r) => r.status !== 'accepted')
  if (reviews.length) {
    p(`## 사용자 검토 대기 문서 ${reviews.length}`, '', '> frontmatter `status`가 accepted가 아닌 문서. 물리·수학 검토는 사용자만 한다 — 에이전트는 acceptance를 대신하지 않는다.', '')
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
    p(`## 주제 ${overview.topics.length}`, '', '> 노트(연구노트·계산 노트·블록 노트)의 주제는 노트 머리말 `topics:`에 적는다 (첫째 = 주 주제). 연구노트·계산 노트는 `note.yaml`, 블록 노트는 파일 맨 위 머리말.', '')
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
export function writeStatus(wb: Workbench, now = new Date(), edits?: EditList): { written: boolean; file: string } {
  const file = path.join(wb.root, STATUS_FILE)
  const body = generateStatus(wb, now, edits)
  // 첫 안내 줄의 시각만 다르면 같은 내용이다
  const strip = (s: string) => s.split('\n').filter((l) => !l.startsWith(STATUS_HEAD)).join('\n')
  if (fs.existsSync(file) && strip(fs.readFileSync(file, 'utf8')) === strip(body)) return { written: false, file }
  writeAtomic(file, body)
  return { written: true, file }
}
