import type { PaperPick, PaperRecommend, PaperRow } from '@rw/core/contract/papers'
import { paperPost } from './paperAdd.js'
import { libraryKeys, s2Hit, type S2Hit, type S2Paper } from './paperIds.js'

/**
 * 추천 논문 (논문 첫 화면 오른쪽 아래, 10/31 시안 1절).
 * 기준: 이 맥에서 최근 연 논문, 없으면 최근 더한 논문 가운데 arXiv 번호나 DOI가 있는 것 몇 편.
 * Semantic Scholar 추천(기본 모음이 최근 논문)에 묻고, 라이브러리에 이미 있는 것은 뺀다(arXiv 번호 · DOI 어느 쪽이 겹쳐도, paperIds.ts).
 * 같은 기준(순서는 상관없음)이면 몇 시간 동안 다시 묻지 않고, 받지 못했으면 몇 분 동안 다시 묻지 않는다 (첫 화면을 열 때마다 바깥에 묻지 않게).
 */

const SEEDS = 8
const PICKS = 6
const KEEP_MS = 6 * 3_600_000
/** 받지 못했을 때(연결 없음 · 429 같은 오류) 다시 묻기까지 */
const RETRY_MS = 5 * 60_000
const URL = `https://api.semanticscholar.org/recommendations/v1/papers?limit=30&fields=title,authors,year,venue,externalIds,publicationDate`

const s2Id = (p: PaperRow) => (p.eprint ? `ArXiv:${p.eprint.replace(/v\d+$/, '')}` : p.doi ? `DOI:${p.doi}` : null)

/** 기준 논문: 연 순, 그다음 더한 순 */
export function seedsOf(papers: PaperRow[]): string[] {
  const sorted = [...papers].sort((a, b) => (b.opened ?? 0) - (a.opened ?? 0) || b.added - a.added)
  return sorted.map(s2Id).filter((x): x is string => !!x).slice(0, SEEDS)
}

/** 마지막으로 물은 기준과 그 답. failed면 받지 못한 것(status = 바깥이 오류로 답한 HTTP 상태) */
let kept: { seeds: string; at: number; picks: S2Hit[]; failed?: { status?: number } } | null = null
/** 테스트가 저장해 둔 결과를 비운다 */
export function forgetRecommendations(): void { kept = null }

export async function recommendPapers(papers: PaperRow[], now = Date.now()): Promise<PaperRecommend> {
  const seeds = seedsOf(papers)
  if (!seeds.length) return { picks: [], seeds: 0, offline: false }
  const have = libraryKeys(papers)
  const fresh = (list: S2Hit[]): PaperPick[] => list.filter((x) => !x.keys.some((k) => have.has(k))).slice(0, PICKS)
    .map((x) => ({ id: x.id, title: x.title, authors: x.authors, ...(x.year && { year: x.year }), ...(x.venue && { venue: x.venue }), ...(x.date && { date: x.date }) }))
  const failed = (status?: number): PaperRecommend => ({ picks: [], seeds: seeds.length, offline: true, ...(status && { status }) })
  const key = [...seeds].sort().join(' ')
  if (kept && kept.seeds === key) {
    if (kept.failed && now - kept.at < RETRY_MS) return failed(kept.failed.status)
    if (!kept.failed && now - kept.at < KEEP_MS) return { picks: fresh(kept.picks), seeds: seeds.length, offline: false }
  }
  try {
    const res = await paperPost(URL, { positivePaperIds: seeds, negativePaperIds: [] })
    if (!res.ok) {
      kept = { seeds: key, at: now, picks: [], failed: { status: res.status } }
      return failed(res.status)
    }
    const body: { recommendedPapers?: S2Paper[] } = await res.json()
    const picks = (body.recommendedPapers ?? []).flatMap((p) => s2Hit(p) ?? [])
      .sort((a, b) => (b.date ?? b.year ?? '').localeCompare(a.date ?? a.year ?? ''))
    kept = { seeds: key, at: now, picks }
    return { picks: fresh(picks), seeds: seeds.length, offline: false }
  } catch {
    kept = { seeds: key, at: now, picks: [], failed: {} }
    return failed()
  }
}
