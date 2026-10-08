import { useSyncExternalStore } from 'react'
import type { CompileResult, ManuscriptCompileResult, ManuscriptPdfStatus, PdfBox } from './api'
import { locale, t } from './i18n'

/**
 * 블록 하나의 편집 탭과 결과 PDF 탭이 함께 보는 상태. 두 탭은 서로 다른 칸에 있을 수 있다.
 * - 편집 탭이 컴파일하면 PDF 탭이 새 PDF를 그린다 (pdfVersion)
 * - 편집기 커서 줄에 맞는 PDF 위치를 PDF 탭이 표시한다 (highlight)
 * - PDF를 누르면 편집 탭이 그 원고 줄로 간다 (handlers.pick). 편집 탭이 닫혀 있으면 PDF 탭이 블록을 연다
 */
export interface BlockSession {
  pdfVersion: number | null
  highlight: PdfBox[]
  compiling: boolean
  result: CompileResult | null
  pendingParts?: Record<string, PartSaveState>
  manuscriptPdf?: ManuscriptPdfStatus
  /** PDF를 눌러 고른 원고 위치 — 그 장의 편집 탭이 받아 그 줄로 간다 (nonce로 같은 위치도 다시) */
  reveal?: { file: string; line: number; nonce: number }
  /** 보조 노트 결과 PDF가 지금 노트의 것인지 (stale = 노트를 PDF 뒤에 고침) */
  blockPdf?: { hasPdf: boolean; pdfAt?: string; stale: boolean }
}
export interface BlockHandlers {
  pick?(page: number, x: number, y: number, text: string): void
  compile?(): void
}

const EMPTY: BlockSession = { pdfVersion: null, highlight: [], compiling: false, result: null }
const sessions = new Map<string, BlockSession>()
const handlers = new Map<string, BlockHandlers>()
const listeners = new Set<() => void>()

export const sessionKey = (rid: string, bid: string) => `${rid}/${bid}`

export function getSession(key: string): BlockSession { return sessions.get(key) ?? EMPTY }

