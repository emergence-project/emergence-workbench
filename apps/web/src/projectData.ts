import { useCallback, useEffect, useState } from 'react'
import { api, notesApi, type LibraryInfo, type ManuscriptInfo, type NoteRow, type ResearchApi, type Topic } from './api'

/**
 * 읽어 와서 넣는다. 효과가 끝나면(프로젝트를 옮기거나 다시 읽으면) 늦게 온 앞 응답은 버린다:
 * 그러지 않으면 프로젝트를 빨리 옮길 때 앞 프로젝트의 목록이 뒤에 도착해 새 프로젝트 화면에 남는다.
 */
export function fill<T>(get: () => Promise<T>, set: (v: T) => void, fallback: T): () => void {
  let live = true
  get().then((v) => { if (live) set(v) }, () => { if (live) set(fallback) })
  return () => { live = false }
}

/**
 * 지금 프로젝트의 사이드바·탭 제목이 함께 쓰는 자료: 공유 라이브러리, 메인 노트(원고), 카드, 남은 할 일 수.
 * version이 오르면(파일 변경 알림) 다시 읽는다.
 */
export function useProjectData(rapi: ResearchApi | null, version: number, rid: string | null = null) {
  // 공유 라이브러리 (개념노트·문헌노트, 쓰는 곳)
  const [library, setLibrary] = useState<LibraryInfo | null>(null)
  const [libTick, setLibTick] = useState(0)
  const libraryChanged = useCallback(() => setLibTick((t) => t + 1), [])
  useEffect(() => fill(() => api.library(), setLibrary, null), [version, libTick])
  // 메인 노트 = 원고 (research.yaml sources.manuscript, 여럿일 수 있음) — 없으면 빈 목록
  const [manuscripts, setManuscripts] = useState<ManuscriptInfo[]>([])
  useEffect(() => {
    if (!rapi) return setManuscripts([])
    return fill(() => rapi.manuscripts(), setManuscripts, [])
  }, [rapi, version])
  // 소문제 카드 (research.yaml topics:) — 없으면 빈 목록
  const [topics, setTopics] = useState<Topic[]>([])
  useEffect(() => {
    if (!rapi) return setTopics([])
    return fill(() => rapi.topics(), setTopics, [])
  }, [rapi, version])
  // 사이드바 "할 일"의 수
  const [todoCount, setTodoCount] = useState<number | null>(null)
  useEffect(() => {
    if (!rapi) return setTodoCount(null)
    return fill(() => rapi.journal(365).then((r) => r.entries.filter((e) => e.kind === 'todo' && !e.done).length), setTodoCount, null)
  }, [rapi, version])
  // 노트 한 목록 (연구노트·계산 노트·보조 노트, 10/5): 왼쪽 사이드바 나무 · 위치 표시 · 오른쪽 사이드바 정보
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [noteTick, setNoteTick] = useState(0)
  const notesChanged = useCallback(() => setNoteTick((t) => t + 1), [])
  useEffect(() => {
    if (!rid) return setNotes([])
    return fill(() => notesApi(rid).list(), setNotes, [])
  }, [rid, version, noteTick])
  return { library, libraryChanged, manuscripts, topics, todoCount, notes, notesChanged }
}
