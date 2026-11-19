// 새 대화의 프로젝트 고르기와 최근 대화 (11/8 14:16 제안 진행, 시안 https://claude.ai/artifact/AgxUmY2ALeKqmCabcE69kE 1절 · 1-2절)
// ChatGPT · Claude의 프로젝트 고르기처럼 입력란 아래 줄의 알약 버튼 하나. 누르면 찾기와 레일 순서의 한 목록(최근 · 모든 프로젝트로 나누지 않음).
// 프로젝트는 여럿 고른다 (11/19 사용자 결정 "고른 프로젝트만 고치고, 다른 프로젝트 · 개념노트는 읽기만"): 대화는 처음 고른 것에서 열리고,
// 나머지는 함께 고친다(scope.also). 그 밖의 일과 앱 버그는 대화가 중앙 대화에 넘긴다(central_help). 예전의 범위(이 프로젝트 · 전체)는 없앴다
import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { agentChatsApi, api, APP_RID, type ChatRow } from './api'
import { PopButton } from './ChatComposer'
import { t } from './i18n'
import { Icon } from './icons'
import { qk } from './queries'

/** 고른 프로젝트를 하나 넣거나 빼기: 하나는 늘 남기고, 맨 앞이 대화를 여는 프로젝트 */
export function togglePicked(picked: string[], id: string): string[] {
  if (!picked.includes(id)) return [...picked.filter((r) => r !== APP_RID), id]
  return picked.length > 1 ? picked.filter((r) => r !== id) : picked
}

export function ProjectPick({ picked, projects, appOk, onPick }: {
  /** 고른 프로젝트 (맨 앞이 대화를 여는 프로젝트). 앱 고치기면 [APP_RID] */
  picked: string[]
  projects: { id: string; title: string }[]
  /** 앱 고치기 대화를 열 수 있는지 (에이전트 화면, 앱 저장소가 있는 맥) */
  appOk: boolean
  onPick(picked: string[]): void
}) {
  const app = picked[0] === APP_RID
  const name = app ? t('앱 수정', 'Fix the app') : projects.find((p) => p.id === picked[0])?.title ?? ''
  const more = app ? 0 : picked.length - 1
  const label = <><span className="ac-pop-ico" aria-hidden>{app ? Icon.spark : Icon.research}</span><span className="ac-pick-name">{name}{more ? t(` 외 ${more}`, ` +${more}`) : ''}</span> ▾</>
  return (
    <PopButton ui="대화 프로젝트 고르기" tip={t('고칠 프로젝트 (여럿)', 'Projects to change (several)')} wide pill label={label}>
      {(close) => <PickMenu picked={picked} projects={projects} appOk={appOk} onPick={onPick} onApp={() => { close(); onPick([APP_RID]) }} />}
    </PopButton>
  )
}

function PickMenu({ picked, projects, appOk, onPick, onApp }: Omit<Parameters<typeof ProjectPick>[0], 'onPick'> & { onPick(picked: string[]): void; onApp(): void }) {
  const [q, setQ] = useState('')
  const shown = projects.filter((p) => p.title.toLowerCase().includes(q.trim().toLowerCase()))
  const check = (on: boolean) => <span className="ac-pop-check" aria-hidden>{on ? Icon.check : null}</span>
  const app = picked[0] === APP_RID
  const toggle = (id: string) => onPick(app ? [id] : togglePicked(picked, id))
  return <>
    <input className="ac-pick-search" data-ui="프로젝트 찾기" autoFocus placeholder={t('프로젝트 찾기', 'Find a project')} aria-label={t('프로젝트 찾기', 'Find a project')} value={q} onChange={(e) => setQ(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter' && shown[0]) toggle(shown[0].id) }} />
    {shown.map((p) => {
      const on = !app && picked.includes(p.id)
      return <button key={p.id} role="menuitemcheckbox" aria-checked={on} className={on ? 'on' : ''} onClick={() => toggle(p.id)}>{check(on)}{p.title}</button>
    })}
    {!shown.length && <div className="muted ac-pop-h">{t('맞는 프로젝트가 없습니다', 'No matching project')}</div>}
    {appOk && !q && <button role="menuitemradio" aria-checked={app} className={app ? 'on' : ''} onClick={onApp}>{check(app)}{t('워크벤치 전체: 앱 수정', 'Whole workbench: fix the app')}</button>}
    <div className="muted ac-pop-h ac-pick-sep ac-pick-hint" data-ui="고칠 프로젝트 안내">{app
      ? t('앱 저장소만 고칩니다. 연구 프로젝트는 읽기만 합니다', 'Changes only the app repository; research projects are read-only')
      : t('고른 프로젝트만 고칩니다. 다른 프로젝트 · 개념노트는 읽기만 하고, 그곳을 고칠 일이나 앱 버그는 중앙 대화에 넘깁니다', 'Changes only the picked projects. Other projects and concept notes are read-only; work there and app bugs go to the central conversation')}</div>
  </>
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
