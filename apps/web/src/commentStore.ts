import { canonicalNoteFile, commentTargetSlug as slug } from '@rw/core'
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { commentsApi, papersApi, type CommentFile, type CommentKind, type CommentState, type NewComment } from './api'
import type { Tab } from './Workspace'
import { openRight } from './noteScreen'
import { t } from './i18n'
import { qk, queryClient } from './queries'

/**
 * PDF 코멘트·질문 (구조 제안 §4·§6). 대상마다 workbench/comments/<대상>.md.
 * - 자료 PDF(논문) `paper-<파일 이름>`, 원고 PDF `manuscript`
 * - PDF 칸 가운데 위 도구 막대의 코멘트·질문, 또는 글을 끌어 고르면 뜨는 메뉴로 남긴다
 * - 맥락 칸에 지금 대상의 코멘트, 에이전트 함에 이 프로젝트의 대기 중인 질문
 */

export interface CommentTarget {
  target: string
  /** 파일 머리에 쓸 이름 */
  title: string
  /** 원래 파일 (자료 PDF 이름, 작업노트 id) */
  source?: string
}
export const paperTarget = (name: string): CommentTarget => ({ target: `paper-${slug(name.replace(/\.pdf$/i, ''))}`, title: `자료 ${name}`, source: name })
/** 원고 PDF. 메인 노트가 여럿이면 둘째부터 `manuscript-<key>` */
/** 주제에 붙는 기록 (10/15 09:51 피드백: 기록이 무엇에 대한 것인지 남게) */
export const topicTarget = (tid: string, title: string): CommentTarget => ({ target: `topic-${slug(tid)}`, title: `주제 ${title}`, source: tid })
/** 맡긴 일 보고서에 붙는 기록 (10/29 19:47: 보고서에서도 글을 골라 코멘트 · 질문) */
export const taskTarget = (id: string, title: string): CommentTarget => ({ target: `task-${slug(id)}`, title: `맡긴 일 ${title}`, source: id })
export const manuscriptTarget = (name?: string, ms?: string): CommentTarget => ({ target: ms ? `manuscript-${slug(ms)}` : 'manuscript', title: `원고 PDF${name ? ` ${name}` : ''}` })
/** Markdown 연구·계산 노트 (같은 폴더 이름이어도 기록 대상은 나눈다). 주제 폴더 안 노트는 notes/의 노트와 같은 대상 (주제를 바꿔 옮겨도 코멘트가 따라간다) */
const NOTE_FILE = /^workbench\/(notes|calc)\/([^/]+)\/note\.md$/
export const noteTarget = (file: string, title?: string): CommentTarget | null => {
  const m = NOTE_FILE.exec(canonicalNoteFile(file))
  return m ? { target: `${m[1] === 'calc' ? 'calc' : 'note'}-${slug(m[2]!)}`, title: `노트 ${title ?? m[2]}`, source: file } : null
}

/** 작업 화면 탭의 코멘트 대상. PDF가 아닌 탭은 null */
export function targetOfTab(t: Tab | undefined, titleOf: (t: Tab) => string): CommentTarget | null {
  if (!t) return null
  if (t.k === 'doc') return /\.pdf$/i.test(t.name) ? paperTarget(t.name) : null
  if (t.k === 'mspdf') return manuscriptTarget(undefined, t.ms)
  if (t.k === 'part') return noteTarget(t.file, titleOf(t))
  if (t.k === 'statement') return { target: `statement-${slug(t.sid)}`, title: `진술 ${titleOf(t)}`, source: t.sid }
  if (t.k === 'topic') return topicTarget(t.tid, titleOf(t))
  if (t.k === 'task') return taskTarget(t.task, titleOf(t))
  return null
}

// ---------- 코멘트를 읽고 쓰는 곳 ----------

/**
 * 라이브러리 논문의 코멘트는 프로젝트가 아니라 shared-library/comments/<키>/에 있다 (논문 라이브러리 3단계).
 * 그 논문들은 rid 자리에 이 값을 쓰고, 대상은 `paper-<bib 키>`다. 화면 부품(PDF·쓰는 칸·목록)은 연구노트 PDF와 같다.
 */
export const LIBRARY = '@library'
export const libraryPaperTarget = (key: string, title: string): CommentTarget => ({ target: `paper-${key}`, title, source: `${key}.pdf` })
interface Backend {
  read(target: string): Promise<CommentFile>
  add(target: string, c: NewComment & { kind: CommentKind; pageHeight?: number }): Promise<string>
  setState(target: string, id: string, state: CommentState, baseHash: string): Promise<CommentFile>
  answer(target: string, id: string): Promise<CommentFile>
  remove(target: string, id: string, baseHash: string): Promise<CommentFile>
  /** 쓰는 칸 아래에 보일 저장 위치 */
  where(target: string): string
}
export const keyOfPaper = (target: string) => target.replace(/^paper-/, '')
export function backend(rid: string): Backend {
  if (rid === LIBRARY) {
    return {
      read: (t) => papersApi.comments(keyOfPaper(t)),
      add: (t, c) => papersApi.addComment(keyOfPaper(t), { kind: c.kind, text: c.text, page: c.page, rects: c.rects, pageHeight: c.pageHeight, quote: c.quote, color: c.color }).then((r) => r.id),
      setState: (t, id, state, h) => papersApi.updateComment(keyOfPaper(t), id, { state }, h),
      answer: (t, id) => papersApi.answer(keyOfPaper(t), id),
      remove: (t, id, h) => papersApi.removeComment(keyOfPaper(t), id, h),
      where: (t) => `shared-library/comments/${keyOfPaper(t)}/`,
    }
  }
  const api = commentsApi(rid)
  return {
    read: api.read, add: (t, c) => api.add(t, c).then((r) => r.entry.id), setState: api.setState, answer: api.answer, remove: api.remove,
    where: (t) => `workbench/comments/${t}.md`,
  }
}

