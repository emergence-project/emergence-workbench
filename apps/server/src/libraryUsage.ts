import { projectRefsStamp } from './projectReadCache.js'
import type { Workbench } from './workbench.js'
// 공유 라이브러리 노트의 "쓰는 곳": 어느 프로젝트(와 노트)가 그 개념·논문에 기대는가
import { listMaterials } from './materials.js'
import { conceptsOf, type LibraryNote } from './libraryNotes.js'
import type { Registry } from './registry.js'

import type { LibraryUse } from '@rw/core/contract/library'
export type { LibraryUse }

/**
 * 개념: 블록 노트 머리말의 concepts:, 그리고 프로젝트 전체가 기대는 research.yaml의 concepts: (노트 없이).
 * 논문: 프로젝트 bib에 있는 key.
 */
const projectUses = new WeakMap<Workbench, { stamp: string; uses: [string, LibraryUse][] }>()
export function libraryUsage(registry: Registry, notes: LibraryNote[]): Record<string, LibraryUse[]> {
  const usedBy: Record<string, LibraryUse[]> = {}
  const add = (key: string, v: LibraryUse) => { (usedBy[key] ??= []).push(v) }
  const paperIds = new Set(notes.filter((n) => n.kind === 'paper').map((n) => n.id))
  for (const r of registry.list().filter((x) => x.available)) {
    const wb = registry.get(r.id)
    const stamp = projectRefsStamp(wb)
    let hit = projectUses.get(wb)
    if (!hit || hit.stamp !== stamp) {
      const info = wb.readResearch()
      const uses: [string, LibraryUse][] = []
      for (const c of info.concepts) uses.push([`concept:${c}`, { rid: r.id, project: r.title }])
      for (const b of wb.listBlocks()) for (const c of conceptsOf(b.content)) uses.push([`concept:${c}`, { rid: r.id, project: r.title, note: b.id, noteTitle: b.meta.title }])
      for (const e of listMaterials(wb.root, info.sources).bib) uses.push([`paper:${e.key}`, { rid: r.id, project: r.title }])
      hit = { stamp, uses }; projectUses.set(wb, hit)
    }
    for (const [key, use] of hit.uses) if (!key.startsWith('paper:') || paperIds.has(key.slice(6))) add(key, use)
  }
  return usedBy
}
