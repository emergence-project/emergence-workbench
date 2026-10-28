import { createContext, useContext, useSyncExternalStore } from 'react'
import type { PaintColor } from './api'
import type { PaintedRecord } from './recordHelpers'
import type { RecordAnchor } from './recordAnchors'
import { openRight } from './noteScreen'

export interface RecordDraft {
  quote?: string; line?: number; prefix?: string; suffix?: string; color?: PaintColor
  page?: number; rects?: number[][]; pageHeight?: number
  /** 가리킨 화면 부위와 그 글자 (10/15, 피드백 모드와 같은 이름) */
  part?: string; partText?: string
}
interface RecordDraftTarget { target: string; title: string; source?: string }
export interface RecordComposerRequest {
  rid: string; target: RecordDraftTarget; draft: RecordDraft; nonce: number
  /** 적기 칸에 미리 채울 글과 종류 (에이전트 대화의 「기록으로 남기기」 초안, 10/28) */
  fill?: { text: string; kind: '메모' | '할 일' | '질문' | '지시' }
}
let composerRequest: RecordComposerRequest | null = null
let requestNonce = 0
const requestListeners = new Set<() => void>()
const selections = new Map<string, RecordDraft>()
export function setRecordSelectionDraft(rid: string, target: string, draft: RecordDraft | null) {
  const key = `${rid}|${target}`
  if (draft) selections.set(key, draft); else selections.delete(key)
}
/** Keep the quote until a sidebar that was closed has mounted and consumed it. */
export function openRecordComposer(rid: string, target: RecordDraftTarget, draft?: RecordDraft, fill?: RecordComposerRequest['fill']) {
  composerRequest = { rid, target, draft: draft ?? selections.get(`${rid}|${target.target}`) ?? {}, nonce: ++requestNonce, ...(fill && { fill }) }
  requestListeners.forEach((listener) => listener())
  openRight('records')
}
export function clearRecordComposerRequest(nonce: number) {
  if (composerRequest?.nonce !== nonce) return
  composerRequest = null
  requestListeners.forEach((listener) => listener())
}
export const useRecordComposerRequest = () => useSyncExternalStore(
  (listener) => { requestListeners.add(listener); return () => { requestListeners.delete(listener) } },
  () => composerRequest,
)

export interface RecordPoint { x: number; y: number }
export interface RecordSelection extends RecordAnchor, RecordPoint {}
export interface NoteRecordsContext {
  /** Entire source file, including front matter: server anchors use file line numbers. */
  source: string
  contentOffset: number
  highlights: PaintedRecord[]
  reveal?: RecordDraft & { id: string; nonce: number }
  onSelect(selection: RecordSelection | null): void
  onHighlight(id: string, point: RecordPoint): void
}

export const RecordContext = createContext<NoteRecordsContext | null>(null)
export const useRecordContext = () => useContext(RecordContext)
