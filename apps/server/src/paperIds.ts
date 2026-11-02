/**
 * 바깥 논문(arXiv · Semantic Scholar · Crossref)이 라이브러리에 이미 있는지, 서로 같은 논문인지 맞춰 보는 번호 (논문 찾기 · 추천).
 * 한 논문이 arXiv 번호와 DOI를 함께 가질 수 있어(arXiv 판과 저널 판), 둘 중 하나라도 겹치면 같은 논문으로 본다.
 */

/** 비교용 열쇠: arXiv 번호는 판 번호를 떼고, DOI는 소문자로 */
export const idKey = (id: string) => (/^10\./.test(id) ? `doi:${id.toLowerCase()}` : `arxiv:${id.replace(/v\d+$/, '')}`)

/** 있는 번호만의 열쇠 */
export const idKeys = (...ids: (string | undefined)[]): string[] => ids.filter((x): x is string => !!x).map(idKey)

/** 라이브러리 논문들의 열쇠 (bib 항목이든 목록 줄이든 eprint · doi로) */
export const libraryKeys = (entries: { eprint?: string; doi?: string }[]): Set<string> => new Set(entries.flatMap((e) => idKeys(e.eprint, e.doi)))

/** Semantic Scholar 논문 (찾기 · 추천이 받는 칸) */
export interface S2Paper { title?: string; year?: number; venue?: string; publicationDate?: string; authors?: { name?: string }[]; externalIds?: { ArXiv?: string; DOI?: string } }

export interface S2Hit { id: string; keys: string[]; title: string; authors: string[]; year?: string; venue?: string; date?: string }

/** S2 논문 하나: id = 더할 때 보낼 번호(arXiv가 있으면 그것, PDF도 받는다), keys = 겹침을 볼 열쇠(arXiv · DOI 둘 다), 저자는 성만 */
export function s2Hit(p: S2Paper): S2Hit | null {
  const ids = p.externalIds
  const id = ids?.ArXiv ?? ids?.DOI
  if (!id || !p.title) return null
  return {
    id, keys: idKeys(ids?.ArXiv, ids?.DOI), title: p.title,
    authors: (p.authors ?? []).map((a) => (a.name ?? '').split(/\s+/).pop() ?? '').filter(Boolean),
    ...(p.year && { year: String(p.year) }), ...(p.venue && { venue: p.venue }), ...(p.publicationDate && { date: p.publicationDate }),
  }
}
