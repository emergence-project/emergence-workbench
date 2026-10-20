// ---------- 연구 흐름 (주제 화면의 흐름, 10/14): workbench/flow/*.yaml, 서버 flow.ts. 형식은 docs/repo-format.md §14 ----------
import { enc, json, req, send } from './http'

// 타입은 서버와 같은 계약에서 (packages/core/src/contract/flow.ts). 타입만 가져와 번들에 zod가 들어가지 않는다
import type { FlowCheckBody, FlowDeleted, FlowLayoutBody, FlowLayoutReply, FlowOne, FlowPatchBody, FlowRowMove, FlowRows, FlowRowsReply, FlowScan, FlowSearchReply, NewFlowBody } from '@rw/core/contract/flow'
export type { FlowEdge, FlowEvidence, FlowKind, FlowLayout as FlowCells, FlowNode, FlowPatchBody, FlowProgress, FlowResult, FlowRows, FlowScan, FlowSearchReply, FlowStep, NewFlowBody } from '@rw/core/contract/flow'
export { FLOW_EDGES, FLOW_EVIDENCE, FLOW_FIELDS, FLOW_KINDS, FLOW_PRIORITY, FLOW_PROGRESS, FLOW_REQUIRED, FLOW_RESULTS, flowGate } from '@rw/core'

export const flowApi = (rid: string) => {
  const base = `/api/researches/${enc(rid)}/flow`
  return {
    scan: () => req(base).then((r) => json<FlowScan>(r)),
    create: (body: NewFlowBody) => req(base, send('POST', body)).then((r) => json<FlowOne>(r)).then((r) => r.node),
    /** gate: 끝냄 · 멈춤으로 넘어갈 때 필수 칸을 검사한다 (해결 문턱, 422) */
    patch: (id: string, baseHash: string, set: FlowPatchBody['set'], gate?: boolean) => req(`${base}/${enc(id)}`, send('PATCH', { baseHash, set, ...(gate && { gate }) })).then((r) => json<FlowOne>(r)).then((r) => r.node),
    /** 낱말이 맞는 지난 점 (비슷한 지난 시도) */
    search: (q: string) => req(`${base}/search?q=${enc(q)}`).then((r) => json<FlowSearchReply>(r)).then((r) => r.rows),
    check: (id: string, body: FlowCheckBody) => req(`${base}/${enc(id)}/check`, send('POST', body)).then((r) => json<FlowOne>(r)).then((r) => r.node),
    remove: (id: string, baseHash: string) => req(`${base}/${enc(id)}?baseHash=${enc(baseHash)}`, { method: 'DELETE' }).then((r) => json<FlowDeleted>(r)),
    rows: (body: FlowRows) => req(`${base}/rows`, send('PUT', body)).then((r) => json<FlowRowsReply>(r)).then((r) => r.rows),
    /** 줄 옮기기: 그 줄의 점과 이름이 함께 간다 */
    moveRow: (body: FlowRowMove) => req(`${base}/rows/move`, send('PUT', body)).then((r) => json<FlowRowsReply>(r)),
    place: (body: FlowLayoutBody) => req(`${base}/layout`, send('PUT', body)).then((r) => json<FlowLayoutReply>(r)).then((r) => r.layout),
  }
}
