import { useMemo, useRef, useState } from 'react'
import { LIBRARY_RID } from '@rw/core'
import { APP_RID, CENTRAL_RID, type ChatRow } from './api'
import { ChatLine, isLive, newChatIn, projectName, useBulkChats, useChatList, useProjects } from './AgentChats'
import { GroupPick } from './AgentGroupPick'
import { myTurn } from './agentSeen'
import { CENTRAL_PAGE, CentralLine } from './CentralChat'
import { t } from './i18n'
import { Icon } from './icons'
import { go } from './router'
import { store } from './store'
import { useDismiss } from './useDismiss'

/**
 * 에이전트 화면 사이드바의 대화 목록 (11/20 시안 1절 추천안, 피드백 09:23 · 00:30):
 * 맨 위 중앙, 그 아래 한 줄에 ☰ 대상 메뉴(전체 · 앱 개발 · 프로젝트마다 · 지식, 수 함께)와 새 대화 아이콘,
 * 대상 아래는 「다음에 누가 움직여야 하나」로 묶은 상태 묶음 넷(내 차례 · 작업 중 · 대기 · 종료, 머리에 수와 접기. 종료는 처음에 접힘),
 * 맨 아래에 붙은 보관함 아이콘(다시 누르면 닫힘). 예전(10/22–11/19)의 걸러 보기 칸(내 차례 · 일하는 중 · 모두)과 「＋ 새 대화」 줄은 없앴다.
 */

type State = 'mine' | 'live' | 'queued' | 'done'
const STATES: State[] = ['mine', 'live', 'queued', 'done']
const STATE_GROUP: Record<State, string> = { mine: t('내 차례', 'Your turn'), live: t('작업 중', 'Working'), queued: t('대기', 'Queued'), done: t('종료', 'Done') }
const STATE_EMPTY: Record<State, string> = { mine: t('답할 대화가 없습니다', 'Nothing waits for you'), live: t('작업 중인 대화가 없습니다', 'No conversation is working'), queued: t('대기 중인 대화가 없습니다', 'Nothing is queued'), done: '' }
/** 사용자 차례(허락 · 계획 · 오류 · 열어 보지 않은 끝) → 도는 것 → 줄 선 것 → 나머지 */
export const stateOf = (c: ChatRow): State => (myTurn(c) ? 'mine' : c.state === 'running' || c.state === 'waiting' ? 'live' : c.state === 'queued' ? 'queued' : 'done')

const ALL = 'all'
const TARGET_KEY = 'rw-agent-target'
const FOLD_KEY = 'rw-agent-fold-state'
/** 보관함을 열었는지 (예전 걸러 보기 값과 같은 열쇠: 'archived'면 연 것) */
const ARCHIVE_KEY = 'rw-agent-filter'

/** 대상 이름: 앱 고치기 대화는 「앱 개발」, 개념노트 기록은 「지식」 */
const targetName = (rid: string, projects?: { id: string; title: string }[]) => (rid === ALL ? t('전체', 'All') : rid === APP_RID ? t('앱 개발', 'App development') : rid === LIBRARY_RID ? t('지식', 'Knowledge') : projectName(rid, projects))

