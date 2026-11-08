// 새 대화의 프로젝트 고르기와 최근 대화 (11/8 14:16 제안 진행, 시안 https://claude.ai/artifact/AgxUmY2ALeKqmCabcE69kE 1절 · 1-2절)
// ChatGPT · Claude의 프로젝트 고르기처럼 입력란 아래 줄의 알약 버튼 하나. 누르면 찾기와 레일 순서의 한 목록(최근 · 모든 프로젝트로 나누지 않음),
// 그 아래 범위(이 프로젝트 · 전체). 프로젝트가 정해진 좁은 자리(오른쪽 사이드바)는 예전처럼 입력란 위에 범위 버튼만(ScopeRow).
import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { agentChatsApi, api, APP_RID, type ChatRow } from './api'
import { PopButton } from './ChatComposer'
import { t } from './i18n'
import { Icon } from './icons'
import { qk } from './queries'

export type ScopeKind = 'project' | 'all'

const SCOPES: [ScopeKind, string, string][] = [
  ['project', t('이 프로젝트', 'This project'), t('이 프로젝트만 고칩니다. 다른 프로젝트는 읽기만 합니다', 'Changes only this project; reads the others')],
  ['all', t('전체', 'Everything'), t('모든 프로젝트를 읽고, 다른 프로젝트 · 개념노트를 고칠 때마다 묻습니다', 'Reads every project; asks each time before changing another project or a concept note')],
]

export function ProjectPick({ rid, projects, appOk, scope, onPick, onScope }: {
  rid: string
  projects: { id: string; title: string }[]
  /** 앱 고치기 대화를 열 수 있는지 (에이전트 화면, 앱 저장소가 있는 맥) */
  appOk: boolean
  scope: ScopeKind
  onPick(rid: string): void
  onScope(k: ScopeKind): void
}) {
  const app = rid === APP_RID
  const name = app ? t('앱 수정', 'Fix the app') : projects.find((p) => p.id === rid)?.title ?? ''
  const label = <><span className="ac-pop-ico" aria-hidden>{app ? Icon.spark : Icon.research}</span><span className="ac-pick-name">{name}{!app && scope === 'all' ? ` · ${t('전체', 'Everything')}` : ''}</span> ▾</>
  return (
    <PopButton ui="대화 프로젝트 고르기" tip={t('프로젝트 · 범위', 'Project · scope')} wide pill label={label}>
      {(close) => <PickMenu rid={rid} projects={projects} appOk={appOk} scope={scope} onPick={(r) => { close(); onPick(r) }} onScope={(k) => { close(); onScope(k) }} />}
    </PopButton>
  )
}

function PickMenu({ rid, projects, appOk, scope, onPick, onScope }: Parameters<typeof ProjectPick>[0]) {
  const [q, setQ] = useState('')
  const shown = projects.filter((p) => p.title.toLowerCase().includes(q.trim().toLowerCase()))
  const check = (on: boolean) => <span className="ac-pop-check" aria-hidden>{on ? Icon.check : null}</span>
  return <>
    <input className="ac-pick-search" data-ui="프로젝트 찾기" autoFocus placeholder={t('프로젝트 찾기', 'Find a project')} aria-label={t('프로젝트 찾기', 'Find a project')} value={q} onChange={(e) => setQ(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter' && shown[0]) onPick(shown[0].id) }} />
    {shown.map((p) => <button key={p.id} role="menuitemradio" aria-checked={p.id === rid} className={p.id === rid ? 'on' : ''} onClick={() => onPick(p.id)}>{check(p.id === rid)}{p.title}</button>)}
    {!shown.length && <div className="muted ac-pop-h">{t('맞는 프로젝트가 없습니다', 'No matching project')}</div>}
    {appOk && !q && <button role="menuitemradio" aria-checked={rid === APP_RID} className={rid === APP_RID ? 'on' : ''} onClick={() => onPick(APP_RID)}>{check(rid === APP_RID)}{t('워크벤치 전체: 앱 수정', 'Whole workbench: fix the app')}</button>}
    {rid !== APP_RID && <>
      <div className="ac-pop-h ac-pick-sep">{t('범위', 'Scope')}</div>
      {SCOPES.map(([k, label, hint]) => (
        <button key={k} role="menuitemradio" aria-checked={scope === k} className={scope === k ? 'on' : ''} onClick={() => onScope(k)}>
          {check(scope === k)}<span className="ac-pop-what"><span>{label}</span><span className="muted">{hint}</span></span>
        </button>
      ))}
    </>}
  </>
}

/** 프로젝트가 정해진 자리(오른쪽 사이드바의 새 대화)의 범위 버튼 둘 */
export function ScopeRow({ scope, onScope }: { scope: ScopeKind; onScope(k: ScopeKind): void }) {
  return (
    <div className="ac-new-row">
      <span className="rs-label">{t('범위', 'Scope')}</span>
      <div className="segmented small" role="radiogroup" aria-label={t('범위', 'Scope')} data-ui="대화 범위">
        {SCOPES.map(([k, label, tip]) => <button key={k} role="radio" aria-checked={scope === k} className={scope === k ? 'on' : ''} data-tip={tip} onClick={() => onScope(k)}>{label}</button>)}
      </div>
    </div>
  )
}

/** 왼쪽 사이드바(대화 목록)가 닫혀 있을 때 새 대화 아래의 최근 대화 다섯 (시안 1절 안 A). 「모든 대화 ›」는 사이드바를 연다 */
export function RecentChats({ onAll, line }: { onAll(): void; line(c: ChatRow): ReactNode }) {
  const list = useQuery({ queryKey: qk.agentChatList(undefined), queryFn: () => agentChatsApi.list(undefined) }).data?.chats
  const projects = useQuery({ queryKey: qk.researches, queryFn: () => api.researches() }).data?.researches
  const recent = [...(list ?? [])].filter((c) => !c.archived).sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 5)
  if (!recent.length) return null
  const where = (r: string) => (r === APP_RID ? t('앱', 'App') : projects?.find((p) => p.id === r)?.title ?? r)
  return (
    <div className="ac-recent" data-ui="최근 대화">
      <div className="ac-recent-h">{t('최근 대화', 'Recent conversations')}</div>
      <div className="set-side ac-recent-list">
        {recent.map((c) => <div key={c.id} className="ac-recent-row">{line(c)}<span className="muted ac-recent-proj">{where(c.rid)}</span></div>)}
      </div>
      <button className="a ac-recent-all" data-ui="모든 대화" onClick={onAll}>{t('모든 대화', 'All conversations')} ›</button>
    </div>
  )
}
