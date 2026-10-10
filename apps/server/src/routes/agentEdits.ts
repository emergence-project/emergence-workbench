// 에이전트 고침 검토 (2026-10-08): 에이전트 쓰기(MCP edit_concept · edit_note)와 사용자 검토(문단 단위 승인 · 되돌리기 · 직접 고치기)
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/agentEdits'
import { parseBody, replies } from '../contract.js'
import { agentWrite, AgentEditStore, decide, listEdits, reviewOf, targetKey, type EditTarget, type TargetIo, type WriteRequest } from '../agentEdits.js'
import { readStatusEdits, writeStatus } from '../agentStatus.js'
import { t } from '../i18n.js'
import { WorkbenchError } from '../workbench.js'
import type { RouteContext } from './context.js'

function parseTarget(v: unknown): EditTarget {
  const o = (v ?? {}) as Record<string, unknown>
  if (o.kind === 'concept' && typeof o.id === 'string' && o.id) return { kind: 'concept', id: o.id }
  if (o.kind === 'note' && typeof o.rid === 'string' && o.rid && typeof o.file === 'string' && o.file) return { kind: 'note', rid: o.rid, file: o.file }
  throw new WorkbenchError(400, t('target은 {kind: "concept", id} 또는 {kind: "note", rid, file}', 'target must be {kind: "concept", id} or {kind: "note", rid, file}'))
}

export function registerAgentEdits(app: FastifyInstance, ctx: RouteContext): void {
  const { registry, wbOf, broadcast } = ctx
  const io = (): TargetIo => ({ lib: registry.libraryPath, wbOf })
  const store = () => new AgentEditStore(AgentEditStore.fileFor(registry.configDir, registry.libraryPath))
  /** 화면이 다시 읽게: 노트 쪽은 그 프로젝트의 research 알림, 개념노트는 library 알림 */
  const notify = (tg: EditTarget) => {
    broadcast(tg.kind === 'note' ? { type: 'research', research: tg.rid } : { type: 'library', research: null, part: 'concepts', file: `concepts/${tg.id}.md` })
    if (tg.kind === 'note') {
      try {
        const wb = wbOf(tg.rid)
        if (wb.readResearch().agentStatus) writeStatus(wb, new Date(), readStatusEdits(wb, registry.configDir, tg.rid, registry.libraryPath))
      } catch (e) { app.log.error(e, '에이전트 고침 뒤 STATUS 갱신 실패') }
    }
  }

  /** 목록: 검토를 기다리는 노트(바뀐 곳 수)와 확인된 노트 쓰기 시도. scope = 프로젝트 id 또는 library */
  app.get<{ Querystring: { scope?: string } }>('/api/agent-edits', replies(C.EditList), async (req): Promise<C.EditList> => listEdits(io(), store(), req.query.scope || undefined, true))

  /** 검토 하나: 기준판과 지금 글의 바뀐 곳. 바뀐 곳이 없으면 review: null */
  app.get<{ Querystring: { key?: string } }>('/api/agent-edits/review', replies(C.EditReviewOne), async (req): Promise<C.EditReviewOne> => {
    if (!req.query.key) throw new WorkbenchError(400, t('key가 필요함', 'key is required'))
    return { review: reviewOf(io(), store(), req.query.key) }
  })

  /** 바뀐 곳 하나 정하기 (accept 승인 · revert 되돌리기 · edit 직접 고치기) */
  app.post('/api/agent-edits/review', replies(C.EditReviewOne), async (req): Promise<C.EditReviewOne> => {
    const b = parseBody(C.DecideBody, req.body)
    const s = store()
    const target = s.pending(b.key)?.target
    const review = decide(io(), s, b)
    if (target) notify(target)
    return { review }
  })

  /** 에이전트 쓰기: 작업 중인 노트는 바로 쓰고 기준판을 남긴다. 확인된 노트는 approved 없이 428과 사용자 차례 알림 */
  app.post<{ Body: WriteRequest }>('/api/agent-edits/write', replies(C.AgentWritten), async (req, reply): Promise<C.AgentWritten> => {
    const b = req.body ?? ({} as WriteRequest)
    if (typeof b.baseHash !== 'string') throw new WorkbenchError(400, t('baseHash가 필요함', 'baseHash is required'))
    const target = parseTarget(b.target)
    const r = agentWrite(io(), store(), { ...b, target, approved: b.approved === true })
    notify(target)
    if (!r.ok) return reply.status(r.status).send({ error: r.error, key: targetKey(target) })
    return { ...r, key: targetKey(target) }
  })

  /** 확인된 노트 쓰기 시도를 지운다 (사용자가 보았음) */
  app.delete<{ Querystring: { key?: string } }>('/api/agent-edits/attempts', replies(C.EditOk), async (req): Promise<C.EditOk> => {
    const key = req.query.key
    if (!key) throw new WorkbenchError(400, t('key가 필요함', 'key is required'))
    const s = store()
    const target = s.read().attempts.find((a) => a.key === key)?.target
    s.update((d) => { d.attempts = d.attempts.filter((a) => a.key !== key) })
    if (target) notify(target)
    return { ok: true }
  })
}
