// 에이전트 고침과 검토 (2026-10-08 사용자 결정, requirements "에이전트 고침 검토"):
// - 작업 중인 노트: 에이전트가 바로 고친다. 고치기 전 글을 기준판으로 앱 설정 폴더에 두고(연구 저장소·git에 쓰지 않음),
//   사용자가 기준판과 지금 글을 문단 단위로 비교해 바뀐 곳마다 승인 · 되돌리기 · 직접 고치기를 고른다.
// - 확인된 노트(개념노트 확인함, 노트 상태 해결): 첫 쓰기를 거절하고 시도를 사용자 차례로 남긴다.
//   에이전트는 대화에서 허락을 받은 뒤 approved로 다시 보낸다.
// - 원고와 잠긴 개념노트는 고치지 않는다.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { readConceptMd, writeConceptBody } from './conceptNotes.js'
import { hashOf, writeAtomic } from './fsutil.js'
import { t } from './i18n.js'
import { listNotes } from './noteList.js'
import { WorkbenchError, type Workbench } from './workbench.js'

export type EditTarget = { kind: 'concept'; id: string } | { kind: 'note'; rid: string; file: string }

/** 검토를 기다리는 노트 하나: 기준판(사용자가 마지막으로 본 글)과 그 뒤의 에이전트 고침 */
export interface PendingEdit {
  key: string
  target: EditTarget
  title: string
  /** 기준판: 개념노트는 머리말을 뺀 본문, 노트는 파일 전체 */
  base: string
  /** 에이전트가 마지막으로 쓴(또는 검토로 쓴) 뒤의 글. 지금 글이 이와 다르면 그 차이는 사용자가 고친 것이다 */
  after?: string
  /** 에이전트가 고친 문단을 사용자가 다시 고친 조각(trim한 글). 이 조각이 든 곳은 되돌리지 않는다 */
  yours?: string[]
  /** 첫 고침 · 마지막 고침 시각 (ISO) */
  since: string
  updated: string
  /** 처음 고친 에이전트 (예전 기록) */
  agent?: string
  /** 고친 에이전트들, 처음 고친 순서 */
  agents?: string[]
  /** 에이전트가 고칠 때 남긴 한 줄들 (최근 것이 뒤) */
  notes: string[]
}

/** 확인된 노트에 대한 쓰기 시도 (사용자 차례) */
export interface EditAttempt {
  key: string
  target: EditTarget
  title: string
  at: string
  agent?: string
  summary?: string
}

interface StoreData { pending: PendingEdit[]; attempts: EditAttempt[] }

export const targetKey = (t: EditTarget): string => (t.kind === 'concept' ? `concept:${t.id}` : `note:${t.rid}:${t.file}`)

/** 설정 폴더의 agent-edits.json 하나 (라이브러리 경로마다 따로 두지 않는다: 개념노트 key는 id만) */
export class AgentEditStore {
  constructor(private readonly file: string) {}
  static fileFor(configDir: string, lib: string | undefined): string {
    // 라이브러리를 바꾸면 개념노트 기준판이 섞이지 않게 라이브러리 경로마다 파일 하나
    const h = crypto.createHash('sha1').update(path.resolve(lib ?? '-')).digest('hex').slice(0, 12)
    return path.join(configDir, 'agent-edits', `edits-${h}.json`)
  }
  read(): StoreData {
    try {
      const v = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<StoreData>
      return { pending: Array.isArray(v.pending) ? v.pending : [], attempts: Array.isArray(v.attempts) ? v.attempts : [] }
    } catch { return { pending: [], attempts: [] } }
  }
  private write(d: StoreData): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    writeAtomic(this.file, `${JSON.stringify(d, null, 1)}\n`)
  }
  update(fn: (d: StoreData) => void): StoreData {
    const d = this.read()
    fn(d)
    this.write(d)
    return d
  }
  pending(key: string): PendingEdit | undefined { return this.read().pending.find((p) => p.key === key) }
}

