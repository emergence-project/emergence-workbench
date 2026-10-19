import { useSyncExternalStore, type ReactNode } from 'react'
import { conceptRecordTarget, LIBRARY_RID } from '@rw/core'
import type { CommentEntry, ConceptMd } from './api'
import { NoteAsk, type CommentTarget } from './Comments'
import { RecordsPanel } from './RecordsPanel'
import { sectionAt } from './conceptRecordPlace'
import { t } from './i18n'

/**
 * 개념노트의 기록 (10/18 시안 4절 "개념노트 기록을 프로젝트 기록과 같게"): 프로젝트 노트와 같은 부품을 쓴다.
 * 기록은 <라이브러리>/workbench/comments/concept-<id>.md에 있고, 기록 API의 rid 자리는 LIBRARY_RID다(#168).
 * 기록의 줄 번호는 파일 줄 번호라서, 본문 앞에 머리말 줄 수만큼 빈 줄을 붙인 글을 원문으로 넘긴다.
 */
export const conceptTarget = (id: string, title: string): CommentTarget => ({ target: conceptRecordTarget(id), title: `개념노트 ${title}`, source: `concepts/${id}.md` })

/** 머리말 줄을 빈 줄로 채운 원문 (본문의 n번째 줄이 파일의 n번째 줄이 되게) */
const padded = (note: Pick<ConceptMd, 'body' | 'bodyLine'>, body = note.body) => '\n'.repeat(note.bodyLine - 1) + body

/** 본문에서 글을 골라 하이라이트 · 기록을 단다. shown은 화면에 그린 본문(제목 줄을 뺀 것), 고치는 동안은 편집기의 처음 글 */
export function ConceptRecords({ note, shown, editing = false, children }: { note: ConceptMd; shown: string; editing?: boolean; children: ReactNode }) {
  const source = padded(note, editing ? shown : note.body)
  return <NoteAsk rid={LIBRARY_RID} target={conceptTarget(note.id, note.meta.title)} source={source} contentOffset={source.length - shown.length}>{children}</NoteAsk>
}

// 화면에 열린 개념노트(본문)를 오른쪽 사이드바 기록이 함께 읽는다: 붙은 곳을 절 이름으로 적는다
const shownNotes = new Map<string, ConceptMd>()
const listeners = new Set<() => void>()
export function setShownConcept(note: ConceptMd) {
  if (shownNotes.get(note.id) === note) return
  shownNotes.set(note.id, note)
  listeners.forEach((f) => f())
}
const useShownConcept = (id: string) => useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f) } }, () => shownNotes.get(id))

/** 오른쪽 사이드바 "기록": 프로젝트 기록과 같은 패널. 붙은 곳은 절 이름, 줄 번호는 툴팁 */
export function ConceptRecordsPanel({ id, title }: { id: string; title: string }) {
  const note = useShownConcept(id)
  const source = note && padded(note)
  const placeOf = (c: CommentEntry) => {
    if (!source || !c.line || c.lost || c.page) return undefined
    const section = sectionAt(source, c.line)
    return section ? { label: section, tip: t(`${c.line}줄`, `line ${c.line}`) } : undefined
  }
  return <RecordsPanel rid={LIBRARY_RID} target={conceptTarget(id, note?.meta.title ?? title)} placeOf={placeOf}
    firstPartOf={() => undefined} onOpenPdf={() => false} />
}
