import { papersApi, type BibEntry, type ResearchApi } from './api'

/** 공유 라이브러리에서 찾은 항목의 source (프로젝트 bib는 파일 이름) */
export const LIBRARY_SOURCE = '@library'

/**
 * 노트가 인용한 키의 bib 항목: 프로젝트 bib 먼저, 거기 없는 키는 공유 라이브러리 references.bib에서.
 * PDF의 참고문헌도 같은 차례다 (서버 noteBib.ts의 libraryCitedBib).
 */
export async function loadCitedBib(rapi: ResearchApi, keys: string[]): Promise<BibEntry[]> {
  const own = await rapi.materials().then((d) => d.bib).catch((): BibEntry[] => [])
  const have = new Set(own.map((e) => e.key))
  const missing = keys.filter((k) => !have.has(k))
  const shared = missing.length ? await papersApi.bib(missing).then((d) => d.items).catch((): BibEntry[] => []) : []
  return [...own, ...shared.map((e) => ({ ...e, source: LIBRARY_SOURCE }))]
}