// ── 문단 나누기와 비교 ─────────────────────────────────────────────

/**
 * 글을 문단 조각으로 나눈다. 조각을 이어 붙이면 원래 글과 바이트까지 같다 (조각은 뒤따르는 빈 줄을 갖는다).
 * 빈 줄이 문단을 나누지만 머리말(---), 코드 블록(```), 표시 수식($$ … $$), 빈 줄로 띄운 목록은 한 조각이다.
 */
export function splitBlocks(text: string): string[] {
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? []
  const out: string[] = []
  let cur = ''
  let fence = false
  let math = false
  let front = false
  let list = false
  let env = 0
  let blankRun = false
  const isBlank = (l: string) => !l.trim()
  const isListLine = (l: string) => /^\s*(?:[-*+]|\d+[.)])\s/.test(l) || /^\s{2,}\S/.test(l)
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!
    if (i === 0 && l.replace(/\r?\n$/, '') === '---') front = true
    else if (front && /^---\s*$/.test(l.replace(/\r?\n$/, ''))) { cur += l; front = false; continue }
    if (front) { cur += l; continue }
    if (blankRun && !isBlank(l)) {
      // 빈 줄 뒤 새 문단: 목록이 이어지면 같은 조각
      if (!(list && isListLine(l))) { out.push(cur); cur = ''; list = false }
      blankRun = false
    }
    if (!cur.trim() && !isBlank(l)) list = isListLine(l)
    cur += l
    if (/^\s*(```|~~~)/.test(l)) fence = !fence
    else if (!fence) {
      const n = (l.match(/\$\$/g) ?? []).length
      if (n % 2 === 1) math = !math
      // LaTeX 환경 (\begin{…} … \end{…}) 안의 빈 줄도 나누지 않는다. document는 글 전체라 세지 않는다
      const code = l.replace(/(^|[^\\])%.*$/, '$1')
      env += (code.match(/\\begin\{(?!document\})/g) ?? []).length - (code.match(/\\end\{(?!document\})/g) ?? []).length
      if (env < 0) env = 0
    }
    if (isBlank(l) && !fence && !math && !env && cur.trim()) blankRun = true
  }
  if (cur) out.push(cur)
  return out
}

/** 조각을 비교하는 열쇠 (뒤 빈 줄 차이는 무시) */
const keyOf = (b: string) => b.trim()

export interface Hunk {
  /** 기준판 조각 [b0, b1)과 지금 조각 [c0, c1) */
  id: string
  b0: number; b1: number; c0: number; c1: number
  base: string
  current: string
}

/** 기준판과 지금 글의 다른 곳 (가장 긴 공통 부분열로 맞춘 뒤 맞지 않는 연속 구간) */
export function diffBlocks(base: string[], cur: string[]): Hunk[] {
  const a = base.map(keyOf), b = cur.map(keyOf)
  const n = a.length, m = b.length
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i]![j] = a[i] === b[j] ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!)
  const hunks: Hunk[] = []
  let i = 0, j = 0
  let start: [number, number] | null = null
  const close = () => {
    if (!start) return
    const [b0, c0] = start
    hunks.push({ id: `${b0}:${i}:${c0}:${j}`, b0, b1: i, c0, c1: j, base: base.slice(b0, i).join('').trim(), current: cur.slice(c0, j).join('').trim() })
    start = null
  }
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { close(); i++; j++; continue }
    start ??= [i, j]
    if (j >= m || (i < n && L[i + 1]![j]! >= L[i]![j + 1]!)) i++
    else j++
  }
  close()
  return hunks
}

/** 조각을 다시 이어 붙인다. 가운데 조각이 빈 줄로 끝나지 않으면(옮겨 온 마지막 조각 등) 빈 줄을 채운다 */
export function joinBlocks(blocks: string[]): string {
  return blocks.map((b, k) => (k < blocks.length - 1 && !/\n\s*\n$/.test(b) ? b.replace(/\n?$/, '\n\n') : b)).join('')
}

// ── 대상 읽기와 쓰기 ────────────────────────────────────────────────

export interface TargetState {
  title: string
  /** 비교하는 글 (개념노트 본문, 노트 파일 전체) */
  text: string
  /** 파일 hash (다른 쓰기와 같은 baseHash) */
  hash: string
  confirmed: boolean
}

export interface TargetIo {
  lib: string | undefined
  wbOf(rid: string): Workbench
}

export function readTarget(io: TargetIo, t0: EditTarget): TargetState {
  if (t0.kind === 'concept') {
    const c = readConceptMd(io.lib, t0.id)
    if (c.meta.locked) throw new WorkbenchError(423, t('잠긴 개념노트는 고치지 않음', 'Locked concept notes are not changed'))
    return { title: c.meta.title || t0.id, text: c.body, hash: c.hash, confirmed: c.checked === 'ok' }
  }
  const row = noteRow(io, t0)
  const wb = io.wbOf(t0.rid)
  const { content, hash } = row.type === 'block' ? wb.readBlock(row.id) : readNoteFile(wb, row.file)
  return { title: row.title || row.file, text: content, hash, confirmed: row.status === 'solved' }
}

// 연구노트 · 계산 노트 본문 파일 (file은 노트 목록이 준 저장소 기준 경로)
const noteAbs = (wb: Workbench, file: string) => path.join(path.dirname(wb.root), file)
function readNoteFile(wb: Workbench, file: string): { content: string; hash: string } {
  const content = fs.readFileSync(noteAbs(wb, file), 'utf8')
  return { content, hash: hashOf(content) }
}

function noteRow(io: TargetIo, t0: Extract<EditTarget, { kind: 'note' }>) {
  const row = listNotes(io.wbOf(t0.rid), true).find((r) => r.file === t0.file)
  if (!row) throw new WorkbenchError(404, t(`노트가 아님: ${t0.file} (원고 · 노트가 아닌 파일은 고치지 않음)`, `Not a note: ${t0.file} (manuscripts and other files are not changed)`))
  return row
}

/** 쓰고 새 hash를 돌려준다. baseHash가 지금 파일과 다르면 409 */
export function writeTarget(io: TargetIo, t0: EditTarget, text: string, baseHash: string): string {
  if (t0.kind === 'concept') return writeConceptBody(io.lib, t0.id, text, baseHash).hash
  const row = noteRow(io, t0)
  const wb = io.wbOf(t0.rid)
  const conflict = () => new WorkbenchError(409, t('다른 곳에서 파일이 바뀌어 쓰지 않았음. 다시 읽어 주세요', 'Not written: the file was changed elsewhere. Read it again'))
  if (row.type === 'block') {
    const r = wb.writeBlock(row.id, text, baseHash)
    if (!r.ok) throw conflict()
    return r.hash
  }
  if (readNoteFile(wb, row.file).hash !== baseHash) throw conflict()
  writeAtomic(noteAbs(wb, row.file), text)
  return hashOf(text)
}

// ── 에이전트 쓰기 ──────────────────────────────────────────────────

export interface WriteRequest {
  target: EditTarget
  baseHash: string
  /** 차례대로 적용하는 바꾸기. old는 지금 글에 꼭 한 번 있어야 한다 */
  edits: { old: string; new: string }[]
  /** 확인된 노트: 대화에서 사용자 허락을 받았으면 true */
  approved?: boolean
  agent?: string
  summary?: string
}

export type WriteResult =
  | { ok: true; hash: string; changes: number }
  | { ok: false; status: 428; error: string }

export function applyEdits(text: string, edits: WriteRequest['edits']): string {
  let out = text
  edits.forEach((e, k) => {
    if (typeof e?.old !== 'string' || typeof e?.new !== 'string' || !e.old) throw new WorkbenchError(400, t(`edits[${k}]: old와 new가 필요함`, `edits[${k}]: old and new are required`))
    const at = out.indexOf(e.old)
    if (at < 0) throw new WorkbenchError(400, t(`edits[${k}]: 바꿀 글이 지금 글에 없음`, `edits[${k}]: old text is not in the current text`))
    if (out.indexOf(e.old, at + 1) >= 0) throw new WorkbenchError(400, t(`edits[${k}]: 바꿀 글이 여러 곳에 있음. 앞뒤 글을 더 넣어 한 곳만 가리키세요`, `edits[${k}]: old text appears more than once. Include more surrounding text`))
    out = out.slice(0, at) + e.new + out.slice(at + e.old.length)
  })
  return out
}

/** 이 노트를 고친 에이전트들 (예전 기록의 agent 하나도 읽는다) */
export const agentsOf = (p: PendingEdit): string[] => p.agents ?? (p.agent ? [p.agent] : [])

export function agentWrite(io: TargetIo, store: AgentEditStore, req: WriteRequest): WriteResult {
  const key = targetKey(req.target)
  const st = readTarget(io, req.target)
  if (st.hash !== req.baseHash) throw new WorkbenchError(409, t('다른 곳에서 파일이 바뀌어 쓰지 않았음. 다시 읽어 주세요', 'Not written: the file was changed elsewhere. Read it again'))
  if (!Array.isArray(req.edits) || !req.edits.length) throw new WorkbenchError(400, t('edits가 필요함', 'edits are required'))
  const next = applyEdits(st.text, req.edits)
  const now = new Date().toISOString()
  if (st.confirmed && !req.approved) {
    store.update((d) => {
      d.attempts = d.attempts.filter((a) => a.key !== key)
      d.attempts.push({ key, target: req.target, title: st.title, at: now, ...(req.agent && { agent: req.agent }), ...(req.summary && { summary: req.summary }) })
    })
    return { ok: false, status: 428, error: t('사용자가 확인한 노트입니다. 대화에서 사용자에게 고쳐도 되는지 묻고, 허락을 받은 뒤 approved: true로 다시 보내세요. 앱은 이 시도를 사용자 차례로 보였습니다.',
      'The user has reviewed this note. Ask the user in the conversation whether you may change it, and only after they agree send again with approved: true. The app has shown this attempt to the user.') }
  }
  const before = syncPending(store, key, st.text)
  if (next === st.text) return { ok: true, hash: st.hash, changes: before ? diffBlocks(splitBlocks(before.base), splitBlocks(st.text)).length : 0 }
  const hash = writeTarget(io, req.target, next, st.hash)
  const d = store.update((d) => {
    d.attempts = d.attempts.filter((a) => a.key !== key)
    const p = d.pending.find((x) => x.key === key)
    if (p) {
      p.updated = now
      p.title = st.title
      p.after = next
      if (req.agent) { const had = agentsOf(p); if (!had.includes(req.agent)) p.agents = [...had, req.agent] }
      if (req.summary) p.notes = [...p.notes, req.summary].slice(-20)
    } else d.pending.push({ key, target: req.target, title: st.title, base: st.text, after: next, since: now, updated: now, ...(req.agent && { agents: [req.agent] }), notes: req.summary ? [req.summary] : [] })
  })
  const p = d.pending.find((x) => x.key === key)!
  const changes = diffBlocks(splitBlocks(p.base), splitBlocks(next)).length
  if (!changes) store.update((d) => { d.pending = d.pending.filter((x) => x.key !== key) })
  return { ok: true, hash, changes }
}

// ── 사용자가 그 뒤에 고친 것 ────────────────────────────────────────

/**
 * 에이전트가 쓴 뒤 사용자가 앱 편집기 등에서 고친 것을 기준판에 옮긴다. 그래야 사용자의 고침이 에이전트 고침으로 보이지 않고,
 * 되돌리기가 사용자의 글을 지우지 않는다. 에이전트가 고친 문단을 사용자가 다시 고쳤으면 기준판으로 옮기지 못하므로(어느 쪽 글인지 섞임)
 * 그 조각을 yours로 남겨 되돌리기를 막는다. 바뀐 것이 없으면 null
 */
export function carryUserEdits(p: Pick<PendingEdit, 'base' | 'after' | 'yours'>, current: string): { base: string; yours: string[] } | null {
  if (p.after === undefined || p.after === current) return null
  const base = splitBlocks(p.base), after = splitBlocks(p.after), cur = splitBlocks(current)
  const agent = diffBlocks(base, after)
  const touches = (u: Hunk, a: Hunk) => Math.max(u.b0, a.c0) < Math.min(u.b1, a.c1)
    || (u.b0 === u.b1 && a.c0 <= u.b0 && u.b0 <= a.c1) || (a.c0 === a.c1 && u.b0 <= a.c0 && a.c0 <= u.b1)
  const next = [...base]
  const yours = new Set(p.yours ?? [])
  // 뒤에서부터 바꿔 앞쪽 자리가 밀리지 않게 한다
  for (const u of diffBlocks(after, cur).reverse()) {
    if (agent.some((a) => touches(u, a))) { for (const b of cur.slice(u.c0, u.c1)) if (b.trim()) yours.add(b.trim()); continue }
    // 에이전트 고침 앞에 있는 것만큼 자리를 옮긴다 (그 고침들이 늘이거나 줄인 조각 수)
    const shift = agent.filter((a) => a.c1 <= u.b0).reduce((n, a) => n + (a.c1 - a.c0) - (a.b1 - a.b0), 0)
    next.splice(u.b0 - shift, u.b1 - u.b0, ...cur.slice(u.c0, u.c1))
  }
  return { base: joinBlocks(next), yours: [...yours] }
}

/** 지금 글에 맞춰 기준판을 옮기고 그 기록을 돌려준다 */
function syncPending(store: AgentEditStore, key: string, current: string): PendingEdit | undefined {
  const p = store.pending(key)
  if (!p) return undefined
  const carried = carryUserEdits(p, current)
  if (!carried) return p
  store.update((d) => { const x = d.pending.find((y) => y.key === key); if (x) { x.base = carried.base; x.after = current; x.yours = carried.yours } })
  return store.pending(key)
}

// ── 사용자 검토 ────────────────────────────────────────────────────

export interface ReviewView {
  key: string
  target: EditTarget
  title: string
  hash: string
  since: string
  updated: string
  agents: string[]
  notes: string[]
  hunks: Hunk[]
}

/** 검토 화면: 기준판과 지금 글의 다른 곳. 다른 곳이 없으면(바깥에서 되돌림 등) 검토를 닫고 null */
export function reviewOf(io: TargetIo, store: AgentEditStore, key: string): ReviewView | null {
  const found = store.pending(key)
  if (!found) return null
  let st: TargetState
  try { st = readTarget(io, found.target) } catch (e) {
    // 노트가 없어졌으면 검토도 닫는다
    if (e instanceof WorkbenchError && e.status === 404) { store.update((d) => { d.pending = d.pending.filter((x) => x.key !== key) }); return null }
    throw e
  }
  const p = syncPending(store, key, st.text)!
  const hunks = diffBlocks(splitBlocks(p.base), splitBlocks(st.text))
  if (!hunks.length) { store.update((d) => { d.pending = d.pending.filter((x) => x.key !== key) }); return null }
  return { key, target: p.target, title: st.title, hash: st.hash, since: p.since, updated: p.updated, agents: agentsOf(p), notes: p.notes, hunks }
}

export interface DecideRequest { key: string; hash: string; hunk: string; action: 'accept' | 'revert' | 'edit'; text?: string }

/**
 * 바뀐 곳 하나를 정한다. 승인: 기준판에 지금 글을 받아들인다(파일은 그대로). 되돌리기: 파일의 그 부분을 기준판 글로 되돌린다.
 * 직접 고치기: 파일의 그 부분을 사용자가 쓴 글로 바꾸고 그 글을 승인한다. hash가 지금 파일과 다르면 409.
 */
export function decide(io: TargetIo, store: AgentEditStore, req: DecideRequest): ReviewView | null {
  const found = store.pending(req.key)
  if (!found) throw new WorkbenchError(404, t('검토할 고침이 없음', 'Nothing to review'))
  const st = readTarget(io, found.target)
  if (st.hash !== req.hash) throw new WorkbenchError(409, t('그사이 노트가 바뀌었습니다. 다시 열어 주세요', 'The note changed in the meantime. Open it again'))
  const p = syncPending(store, req.key, st.text)!
  const base = splitBlocks(p.base), cur = splitBlocks(st.text)
  const h = diffBlocks(base, cur).find((x) => x.id === req.hunk)
  if (!h) throw new WorkbenchError(409, t('그 바뀐 곳이 더는 없습니다. 다시 열어 주세요', 'That change is no longer there. Open it again'))
  let nextBase = p.base
  let written = st.text
  if (req.action === 'accept') nextBase = joinBlocks([...base.slice(0, h.b0), ...cur.slice(h.c0, h.c1), ...base.slice(h.b1)])
  else if (req.action === 'revert') {
    const yours = new Set(p.yours ?? [])
    if (cur.slice(h.c0, h.c1).some((b) => yours.has(b.trim()))) throw new WorkbenchError(409, t('에이전트가 고친 뒤 직접 고친 글이 섞여 있어 되돌리지 않았습니다. 직접 고치기로 정해 주세요', 'Not reverted: this part also has your own edits made after the agent. Use Edit instead'))
    written = joinBlocks([...cur.slice(0, h.c0), ...base.slice(h.b0, h.b1), ...cur.slice(h.c1)])
    writeTarget(io, p.target, written, st.hash)
  } else if (req.action === 'edit') {
    if (typeof req.text !== 'string') throw new WorkbenchError(400, t('text가 필요함', 'text is required'))
    // 고친 글이 뒤 문단과 붙지 않게 끝에 빈 줄 (마지막 조각이면 joinBlocks가 그대로 둔다)
    const rep = req.text.trim() ? splitBlocks(req.text.replace(/\s*$/, h.c1 < cur.length ? '\n\n' : '\n')) : []
    written = joinBlocks([...cur.slice(0, h.c0), ...rep, ...cur.slice(h.c1)])
    writeTarget(io, p.target, written, st.hash)
    nextBase = joinBlocks([...base.slice(0, h.b0), ...rep, ...base.slice(h.b1)])
  } else throw new WorkbenchError(400, t('action은 accept · revert · edit', 'action must be accept, revert or edit'))
  store.update((d) => { const x = d.pending.find((y) => y.key === req.key); if (x) { x.base = nextBase; x.after = written } })
  return reviewOf(io, store, req.key)
}

/** 목록: 검토를 기다리는 노트(바뀐 곳 수)와 확인된 노트 쓰기 시도. rid를 주면 그 프로젝트 노트만, 'library'면 개념노트만 */
export function listEdits(io: TargetIo, store: AgentEditStore, scope?: string): { reviews: (Omit<ReviewView, 'hunks' | 'hash' | 'notes'> & { changes: number })[]; attempts: EditAttempt[] } {
  const inScope = (t0: EditTarget) => !scope || (scope === 'library' ? t0.kind === 'concept' : t0.kind === 'note' && t0.rid === scope)
  const reviews: (Omit<ReviewView, 'hunks' | 'hash' | 'notes'> & { changes: number })[] = []
  for (const p of store.read().pending.filter((x) => inScope(x.target))) {
    let v: ReviewView | null = null
    try { v = reviewOf(io, store, p.key) } catch { continue }
    if (v) reviews.push({ key: v.key, target: v.target, title: v.title, since: v.since, updated: v.updated, agents: v.agents, changes: v.hunks.length })
  }
  return { reviews: reviews.sort((a, b) => a.since.localeCompare(b.since)), attempts: store.read().attempts.filter((a) => inScope(a.target)).sort((a, b) => a.at.localeCompare(b.at)) }
}
