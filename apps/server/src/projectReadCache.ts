import fs from 'node:fs'
import path from 'node:path'
import { materialsDir } from './materials.js'
import { DerivedCache, treeStamp } from './readCache.js'
import type { Registry } from './registry.js'
import type { Workbench } from './workbench.js'

/** workbench/ 안에서 노트·원고·메타자료를 읽는 곳이 쓰지 않는 것: 앱이 자주 쓰는 요약·일지·맡긴 일·코멘트 */
// agentStatus STATUS_FILE · logDir · tasks TASKS_DIR · comments COMMENTS_DIR (이 파일을 읽는 모듈이라 이름만 적는다: 순환 import를 피한다)
const NOT_SOURCES = ['STATUS.md', 'log', 'tasks', 'comments']

function bibFiles(wb: Workbench): string[] {
  const repo = wb.repo
  const sources = wb.readResearch().sources
  return (sources.bib.length ? sources.bib : fs.readdirSync(repo).filter((n) => n.endsWith('.bib'))).map((f) => path.join(repo, f))
}

function cachedStamp(stamps: WeakMap<Workbench, DerivedCache<string>>, wb: Workbench, compute: () => string): string {
  let cache = stamps.get(wb)
  if (!cache) { cache = new DerivedCache(); stamps.set(wb, cache) }
  let stamp = ''
  return cache.get(() => (stamp = compute()), () => stamp)
}

/** 연구 하나의 원고·노트·메타자료. 내용 읽기는 바뀐 연구만 다시 한다. */
const stamps = new WeakMap<Workbench, DerivedCache<string>>()
export function projectStamp(wb: Workbench): string {
  return cachedStamp(stamps, wb, () => {
    const repo = wb.repo
    return treeStamp([wb.root, ...bibFiles(wb), ...wb.readResearch().sources.manuscripts.map((m) => path.join(repo, m.path))],
      { skip: NOT_SOURCES.map((n) => path.join(wb.root, n)), dirStats: false })
  })
}

/** 라이브러리가 프로젝트에서 읽는 것만: research.yaml(개념·자료), 블록 노트 폴더, bib, 자료 폴더. 노트 본문을 고쳐도 바뀌지 않는다. */
const refStamps = new WeakMap<Workbench, DerivedCache<string>>()
export function projectRefsStamp(wb: Workbench): string {
  return cachedStamp(refStamps, wb, () => treeStamp([wb.researchPath, wb.blocksDir, ...bibFiles(wb), materialsDir(wb.root)], { dirStats: false }))
}

export function invalidateProjects(registry: Registry): void {
  for (const id of registry.ids()) { try { const wb = registry.get(id); stamps.get(wb)?.invalidate(); refStamps.get(wb)?.invalidate() } catch { /* removed */ } }
}

export function registryStamp(registry: Registry, stampOf: (wb: Workbench) => string = projectStamp): string {
  return registry.list().map((r) => `${r.id}:${r.path}:${r.title}:${r.available}:${r.available ? stampOf(registry.get(r.id)) : ''}`).join('\n')
}
