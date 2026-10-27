import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { frontMatter } from '@rw/core'
import type { ChangeItem, ChangeKind, ChangeAction } from '@rw/core/contract/changes'
import { machineName } from './backup.js'
import { git, GIT_TIMEOUT } from './git.js'
import type { Workbench } from './workbench.js'

/**
 * 변경사항 (10/27 사용자 결정 "변경사항"): 기준 시각 뒤 이 프로젝트에서 바뀐 것을 화면의 이름(노트 · 흐름 점 · 맡긴 일 · 기록 · 다른 파일)으로 모은다.
 * - 커밋: HEAD와 받아 둔 upstream의 기준 뒤 커밋 (다른 맥에서 올린 것도 받은 뒤에는 보인다)
 * - 이 맥에서 아직 커밋하지 않은 것: 파일 시각이 기준 뒤인 것 ("커밋 안 됨"). 다른 맥의 커밋 안 된 것은 볼 수 없다
 * 기준 시각은 보는 이마다 설정 폴더의 changes-seen.json에 둔다: 나(화면을 연 때), 에이전트(MCP changes_since를 부른 때, 계정마다)
 */
const SEEN = 'changes-seen.json'
/** 처음 보는 이의 기준: 7일 전 */
export const FIRST_LOOK_MS = 7 * 86_400_000
const MAX_COMMITS = 300

export const ME = 'me'
/** 보는 이 이름: 나 · claude-code:<계정 id> · codex */
export function viewerOf(agent: string | undefined, account: string | undefined): string {
  const a = (agent ?? '').replace(/[^\w.-]/g, '').slice(0, 40) || 'agent'
  const acc = (account ?? '').replace(/[^\w.-]/g, '').slice(0, 64)
  return acc ? `${a}:${acc}` : a
}

type SeenFile = Record<string, Record<string, string>>
function readSeen(configDir: string): SeenFile {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(configDir, SEEN), 'utf8')) as unknown
    return v && typeof v === 'object' ? v as SeenFile : {}
  } catch { return {} }
}

/** 보는 이마다 이 프로젝트를 마지막으로 본 때 */
export function seenOf(configDir: string, rid: string): Record<string, string> {
  return Object.fromEntries(Object.entries(readSeen(configDir)).flatMap(([who, m]) => typeof m?.[rid] === 'string' ? [[who, m[rid]!]] : []))
}

export function markSeen(configDir: string, rid: string, viewer: string, at = new Date()): void {
  const all = readSeen(configDir)
  all[viewer] = { ...all[viewer], [rid]: at.toISOString() }
  try { fs.writeFileSync(path.join(configDir, SEEN), `${JSON.stringify(all, null, 1)}\n`) } catch { /* 설정 폴더에 못 쓰면 기준이 그대로일 뿐 */ }
}

export const baselineOf = (seen: Record<string, string>, viewer: string, now = Date.now()): string =>
  seen[viewer] ?? new Date(now - FIRST_LOOK_MS).toISOString()

/** git이 주는 경로는 git 저장소 맨 위 기준이다. 등록한 폴더가 더 큰 저장소 안이면 그 앞부분을 뗀다 */
const strip = (file: string, prefix: string) => (prefix && file.startsWith(prefix) ? file.slice(prefix.length) : file)

interface Touch { file: string; status: string; from?: string; author: string; at: string; uncommitted: boolean }

/** 기준 뒤 커밋의 파일들 (HEAD와 upstream). 저장소가 아니거나 git이 실패하면 빈 목록 */
async function committed(repo: string, since: string, prefix: string): Promise<Touch[]> {
  const refs = ['HEAD']
  try { refs.push(await git(repo, ['rev-parse', '--abbrev-ref', '@{u}'], { timeout: GIT_TIMEOUT.read })) } catch { /* upstream 없음 */ }
  let out: string
  try {
    out = await git(repo, ['log', ...refs, `--since=${since}`, `-n${MAX_COMMITS}`, '--name-status', '-M', '--no-merges', '--format=%x1e%an%x1f%aI', '--', '.'], { timeout: GIT_TIMEOUT.read })
  } catch { return [] }
  const touches: Touch[] = []
  for (const chunk of out.split('\x1e').slice(1)) {
    const [head = '', ...lines] = chunk.split('\n')
    const [author = '', at = ''] = head.split('\x1f')
    // --since는 커밋한 때로 거르므로, 쓴 때(author date)로 한 번 더 거른다
    if (Date.parse(at) <= Date.parse(since)) continue
    for (const line of lines) {
      const [status = '', a, b] = line.split('\t')
      if (!status || !a) continue
      touches.push(status.startsWith('R') && b ? { file: strip(b, prefix), from: strip(a, prefix), status: 'R', author, at, uncommitted: false } : { file: strip(a, prefix), status: status[0]!, author, at, uncommitted: false })
    }
  }
  return touches
}

