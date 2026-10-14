// ---------- 연구 흐름 (주제 화면의 흐름, 10/14): workbench/flow/*.yaml, 서버 flow.ts. 형식은 docs/repo-format.md §14 ----------
import { enc, json, req } from './http'

// 타입은 서버와 같은 계약에서 (packages/core/src/contract/flow.ts). 타입만 가져와 번들에 zod가 들어가지 않는다
import type { FlowScan } from '@rw/core/contract/flow'
export type { FlowEdge, FlowEvidence, FlowKind, FlowNode, FlowProgress, FlowResult, FlowScan } from '@rw/core/contract/flow'

export const flowApi = (rid: string) => ({
  scan: () => req(`/api/researches/${enc(rid)}/flow`).then((r) => json<FlowScan>(r)),
})
