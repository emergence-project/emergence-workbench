// 설정 › 기능: 내장 플러그인 설치 · 제거 (2026-11-27 사용자 결정 "실험 기능을 플러그인으로, 컴퓨터마다").
// 설치 상태는 이 컴퓨터의 config.yaml `plugins:`에만 적는다. 제거는 등록을 건너뛸 뿐 연구 파일은 지우지 않는다.
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/plugins'
import { changePlugin, pluginInstalled, requiredBy } from '@rw/core'
import { parseBody, replies } from '../contract.js'
import { WorkbenchError } from '../workbench.js'
import { SERVER_PLUGINS, setPluginStates } from '../plugins/index.js'
import { t } from '../i18n.js'
import type { RouteContext } from './context.js'

export function registerPlugins(app: FastifyInstance, ctx: RouteContext): void {
  const list = () => ctx.opts.plugins ?? SERVER_PLUGINS
  const manifests = () => list().map((p) => p.manifest)
  const view = (): C.PluginsView => {
    const states = ctx.registry.plugins
    return {
      plugins: manifests().map((m) => {
        const saved = states[m.id]
        return {
          id: m.id, name: m.name, summary: m.summary, stage: m.stage,
          ...(m.rule && { rule: m.rule }),
          installed: pluginInstalled(m, states),
          ...(saved && { at: saved.at }),
          requires: m.requires ?? [],
          requiredBy: requiredBy(manifests(), states, m.id),
          keeps: m.keeps ?? [],
        }
      }),
    }
  }
  app.get('/api/plugins', replies(C.PluginsView), async (): Promise<C.PluginsView> => view())
  app.put<{ Params: { id: string } }>('/api/plugins/:id', replies(C.PluginsView), async (req): Promise<C.PluginsView> => {
    const { installed } = parseBody(C.PluginBody, req.body)
    const r = changePlugin(manifests(), ctx.registry.plugins, req.params.id, installed, new Date().toISOString())
    if (!r.ok && r.reason === 'unknown') throw new WorkbenchError(404, t(`없는 기능입니다: ${r.id}`, `No such feature: ${r.id}`))
    if (!r.ok) throw new WorkbenchError(409, t(`설치된 ${r.by.join(', ')}이(가) 이 기능을 씁니다. 그것을 먼저 제거하세요`, `${r.by.join(', ')} uses this feature. Remove it first`))
    setPluginStates(ctx.registry.setPlugins(r.states), list())
    // 열린 화면이 사이드바 · 내 차례 · 알림을 다시 그리게 한다
    ctx.broadcast({ type: 'plugins', research: null })
    return view()
  })
}
