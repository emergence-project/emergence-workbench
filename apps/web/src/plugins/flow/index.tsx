/**
 * 흐름(질문 › 주장 › 시도) 플러그인의 화면 쪽 (2026-11-27 사용자 결정 "실험 기능을 플러그인으로 설치 · 제거").
 * 본체의 꽂는 자리(plugins/index.tsx)에 흐름 페이지 · 사이드바 흐름 줄 · 내 차례(결정을 기다리는 흐름)를 낸다.
 * 흐름 화면 파일(Problem*.tsx 등)은 아직 제자리에 있고, 본체 가운데 이 파일만 그것들을 부른다.
 */
import { FLOW_MANIFEST } from '@rw/core/plugins/flow'
import type { WebPlugin } from '..'
import { ProblemsPage, problemTurns, useProblems } from '../../Problems'
import { flowName } from '../../projectProfile'
import { Icon } from '../../icons'
import { t } from '../../i18n'
import { go } from '../../router'

export const flowWeb: WebPlugin = {
  manifest: FLOW_MANIFEST,
  projectQuery: 'problems', // qk.problems · qk.problem · qk.problemExceptions
  page: {
    name: 'problems',
    render: ({ rid, route, kind, onSaved }) => {
      const r = route.page === 'problems' ? route : undefined
      return <ProblemsPage key={rid} rid={rid} id={r?.id} view={r?.view} at={r?.at} attempt={r?.attempt} kind={kind} onSaved={onSaved} />
    },
  },
  // 결정할 흐름 (11/11): 방향 보고가 결정을 기다리는 흐름. 사이드바 수는 확인할 지난 일도 센다(problemTurns)
  useTurns: (rid, enabled) => {
    const rows = useProblems(rid, enabled).data?.problems
    return enabled ? { count: problemTurns(rows), waiting: (rows ?? []).filter((p) => p.waiting).map((p) => ({ id: p.id, title: p.question })) } : { count: 0, waiting: [] }
  },
  SidebarRow: ({ rid, route, kind, count }) => (
    <button className={`nav side-row${route.page === 'problems' ? ' on' : ''}`} aria-current={route.page === 'problems' ? 'page' : undefined} data-ui="흐름 블록" title={`${flowName(kind)}: ${t('메시지를 쓰고 시작한 질문과 그 아래에서 해 본 방법들', 'questions you started with a message, and the methods tried under them')}`} onClick={() => go({ page: 'problems', rid })}>
      <span className="q-ico" aria-hidden>{Icon.branch}</span><span className="label">{t('흐름', 'Flow')}</span>{count ? <span className="rail-count" title={t(`결정을 기다리는 방향 보고 ${count}개`, `${count} direction report(s) waiting for your decision`)}>{count}</span> : null}</button>
  ),
}
