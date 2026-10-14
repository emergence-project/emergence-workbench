// 연구 흐름 (주제 화면의 흐름, workbench/flow/*.yaml). 요청·응답 모양은 @rw/core/contract/flow
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/flow'
import { replies } from '../contract.js'
import { scanFlow } from '../flow.js'
import type { RouteContext } from './context.js'

export function registerFlow(app: FastifyInstance, ctx: RouteContext): void {
  const { wbOf } = ctx
  /** 흐름의 점 전부 (날짜 순)와 파일 형식 진단. 주제마다 거르는 것은 화면이 한다 (점의 topics) */
  app.get<{ Params: { rid: string } }>('/api/researches/:rid/flow', replies(C.FlowScan), async (req): Promise<C.FlowScan> => scanFlow(wbOf(req.params.rid)))
}
