import type { Route } from './router'

/** 일지의 노트 대상은 예전 TeX 경로 또는 연구·계산 노트의 Markdown 경로다. */
export const isNoteTarget = (target: string): boolean => /\.tex$/.test(target) || /^workbench\/(?:notes|calc)\/[^/]+\/note\.md$/.test(target)

export function journalTargetRoute(rid: string, target: string): Route {
  return isNoteTarget(target) ? { page: 'part', rid, file: target } : { page: 'block', rid, bid: target }
}
