// 전역 검색의 목록: 모든 프로젝트의 카드·노트·장·보조 노트·진술 이름, 라이브러리 문헌노트, 네트워킹의 사람 (10/4 19:33 피드백)
import { personId } from '@rw/core'
import type { SearchItem } from '@rw/core/contract/search'
import { listLibraryNotes, type LibraryNote } from './libraryNotes.js'
import { allManuscripts } from './manuscript.js'
import type { Registry } from './registry.js'
import { listStatements } from './statements.js'
import { readTopics } from './topics.js'

export type { SearchItem } from '@rw/core/contract/search'

/** 검색 창을 열 때 한 번 받는 목록. 프로젝트 하나를 읽지 못해도 나머지는 낸다 */
export function searchCatalog(registry: Registry, notes: LibraryNote[] = listLibraryNotes(registry.libraryPath)): SearchItem[] {
  const out: SearchItem[] = []
  for (const r of registry.list()) {
    out.push({ kind: 'project', id: r.id, title: r.title, also: r.tags.map((t) => `#${t}`).join(' '), rid: r.id })
    if (!r.available) continue
    const at = { rid: r.id, project: r.title }
    try {
      const wb = registry.get(r.id)
      for (const t of readTopics(wb)) out.push({ kind: 'card', id: t.id, title: t.title, ...at })
      const seen = new Set<string>()
      for (const m of allManuscripts(wb)) {
        const first = m.parts[0]?.file ?? m.main
        out.push({ kind: 'note', id: m.key || m.main, title: m.name, also: m.main, file: first, noteKind: m.kind, ...at })
        seen.add(first)
        for (const p of m.parts) {
          if (p.line || seen.has(p.file)) continue // 한 파일 원고의 절은 그 파일 하나로
          seen.add(p.file)
          out.push({ kind: 'part', id: p.id, title: p.title, also: `${p.file} ${m.name}`, file: p.file, ...at })
        }
      }
      for (const b of wb.listBlocks()) out.push({ kind: 'block', id: b.id, title: b.meta.title || b.id, also: b.id, ...at })
      for (const s of listStatements(wb.root)) {
        const label = (s.label ?? '').split(',')[0]!.trim()
        out.push({ kind: 'statement', id: s.id, title: [label, s.title].filter(Boolean).join(' ') || s.id, also: s.id, ...at })
      }
    } catch { /* 읽지 못한 프로젝트는 이름만 */ }
  }
  for (const n of notes) {
    if (n.format === 'md') continue
    out.push({ kind: n.kind === 'paper' ? 'paper' : 'concept', id: n.id, title: n.title || n.id, also: [n.id, n.authors, n.year, n.eprint].filter(Boolean).join(' ') })
  }
  const people = new Map<string, SearchItem>()
  for (const a of registry.authors) people.set(personId(a.name), { kind: 'person', id: personId(a.name), title: a.name, also: a.affiliations.join(' ') })
  for (const p of registry.people) {
    const id = personId(p.name)
    const prev = people.get(id)
    people.set(id, { kind: 'person', id, title: p.name, also: [prev?.also, ...(p.aliases ?? []), ...(p.tags ?? []), p.note].filter(Boolean).join(' ') })
  }
  out.push(...people.values())
  return out
}
