import type { HookInstallBody, HookView } from '@rw/core/contract/agentHooks'
import { json, req, send } from './http'

export type { HookSession, HookView } from '@rw/core/contract/agentHooks'

/** 밖에서 도는 에이전트의 상태 (설정 › 에이전트 › 상태 알리기, 10/30) */
export const agentHooksApi = {
  get: () => req('/api/agent-hooks').then((r) => json<HookView>(r)),
  install: (body: HookInstallBody) => req('/api/agent-hooks/install', send('POST', body)).then((r) => json<HookView>(r)),
}
