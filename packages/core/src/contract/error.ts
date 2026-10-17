/**
 * 모든 JSON API의 오류 응답(4xx·5xx) 계약: 서버 오류 처리기(apps/server/src/app.ts setErrorHandler)와
 * 오류를 직접 보내는 라우트가 이 모양으로 보내고, 화면은 api/http.ts의 json()이 읽는다.
 * 테스트에서는 checkReplies(apps/server/src/contract.ts)가 replies()를 붙인 라우트의 오류 몸도 이것으로 검사한다.
 */
import { z } from 'zod'

export const ErrorReply = z.object({
  /** 사람이 읽는 오류 문장 (화면 언어) */
  error: z.string(),
  /** 409(ConflictError): 지금 파일의 hash. 화면은 이것으로 다시 읽고 고른다 */
  currentHash: z.string().optional(),
  /** 428(POST /api/agent-edits/write, 확인된 노트): 시도를 지울 때 쓰는 대상 키 */
  key: z.string().optional(),
}).strict()
export type ErrorReply = z.infer<typeof ErrorReply>
