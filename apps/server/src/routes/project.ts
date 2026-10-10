// 프로젝트 정본 · 에이전트 요약
import type { FastifyInstance } from 'fastify'
import fs from 'node:fs'
import path from 'node:path'
import * as C from '@rw/core/contract/research'
import { parseBody, replies } from '../contract.js'
import { projectRules } from '../agentRules.js'
import { generateStatus, readStatusEdits, listReviews, readTaskTable, writeStatus } from '../agentStatus.js'
import { contentTypeOf } from '../materials.js'
import { setResearchInfo } from '../projectInfo.js'
import { researchHash } from '../mainNote.js'
import { WorkbenchError } from '../workbench.js'
import { cardFigureRef } from '../figures.js'
import type { RouteContext } from './context.js'
import { t } from '../i18n.js'

export function registerProject(app: FastifyInstance, ctx: RouteContext): void {
  const { wbOf, registry } = ctx
  /** 프로젝트 자체 작업 목록·검토 대기 문서·정본 위치 (research.yaml의 sources:) */
  app.get<{ Params: { rid: string } }>('/api/researches/:rid/project', replies(C.ProjectInfo), async (req): Promise<C.ProjectInfo> => {
    const wb = wbOf(req.params.rid)
    const info = wb.readResearch()
    const repo = wb.repo
    return { hash: researchHash(wb), sources: info.sources, agentStatus: info.agentStatus, tasks: readTaskTable(repo, info.sources), reviews: listReviews(repo, info.sources) }
  })
  /** 프로젝트 카드 그림 (research.yaml의 image:). 없으면 404 */
  app.get<{ Params: { rid: string } }>('/api/researches/:rid/image', async (req, reply) => {
    const wb = wbOf(req.params.rid)
    const rel = wb.readResearch().image
    if (!rel) throw new WorkbenchError(404, t('프로젝트 그림이 없음', 'This project has no picture'))
    const ref = cardFigureRef(registry, req.params.rid, rel)
    if (ref) return reply.header('cache-control', 'no-store').redirect(`/api/figures/file?id=${encodeURIComponent(ref.id)}`)
    return reply.type(contentTypeOf(rel)).header('cache-control', 'no-store').send(fs.createReadStream(path.join(wb.repo, rel)))
  })
  /** 제목·설명·시작일·카드 그림 고치기 (workbench/research.yaml만 씀) */
  app.patch<{ Params: { rid: string } }>('/api/researches/:rid/info', replies(C.InfoSaved), async (req, reply) => {
    const { baseHash, ...patch } = parseBody(C.InfoBody, req.body)
    cardFigureRef(registry, req.params.rid, patch.image)
    const r = setResearchInfo(wbOf(req.params.rid), patch, baseHash)
    if (!r.ok) return reply.status(409).send({ error: t('다른 곳에서 research.yaml이 바뀌어 쓰지 않았음', 'Not written: research.yaml was changed elsewhere'), currentHash: r.currentHash })
    return r
  })
  /** STATUS.md 미리보기 (쓰지 않음) */
  app.get<{ Params: { rid: string } }>('/api/researches/:rid/agent-status', replies(C.AgentStatusPreview), async (req): Promise<C.AgentStatusPreview> => ({ markdown: generateStatus(wbOf(req.params.rid), new Date(), readStatusEdits(wbOf(req.params.rid), registry.configDir, req.params.rid, registry.libraryPath)) }))
  /** 이 연구 저장소의 에이전트 규칙: 맨 위 AGENTS.md · CLAUDE.md (MCP rules 도구가 모아 준다) */
  app.get<{ Params: { rid: string } }>('/api/researches/:rid/agent-rules', async (req) => ({ files: projectRules(path.dirname(wbOf(req.params.rid).root)) }))
  /** STATUS.md 쓰기 — agent-status를 켠 프로젝트만 */
  app.post<{ Params: { rid: string } }>('/api/researches/:rid/agent-status', async (req) => {
    const wb = wbOf(req.params.rid)
    if (!wb.readResearch().agentStatus) throw new WorkbenchError(409, t('research.yaml에 agent-status: true가 없어 쓰지 않음', 'Not written: research.yaml does not have agent-status: true'))
    return writeStatus(wb, new Date(), readStatusEdits(wb, registry.configDir, req.params.rid, registry.libraryPath))
  })
}
