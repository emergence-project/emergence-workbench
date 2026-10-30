import os from 'node:os'
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/agentHooks'
import { z } from 'zod'
import { parseBody, replies } from '../contract.js'
import { claudeInstalled, codexInstalled, HookSessions, setClaudeHooks, setCodexNotify, writeHookFiles } from '../agentHooks.js'
import { WorkbenchError } from '../workbench.js'
import { t } from '../i18n.js'
import type { RouteContext } from './context.js'

/** 예제 모드: 이 컴퓨터의 에이전트 설정을 보지도 고치지도 않고, 그림에 보일 세션 둘 */
const sample = (): C.HookSession[] => {
  const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
  return [
    { agent: 'claude-code', session: 'sample-1', cwd: '~/GitHub/sample-research', rid: 'sample-research', project: t('예제 연구', 'Sample research'), state: 'waiting', at: ago(2), note: t('Claude needs your permission to use Bash', 'Claude needs your permission to use Bash') },
    { agent: 'codex', session: 'sample-2', cwd: '~/GitHub/sample-research', rid: 'sample-research', project: t('예제 연구', 'Sample research'), state: 'done', at: ago(25) },
  ]
}

/** 밖에서 도는 에이전트의 상태 (10/30): 훅이 알리는 곳 · 설정 › 에이전트 › 상태 알리기 */
export function registerAgentHooks(app: FastifyInstance, ctx: RouteContext): void {
  const { registry, opts } = ctx
  const home = opts.agentHome ?? os.homedir()
  const sessions = new HookSessions(() => registry.list().map((r) => ({ id: r.id, title: r.title, path: r.path })))

  // 스크립트와 서버 주소: 뜰 때마다 (포트가 바뀌어도 오래 돈 세션이 닿게)
  app.addHook('onListen', async () => {
    const a = app.server.address()
    if (a && typeof a === 'object') writeHookFiles(opts.configDir, `http://127.0.0.1:${a.port}`)
  })

  /** 훅이 부른다 (본문은 에이전트가 준 그대로). 모르는 알림도 200: 에이전트를 막지 않는다 */
  app.post('/api/agent-hooks', replies(C.HookReceived), async (req): Promise<C.HookReceived> => {
    const agent = String(req.headers['x-rw-hook-agent'] ?? '')
    const parsed = z.record(z.string(), z.unknown()).safeParse(req.body)
    const body = parsed.success ? parsed.data : {}
    if (!opts.sandbox && sessions.receive(agent, body)) ctx.broadcast({ type: 'agent-hooks', research: null })
    return { ok: true }
  })

  const view = (): C.HookView => opts.sandbox
    ? { installed: { 'claude-code': true, codex: false }, sessions: sample() }
    : { installed: { 'claude-code': claudeInstalled(home), codex: codexInstalled(home) }, sessions: sessions.list() }

  app.get('/api/agent-hooks', replies(C.HookView), async (): Promise<C.HookView> => view())

  app.post('/api/agent-hooks/install', replies(C.HookView), async (req): Promise<C.HookView> => {
    const b = parseBody(C.HookInstallBody, req.body)
    if (opts.sandbox) throw new WorkbenchError(400, t('예제 모드에서는 이 컴퓨터의 에이전트 설정을 고치지 않습니다', 'Sample mode does not change this computer\'s agent settings'))
    try {
      if (b.agent === 'claude-code') setClaudeHooks(opts.configDir, b.on, home)
      else if (setCodexNotify(opts.configDir, b.on, home) === 'busy') throw new WorkbenchError(409, t('Codex 설정(~/.codex/config.toml)에 다른 notify가 있어 넣지 않았습니다. 그 줄을 지우면 넣을 수 있습니다', 'Codex settings (~/.codex/config.toml) already have another notify, so nothing was added. Remove that line to add it'))
    } catch (e) {
      if (e instanceof WorkbenchError) throw e
      const why = e instanceof Error ? e.message : String(e)
      throw new WorkbenchError(400, t(`에이전트 설정을 고치지 못했습니다: ${why}`, `Could not change the agent settings: ${why}`))
    }
    return view()
  })
}
