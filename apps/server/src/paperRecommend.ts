import type { PaperPick, PaperRecommend, PaperRow } from '@rw/core/contract/papers'
import { paperFetch } from './paperAdd.js'
import { libraryKeys, s2Hit, type S2Hit, type S2Paper } from './paperIds.js'

/**
 * 추천 논문 (논문 첫 화면 오른쪽 아래, 10/31 시안 1절).
 * 기준: 이 맥에서 최근 연 논문, 없으면 최근 더한 논문 가운데 arXiv 번호나 DOI가 있는 것 몇 편.
 * 기준 논문마다 따로 Semantic Scholar 추천(최근 논문 모음)에 묻고, 기준마다 가까운 순서대로 번갈아 하나씩 고른다.
 * 여러 편을 한 번에 물으면(positivePaperIds) 주제가 섞인 평균에 가까운 논문이 와 내 논문과 무관한 것이 추천되고,
 * 날짜순으로 다시 늘어놓으면 가까운 순서가 사라진다 (11/19 피드백: 무관한 논문 추천).
 * 라이브러리에 이미 있는 것은 뺀다(arXiv 번호 · DOI 어느 쪽이 겹쳐도, paperIds.ts).
 * 같은 기준(순서는 상관없음)이면 몇 시간 동안 다시 묻지 않고, 받지 못했으면 몇 분 동안 다시 묻지 않는다 (첫 화면을 열 때마다 바깥에 묻지 않게).
 */

const SEEDS = 6
const PICKS = 6
const KEEP_MS = 6 * 3_600_000
/** 받지 못했을 때(연결 없음 · 429 같은 오류) 다시 묻기까지 */
const RETRY_MS = 5 * 60_000
/** 기준 하나에 받는 수 (라이브러리에 있는 것을 빼고도 남게) */
const PER_SEED = 10
const urlFor = (seed: string) => `https://api.semanticscholar.org/recommendations/v1/papers/forpaper/${encodeURI(seed)}?from=recent&limit=${PER_SEED}&fields=title,authors,year,venue,externalIds,publicationDate`

const s2Id = (p: PaperRow) => (p.eprint ? `ArXiv:${p.eprint.replace(/v\d+$/, '')}` : p.doi ? `DOI:${p.doi}` : null)

/** 기준 논문: 연 순, 그다음 더한 순 */
export function seedsOf(papers: PaperRow[]): string[] {
  const sorted = [...papers].sort((a, b) => (b.opened ?? 0) - (a.opened ?? 0) || b.added - a.added)
  return sorted.map(s2Id).filter((x): x is string => !!x).slice(0, SEEDS)
}

class HttpError extends Error { constructor(readonly status: number) { super(`HTTP ${status}`) } }

/** 기준마다 받은 목록(가까운 순)을 첫째끼리, 둘째끼리 … 번갈아 이어 붙인다. 같은 논문은 처음 나온 자리에만 */
export function interleave(lists: S2Hit[][]): S2Hit[] {
  const out: S2Hit[] = [], seen = new Set<string>()
  for (let i = 0; i < Math.max(0, ...lists.map((l) => l.length)); i++)
    for (const l of lists) {
      const x = l[i]
      if (!x || x.keys.some((k) => seen.has(k))) continue
      x.keys.forEach((k) => seen.add(k))
      out.push(x)
    }
  return out
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
    const answers = await Promise.allSettled(seeds.map(async (seed): Promise<S2Hit[]> => {
      const res = await paperFetch(urlFor(seed))
      // 404: Semantic Scholar가 이 기준 논문을 모른다. 그 기준만 건너뛴다
      if (res.status === 404) return []
      if (!res.ok) throw new HttpError(res.status)
      const body: { recommendedPapers?: S2Paper[] } = await res.json()
      return (body.recommendedPapers ?? []).flatMap((p) => s2Hit(p) ?? [])
    }))
    const got = answers.flatMap((x) => (x.status === 'fulfilled' ? [x.value] : []))
    if (!got.length) {
      const why = answers.find((x): x is PromiseRejectedResult => x.status === 'rejected')?.reason
      const status = why instanceof HttpError ? why.status : undefined
      kept = { seeds: key, at: now, picks: [], failed: { ...(status && { status }) } }
      return failed(status)
    }
    const picks = interleave(got)
    kept = { seeds: key, at: now, picks }
    return { picks: fresh(picks), seeds: seeds.length, offline: false }
  } catch {
    kept = { seeds: key, at: now, picks: [], failed: {} }
    return failed()
  }
}
