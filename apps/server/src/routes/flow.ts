// 연구 흐름 (주제 화면의 흐름, workbench/flow/*.yaml). 요청·응답 모양은 @rw/core/contract/flow
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/flow'
import { parseBody, replies } from '../contract.js'
import { checkFlowEvidence, createFlowNode, deleteFlowNode, judgeFlow, moveFlowRow, patchFlowNode, readFlowNode, reviewFlow, scanFlow, searchFlow, setFlowLayout, setFlowRows } from '../flow.js'
import { closeAfterJudgment } from '../ask.js'
import { startFlow } from '../flowStart.js'
import { t } from '../i18n.js'
import { WorkbenchError } from '../workbench.js'
import type { RouteContext } from './context.js'

export function registerFlow(app: FastifyInstance, ctx: RouteContext): void {
  const { wbOf } = ctx
  /** 흐름의 점 전부 (날짜 순)와 파일 형식 진단. 주제마다 거르는 것은 화면이 한다 (점의 topics) */
  app.get<{ Params: { rid: string } }>('/api/researches/:rid/flow', replies(C.FlowScan), async (req): Promise<C.FlowScan> => scanFlow(wbOf(req.params.rid)))
  /** 지난 시도 찾기 (MCP flow_search): 낱말이 많이 걸린 점부터 한 줄씩 */
  app.get<{ Params: { rid: string }; Querystring: { q?: string } }>('/api/researches/:rid/flow/search', replies(C.FlowSearchReply), async (req): Promise<C.FlowSearchReply> =>
    searchFlow(wbOf(req.params.rid), String(req.query.q ?? '')))
  /** 점 하나 (빈틈 포함) */
  app.get<{ Params: { rid: string; id: string } }>('/api/researches/:rid/flow/:id', replies(C.FlowOne), async (req): Promise<C.FlowOne> =>
    ({ node: readFlowNode(wbOf(req.params.rid), req.params.id) }))
  /** 새 점 (파일 이름은 짧은 제목에서) */
  app.post<{ Params: { rid: string } }>('/api/researches/:rid/flow', replies(C.FlowOne), async (req): Promise<C.FlowOne> =>
    ({ node: createFlowNode(wbOf(req.params.rid), parseBody(C.NewFlowBody, req.body)) }))
  /** 시작 기록과 함께 새 점 (MCP flow_add): 가장 가까운 점이나 왜 새로운지, 판정 기준이 없으면 400이고 아무것도 쓰지 않는다 */
  app.post<{ Params: { rid: string } }>('/api/researches/:rid/flow/start', replies(C.FlowStartReply), async (req): Promise<C.FlowStartReply> =>
    startFlow(wbOf(req.params.rid), parseBody(C.FlowStartBody, req.body)))
  /** 손으로 옮긴 자리 정하기·풀기 (at: null) */
  app.put<{ Params: { rid: string } }>('/api/researches/:rid/flow/layout', replies(C.FlowLayoutReply), async (req): Promise<C.FlowLayoutReply> =>
    ({ layout: setFlowLayout(wbOf(req.params.rid), parseBody(C.FlowLayoutBody, req.body)) }))
  /** 보이는 줄 (＋ 줄 · ×): 중심선 기준 맨 위·맨 아래 */
  app.put<{ Params: { rid: string } }>('/api/researches/:rid/flow/rows', replies(C.FlowRowsReply), async (req): Promise<C.FlowRowsReply> =>
    ({ rows: setFlowRows(wbOf(req.params.rid), parseBody(C.FlowRows, req.body)) }))
  /** 줄 옮기기 (▶ · 줄 이름 끌기): 그 줄의 점과 이름이 함께 옮겨진다 */
  app.put<{ Params: { rid: string } }>('/api/researches/:rid/flow/rows/move', replies(C.FlowRowsReply), async (req): Promise<C.FlowRowsReply> =>
    moveFlowRow(wbOf(req.params.rid), parseBody(C.FlowRowMove, req.body)))
  /** 점 고치기: 보낸 칸만 바꾼다 */
  app.patch<{ Params: { rid: string; id: string } }>('/api/researches/:rid/flow/:id', replies(C.FlowOne), async (req): Promise<C.FlowOne> =>
    ({ node: patchFlowNode(wbOf(req.params.rid), req.params.id, parseBody(C.FlowPatchBody, req.body)) }))
  /** 사람 승인·거두기 (확인 기록에 덧붙인다) */
  app.post<{ Params: { rid: string; id: string } }>('/api/researches/:rid/flow/:id/check', replies(C.FlowOne), async (req): Promise<C.FlowOne> =>
    ({ node: checkFlowEvidence(wbOf(req.params.rid), req.params.id, parseBody(C.FlowCheckBody, req.body)) }))
  /** 사람 판단 (10/23): 발견은 승인 · 수정 · 기각, 카드는 시작 · 수정 · 종료 */
  app.post<{ Params: { rid: string; id: string } }>('/api/researches/:rid/flow/:id/judge', replies(C.FlowOne), async (req): Promise<C.FlowOne> => {
    const wb = wbOf(req.params.rid), body = parseBody(C.FlowJudgeBody, req.body)
    const node = judgeFlow(wb, req.params.id, body)
    // 판단이 끝나면 (승인 · 기각 · 종료) 그 점의 열린 질문을 닫는다
    closeAfterJudgment(wb.root, node.id, body.verdict)
    return { node }
  })
  /** 에이전트 검토 (확인 기록에 role agent로 덧붙인다) */
  app.post<{ Params: { rid: string; id: string } }>('/api/researches/:rid/flow/:id/review', replies(C.FlowOne), async (req): Promise<C.FlowOne> =>
    ({ node: reviewFlow(wbOf(req.params.rid), req.params.id, parseBody(C.FlowReviewBody, req.body)) }))
  /** 점 지우기: 이 점을 가리키던 선도 뺀다 */
  app.delete<{ Params: { rid: string; id: string }; Querystring: { baseHash?: string } }>('/api/researches/:rid/flow/:id', replies(C.FlowDeleted), async (req): Promise<C.FlowDeleted> => {
    const baseHash = req.query.baseHash
    if (typeof baseHash !== 'string') throw new WorkbenchError(400, t('baseHash가 필요함', 'baseHash is required'))
    return deleteFlowNode(wbOf(req.params.rid), req.params.id, baseHash)
  })
}
