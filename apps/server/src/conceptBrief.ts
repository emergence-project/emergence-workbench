import { registryStamp } from './projectReadCache.js'
// 지식 첫 화면 (라이브러리 L1, requirements §8.1 "라이브러리 첫 화면" · "지식 점검 기준" · "규모 대비")
// 개념노트 파일을 요청마다 다 읽지 않고 색인 위에서 센다. 프로젝트 노트는 등록한 연구마다 읽는다 (연구 수는 적다).
import type { ConceptIndex } from './conceptIndex.js'
import { readLearn } from './learn.js'
import { projectConceptRefs } from './noteList.js'
import type { Registry } from './registry.js'

export type { IdCount, ConceptBrief } from '@rw/core/contract/concepts'
import type { IdCount, ConceptBrief } from '@rw/core/contract/concepts'

const ofIds = (ids: string[]): IdCount => ({ count: ids.length, ids })

/** 프로젝트별 직접 사용만 모은다. 전제 한 단계는 usedConcepts에서만 더한다. */
const directCache = new WeakMap<Registry, { index: ConceptIndex; stamp: string; projects: Record<string, string[]> }>()
export function directConceptProjects(registry: Registry, index: ConceptIndex): Record<string, string[]> {
  index.refresh()
  const stamp = `${index.revision}:${registryStamp(registry)}`
  const hit = directCache.get(registry)
  if (hit?.index === index && hit.stamp === stamp) return hit.projects
  const projects: Record<string, string[]> = Object.create(null)
  for (const r of registry.list().filter((x) => x.available)) {
    let refs: { names: string[]; ids: string[] }
    try { refs = projectConceptRefs(registry.get(r.id)) } catch { continue }
    const direct = new Set(refs.ids)
    for (const n of refs.names) { const hit = index.resolve(n); if (hit) direct.add(hit.id) }
    for (const id of index.checkStates([...direct]).keys()) (projects[id] ??= []).push(r.title)
  }
  directCache.set(registry, { index, stamp, projects })
  return projects
}

/**
 * 연구가 쓰는 개념노트: 프로젝트 노트 · 원고가 링크한 개념노트(본문 [[링크]], 머리말 concepts:, research.yaml concepts:)와
 * 그 노트가 링크한 전제 한 단계. 색인에 없는 id는 뺀다.
 */
export function usedConcepts(registry: Registry, index: ConceptIndex, projects = directConceptProjects(registry, index)): string[] {
  const first = Object.keys(projects)
  return [...new Set([...first, ...index.linkedFrom(first)])].sort()
}

/** 첫 화면과 목록의 점검 조건 정본. projects를 받으면 연구 파일은 다시 읽지 않는다. */
export function conceptChecks(registry: Registry, index: ConceptIndex, lib: string, projects = directConceptProjects(registry, index)): ConceptBrief['check'] {
  const used = usedConcepts(registry, index, projects)
  const states = index.checkStates(used)
  let items: ReturnType<typeof readLearn>['items'] = []
  try { items = readLearn(lib).items } catch { /* to-learn.yaml을 못 읽으면 초안 검토 0 */ }
  const linked = items.filter((i) => i.concept)
  const learnStates = index.checkStates([...new Set(linked.map((i) => i.concept!))])
  const drafts = linked.filter((i) => learnStates.has(i.concept!) && learnStates.get(i.concept!) !== 'ok')
  return {
    used: used.length,
    unchecked: ofIds(used.filter((id) => states.get(id) === 'none')),
    changedAfterCheck: ofIds(used.filter((id) => states.get(id) === 'changed')),
    draftsToReview: { ...ofIds(drafts.map((i) => i.id)), concepts: [...new Set(drafts.map((i) => i.concept!))] },
  }
}

export function conceptBrief(registry: Registry, index: ConceptIndex, lib: string, recentLimit = 8): ConceptBrief {
  const issues = index.issues()
  return {
    total: index.count(),
    recent: index.recent(recentLimit).map(({ id, title, subject, mtime }) => ({ id, title, subject, mtime })),
    check: conceptChecks(registry, index, lib),
    stats: {
      empty: ofIds(issues.empty), emptySection: ofIds(issues.emptySection), todo: ofIds(issues.todo),
      brokenLink: ofIds(issues.brokenLink), noSource: ofIds(issues.noSource), unknownCite: ofIds(issues.unknownCite),
    },
  }
}
