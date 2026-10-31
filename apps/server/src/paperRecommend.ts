import type { PaperPick, PaperRecommend, PaperRow } from '@rw/core/contract/papers'
import { paperPost } from './paperAdd.js'

/**
 * 추천 논문 (논문 첫 화면 오른쪽 아래, 10/31 시안 1절).
 * 기준: 이 맥에서 최근 연 논문, 없으면 최근 더한 논문 가운데 arXiv 번호나 DOI가 있는 것 몇 편.
 * Semantic Scholar 추천(기본 모음이 최근 논문)에 묻고, 라이브러리에 이미 있는 것은 뺀다.
 * 같은 기준이면 몇 시간 동안 다시 묻지 않는다 (첫 화면을 열 때마다 바깥에 묻지 않게).
 */

const SEEDS = 8
const PICKS = 6
const KEEP_MS = 6 * 3_600_000
const URL = `https://api.semanticscholar.org/recommendations/v1/papers?limit=30&fields=title,authors,year,venue,externalIds,publicationDate`

const idKey = (id: string) => (/^10\./.test(id) ? `doi:${id.toLowerCase()}` : `arxiv:${id.replace(/v\d+$/, '')}`)
const s2Id = (p: PaperRow) => (p.eprint ? `ArXiv:${p.eprint.replace(/v\d+$/, '')}` : p.doi ? `DOI:${p.doi}` : null)

/** 기준 논문: 연 순, 그다음 더한 순 */
export function seedsOf(papers: PaperRow[]): string[] {
  const sorted = [...papers].sort((a, b) => (b.opened ?? 0) - (a.opened ?? 0) || b.added - a.added)
  return sorted.map(s2Id).filter((x): x is string => !!x).slice(0, SEEDS)
}

interface S2Paper { title?: string; year?: number; venue?: string; publicationDate?: string; authors?: { name?: string }[]; externalIds?: { ArXiv?: string; DOI?: string } }

let kept: { seeds: string; at: number; picks: PaperPick[] } | null = null
/** 테스트가 저장해 둔 결과를 비운다 */
export function forgetRecommendations(): void { kept = null }

export async function recommendPapers(papers: PaperRow[], now = Date.now()): Promise<PaperRecommend> {
  const seeds = seedsOf(papers)
  if (!seeds.length) return { picks: [], seeds: 0, offline: false }
  const have = new Set(papers.flatMap((p) => [p.eprint && idKey(p.eprint), p.doi && idKey(p.doi)].filter((x): x is string => !!x)))
  const fresh = (list: PaperPick[]) => list.filter((x) => !have.has(idKey(x.id))).slice(0, PICKS)
  const key = seeds.join(' ')
  if (kept && kept.seeds === key && now - kept.at < KEEP_MS) return { picks: fresh(kept.picks), seeds: seeds.length, offline: false }
  try {
    const res = await paperPost(URL, { positivePaperIds: seeds, negativePaperIds: [] })
    if (!res.ok) throw new Error(`Semantic Scholar ${res.status}`)
    const body: { recommendedPapers?: S2Paper[] } = await res.json()
    const picks: PaperPick[] = (body.recommendedPapers ?? []).flatMap((p) => {
      const id = p.externalIds?.ArXiv ?? p.externalIds?.DOI
      if (!id || !p.title) return []
      return [{ id, title: p.title, authors: (p.authors ?? []).map((a) => (a.name ?? '').split(/\s+/).pop() ?? '').filter(Boolean),
        ...(p.year && { year: String(p.year) }), ...(p.venue && { venue: p.venue }), ...(p.publicationDate && { date: p.publicationDate }) }]
    }).sort((a, b) => (b.date ?? b.year ?? '').localeCompare(a.date ?? a.year ?? ''))
    kept = { seeds: key, at: now, picks }
    return { picks: fresh(picks), seeds: seeds.length, offline: false }
  } catch {
    return { picks: [], seeds: seeds.length, offline: true }
  }
}
