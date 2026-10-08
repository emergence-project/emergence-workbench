import type { JournalEntry } from '@rw/core'
import { useEffect, useRef, useState } from 'react'
import type { ResearchApi } from './api'

/** 첫 화면과 작업 화면이 함께 읽는 일지. 다른 프로젝트의 늦은 응답은 버린다. */
export function useJournal(rapi: ResearchApi, version: number) {
  const [journal, setJournal] = useState<{ rapi: ResearchApi; version: number; entries: JournalEntry[] } | null>(null)
  const request = useRef(0)
  const owner = useRef({ rapi, version })
  owner.current = { rapi, version }
  const reload = async () => {
    // 저장 완료가 늦게 돌아와도 지금 화면의 API와 버전으로 다시 읽는다.
    const currentOwner = owner.current
    const current = ++request.current
    const entries = await currentOwner.rapi.journal(365).then((r) => r.entries).catch(() => [])
    if (current === request.current && currentOwner.rapi === owner.current.rapi && currentOwner.version === owner.current.version) {
      setJournal({ ...currentOwner, entries })
    }
  }
  useEffect(() => {
    void reload()
    return () => { request.current++ }
  }, [rapi, version]) // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (e: JournalEntry) => { rapi.setTodo(e, !e.done).then(reload).catch(() => undefined) }
  return { entries: journal?.rapi === rapi ? journal.entries : [], loaded: journal?.rapi === rapi && journal.version === version, reload, toggle }
}