/** 이 맥에서 커밋하지 않은 것 가운데 파일 시각이 기준 뒤인 것 */
async function uncommitted(repo: string, since: string, me: string, prefix: string): Promise<Touch[]> {
  let out: string
  try { out = await git(repo, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.'], { timeout: GIT_TIMEOUT.read }) } catch { return [] }
  const parts = out.split('\0')
  const touches: Touch[] = []
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!
    if (p.length < 4) continue
    const xy = p.slice(0, 2), file = strip(p.slice(3), prefix)
    const renamed = xy.includes('R')
    const from = renamed ? strip(parts[++i] ?? '', prefix) : undefined
    const status = xy === '??' ? 'A' : xy.includes('D') ? 'D' : renamed ? 'R' : xy.includes('A') ? 'A' : 'M'
    // 지운 파일은 시각이 없어 그 폴더의 시각을 쓴다
    let ms: number
    try { ms = fs.statSync(path.join(repo, status === 'D' ? path.dirname(file) : file)).mtimeMs } catch { continue }
    if (ms <= Date.parse(since)) continue
    touches.push({ file, ...(from && { from }), status, author: me, at: new Date(ms).toISOString(), uncommitted: true })
  }
  return touches
}

/** 파일 하나가 화면의 무엇인지. wbRel = 저장소 안 workbench 폴더 (보통 workbench) */
export function classify(file: string, wbRel: string): { kind: ChangeKind; id: string } {
  const prefix = wbRel ? `${wbRel}/` : ''
  if (prefix && !file.startsWith(prefix)) return { kind: 'file', id: file }
  const p = file.slice(prefix.length).split('/')
  const [top, a, b] = p
  if (top === 'topics' && a && b && p.length >= 4) return { kind: 'note', id: b }
  if ((top === 'notes' || top === 'calc') && a && p.length >= 3) return { kind: 'note', id: a }
  if (top === 'flow' && a && p.length === 2 && /\.ya?ml$/.test(a) && !/^layout\.ya?ml$/.test(a)) return { kind: 'flow', id: a.replace(/\.ya?ml$/, '') }
  if (top === 'tasks' && a && p.length === 2 && a.endsWith('.md')) return { kind: 'task', id: a.slice(0, -3) }
  if (top === 'comments' && a) return { kind: 'record', id: p.slice(1).join('/').replace(/\.(md|ya?ml)$/, '') }
  return { kind: 'file', id: file }
}

/** 화면에 보일 이름: 노트 이름 · 흐름 점 제목 · 맡긴 일 제목. 못 읽으면 id */
function namer(wb: Workbench): { name: (kind: ChangeKind, id: string) => string; main: (id: string) => string | undefined } {
  let notes: Map<string, { name: string; main: string }> | undefined
  const noteNames = () => {
    if (notes) return notes
    notes = new Map()
    try { for (const n of wb.ownNotes()) notes.set(path.basename(path.dirname(n.path)), { name: n.name, main: n.path }) } catch { /* 이름 없이 */ }
    return notes
  }
  const read = (rel: string) => { try { return fs.readFileSync(path.join(wb.root, rel), 'utf8') } catch { return null } }
  const name = (kind: ChangeKind, id: string): string => {
    if (kind === 'note') return noteNames().get(id)?.name ?? id
    if (kind === 'flow') {
      const text = read(`flow/${id}.yaml`)
      try { const y = text ? YAML.parse(text) as { title?: unknown; short?: unknown } : null; if (typeof y?.title === 'string') return y.title } catch { /* id */ }
      return id
    }
    if (kind === 'task') {
      const fm = frontMatter(read(`tasks/${id}.md`) ?? '')
      try { const y = fm ? YAML.parse(fm.yaml) as { title?: unknown } : null; if (typeof y?.title === 'string') return y.title } catch { /* id */ }
      return id
    }
    return id
  }
  return { name, main: (id) => noteNames().get(id)?.main }
}

const actionOf = (ts: Touch[]): ChangeAction => {
  const byTime = [...ts].sort((a, b) => a.at.localeCompare(b.at))
  if (byTime.at(-1)!.status === 'D') return 'deleted'
  if (byTime[0]!.status === 'A') return 'created'
  if (byTime.some((x) => x.status === 'R')) return 'moved'
  return 'edited'
}

export interface ChangesResult { machine: string; since: string; items: ChangeItem[] }

/** 기준 뒤 변경사항. 같은 것(노트 하나 · 점 하나 …)은 한 줄로 묶고 마지막에 바뀐 순서로 */
export async function changesSince(wb: Workbench, since: string, me = machineName()): Promise<ChangesResult> {
  const repo = wb.repo
  const wbRel = path.relative(repo, wb.root).split(path.sep).join('/')
  let prefix = ''
  try { prefix = await git(repo, ['rev-parse', '--show-prefix'], { timeout: GIT_TIMEOUT.read }) } catch { /* 저장소가 아니면 아래도 빈 목록 */ }
  const touches = [...await committed(repo, since, prefix), ...await uncommitted(repo, since, me, prefix)]
  const groups = new Map<string, { kind: ChangeKind; id: string; ts: Touch[] }>()
  for (const x of touches) {
    const c = classify(x.file, wbRel)
    const key = `${c.kind}\0${c.id}`
    const g = groups.get(key) ?? { ...c, ts: [] }
    g.ts.push(x)
    groups.set(key, g)
  }
  const { name, main } = namer(wb)
  const items: ChangeItem[] = [...groups.values()].map(({ kind, id, ts }) => {
    const file = kind === 'note' ? main(id) : undefined
    const times = ts.map((x) => x.at).sort()
    const authors = [...new Set([...ts].sort((a, b) => b.at.localeCompare(a.at)).map((x) => x.author))]
    return {
      kind, id, name: name(kind, id), action: actionOf(ts),
      authors, first: times[0]!, last: times.at(-1)!,
      uncommitted: ts.some((x) => x.uncommitted),
      files: [...new Set(ts.map((x) => x.file))].slice(0, 20),
      ...(file && { main: file }),
    }
  })
  items.sort((a, b) => b.last.localeCompare(a.last))
  return { machine: me, since, items }
}
