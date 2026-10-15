// 프로젝트 정본 · 에이전트 요약
import type { FastifyInstance } from 'fastify'
import fs from 'node:fs'
import path from 'node:path'
import * as C from '@rw/core/contract/research'
import { parseBody, replies } from '../contract.js'
import { commonRules, projectRules } from '../agentRules.js'
import * as CC from '@rw/core/contract/concepts'
import { generateStatus, readStatusEdits, statusPart, statusPartNames, statusSummary, listReviews, readTaskTable, writeStatus } from '../agentStatus.js'
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
  /**
   * STATUS 미리보기. 화면은 전부를 쓴다. 에이전트는 ?view=summary(머리 · 목표 · 지금 할 것, 다른 절은 이름과 크기만)나
   * ?section=<절 이름>(그 절만)으로 필요한 만큼만 읽는다 (10/15 에이전트가 읽는 양 줄이기)
   */
  app.get<{ Params: { rid: string }; Querystring: { view?: string; section?: string } }>('/api/researches/:rid/agent-status', replies(C.AgentStatusPreview), async (req): Promise<C.AgentStatusPreview> => {
    const wb = wbOf(req.params.rid)
    const full = generateStatus(wb, new Date(), readStatusEdits(wb, registry.configDir, req.params.rid, registry.libraryPath), commonRules(registry.configDir))
    const { section, view } = req.query
    if (section) {
      const part = statusPart(full, section)
      if (!part) throw new WorkbenchError(404, t(`그런 절이 없습니다: ${section}. 있는 절: ${statusPartNames(full).join(', ')}`, `No such section: ${section}. Sections: ${statusPartNames(full).join(', ')}`))
      return { markdown: part }
    }
    return { markdown: view === 'summary' ? statusSummary(full, t('절 하나만 받기: MCP project_status에 section: "<절 이름>", 또는 GET …/agent-status?section=<절 이름>', 'One section: MCP project_status with section: "<name>", or GET …/agent-status?section=<name>')) : full }
  })
  /** 이 연구 저장소의 에이전트 규칙: 맨 위 AGENTS.md · CLAUDE.md (MCP rules 도구가 모아 준다) */
  app.get<{ Params: { rid: string } }>('/api/researches/:rid/agent-rules', replies(C.AgentRules), async (req): Promise<C.AgentRules> => ({ files: projectRules(path.dirname(wbOf(req.params.rid).root)) }))
  /** 연구 공통 규칙: 모든 연구 저장소에 통하는 규칙 한 파일 (MCP rules 도구가 모아 준다). 없으면 null */
  app.get('/api/rules/common', replies(CC.CommonRules), async (): Promise<CC.CommonRules> => ({ rules: commonRules(registry.configDir) }))
  /** STATUS.md 쓰기 — agent-status를 켠 프로젝트만 */
  app.post<{ Params: { rid: string } }>('/api/researches/:rid/agent-status', replies(C.AgentStatusWritten), async (req): Promise<C.AgentStatusWritten> => {
    const wb = wbOf(req.params.rid)
    if (!wb.readResearch().agentStatus) throw new WorkbenchError(409, t('research.yaml에 agent-status: true가 없어 쓰지 않음', 'Not written: research.yaml does not have agent-status: true'))
    return writeStatus(wb, new Date(), readStatusEdits(wb, registry.configDir, req.params.rid, registry.libraryPath), commonRules(registry.configDir))
  })
}
