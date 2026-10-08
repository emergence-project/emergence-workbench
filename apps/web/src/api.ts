/**
 * 서버 호출. 갈래마다 api/<갈래>.ts에 타입과 호출을 두고, 여기서는 다시 내보내기만 한다.
 * 새 갈래는 api/에 파일을 만들고 아래에 한 줄을 더한다 (화면 파일은 계속 './api'에서 가져온다).
 */
import { feedbackCalls } from './api/feedback'
import { libraryCalls } from './api/library'
import { researchApi, researchListCalls } from './api/research'
import { settingsCalls } from './api/settings'

export { ConflictError, req } from './api/http'
export * from './api/research'
export * from './api/library'
export * from './api/feedback'
export * from './api/settings'
export * from './api/knowledge'
export * from './api/concepts'
export * from './api/comments'
export * from './api/google'
export * from './api/backup'
export * from './api/latex'
export * from './api/network'
export * from './api/noteExport'
export * from './api/register'
export * from './api/search'
export * from './api/learn'
export * from './api/notes'
export * from './api/papers'
export * from './api/figures'
export * from './api/tasks'
export * from './api/agentEdits'

export const api = {
  ...researchListCalls,
  ...feedbackCalls,
  ...libraryCalls,
  ...settingsCalls,
  research: researchApi,
}

export * from './api/subjects'