export function setSession(key: string, patch: Partial<BlockSession>): void {
  sessions.set(key, { ...getSession(key), ...patch })
  for (const l of listeners) l()
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export function useSession(key: string): BlockSession {
  return useSyncExternalStore(subscribe, () => getSession(key))
}

/** 편집 탭이 열려 있는 동안 등록한다. 돌려주는 함수로 해제 */
export function registerHandlers(key: string, h: BlockHandlers): () => void {
  handlers.set(key, h)
  return () => { if (handlers.get(key) === h) handlers.delete(key) }
}
export function handlersOf(key: string): BlockHandlers { return handlers.get(key) ?? {} }

export type PartSaveState = 'saved' | 'dirty' | 'editing' | 'saving' | 'conflict' | 'error'

// Update synchronously so another pane cannot compile before React renders the edit.
export function setPartSaveState(key: string, file: string, state: PartSaveState): void {
  const pending = getSession(key).pendingParts ?? {}
  if ((pending[file] ?? 'saved') === state) return
  const next = { ...pending }
  if (state === 'saved') delete next[file]
  else next[file] = state
  setSession(key, { pendingParts: next })
}

/**
 * 장 탭이 닫힌 뒤 남길 상태. 탭 없이도 끝나는 자동 저장(dirty·saving)만 남기고,
 * 고치는 중·충돌·오류는 탭과 함께 지운다 (닫힌 탭 때문에 컴파일이 계속 막히지 않게)
 */
export const partStateWithoutTab = (state: PartSaveState): PartSaveState => state === 'dirty' || state === 'saving' ? state : 'saved'

export const hasPendingParts = (key: string): boolean => Object.keys(getSession(key).pendingParts ?? {}).length > 0
const pdfRequests = new Map<string, number>()
export function beginManuscriptRefresh(key: string): number {
  const request = (pdfRequests.get(key) ?? 0) + 1
  pdfRequests.set(key, request)
  return request
}

export function applyManuscriptPdf(key: string, status: ManuscriptPdfStatus, request?: number): boolean {
  const s = getSession(key)
  if (request !== undefined && (s.compiling || pdfRequests.get(key) !== request)) return false
  // 오류가 난 컴파일도 새 PDF를 남기므로, 보이는 PDF가 바뀌었는지는 그 PDF의 컴파일 시각으로 본다
  const changed = s.manuscriptPdf?.lastSuccessAt !== status.lastSuccessAt || s.manuscriptPdf?.pdfAt !== status.pdfAt
  setSession(key, {
    manuscriptPdf: { hasPdf: status.hasPdf, pdfState: status.pdfState, lastSuccessAt: status.lastSuccessAt, lastCompile: status.lastCompile, pdfAt: status.pdfAt, pdfErrors: status.pdfErrors },
    pdfVersion: !status.hasPdf ? null : s.pdfVersion === null || changed ? Math.max(Date.now(), (s.pdfVersion ?? 0) + 1) : s.pdfVersion,
  })
  return true
}

export async function runManuscriptCompile(key: string, request: () => Promise<ManuscriptCompileResult>): Promise<void> {
  if (getSession(key).compiling) return
  if (hasPendingParts(key)) throw new Error(t('저장하지 않은 내용이 있습니다. 해당 노트에서 저장하거나 파일을 다시 읽은 뒤 컴파일하세요.', 'There are unsaved changes. Save them in that note or reload the file, then compile.'))
  beginManuscriptRefresh(key)
  setSession(key, { compiling: true })
  try {
    const result = await request()
    applyManuscriptPdf(key, result)
    setSession(key, { result, highlight: [] })
  } catch (error) {
    const previous = getSession(key).manuscriptPdf
    if (previous) applyManuscriptPdf(key, { ...previous, pdfState: 'unknown' })
    throw error
  } finally {
    beginManuscriptRefresh(key)
    setSession(key, { compiling: false })
  }
}

export function manuscriptPdfLabel(status: ManuscriptPdfStatus): string {
  if (!status.hasPdf || status.pdfState === 'missing') return status.lastCompile?.ok === false ? t('컴파일 오류로 PDF를 만들지 못했습니다', 'Compile errors prevented a PDF') : t('아직 PDF가 없습니다', 'No PDF yet')
  const when = (at: string) => new Date(at).toLocaleString(locale())
  const after = status.pdfState === 'stale' ? t(' · 그 뒤 원고가 바뀌었습니다', ' · Manuscript changed after this') : ''
  // 오류가 있어도 만든 PDF는 보여 주고, 오류가 난 결과임을 먼저 알린다 (10/5 사용자 결정)
  if (status.pdfErrors) return `${t('컴파일 오류가 있는 PDF입니다 · 빠지거나 틀린 부분이 있을 수 있습니다', 'This PDF has compile errors · Parts may be missing or wrong')}${after}`
  const at = status.pdfAt ?? status.lastSuccessAt
  if (status.lastCompile?.ok === false && at) return t(`이번 컴파일은 PDF를 만들지 못했습니다 · 보이는 것은 ${when(at)}의 결과`, `This compile made no PDF · Showing the result from ${when(at)}`)
  if (status.pdfState === 'stale') return t('원고가 바뀌었습니다 · PDF는 이전 결과', 'The manuscript changed · PDF is an earlier result')
  if (status.pdfState === 'unknown') return t('PDF 최신 여부를 확인하지 못했습니다', 'Could not check whether the PDF is current')
  return t('현재 원고의 PDF', 'PDF of the current manuscript')
}

/** 노트 도구 줄에 붙이는 짧은 PDF 알림 (C3 "PDF 이전 결과 표시"를 노트 화면에도). 지금 원고의 PDF이거나 PDF가 없으면 null */
export function pdfShortNote(status: Pick<ManuscriptPdfStatus, 'hasPdf' | 'pdfState' | 'pdfErrors' | 'lastCompile'> | undefined): string | null {
  if (!status?.hasPdf || status.pdfState === 'missing') return null
  if (status.pdfErrors) return t('PDF에 오류가 있습니다', 'The PDF has errors')
  if (status.lastCompile?.ok === false) return t('이번 컴파일 실패 · PDF는 이전 결과', 'This compile failed · PDF is an earlier result')
  if (status.pdfState === 'stale') return t('PDF는 이전 결과', 'PDF is an earlier result')
  return null
}