// ---------- 같은 대상을 보는 화면들(PDF 탭·맥락 칸)이 함께 쓰는 상태 ----------

interface Slot { file: CommentFile | null; active: string | null; reveal: { id: string; nonce: number } | null; error: string | null }
const slots = new Map<string, Slot>()
const listeners = new Map<string, Set<() => void>>()
export const keyOf = (rid: string, target: string) => `${rid}|${target}`
const EMPTY: Slot = { file: null, active: null, reveal: null, error: null }
export function patch(key: string, p: Partial<Slot>) {
  slots.set(key, { ...(slots.get(key) ?? EMPTY), ...p })
  listeners.get(key)?.forEach((f) => f())
}
const loading = new Map<string, Promise<void>>()
export function load(rid: string, target: string, fresh = false): Promise<void> {
  const key = keyOf(rid, target)
  const prev = loading.get(key)
  if (prev) return fresh ? prev.then(() => load(rid, target)) : prev
  // 읽기 실패를 삼키면 화면이 "불러오는 중…"에 영원히 머문다. 오류 글을 슬롯에 적어 보여 준다
  const p = backend(rid).read(target).then((file) => patch(key, { file, error: null })).catch((e: Error) => patch(key, { error: e.message })).finally(() => loading.delete(key))
  loading.set(key, p)
  return p
}
/** 파일이 바뀌었다는 알림 (App의 파일 감시 구독에서 부른다) */
export function commentsChanged(rid: string, target: string) {
  if (listeners.get(keyOf(rid, target))?.size) void load(rid, target)
  bumpPending()
}
/** 에이전트 함을 다시 읽게 한다 */
export function bumpPending() {
  // 기록 모음(작업 탭 · 오른쪽 기록 패널, qk.records)도 다시 받는다
  void queryClient.invalidateQueries({ queryKey: ['project'], predicate: (q) => q.queryKey[2] === 'records' })
  pendingTick++
  pendingListeners.forEach((f) => f())
}
/** 이 코멘트를 PDF에서 보여 달라 (에이전트 함에서 누를 때) */
export function revealComment(rid: string, target: string, id: string) {
  patch(keyOf(rid, target), { active: id, reveal: { id, nonce: Date.now() } })
}

export function useSlot(rid: string, target: string, read = true): Slot {
  const key = keyOf(rid, target)
  const subscribe = useCallback((f: () => void) => {
    const set = listeners.get(key) ?? new Set()
    set.add(f)
    listeners.set(key, set)
    return () => { set.delete(f) }
  }, [key])
  const slot = useSyncExternalStore(subscribe, () => slots.get(key) ?? EMPTY)
  useEffect(() => { if (read) void load(rid, target) }, [rid, target, read])
  return slot
}

let pendingTick = 0
const pendingListeners = new Set<() => void>()
export const usePendingTick = () => useSyncExternalStore((f) => { pendingListeners.add(f); return () => { pendingListeners.delete(f) } }, () => pendingTick)

/** 맥락 칸을 열어 달라는 알림 (App.tsx가 듣는다) */
export const OPEN_CONTEXT = 'rw:open-context'

/** Viewing an existing record must leave the unfinished composer and its quote intact. */
export function openRecordsSidebar(rid: string) {
  openRight('records')
  if (rid === LIBRARY) window.dispatchEvent(new Event(OPEN_CONTEXT))
}

// ---------- Claude에게 넘긴 질문 (화면을 옮겨도 "답을 쓰는 중"과 오류가 남게) ----------

export const asking = new Set<string>()
export const askErrors = new Map<string, string>()
let askTick = 0
const askListeners = new Set<() => void>()
export const askKey = (rid: string, target: string, id: string) => `${rid}|${target}|${id}`
function bumpAsk() { askTick++; askListeners.forEach((f) => f()) }
export function useAskTick() { return useSyncExternalStore((f) => { askListeners.add(f); return () => { askListeners.delete(f) } }, () => askTick) }
/** 질문을 이 컴퓨터의 Claude에게 넘기고, 답이 오면 그 파일을 다시 그린다. 기다리지 않아도 된다 */
export async function askClaude(rid: string, target: string, id: string): Promise<void> {
  const k = askKey(rid, target, id)
  if (asking.has(k)) return
  asking.add(k); askErrors.delete(k); bumpAsk()
  try { patch(keyOf(rid, target), { file: await backend(rid).answer(target, id) }); bumpPending() } catch (e) {
    askErrors.set(k, t(`에이전트에게 보내지 못했습니다 — ${(e as Error).message}`, `Could not send to the agent: ${(e as Error).message}`))
  } finally { asking.delete(k); bumpAsk() }
}

// ---------- PDF + 코멘트 ----------
