import { localDate, localTime } from './fsutil.js'

/**
 * 코멘트 기록 파일의 형식 중 노트 코멘트(comments.ts)와 논문 코멘트(paperComments.ts)가 함께 쓰는 것.
 * 둘은 서로를 import하므로 여기 따로 둔다.
 */

/** 질문은 대기·답함·끝냄, 할 일은 대기·끝냄. 나머지는 상태가 없다(null) */
export type CommentState = '대기' | '답함' | '끝냄'
export const COMMENT_STATES: CommentState[] = ['대기', '답함', '끝냄']
export const isCommentState = (s: unknown): s is CommentState => (COMMENT_STATES as unknown[]).includes(s)

/** 답 머리: `### 답 · <이름> · YYYY-MM-DD HH:MM` */
export const ANSWER_RE = /^### 답 · (.+?) · (.+)$/
export const answerHead = (by: string, now: Date) => `### 답 · ${by} · ${localDate(now)} ${localTime(now)}`
