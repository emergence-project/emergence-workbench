// ---------- 노트 기록 · PDF 코멘트 (서버 comments.ts) ----------
import type {
  CommentAdded, CommentChangeBody, CommentFile as CommentFileReply, CommentOverview, CommentState, NewCommentBody, NoteHighlight as NoteHighlightReply, RecordList,
} from '@rw/core/contract/comments'
import type { RecordsPublished, UnpublishedFiles } from '@rw/core/contract/feedback'
import { enc, json, req, send } from './http'

export type { CommentKind, CommentState, CommentEntry, RecordFile, PendingQuestion } from '@rw/core/contract/comments'
export type { RecordsPublished } from '@rw/core/contract/feedback'
/**
 * 논문 하이라이트(PaperHighlight)도 받는 공통 모양: 노트 기록의 하이라이트는 종류 · 위치 · 본문 · 상태까지 함께 온다.
 * 화면(Comments.tsx)이 노트 기록 파일과 논문 코멘트 파일을 같은 CommentFile로 다루므로 계약보다 넓게 둔다.
 */
export type NoteHighlight = Pick<NoteHighlightReply, 'id' | 'rects' | 'color'> & Partial<Omit<NoteHighlightReply, 'id' | 'rects' | 'color'>>
export type CommentFile = Omit<CommentFileReply, 'highlights'> & { highlights: NoteHighlight[] }
export type NewComment = NewCommentBody
export type CommentChange = CommentChangeBody

export function commentsApi(rid: string) {
  const base = `/api/researches/${enc(rid)}/comments`
  const t = (target: string) => `${base}/${enc(target)}`
  return {
    records: () => req(`/api/researches/${enc(rid)}/records`).then((r) => json<RecordList>(r)),
    overview: () => req(base).then((r) => json<CommentOverview>(r)),
    read: (target: string) => req(t(target)).then((r) => json<CommentFileReply>(r)),
    classify: (target: string, baseHash: string) => req(`${t(target)}/classify`, send('POST', { baseHash })).then((r) => json<CommentFileReply>(r)),
    add: (target: string, c: NewComment) => req(t(target), send('POST', c)).then((r) => json<CommentAdded>(r)),
    setState: (target: string, id: string, state: CommentState, baseHash: string) =>
      req(`${t(target)}/${enc(id)}`, send('PATCH', { state, baseHash })).then((r) => json<CommentFileReply>(r)),
    update: (target: string, id: string, change: CommentChange) =>
      req(`${t(target)}/${enc(id)}`, send('PATCH', change)).then((r) => json<CommentFileReply>(r)),
    /** 맥의 Claude(claude -p)에게 이 질문을 넘긴다. 답을 덧붙인 파일이 올 때까지(몇 분) 기다린다 */
    answer: (target: string, id: string) => req(`${t(target)}/${enc(id)}/answer`, { method: 'POST' }).then((r) => json<CommentFileReply>(r)),
    /** 답에 든 고침(before/after)을 노트에 적용한다. answer: 답 번호, baseHash: 기록 파일 hash */
    apply: (target: string, id: string, answer: number, baseHash: string) =>
      req(`${t(target)}/${enc(id)}/apply`, send('POST', { answer, baseHash })).then((r) => json<CommentFileReply>(r)),
    remove: (target: string, id: string, baseHash: string) =>
      req(`${t(target)}/${enc(id)}?baseHash=${enc(baseHash)}`, { method: 'DELETE' }).then((r) => json<CommentFileReply>(r)),
    /** GitHub에 아직 없는 코멘트 파일 (서버 기록 올리기, PR #22의 /records). 그 기능이 없는 서버면 null */
    unpublished: () => req(`/api/researches/${enc(rid)}/records/unpublished`).then((r) => (r.status === 404 ? null : json<UnpublishedFiles>(r).then((x) => x.files))),
    publish: () => req(`/api/researches/${enc(rid)}/records/publish`, { method: 'POST' }).then((r) => json<RecordsPublished>(r)),
  }
}
