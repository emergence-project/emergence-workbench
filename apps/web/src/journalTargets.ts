import type { Route } from './router'

/** id로 노트 찾기 (옛 블록 노트 id → 같은 이름의 노트) */
export type NoteOf = (id: string) => { title: string; file: string } | undefined

/** 일지의 노트 대상은 예전 TeX 경로 또는 연구·계산 노트의 Markdown 경로다. 그 밖은 옛 블록 노트 id (2026-10-27부터 같은 이름의 노트 폴더) */
export const isNoteTarget = (target: string): boolean => /\.tex$/.test(target) || /^workbench\/(?:notes|calc|topics\/[^/]+)\/[^/]+\/note\.md$/.test(target)

export function journalTargetRoute(rid: string, target: string, noteOf: NoteOf = () => undefined): Route {
  if (isNoteTarget(target)) return { page: 'part', rid, file: target }
  const n = noteOf(target)
  return n ? { page: 'part', rid, file: n.file } : { page: 'overview', rid }
}
