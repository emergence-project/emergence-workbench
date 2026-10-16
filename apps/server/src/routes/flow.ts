// 연구 흐름 (주제 화면의 흐름, workbench/flow/*.yaml). 요청·응답 모양은 @rw/core/contract/flow
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/flow'
import { parseBody, replies } from '../contract.js'
import { checkFlowEvidence, createFlowNode, deleteFlowNode, patchFlowNode, scanFlow, setFlowLayout, setFlowRows } from '../flow.js'
import { t } from '../i18n.js'
import { WorkbenchError } from '../workbench.js'
import type { RouteContext } from './context.js'

export function registerFlow(app: FastifyInstance, ctx: RouteContext): void {
  const { wbOf } = ctx
  /** 흐름의 점 전부 (날짜 순)와 파일 형식 진단. 주제마다 거르는 것은 화면이 한다 (점의 topics) */
  app.get<{ Params: { rid: string } }>('/api/researches/:rid/flow', replies(C.FlowScan), async (req): Promise<C.FlowScan> => scanFlow(wbOf(req.params.rid)))
  /** 새 점 (파일 이름은 짧은 제목에서) */
  app.post<{ Params: { rid: string } }>('/api/researches/:rid/flow', replies(C.FlowOne), async (req): Promise<C.FlowOne> =>
    ({ node: createFlowNode(wbOf(req.params.rid), parseBody(C.NewFlowBody, req.body)) }))
  /** 손으로 옮긴 자리 정하기·풀기 (at: null) */
  app.put<{ Params: { rid: string } }>('/api/researches/:rid/flow/layout', replies(C.FlowLayoutReply), async (req): Promise<C.FlowLayoutReply> =>
    ({ layout: setFlowLayout(wbOf(req.params.rid), parseBody(C.FlowLayoutBody, req.body)) }))
  /** 보이는 줄 (＋ 줄 · ×): 중심선 기준 맨 위·맨 아래 */
  app.put<{ Params: { rid: string } }>('/api/researches/:rid/flow/rows', replies(C.FlowRowsReply), async (req): Promise<C.FlowRowsReply> =>
    ({ rows: setFlowRows(wbOf(req.params.rid), parseBody(C.FlowRows, req.body)) }))
  /** 점 고치기: 보낸 칸만 바꾼다 */
  app.patch<{ Params: { rid: string; id: string } }>('/api/researches/:rid/flow/:id', replies(C.FlowOne), async (req): Promise<C.FlowOne> =>
    ({ node: patchFlowNode(wbOf(req.params.rid), req.params.id, parseBody(C.FlowPatchBody, req.body)) }))
  /** 사람 승인·거두기 (확인 기록에 덧붙인다) */
  app.post<{ Params: { rid: string; id: string } }>('/api/researches/:rid/flow/:id/check', replies(C.FlowOne), async (req): Promise<C.FlowOne> =>
    ({ node: checkFlowEvidence(wbOf(req.params.rid), req.params.id, parseBody(C.FlowCheckBody, req.body)) }))
  /** 점 지우기: 이 점을 가리키던 선도 뺀다 */
  app.delete<{ Params: { rid: string; id: string }; Querystring: { baseHash?: string } }>('/api/researches/:rid/flow/:id', replies(C.FlowDeleted), async (req): Promise<C.FlowDeleted> => {
    const baseHash = req.query.baseHash
    if (typeof baseHash !== 'string') throw new WorkbenchError(400, t('baseHash가 필요함', 'baseHash is required'))
    return deleteFlowNode(wbOf(req.params.rid), req.params.id, baseHash)
  })
}
