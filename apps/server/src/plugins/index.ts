/**
 * 서버의 플러그인 등록부 (내장 플러그인, @rw/core plugins/manifest.ts, 2026-11-27 사용자 결정 "실험 기능을 플러그인으로 설치 · 제거").
 * 본체는 플러그인 폴더를 직접 부르지 않고 이 파일만 부른다. 플러그인은 `plugins/<id>/`에 두고 아래 목록에 늘어놓는다.
 * 꽂는 자리는 흐름이 실제로 쓰는 것만 열었다 (둘째 기능이 필요로 할 때만 늘린다).
 *
 * 설치 상태: 서버 안에서는 app.ts가 이 컴퓨터의 config.yaml을 읽어 setPluginStates로 알려 준다.
 * 설정 파일이 없는 곳(클라우드의 pnpm agent:status 등)에서는 이름표의 기본값을 쓴다.
 */
import type { FastifyInstance } from 'fastify'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { z } from 'zod'
import { normalizePluginStates, pluginInstalled, type PluginManifest, type PluginStates } from '@rw/core'
import type { RouteContext } from '../routes/context.js'
import type { Workbench } from '../workbench.js'
import type { Text } from '../mcp.js'
import type { WorkbenchDiagnostic } from '../agentCheck.js'
import type { UserTurn } from '../agentOverview.js'
import { WorkbenchError } from '../workbench.js'
import { t } from '../i18n.js'
import { flowPlugin } from './flow/index.js'

export type McpReply = { ok: true; body: unknown } | { ok: false; error: Text }
type Hints = { readonly readOnlyHint: boolean; readonly openWorldHint: false; readonly destructiveHint?: false; readonly idempotentHint?: false }
/** MCP 도구가 받는 것 (mcp.ts가 채운다): 프로젝트 칸, 앱 서버 읽기 · 쓰기, 도구 성격 */
export interface McpDeps {
  project: z.ZodString
  read: (url: string) => Promise<McpReply>
  write: (url: string, payload: unknown, method?: 'POST' | 'PATCH') => Promise<McpReply>
  ro: Hints
  writeOnce: Hints
}

/** 바뀐 것 검사(agentChanges.ts)에 더하는 규칙. 파일 보호라 설치 상태와 상관없이 늘 돈다 */
export interface ChangeCheckPart {
  levels: Readonly<Record<string, 'error' | 'warning' | 'off'>>
  checker: (repo: string, add: (check: string, file: string, ko: string, en: string) => void) => {
    /** 이 플러그인 폴더의 파일이면 true (본체 검사는 건너뛴다) */
    file: (c: { file: string; status: 'A' | 'M' | 'D' | 'R' }, old: string, before: string | undefined, after: string | undefined) => boolean
    finish: () => void
    /** 진행 중인 일이 가리키는 파일. 진행 중인 일이 없으면 null */
    pointed: () => string[] | null
  }
}

export interface ServerPlugin {
  manifest: PluginManifest
  /** API. 늘 등록하고, 제거돼 있으면 앞의 문이 404로 막는다(다시 시작 없이 켜고 끈다) */
  routes?: (app: FastifyInstance, ctx: RouteContext) => void
  /** MCP 도구와 연결할 때 주는 안내 한 줄 */
  mcp?: { instructions: string; register: (server: McpServer, deps: McpDeps) => void }
  /** 에이전트 현황(STATUS.md · project_status · pnpm agent:status)의 절 */
  statusSection?: (wb: Workbench) => string[]
  /** 홈 · 개요의 사용자 차례 수 */
  userTurns?: (wb: Workbench) => Partial<UserTurn>
  /** pnpm agent:check의 파일 형식 진단 */
  repoChecks?: (wb: Workbench) => WorkbenchDiagnostic[]
  changeChecks?: ChangeCheckPart
}

/** 앱에 함께 들어 있는 플러그인 */
export const SERVER_PLUGINS: readonly ServerPlugin[] = [flowPlugin]

let list: readonly ServerPlugin[] = SERVER_PLUGINS
let states: PluginStates = statesFromEnv()
/**
 * 서버 없이 도는 pnpm agent:status · agent:check의 설치 상태. 스크립트가 이 컴퓨터 config.yaml의 `plugins:`를 RW_PLUGINS(JSON)로 넘긴다
 * (tsImport가 모듈을 따로 불러와 setPluginStates가 닿지 않는다). 없으면 이름표의 기본값. 서버는 켤 때 setPluginStates로 덮는다
 */
function statesFromEnv(): PluginStates {
  try { return normalizePluginStates(JSON.parse(process.env.RW_PLUGINS ?? '{}')) } catch { return {} }
}
/** app.ts가 켤 때와 설정 › 기능에서 바꿀 때 부른다 */
export function setPluginStates(next: PluginStates, plugins: readonly ServerPlugin[] = SERVER_PLUGINS): void { states = next; list = plugins }

/** 이 컴퓨터에서 id가 설치돼 있는지. 모르는 id는 false */
export function isPluginOn(plugins: readonly ServerPlugin[], s: PluginStates, id: string): boolean {
  const p = plugins.find((x) => x.manifest.id === id)
  return !!p && pluginInstalled(p.manifest, s)
}
/** 지금 설치된 플러그인 (화면 · 현황 · 도구에 보이는 것) */
export const installedPlugins = (): readonly ServerPlugin[] => list.filter((p) => pluginInstalled(p.manifest, states))
/** 모든 플러그인 (파일 보호 검사처럼 제거해도 도는 것) */
export const allPlugins = (): readonly ServerPlugin[] => list

/** 플러그인의 API를 등록한다. 제거돼 있으면 그 경로는 404 */
export function registerPluginRoutes(app: FastifyInstance, ctx: RouteContext, plugins: readonly ServerPlugin[]): void {
  for (const p of plugins) {
    if (!p.routes) continue
    const { routes, manifest } = p
    void app.register(async (scope) => {
      scope.addHook('onRequest', async () => {
        if (!pluginInstalled(manifest, ctx.registry.plugins)) throw new WorkbenchError(404, t(`${manifest.name.ko} 기능이 제거되어 있습니다. 설정 › 기능에서 설치하세요`, `${manifest.name.en} is removed. Install it in Settings › Features`))
      })
      routes(scope, ctx)
    })
  }
}
