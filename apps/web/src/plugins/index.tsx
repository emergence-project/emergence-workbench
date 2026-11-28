/**
 * 화면의 플러그인 등록부 (내장 플러그인, @rw/core plugins/manifest.ts, 2026-11-27 사용자 결정 "실험 기능을 플러그인으로 설치 · 제거").
 * 본체 화면은 플러그인 폴더를 직접 부르지 않고 이 파일만 부른다. 플러그인은 `plugins/<id>/`에 두고 아래 목록에 늘어놓는다.
 * 설치돼 있는지는 서버(GET /api/plugins)가 정한다. 받기 전에는 이름표의 기본값을 써서 깜박이지 않게 한다.
 * 꽂는 자리는 흐름이 실제로 쓰는 것만: 프로젝트 페이지 · 사이드바 줄 · 내 차례.
 */
import type { ComponentType, ReactNode } from 'react'
import { useQuery, type QueryClient } from '@tanstack/react-query'
import { pluginInstalled, type PluginManifest, type PluginStates } from '@rw/core'
import { pluginsCalls } from '../api/plugins'
import type { ProjectKind } from '../api'
import { qk } from '../queries'
import { go, type Route } from '../router'
import { t } from '../i18n'
import { flowWeb } from './flow/index'

/** 내 차례에 오르는 것 하나 (흐름: 방향 보고가 결정을 기다리는 흐름) */
export interface PluginTurn { id: string; title: string }
export interface PluginPageProps { rid: string; route: Route; kind?: ProjectKind; onSaved: (msg: string) => void }

export interface WebPlugin {
  manifest: PluginManifest
  /** 프로젝트 안의 페이지 (router.ts의 page 이름) */
  page?: { name: Route['page']; render: (p: PluginPageProps) => ReactNode }
  /** 사이드바 줄 (count = useTurns의 count) */
  SidebarRow?: ComponentType<{ rid: string; route: Route; kind?: ProjectKind; count: number }>
  /** 사용자 차례. enabled가 false면 서버에 묻지 않고 비어 있어야 한다 (훅: 목록이 고정이라 부르는 차례가 바뀌지 않는다) */
  useTurns?: (rid: string, enabled: boolean) => { count: number; waiting: PluginTurn[] }
  /** 화면 캐시에서 이 플러그인의 프로젝트 자료 키 셋째 칸 (['project', rid, 이것, …]) */
  projectQuery?: string
}

/** 앱에 함께 들어 있는 플러그인 */
export const WEB_PLUGINS: readonly WebPlugin[] = [flowWeb]

/** 이 컴퓨터의 설치 상태. 받기 전 · 받지 못하면 이름표의 기본값 */
export function usePluginOn(): (id: string) => boolean {
  const q = useQuery({ queryKey: qk.plugins, queryFn: pluginsCalls.plugins, staleTime: Infinity })
  const states: PluginStates = Object.fromEntries((q.data?.plugins ?? []).map((p) => [p.id, { installed: p.installed, at: p.at ?? '' }]))
  return (id) => {
    const m = WEB_PLUGINS.find((p) => p.manifest.id === id)?.manifest
    if (!m) return false
    return id in states ? states[id]!.installed : pluginInstalled(m, {})
  }
}

/**
 * 플러그인 설치 · 제거 알림: 설치 상태 · 알림 종의 수 · 프로젝트 자료를 다시 받는다.
 * 플러그인 자기 자료는 낡음 표시만 한다: 다른 창에 열린 그 화면이 설치 상태보다 먼저 다시 받으면 제거된 API가 404이고,
 * 다시 설치하면 화면이 새로 열리며 받는다.
 */
export function invalidatePluginChange(client: QueryClient): void {
  const own = (key: readonly unknown[]) => key[0] === 'project' && WEB_PLUGINS.some((p) => p.projectQuery !== undefined && key[2] === p.projectQuery)
  void client.invalidateQueries({ queryKey: qk.plugins })
  void client.invalidateQueries({ queryKey: qk.researchIssues })
  void client.invalidateQueries({ queryKey: ['project'], predicate: (q) => !own(q.queryKey) })
  void client.invalidateQueries({ queryKey: ['project'], predicate: (q) => own(q.queryKey), refetchType: 'none' })
}

/** 설치된 플러그인의 사이드바 줄과 차례 수를 함께 */
export function usePluginTurns(rid: string): { plugin: WebPlugin; count: number; waiting: PluginTurn[] }[] {
  const on = usePluginOn()
  const out: { plugin: WebPlugin; count: number; waiting: PluginTurn[] }[] = []
  for (const plugin of WEB_PLUGINS) {
    const enabled = on(plugin.manifest.id)
    const turns = plugin.useTurns?.(rid, enabled) ?? { count: 0, waiting: [] }
    if (enabled) out.push({ plugin, ...turns })
  }
  return out
}

/** 플러그인 사이드바 줄들 */
export function PluginSidebarRows({ rid, route, kind, turns }: { rid: string; route: Route; kind?: ProjectKind; turns: ReturnType<typeof usePluginTurns> }) {
  return <>{turns.map(({ plugin, count }) => plugin.SidebarRow && <plugin.SidebarRow key={plugin.manifest.id} rid={rid} route={route} kind={kind} count={count} />)}</>
}

/** 프로젝트 페이지 name을 그리는 플러그인. 없으면 null. 제거돼 있으면 설정 › 기능으로 가는 안내 */
export function PluginPage({ name, ...props }: PluginPageProps & { name: Route['page'] }) {
  const on = usePluginOn()
  const plugin = WEB_PLUGINS.find((p) => p.page?.name === name)
  if (!plugin?.page) return null
  if (!on(plugin.manifest.id)) {
    return (
      <div className="ws-doc">
        <section className="pane" data-ui="본문">
          <div className="scroll">
            <div className="page-body"><div className="empty" data-ui="제거된 기능">
              <p>{t(`${plugin.manifest.name.ko} 기능이 제거되어 있습니다. 연구 파일은 그대로 있습니다.`, `${plugin.manifest.name.en} is removed. Its research files are kept.`)}</p>
              <button className="btn" onClick={() => go({ page: 'settings', part: 'features' })}>{t('설정 › 기능 열기', 'Open Settings › Features')}</button>
            </div></div>
          </div>
        </section>
      </div>
    )
  }
  return <>{plugin.page.render(props)}</>
}
