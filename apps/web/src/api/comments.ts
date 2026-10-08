// ---------- 노트 기록 · PDF 코멘트 (서버 comments.ts) ----------
import { enc, json, req, send } from './http'
import type { PaintColor } from './papers'

/** 코멘트는 예전 입력과 논문 API에서 쓰는 이름. 노트에서는 메모로 읽힌다 */
export type CommentKind = '메모' | '할 일' | '질문' | '하이라이트' | '코멘트'
export type CommentState = '대기' | '답함' | '끝냄'
export interface CommentEntry {
  id: string; kind: CommentKind; where: string; page?: number
  /** 고른 글의 사각형들 [x, y, w, h] — PDF 포인트, 쪽 왼쪽 위 원점 */
  rects: number[][]
  quote?: string; body: string; state: CommentState | null
  color?: PaintColor; line?: number; prefix?: string; suffix?: string
  unsorted?: true; split?: true; lost?: true; journal?: string; journalIndex?: number
  answers: { by: string; at: string; body: string }[]
}
/** 논문 하이라이트도 쓰는 공통 모양. 노트 기록은 종류·본문·상태도 함께 반환한다 */
export interface NoteHighlight {
  id: string; rects: number[][]; color: PaintColor
  page?: number; quote?: string; line?: number; prefix?: string; suffix?: string; lost?: true
  kind?: '하이라이트'; where?: string; body?: string; state?: CommentState | null
  answers?: { by: string; at: string; body: string }[]
}
export interface CommentFile { target: string; title: string; source?: string; hash: string; comments: CommentEntry[]; highlights: NoteHighlight[] }
export interface PendingQuestion { target: string; title: string; source?: string; file: string; id: string; where: string; quote?: string; body: string }
export interface NewComment {
  kind: CommentKind | '자동'; title: string; source?: string; page?: number; rects?: number[][]; quote?: string; text: string
  color?: PaintColor; line?: number; prefix?: string; suffix?: string
}
export interface RecordFile extends Omit<CommentFile, 'highlights'> {}
export interface CommentChange { text?: string; state?: CommentState; color?: PaintColor; baseHash: string }

export function commentsApi(rid: string) {
  const base = `/api/researches/${enc(rid)}/comments`
  const t = (target: string) => `${base}/${enc(target)}`
  return {
    records: () => req(`/api/researches/${enc(rid)}/records`).then((r) => json<{ files: RecordFile[] }>(r)),
    overview: () => req(base).then((r) => json<{ files: { target: string; title: string; source?: string; count: number }[]; pending: PendingQuestion[] }>(r)),
    read: (target: string) => req(t(target)).then((r) => json<CommentFile>(r)),
    classify: (target: string, baseHash: string) => req(`${t(target)}/classify`, send('POST', { baseHash })).then((r) => json<CommentFile>(r)),
    add: (target: string, c: NewComment) => req(t(target), send('POST', c)).then((r) => json<{ entry: CommentEntry; hash: string }>(r)),
    setState: (target: string, id: string, state: CommentState, baseHash: string) =>
      req(`${t(target)}/${enc(id)}`, send('PATCH', { state, baseHash })).then((r) => json<CommentFile>(r)),
    update: (target: string, id: string, change: CommentChange) =>
      req(`${t(target)}/${enc(id)}`, send('PATCH', change)).then((r) => json<CommentFile>(r)),
    /** 맥의 Claude(claude -p)에게 이 질문을 넘긴다. 답을 덧붙인 파일이 올 때까지(몇 분) 기다린다 */
    answer: (target: string, id: string) => req(`${t(target)}/${enc(id)}/answer`, { method: 'POST' }).then((r) => json<CommentFile>(r)),
    /** 답에 든 고침(before/after)을 노트에 적용한다. answer: 답 번호, baseHash: 기록 파일 hash */
    apply: (target: string, id: string, answer: number, baseHash: string) =>
      req(`${t(target)}/${enc(id)}/apply`, send('POST', { answer, baseHash })).then((r) => json<CommentFile>(r)),
    remove: (target: string, id: string, baseHash: string) =>
      req(`${t(target)}/${enc(id)}?baseHash=${enc(baseHash)}`, { method: 'DELETE' }).then((r) => json<CommentFile>(r)),
    /** GitHub에 아직 없는 코멘트 파일 (서버 기록 올리기, PR #22의 /records). 그 기능이 없는 서버면 null */
    unpublished: () => req(`/api/researches/${enc(rid)}/records/unpublished`).then((r) => (r.status === 404 ? null : json<{ files: string[] }>(r).then((x) => x.files))),
    publish: () => req(`/api/researches/${enc(rid)}/records/publish`, { method: 'POST' }).then((r) => json<{ commit: string | null; pushed: boolean; message: string }>(r)),
  }
}
