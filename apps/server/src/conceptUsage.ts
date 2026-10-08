// 개념노트의 "쓰는 곳"과 인용 문헌을 함께 (10/4 16:59 피드백 "쓰는 곳이랑 인용 문헌 관리 같이 생각해줘야해")
// 이 개념을 쓰는 프로젝트마다, 개념노트가 인용한 문헌을 그 프로젝트의 bib도 갖고 있는지 본다.
// 원고를 쓸 때 개념의 출처를 빠뜨리지 않게, 그리고 같은 논문을 다른 키로 적어도 알아보게 (키 · arXiv · DOI · 제목).
import { conceptsOf } from './libraryNotes.js'
import { listMaterials, type BibEntry } from './materials.js'
import type { Registry } from './registry.js'

export interface ConceptUse {
  rid: string
  project: string
  /** research.yaml의 concepts:로 프로젝트 전체가 기댄다 (빼기 가능) */
  linked: boolean
  /** 머리말 concepts:로 이 개념에 기대는 연구노트 */
  notes: { id: string; title: string }[]
  /** 개념노트의 출처 하나하나가 이 프로젝트 bib에 있는지 (있으면 그 bib의 키) */
  cites: { key: string; projectKey?: string }[]
}

const arxiv = (s?: string) => s?.replace(/^arxiv:/i, '').replace(/v\d+$/, '').trim().toLowerCase() || undefined
const doi = (s?: string) => s?.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').trim().toLowerCase() || undefined
const title = (s?: string) => s?.normalize('NFKD').replace(/[{}\\]/g, '').replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase() || undefined

/** 같은 문헌인가: 키가 같거나, arXiv 번호·DOI·제목이 같다 */
export function sameWork(a: BibEntry, b: BibEntry): boolean {
  if (a.key === b.key) return true
  const ax = arxiv(a.eprint), bx = arxiv(b.eprint)
  if (ax && ax === bx) return true
  const ad = doi(a.doi), bd = doi(b.doi)
  if (ad && ad === bd) return true
  const at = title(a.title), bt = title(b.title)
  return !!at && at.length > 12 && at === bt
}

export function conceptUsage(registry: Registry, id: string, sources: (BibEntry | { key: string; missing: true })[]): ConceptUse[] {
  const out: ConceptUse[] = []
  for (const r of registry.list().filter((x) => x.available)) {
    const wb = registry.get(r.id)
    const info = wb.readResearch()
    const linked = info.concepts.includes(id)
    const notes = wb.listBlocks().filter((b) => conceptsOf(b.content).includes(id)).map((b) => ({ id: b.id, title: b.meta.title ?? b.id }))
    if (!linked && notes.length === 0) continue
    const bib = listMaterials(wb.root, info.sources).bib
    const cites = sources.map((s) => {
      const hit = 'missing' in s ? bib.find((e) => e.key === s.key) : bib.find((e) => sameWork(s, e))
      return hit ? { key: s.key, projectKey: hit.key } : { key: s.key }
    })
    out.push({ rid: r.id, project: r.title, linked, notes, cites })
  }
  return out
}