export function AgentSide({ id }: { id?: string }) {
  const listed = useChatList().data
  const list = useMemo(() => (listed?.chats ?? []).filter((c) => c.rid !== CENTRAL_RID), [listed])
  const projects = useProjects()
  const [target, setTargetState] = useState<string>(() => store.get<string>(TARGET_KEY, ALL))
  const setTarget = (v: string) => { setTargetState(v); store.set(TARGET_KEY, v) }
  const [archive, setArchiveState] = useState(() => store.get<string>(ARCHIVE_KEY, 'all') === 'archived')
  const setArchive = (v: boolean) => { setArchiveState(v); store.set(ARCHIVE_KEY, v ? 'archived' : 'all') }
  const [fold, setFoldState] = useState<string[]>(() => store.get<string[]>(FOLD_KEY, ['done']))
  const toggle = (k: string) => { const v = fold.includes(k) ? fold.filter((x) => x !== k) : [...fold, k]; setFoldState(v); store.set(FOLD_KEY, v) }

  // 대상: 전체 · 앱 개발(앱 저장소가 있거나 대화가 있으면) · 등록한 프로젝트 · 등록에서 빠졌지만 대화가 있는 프로젝트 · 지식(대화가 있으면)
  // 다른 컴퓨터의 대화(machine)는 보관함에서 컴퓨터마다 묶어 읽기만 한다 (11/20). 대상은 이 컴퓨터의 대화로 정한다
  const mine = list.filter((c) => !c.machine)
  const live = mine.filter((c) => !c.archived)
  const has = (rid: string) => mine.some((c) => c.rid === rid)
  const targets = [ALL, ...(listed?.app || has(APP_RID) ? [APP_RID] : []), ...(projects ?? []).map((p) => p.id),
    ...[...new Set(mine.map((c) => c.rid))].filter((r) => r !== APP_RID && r !== LIBRARY_RID && !projects?.some((p) => p.id === r)), ...(has(LIBRARY_RID) ? [LIBRARY_RID] : [])]
  const at = targets.includes(target) ? target : ALL
  const inTarget = (c: ChatRow) => at === ALL || c.rid === at
  const shown = list.filter((c) => c.archived === archive && inTarget(c))
  const archived = list.filter((c) => c.archived && inTarget(c)).length

  const [menu, setMenu] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useDismiss(menu, box, () => setMenu(false))
  const newChat = () => { if (at === ALL || at === LIBRARY_RID || (at === APP_RID && !listed?.app)) go({ page: 'agent' }); else newChatIn(at) }

  // 여러 개 고르기 (10/28 시안 4절): 목록에서는 보관만, 보관함에서는 복원 · 지우기
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const bulk = useBulkChats()
  const stopPicking = () => { setPicking(false); setPicked([]) }
  const pickOf = (c: ChatRow) => picking ? {
    on: picked.includes(c.id),
    disabled: c.machine ? t('다른 컴퓨터의 대화는 그 컴퓨터에서 고칩니다', 'Change it on the computer where it ran') : !archive && isLive(c.state) ? t('도는 대화는 멈춘 뒤 보관합니다', 'Stop it before archiving') : undefined,
    toggle: () => setPicked(picked.includes(c.id) ? picked.filter((x) => x !== c.id) : [...picked, c.id]),
  } : undefined
  const line = (c: ChatRow) => <ChatLine key={c.id} c={c} on={c.id === id} actions pick={pickOf(c)} where={at === ALL ? targetName(c.rid, projects) : undefined} onOpen={() => go({ page: 'agent', id: c.id })} />

  /** 접는 묶음 하나: 머리(접기 › · 이름 · 수), 고르는 중이면 묶음 전체 고르기 */
  const group = (key: string, name: string, chats: ChatRow[], ui: string, empty?: string) => {
    const open = !fold.includes(key)
    return (
      <div key={key} className="ac-group" data-ui={ui} data-ui-item={name}>
        <div className={`ac-group-h${open ? ' open' : ''}`}>
          {picking && <GroupPick name={name} ids={chats.filter((c) => !pickOf(c)?.disabled).map((c) => c.id)} picked={picked} onPick={setPicked} />}
          <button className="ac-group-name" aria-expanded={open} onClick={() => toggle(key)} title={name}>
            <span className="tree-chev" aria-hidden><span>›</span></span>
            <span className="label">{name}</span>
            <span className="n">{chats.length}</span>
          </button>
        </div>
        {(open ? chats : chats.filter((c) => c.id === id)).map(line) /* 접혀도 연 대화 줄은 보인다 */}
        {open && !chats.length && empty && <div className="muted ac-group-empty">{empty}</div>}
      </div>
    )
  }

  const byState = (s: State) => shown.filter((c) => stateOf(c) === s).sort(s === 'queued' ? (a, b) => (a.queue ?? 99) - (b.queue ?? 99) : (a, b) => b.updated.localeCompare(a.updated))
  // 보관함은 대상마다 묶는다 (11/20 시안 1절 「보관함을 연 때」)
  const newest = (a: ChatRow, b: ChatRow) => b.updated.localeCompare(a.updated)
  const archiveGroups = [...targets.filter((r) => r !== ALL).map((r) => [`archive:${r}`, targetName(r, projects), shown.filter((c) => c.rid === r && !c.machine).sort(newest)] as const),
    ...[...new Set(shown.map((c) => c.machine).filter((m): m is string => !!m))].sort().map((m) => [`machine:${m}`, t(`${m}에서`, `On ${m}`), shown.filter((c) => c.machine === m).sort(newest)] as const)].filter(([, , cs]) => cs.length)

  return (
    <div className="set-side ac-list" data-ui="대화 목록">
      {(listed?.app || listed?.chats.some((c) => c.rid === CENTRAL_RID)) && <CentralLine row={listed?.chats.find((c) => c.rid === CENTRAL_RID && !c.archived && !c.local)} on={id === CENTRAL_PAGE || listed?.chats.some((c) => c.id === id && c.rid === CENTRAL_RID) === true} />}
      <div className="ac-target-line">
        <div className="ac-target-box" ref={box}>
          <button className="ac-target" data-ui="대화 대상" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
            <span className="ac-target-ic" aria-hidden>{Icon.menu}</span><b className="label">{targetName(at, projects)}</b><span className="n">{(at === ALL ? live : live.filter((c) => c.rid === at)).length}</span>
          </button>
          {menu && <div className="menu ac-target-menu" role="menu" data-ui="대상 메뉴">
            {targets.map((r, i) => <div key={r}>{(i === 1 || r === LIBRARY_RID || (i > 1 && targets[i - 1] === APP_RID)) && <hr className="ac-target-sep" />}
              <button role="menuitemradio" aria-checked={r === at} className={r === at ? 'on' : ''} onClick={() => { setTarget(r); setMenu(false) }}>
                <span className="label">{targetName(r, projects)}</span><span className="n">{(r === ALL ? live : live.filter((c) => c.rid === r)).length}</span>
              </button></div>)}
          </div>}
        </div>
        {!!shown.length && !picking && <button className="icon-btn" data-ui="대화 여러 개 고르기" data-tip={archive ? t('골라서 복원 · 삭제', 'Pick to restore or delete') : t('여러 개 골라 보관', 'Pick to archive')} aria-label={archive ? t('골라서 복원 · 삭제', 'Pick to restore or delete') : t('여러 개 골라 보관', 'Pick to archive')} onClick={() => setPicking(true)}>{Icon.pick}</button>}
        <button className="icon-btn tip-end" data-ui="새 대화 아이콘" data-tip={t('새 대화', 'New conversation')} aria-label={at === ALL ? t('새 대화', 'New conversation') : t(`${targetName(at, projects)}에서 새 대화`, `New conversation in ${targetName(at, projects)}`)} aria-current={!id ? 'page' : undefined} onClick={newChat}>{Icon.compose}</button>
      </div>
      {archive && <div className="ac-archive-h" data-ui="보관함 머리">{t('보관함', 'Archive')} {archived}</div>}
      {!!shown.length && picking && (
        <div className="ac-pickbar" data-ui="대화 고르기 툴바">
          <b>{t(`${picked.length}개 고름`, `${picked.length} picked`)}</b>
          <span className="sp" />
          {archive
            ? <>
              <button className="btn sm" disabled={!picked.length || bulk.busy} onClick={() => void bulk.archive(picked, false).then(stopPicking)}>{t('복원', 'Restore')}</button>
              <button className="btn sm danger" data-ui="대화 지우기" disabled={!picked.length || bulk.busy} onClick={() => void bulk.remove(picked).then((ok) => { if (ok) { if (id && picked.includes(id)) go({ page: 'agent' }); stopPicking() } })}>{t('삭제', 'Delete')}</button>
            </>
            : <button className="btn sm" disabled={!picked.length || bulk.busy} onClick={() => void bulk.archive(picked, true).then(stopPicking)}>{t('보관', 'Archive')}</button>}
          <button className="btn sm" onClick={stopPicking}>{t('취소', 'Cancel')}</button>
        </div>)}
      {archive
        ? (archiveGroups.length ? archiveGroups.map(([k, name, cs]) => group(k, name, cs, '보관함 묶음')) : <div className="empty">{t('보관한 대화가 없습니다', 'Nothing archived')}</div>)
        : STATES.map((s) => group(s, STATE_GROUP[s], byState(s), '상태 묶음', STATE_EMPTY[s]))}
      {/* 보관함은 맨 아래 아이콘 하나로 열고 닫는다 (11/19 피드백 09:23) */}
      {(archive || archived > 0) && <div className="ac-side-foot"><button className={`icon-btn ac-archive-btn${archive ? ' on' : ''}`} data-ui="보관함 아이콘" aria-pressed={archive} data-tip={archive ? t('보관함 닫기', 'Close archive') : t(`보관함 ${archived}`, `Archive ${archived}`)} aria-label={archive ? t('보관함 닫기', 'Close archive') : t(`보관함 열기 (${archived})`, `Open archive (${archived})`)} onClick={() => { stopPicking(); setArchive(!archive) }}>{Icon.archive}{archived > 0 && <span className="n">{archived}</span>}</button></div>}
    </div>
  )
}
