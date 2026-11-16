// 내 문단에 대한 에이전트 고침은 제안으로 (11/8 15:16 논의 → 11/16 「시안은 다 추천대로」, 시안 N7ik 2절 ②).
// git blame으로 문단마다 마지막에 쓴 사람이 사람인지 에이전트인지 본다(#419부터 에이전트 저장은 에이전트 이름으로 커밋).
// 사람이 쓴 문단을 고치는 에이전트 고침은 파일에 쓰지 않고 제안으로 둔다: 본문에 줄 그은 글 · 새 글로 겹쳐 보이고, 「받기」를 눌러야 파일에 쓴다.
// 에이전트가 쓴 문단과 새 문단은 지금처럼 바로 고치고 수정 검토에서 승인한다. 받은 제안은 내 이름으로, 에이전트는 Co-Authored-By로 커밋한다
// (내 이름만 남기면 에이전트 문장이 사람 문단으로 보여 다음 에이전트 고침이 막힌다).
import fs from 'node:fs'
import type { EditTarget } from '@rw/core/contract/agentEdits'
import { diffBlocks, joinBlocks, readTarget, sectionAt, splitBlocks, writeTarget, type AgentEditStore, type TargetIo } from './agentEdits.js'
import { t } from './i18n.js'
import { WorkbenchError } from './workbench.js'
import { coAuthors, isAgent } from './fileHistory.js'
import { git } from './git.js'
import { locate } from './pathsync.js'
import path from 'node:path'

/** 제안 하나: 사람이 쓴 문단(before)을 에이전트가 바꾸려는 글(after). after가 ''면 지우자는 제안 */
export interface Suggestion {
  id: string
  key: string
  target: EditTarget
  /** 노트 제목 (쓸 때) */
  title: string
  before: string
  after: string
  section?: string
  reason?: string
  by?: string
  at: string
}

/**
 * 사람이 마지막에 쓴 문단(trim한 글). 파일이 git 밖이거나 기록이 없으면 null(지금처럼 모두 바로 고친다).
 * 커밋하지 않은 줄은 사람의 것으로 본다. 에이전트가 작성자이거나 Co-Authored-By에 에이전트가 있는 커밋은 에이전트의 것
 */
export async function humanBlocks(abs: string): Promise<Set<string> | null> {
  if (!abs || !path.isAbsolute(abs) || !fs.existsSync(abs)) return null
  let top: string, rel: string
  try { const at = await locate(path.dirname(abs)); top = at.top; rel = at.rel ? `${at.rel}/${path.basename(abs)}` : path.basename(abs) } catch { return null }
  const out = await git(top, ['blame', '--line-porcelain', '--', rel]).catch(() => '')
  if (!out) return null
  // 줄마다 커밋. 커밋마다 사람인지 (작성자 + 본문의 Co-Authored-By)
  const lineCommit: string[] = []
  const author = new Map<string, { name: string; mail: string }>()
  let cur = ''
  for (const l of out.split('\n')) {
    const head = l.match(/^([0-9a-f]{40}) \d+ \d+/)
    if (head) { cur = head[1]!; continue }
    if (l.startsWith('author ')) author.set(cur, { name: l.slice(7), mail: author.get(cur)?.mail ?? '' })
    else if (l.startsWith('author-mail ')) author.set(cur, { name: author.get(cur)?.name ?? '', mail: l.slice(12).replace(/^<|>$/g, '') })
    else if (l.startsWith('\t')) lineCommit.push(cur)
  }
  const commits = [...new Set(lineCommit)].filter((h) => !/^0+$/.test(h))
  if (!commits.length) return null
  const bodies = new Map<string, string>()
  const log = await git(top, ['show', '-s', '--format=%x1e%H%x09%b', ...commits]).catch(() => '')
  for (const chunk of log.split('\u001e')) { const [h, ...b] = chunk.split('\t'); if (h?.trim()) bodies.set(h.trim(), b.join('\t')) }
  const human = new Map<string, boolean>()
  const isHuman = (h: string) => {
    if (/^0+$/.test(h)) return true
    if (!human.has(h)) {
      const a = author.get(h)
      const agent = (a && isAgent(a.name, a.mail)) || coAuthors(bodies.get(h) ?? '').some((c) => isAgent(c.name, c.email))
      human.set(h, !agent)
    }
    return human.get(h)!
  }
  // 문단마다 그 줄들 가운데 사람이 쓴 줄이 있으면 사람 문단
  const text = fs.readFileSync(abs, 'utf8')
  const mine = new Set<string>()
  let line = 0
  for (const b of splitBlocks(text)) {
    const n = (b.match(/\n/g) ?? []).length + (b.endsWith('\n') ? 0 : 1)
    const lines = b.split('\n')
    if (b.trim() && lineCommit.slice(line, line + n).some((h, k) => lines[k]?.trim() && isHuman(h))) mine.add(b.trim())
    line += n
  }
  return mine
}

