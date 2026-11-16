/**
 * 파일 이력 API의 계약 (11/16 시안 N7ik 2절 ③′ 이력 보기). 서버 fileHistory.ts · routes/history.ts, 화면 api/history.ts · NoteHistory.tsx.
 * 노트 파일을 고친 커밋 목록과, 고른 커밋(들)의 전 · 후 글.
 */
import { z } from 'zod'

export const FileCommit = z.object({
  hash: z.string(),
  short: z.string(),
  /** 커밋한 때 (ISO) */
  at: z.string(),
  subject: z.string(),
  /** 작성자와 Co-Authored-By. agent는 에이전트(Claude · Codex …)인지 */
  authors: z.array(z.object({ name: z.string(), agent: z.boolean() }).strict()),
  /** 그 커밋 때의 파일 경로 (이름을 바꾼 이력을 따라감) */
  path: z.string(),
}).strict()

export const FileHistory = z.object({ commits: z.array(FileCommit) }).strict()

export const FileVersions = z.object({
  before: z.string(),
  after: z.string(),
  /** 고른 커밋이 이 파일의 이력에 있는지 */
  found: z.boolean(),
}).strict()

export type FileCommit = z.infer<typeof FileCommit>
export type FileHistory = z.infer<typeof FileHistory>
export type FileVersions = z.infer<typeof FileVersions>
