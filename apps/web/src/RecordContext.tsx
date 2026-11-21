import { createContext, useContext, useSyncExternalStore } from 'react'
import type { PaintColor } from './api'
import type { PaintedRecord } from './recordHelpers'
import type { RecordAnchor } from './recordAnchors'
import { openRight } from './noteScreen'
import { placeOf } from './screenView'
import { parseRoute } from './router'

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
  fill?: { text: string; kind: '메모' | '할 일' | '질문' }
}
let composerRequest: RecordComposerRequest | null = null
let requestNonce = 0
const requestListeners = new Set<() => void>()
const selections = new Map<string, RecordDraft>()
/** 마지막으로 고른 글: 선택이 풀리거나 화면이 닫혀도 남긴다 (입력란 ＋「고른 글 붙이기」가 옮기는 사이 사라지지 않게) */
export interface LastSelection { rid?: string; target: string; quote: string; line?: number }
let lastSelection: LastSelection | null = null
export const lastRecordSelection = () => lastSelection
export function setRecordSelectionDraft(rid: string, target: string, draft: RecordDraft | null) {
  const key = `${rid}|${target}`
  if (draft) selections.set(key, draft); else selections.delete(key)
  if (draft?.quote?.trim()) lastSelection = { rid, target, quote: draft.quote, ...(draft.line && { line: draft.line }) }
}
/**
 * 노트 밖 어느 화면에서 고른 글도 마지막으로 고른 글로 남긴다 (11/19 피드백 "앱의 모든 페이지에서 텍스트를 대화에 컨텍스트로").
 * 노트 · 보고서 본문(.note-ask)은 줄 위치까지 setRecordSelectionDraft가 남기고, 입력칸 · 편집기는 건너뛴다. main.tsx가 한 번 켠다
 */
export function watchPageSelection() {
  let timer: ReturnType<typeof setTimeout>
  const onUp = (event: Event) => {
    if (event instanceof KeyboardEvent && event.key !== 'Shift' && !event.key.startsWith('Arrow')) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      const s = window.getSelection()
      const quote = s?.toString().trim()
      if (!s || !quote) return
      const element = s.anchorNode instanceof Element ? s.anchorNode : s.anchorNode?.parentElement
      if (!element || element.closest('.note-ask, input, textarea, [contenteditable="true"], .cn-edit')) return
      const route = parseRoute(location.hash)
      lastSelection = { ...('rid' in route && route.rid && { rid: route.rid }), target: placeOf(document.title).join(' › ') || route.page, quote: quote.slice(0, 4000) }
    }, 0)
  }
  document.addEventListener('mouseup', onUp)
  document.addEventListener('keyup', onUp)
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
/** 본문에서 고른 글. 그림 캡션이면 가리킨 곳(part · partText)에 그 그림이 함께 온다 */
export interface RecordSelection extends RecordAnchor, RecordPoint { part?: string; partText?: string }
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
