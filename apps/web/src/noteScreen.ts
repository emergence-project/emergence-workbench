import { useSyncExternalStore } from 'react'
import type { NoteHeadPatch } from './api'
import { store } from './store'
import { t } from './i18n'

/**
 * 노트 화면(10/5 시안 "노트 화면")이 여러 부품에 걸쳐 함께 쓰는 작은 상태:
 * - 오른쪽 사이드바의 갈래 (정보 · 적기). 노트 도구 줄의 말풍선이 "적기"로 바꾼다
 * - 지금 연 노트의 절 목차 (왼쪽 사이드바 맨 아래). 지금 칸에서 보이는 노트 탭이 알린다
 */

function tiny<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set(next: T) { if (next === value) return; value = next; listeners.forEach((f) => f()) },
    subscribe(f: () => void) { listeners.add(f); return () => { listeners.delete(f) } },
  }
}

// ---------- 오른쪽 사이드바 갈래 ----------

export type RightMode = 'info' | 'records'
export const normalizeRightMode = (value: string): RightMode => value === 'info' ? 'info' : 'records'
const MODE_KEY = 'rw-right-mode'
const mode = tiny<RightMode>(normalizeRightMode(store.get<string>(MODE_KEY, 'info')))
export const getRightMode = mode.get
export function setRightMode(m: RightMode) { mode.set(m); store.set(MODE_KEY, m) }
export const useRightMode = () => useSyncExternalStore(mode.subscribe, mode.get)

/** 오른쪽 사이드바를 열고 그 갈래를 보여 달라 (App.tsx가 듣는다) */
export const OPEN_RIGHT = 'rw:open-right'
export function openRight(m: RightMode) {
  setRightMode(m)
  window.dispatchEvent(new CustomEvent(OPEN_RIGHT))
}

// ---------- 절 목차 ----------

export interface NoteSection { title: string; level: number }
export interface NoteToc {
  /** 알린 노트 (탭 key). 그 노트만 지울 수 있다 */
  owner: string
  sections: NoteSection[]
  /** 지금 절 (스크롤·커서를 따라감), 없으면 -1 */
  current: number
  jump(i: number): void
}
const toc = tiny<NoteToc | null>(null)
export function publishToc(next: NoteToc | null, owner: string) {
  const now = toc.get()
  if (next === null) { if (now?.owner === owner) toc.set(null); return }
  if (now && now.owner === next.owner && now.current === next.current && now.jump === next.jump
    && now.sections.length === next.sections.length && now.sections.every((s, i) => s.title === next.sections[i]!.title && s.level === next.sections[i]!.level)) return
  toc.set(next)
}
export const useNoteToc = () => useSyncExternalStore(toc.subscribe, toc.get)

/** LaTeX 본문의 \section·\subsection 줄 (줄 번호는 1부터) */
export function latexSections(text: string): (NoteSection & { line: number })[] {
  const out: (NoteSection & { line: number })[] = []
  text.split('\n').forEach((l, i) => {
    const m = /^\s*\\(section|subsection)\*?\{([^}]*)\}/.exec(l)
    if (m) out.push({ title: m[2]!.trim() || t('(제목 없음)', '(untitled)'), level: m[1] === 'section' ? 2 : 3, line: i + 1 })
  })
  return out
}
/** 줄 번호가 든 절 */
export const sectionAtLine = (secs: { line: number }[], line: number) => secs.reduce((cur, s, i) => (s.line <= line ? i : cur), -1)

// ---------- 오른쪽 사이드바의 노트 칸 ----------

/**
 * 오른쪽 사이드바 "정보" 아래에 노트 화면이 자기 것을 그려 넣는 자리 (보조 노트의 증명할 진술 · 기대는 노트 · 다른 방법 · 다음 할 일).
 * 지금 칸에서 보이는 노트만 그린다 (createPortal)
 */
const slot = tiny<HTMLElement | null>(null)
export const setRightSlot = (el: HTMLElement | null) => slot.set(el)
export const useRightSlot = () => useSyncExternalStore(slot.subscribe, slot.get)

// ---------- 오른쪽 사이드바의 머리말 고치기 ----------

/**
 * 열린 보조 노트 화면이 오른쪽 사이드바의 머리말 고치기(성격 · 주제 · 설명 · ★)를 맡는 자리.
 * 사이드바가 파일을 바로 고치면 열린 편집기는 그것을 바깥에서 바뀐 것으로 보고 저장을 멈춘다(충돌).
 * 그래서 노트 화면이 고치던 본문을 먼저 저장하고, 고친 뒤의 파일을 편집기에 반영한다.
 */
export type HeadWriter = (patch: NoteHeadPatch) => Promise<void>
const headWriters = new Map<string, HeadWriter>()
const headKey = (rid: string, file: string) => `${rid}\n${file}`
export function registerHeadWriter(rid: string, file: string, fn: HeadWriter): () => void {
  const k = headKey(rid, file)
  headWriters.set(k, fn)
  return () => { if (headWriters.get(k) === fn) headWriters.delete(k) }
}
export const headWriterOf = (rid: string, file: string) => headWriters.get(headKey(rid, file))
