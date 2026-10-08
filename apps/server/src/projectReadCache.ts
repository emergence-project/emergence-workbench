import fs from 'node:fs'
import path from 'node:path'
import { DerivedCache, treeStamp } from './readCache.js'
import type { Registry } from './registry.js'
import type { Workbench } from './workbench.js'

/** 연구 하나의 원고·노트·메타자료. 내용 읽기는 바뀐 연구만 다시 한다. */
const stamps = new WeakMap<Workbench, DerivedCache<string>>()
export function projectStamp(wb: Workbench): string {
  let cache = stamps.get(wb)
  if (!cache) { cache = new DerivedCache(); stamps.set(wb, cache) }
  let stamp = ''
  return cache.get(() => {
    const repo = path.dirname(wb.root)
    const sources = wb.readResearch().sources
    const bib = sources.bib.length ? sources.bib : fs.readdirSync(repo).filter((n) => n.endsWith('.bib'))
    stamp = treeStamp([wb.root, ...bib.map((f) => path.join(repo, f)), ...sources.manuscripts.map((m) => path.join(repo, m.path))])
    return stamp
  }, () => stamp)
}

export function invalidateProjects(registry: Registry): void {
  for (const id of registry.ids()) { try { stamps.get(registry.get(id))?.invalidate() } catch { /* removed */ } }
}

export function registryStamp(registry: Registry): string {
  return registry.list().map((r) => `${r.id}:${r.path}:${r.title}:${r.available}:${r.available ? projectStamp(registry.get(r.id)) : ''}`).join('\n')
}