/**
 * 에이전트가 쓰려는 글(next)에서 사람 문단을 바꾸는 곳은 빼고(지금 글 그대로), 그 곳들을 제안으로 돌려준다.
 * 새 문단(기준판 쪽이 빈 곳)과 에이전트 문단은 그대로 쓴다
 */
export function holdHumanEdits(text: string, next: string, mine: Set<string>): { applied: string; held: { before: string; after: string; section?: string }[] } {
  const base = splitBlocks(text), cur = splitBlocks(next)
  const hunks = diffBlocks(base, cur)
  const held = hunks.filter((h) => base.slice(h.b0, h.b1).some((b) => mine.has(b.trim())))
  if (!held.length) return { applied: next, held: [] }
  const out = [...cur]
  // 뒤에서부터 지금 글로 되돌려 앞 자리가 밀리지 않게
  for (const h of [...held].sort((a, b) => b.c0 - a.c0)) out.splice(h.c0, h.c1 - h.c0, ...base.slice(h.b0, h.b1))
  return {
    applied: joinBlocks(out),
    held: held.map((h) => { const section = sectionAt(base.slice(0, h.b0).join('')); return { before: h.base, after: h.current, ...(section && { section }) } }),
  }
}

/** 제안을 받는다: 지금 글에서 before를 꼭 한 곳 찾아 after로 바꾼 글. 못 찾으면(그사이 고침) null */
export function takeInto(text: string, s: Pick<Suggestion, 'before' | 'after'>): string | null {
  const at = text.indexOf(s.before)
  if (at < 0 || text.indexOf(s.before, at + 1) >= 0) return null
  if (s.after) return text.slice(0, at) + s.after + text.slice(at + s.before.length)
  // 지우는 제안: 뒤따르는 빈 줄도 함께
  const end = at + s.before.length
  const tail = text.slice(end).match(/^\n*/)![0]
  return text.slice(0, at) + text.slice(end + Math.min(tail.length, 2))
}

/** 제안 목록. scope = 프로젝트 id(그 프로젝트 노트) · key(노트 하나). 오래된 것이 위 */
export function listSuggestions(store: AgentEditStore, scope?: string): Suggestion[] {
  const all = store.read(true).suggestions ?? []
  const inScope = (s: Suggestion) => !scope || s.key === scope || (s.target.kind === 'note' && s.target.rid === scope)
  return all.filter(inScope).sort((a, b) => a.at.localeCompare(b.at))
}

/**
 * 제안 하나를 받거나 버린다. 받기: 지금 파일에서 before를 찾아 after로 바꿔 쓴다(그사이 그 문단을 고쳐 못 찾으면 409, 제안은 남는다).
 * 버리기: 기록만 지운다. 받았으면 새 hash
 */
export function decideSuggestion(io: TargetIo, store: AgentEditStore, id: string, take: boolean): { suggestion: Suggestion; hash?: string } {
  const s = (store.read().suggestions ?? []).find((x) => x.id === id)
  if (!s) throw new WorkbenchError(404, t('그 제안이 없습니다. 다시 열어 주세요', 'That suggestion is gone. Open it again'))
  let hash: string | undefined
  if (take) {
    const st = readTarget(io, s.target)
    const next = takeInto(st.text, s)
    if (next === null) throw new WorkbenchError(409, t('그사이 그 문단이 바뀌어 받지 못했습니다. 버리고 다시 고쳐 달라고 해 주세요', 'Not taken: that paragraph changed in the meantime. Discard it and ask again'))
    hash = writeTarget(io, s.target, next, st.hash)
  }
  store.update((d) => { d.suggestions = (d.suggestions ?? []).filter((x) => x.id !== id) })
  return { suggestion: s, ...(hash && { hash }) }
}
