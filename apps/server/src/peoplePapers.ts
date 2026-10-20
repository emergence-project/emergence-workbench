import fs from 'node:fs'
import path from 'node:path'
import { isAuthorOf, nameKey, type Person } from '@rw/core'
import type { NewPaper, S2Author } from '@rw/core/contract/network'
import { paperFetch } from './paperAdd.js'
import { writeAtomic } from './fsutil.js'
import { t } from './i18n.js'

/**
 * 사람 페이지의 새 논문 (10/19 결정 "사람 페이지", 시안 2026-10-19-pdf-records-people 4절).
 * Semantic Scholar 저자 ID가 있으면 그 ID로(동명이인이 섞이지 않음), 없으면 arXiv에서 이름 · 다른 이름으로 최근 90일 논문을 찾는다.
 * 결과는 앱 설정 폴더의 people-papers.json에 사람마다 두고 하루에 한 번만 다시 찾는다. 본 논문 · "이 사람 아님"도 거기에 둔다.
 */

export const NEW_PAPER_DAYS = 90
export const NEW_PAPER_EVERY_MS = 24 * 60 * 60_000

type Found = Omit<NewPaper, 'fresh' | 'inLibrary'>
interface Entry { at: number; source: 's2' | 'arxiv'; key: string; papers: Found[]; seen: string[]; hidden: string[]; error?: string }
type Cache = Record<string, Entry>

/** 실패하면 하루가 아니라 한 시간 뒤에 다시 찾는다 */
const RETRY_AFTER_MS = 60 * 60_000
/** Semantic Scholar는 키 없이 쓰면 모두가 같은 몫을 나눠 써서 429(요청이 많음)가 잦다: 조금씩 기다렸다 두 번 더 */
let s2Wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
export function useS2Wait(f: (ms: number) => Promise<unknown>): void { s2Wait = f }
async function s2Fetch(url: string): Promise<Response> {
  for (const ms of [1500, 4000]) {
    const res = await paperFetch(url)
    if (res.status !== 429) return res
    await s2Wait(ms)
  }
  return paperFetch(url)
}
const s2Error = (status: number, what: 'fetch' | 'search') => new Error(status === 429
  ? t('Semantic Scholar에 요청이 많아 지금은 받지 못했습니다. 잠시 뒤 다시 해 보세요', 'Semantic Scholar is busy right now. Try again in a moment')
  : what === 'fetch' ? t(`Semantic Scholar에서 받지 못했습니다 (${status})`, `Could not fetch from Semantic Scholar (${status})`) : t(`Semantic Scholar에서 찾지 못했습니다 (${status})`, `Could not search Semantic Scholar (${status})`))

const fileOf = (configDir: string) => path.join(configDir, 'people-papers.json')
export function readPeoplePapers(configDir: string): Cache {
  try { return JSON.parse(fs.readFileSync(fileOf(configDir), 'utf8')) as Cache } catch { return {} }
}
function writePeoplePapers(configDir: string, cache: Cache): void {
  fs.mkdirSync(configDir, { recursive: true })
  writeAtomic(fileOf(configDir), JSON.stringify(cache, null, 1))
}

/** 무엇으로 찾는지: 바뀌면(ID를 고르거나 이름을 고치면) 하루를 기다리지 않고 다시 찾는다 */
const searchKey = (p: Person) => (p.s2 ? `s2:${p.s2}` : `arxiv:${[p.name, ...(p.aliases ?? [])].join('|')}`)
const since = (days: number, now: number) => new Date(now - days * 24 * 60 * 60_000).toISOString().slice(0, 10)
const xmlText = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

async function fromS2(id: string, now: number): Promise<Found[]> {
  // 저자의 논문은 최근 것부터 온다. 많이 쓴 사람도 최근 90일은 앞 100편 안에 든다
  const res = await s2Fetch(`https://api.semanticscholar.org/graph/v1/author/${encodeURIComponent(id)}/papers?fields=title,externalIds,publicationDate,year,authors,url&limit=100`)
  if (!res.ok) throw s2Error(res.status, 'fetch')
  const body = await res.json() as { data?: { paperId: string; title?: string; publicationDate?: string | null; externalIds?: { ArXiv?: string; DOI?: string } | null; authors?: { name: string }[]; url?: string }[] }
  const from = since(NEW_PAPER_DAYS, now)
  return (body.data ?? []).filter((p) => p.title && p.publicationDate && p.publicationDate >= from).map((p) => ({
    id: p.externalIds?.ArXiv ? `arxiv:${p.externalIds.ArXiv}` : `s2:${p.paperId}`,
    title: p.title!, date: p.publicationDate!, authors: (p.authors ?? []).map((a) => a.name),
    ...(p.externalIds?.ArXiv && { arxiv: p.externalIds.ArXiv }), ...(p.externalIds?.DOI && { doi: p.externalIds.DOI }),
    url: p.externalIds?.ArXiv ? `https://arxiv.org/abs/${p.externalIds.ArXiv}` : p.url ?? `https://www.semanticscholar.org/paper/${p.paperId}`,
  }))
}

