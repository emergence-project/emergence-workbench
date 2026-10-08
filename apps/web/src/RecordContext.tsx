import { createContext, useContext, useSyncExternalStore } from 'react'
import type { NoteHighlight, PaintColor } from './api'
import type { RecordAnchor } from './recordAnchors'
import { openRight } from './noteScreen'

export interface RecordDraft {
  quote?: string; line?: number; prefix?: string; suffix?: string; color?: PaintColor
  page?: number; rects?: number[][]; pageHeight?: number
}
interface RecordDraftTarget { target: string; title: string; source?: string }
export interface RecordComposerRequest {
  rid: string; target: RecordDraftTarget; draft: RecordDraft; nonce: number
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
export function openRecordComposer(rid: string, target: RecordDraftTarget, draft?: RecordDraft) {
  composerRequest = { rid, target, draft: draft ?? selections.get(`${rid}|${target.target}`) ?? {}, nonce: ++requestNonce }
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
  highlights: NoteHighlight[]
  reveal?: RecordDraft & { id: string; nonce: number }
  onSelect(selection: RecordSelection | null): void
  onHighlight(id: string, point: RecordPoint): void
}

export const RecordContext = createContext<NoteRecordsContext | null>(null)
export const useRecordContext = () => useContext(RecordContext)
