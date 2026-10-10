import { parseBib, type BibEntry } from './materials.js'

/**
 * 개념노트의 출처는 본문 글로 두지 않고 머리말 `sources:`에 references.bib의 키만 적는다 (2026-10-04 사용자 결정).
 * 화면과 PDF 참고문헌은 bib에서 만든다.
 */

/** 개념노트 화면에 보일 출처: 머리말 sources와 본문 [@키]를 bib에서 찾아서. 없는 키는 missing */
export function conceptSources(keys: string[], bib: string | null): (BibEntry | { key: string; missing: true })[] {
  const entries = bib ? parseBib(bib) : []
  return [...new Set(keys)].map((k) => entries.find((e) => e.key === k) ?? { key: k, missing: true as const })
}
