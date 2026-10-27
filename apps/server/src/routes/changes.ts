// 변경사항 (10/27): 기준 뒤 프로젝트에서 바뀐 것. 화면(프로젝트 정보 › 변경사항 · 홈 카드)과 MCP changes_since가 쓴다
import type { FastifyInstance, FastifyRequest } from 'fastify'
import * as C from '@rw/core/contract/changes'
import { parseBody, replies } from '../contract.js'
import { ME, baselineOf, changesSince, markSeen, seenOf, viewerOf } from '../changes.js'
import { WorkbenchError } from '../workbench.js'
import type { RouteContext } from './context.js'
import { t } from '../i18n.js'

/** ISO 시각이 맞는지. 틀리면 400 */
function isoOf(v: string | undefined): string | undefined {
  if (v === undefined || v === '') return undefined
  const ms = Date.parse(v)
  if (Number.isNaN(ms)) throw new WorkbenchError(400, t(`시각을 읽지 못함: ${v} (예: 2026-10-27T09:00)`, `Could not read the time: ${v} (e.g. 2026-10-27T09:00)`))
  return new Date(ms).toISOString()
}

/** 에이전트마다 가장 늦게 받은 때. Claude는 계정이 여럿이어도 한 칸 */
function agentsOf(seen: Record<string, string>): C.Changes['agents'] {
  const latest = (prefix: string) => Object.entries(seen).filter(([k]) => k === prefix || k.startsWith(`${prefix}:`)).map(([, v]) => v).sort().at(-1) ?? null
  return { claude: latest('claude-code'), codex: latest('codex') }
}

const header = (req: FastifyRequest, name: string) => { const v = req.headers[name]; return typeof v === 'string' ? v : undefined }

export function registerChanges(app: FastifyInstance, ctx: RouteContext): void {
  const { wbOf, registry } = ctx
  /** 화면: since가 없으면 내가 마지막으로 본 때부터 (처음이면 7일 전) */
  app.get<{ Params: { rid: string }; Querystring: { since?: string } }>('/api/researches/:rid/changes', replies(C.Changes), async (req): Promise<C.Changes> => {
    const { rid } = req.params
    const seen = seenOf(registry.configDir, rid)
    const since = isoOf(req.query.since) ?? baselineOf(seen, ME)
    return { ...await changesSince(wbOf(rid), since), agents: agentsOf(seen) }
  })
  /** 홈 카드: 내가 마지막으로 본 뒤 변경사항 수 */
  app.get<{ Params: { rid: string } }>('/api/researches/:rid/changes/count', replies(C.ChangesCount), async (req): Promise<C.ChangesCount> => {
    const { rid } = req.params
    const r = await changesSince(wbOf(rid), baselineOf(seenOf(registry.configDir, rid), ME))
    return { count: r.items.length, last: r.items[0]?.last ?? null }
  })
  /** 화면을 열었다: 내 기준을 그때로 */
  app.post<{ Params: { rid: string } }>('/api/researches/:rid/changes/seen', replies(C.ChangesSeen), async (req): Promise<C.ChangesSeen> => {
    const { rid } = req.params
    wbOf(rid)
    const at = isoOf(parseBody(C.ChangesSeenBody, req.body ?? {}).at) ?? new Date().toISOString()
    markSeen(registry.configDir, rid, ME, new Date(at))
    return { at }
  })
  /**
   * 에이전트가 받기 (MCP changes_since). 보는 이는 x-rw-agent(claude-code · codex)와 x-rw-account(Claude 계정 id)로 가린다.
   * since를 주면 그때부터, 없으면 이 에이전트가 지난번 받은 때부터. 받은 지금이 새 기준이 된다
   */
  app.post<{ Params: { rid: string } }>('/api/researches/:rid/changes/read', replies(C.Changes), async (req): Promise<C.Changes> => {
    const { rid } = req.params
    const wb = wbOf(rid)
    const agent = header(req, 'x-rw-agent')
    if (!agent || agent === ME) throw new WorkbenchError(400, t('에이전트 이름이 필요함 (x-rw-agent)', 'An agent name is required (x-rw-agent)'))
    const viewer = viewerOf(agent, header(req, 'x-rw-account'))
    const now = new Date()
    const seen = seenOf(registry.configDir, rid)
    const since = isoOf(parseBody(C.ChangesReadBody, req.body ?? {}).since) ?? baselineOf(seen, viewer, now.getTime())
    const r = await changesSince(wb, since)
    markSeen(registry.configDir, rid, viewer, now)
    return { ...r, agents: agentsOf({ ...seen, [viewer]: now.toISOString() }) }
  })
}