async function fromArxiv(person: Person, now: number): Promise<Found[]> {
  // arXiv 저자 검색은 "성_이름첫글자" 꼴. 이름 · 다른 이름마다 OR로 묶고, 받은 뒤 같은 사람 기준(isAuthorOf)으로 한 번 더 거른다
  const keys = [...new Set([person.name, ...(person.aliases ?? [])].map(nameKey).filter((k) => k.family)
    .map((k) => `au:${k.family.replace(/[^a-z-]/g, '').replace(/-/g, '_')}${k.initial ? `_${k.initial}` : ''}`))]
  if (!keys.length) return []
  const q = keys.join(' OR ')
  const res = await paperFetch(`https://export.arxiv.org/api/query?search_query=${encodeURIComponent(q)}&sortBy=submittedDate&sortOrder=descending&max_results=40`)
  if (!res.ok) throw new Error(t(`arXiv에서 찾지 못했습니다 (${res.status})`, `Could not search arXiv (${res.status})`))
  const from = since(NEW_PAPER_DAYS, now)
  const out: Found[] = []
  for (const m of (await res.text()).matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const entry = m[1]!
    const arxiv = /<id>\s*https?:\/\/arxiv\.org\/abs\/([^<\s]+?)(?:v\d+)?\s*<\/id>/.exec(entry)?.[1]
    const title = /<title[^>]*>([\s\S]*?)<\/title>/.exec(entry)?.[1]
    const date = /<published>(\d{4}-\d{2}-\d{2})/.exec(entry)?.[1]
    if (!arxiv || !title || !date || date < from) continue
    const authors = [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map((a) => xmlText(a[1]!))
    if (!isAuthorOf(person, authors.join(' and '))) continue
    const doi = /<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/.exec(entry)?.[1]
    out.push({ id: `arxiv:${arxiv}`, title: xmlText(title), date, authors, arxiv, ...(doi && { doi: xmlText(doi) }), url: `https://arxiv.org/abs/${arxiv}` })
  }
  return out
}

/** 이 사람의 새 논문을 (하루가 지났거나 찾는 법이 바뀌었으면) 다시 찾아 저장한다. 실패해도 지난 결과는 남긴다 */
export async function refreshPersonPapers(configDir: string, id: string, person: Person, { force = false, now = Date.now() } = {}): Promise<Entry> {
  const cache = readPeoplePapers(configDir)
  const old = cache[id]
  const key = searchKey(person)
  if (old && old.key === key && !force && now - old.at < NEW_PAPER_EVERY_MS) return old
  const source = person.s2 ? 's2' : 'arxiv'
  let next: Entry
  try {
    const papers = (person.s2 ? await fromS2(person.s2, now) : await fromArxiv(person, now)).sort((a, b) => b.date.localeCompare(a.date))
    // 처음 찾을 때 나온 논문은 "새것"으로 띄우지 않는다 (이미 아는 논문일 테니 본 것으로)
    const seen = old && old.key === key ? old.seen : papers.map((p) => p.id)
    next = { at: now, source, key, papers, seen, hidden: old?.hidden ?? [] }
  } catch (e) {
    next = { ...(old ?? { papers: [], seen: [], hidden: [] }), at: now - NEW_PAPER_EVERY_MS + RETRY_AFTER_MS, source, key, error: (e as Error).message }
  }
  const latest = readPeoplePapers(configDir)
  // 찾는 동안 누른 "본 것으로" · "이 사람 아님"을 잃지 않게 지금 파일의 것을 합친다
  const current = latest[id]
  if (current && current.key === key) next = { ...next, seen: [...new Set([...next.seen, ...current.seen])], hidden: [...new Set([...next.hidden, ...current.hidden])] }
  latest[id] = next
  writePeoplePapers(configDir, latest)
  return next
}

/** 본 것으로 · 이 사람 아님 */
export function markPapers(configDir: string, id: string, change: { seen?: true; hide?: string }): void {
  const cache = readPeoplePapers(configDir)
  const e = cache[id]
  if (!e) return
  if (change.seen) e.seen = [...new Set([...e.seen, ...e.papers.map((p) => p.id)])]
  if (change.hide && !e.hidden.includes(change.hide)) e.hidden.push(change.hide)
  writePeoplePapers(configDir, cache)
}

/** 보지 않은 새 논문 수 (숨긴 것 빼고) */
export const freshCount = (e: Entry | undefined): number => (e ? e.papers.filter((p) => !e.seen.includes(p.id) && !e.hidden.includes(p.id)).length : 0)

/** Semantic Scholar 저자 찾기 (사람 고치기 창) */
export async function searchS2Authors(query: string): Promise<S2Author[]> {
  const res = await s2Fetch(`https://api.semanticscholar.org/graph/v1/author/search?query=${encodeURIComponent(query)}&fields=name,affiliations,paperCount,papers.title&limit=8`)
  if (!res.ok) throw s2Error(res.status, 'search')
  const body = await res.json() as { data?: { authorId: string; name: string; affiliations?: string[]; paperCount?: number; papers?: { title?: string }[] }[] }
  return (body.data ?? []).map((a) => ({ id: a.authorId, name: a.name, affiliations: a.affiliations ?? [], paperCount: a.paperCount ?? 0, ...(a.papers?.[0]?.title && { sample: a.papers[0].title }) }))
}

/** 사람 사진: 앱 설정 폴더 people/<id>.jpg (화면이 작게 줄여 보낸다) */
export const photoFile = (configDir: string, id: string) => path.join(configDir, 'people', `${id.replace(/[^a-z0-9가-힣-]/g, '')}.jpg`)
export function photoStamp(configDir: string, id: string): number | undefined {
  try { return Math.round(fs.statSync(photoFile(configDir, id)).mtimeMs) } catch { return undefined }
}
