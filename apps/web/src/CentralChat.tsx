// 중앙 대화 (11/16 사용자 결정 "중앙 에이전트", 시안 https://claude.ai/artifact/9x2Bud4dVQyYkS6RhdnbAG §2):
// 대화 목록 맨 위에 고정한 「중앙」 줄, 처음 말하는 화면, 중앙 오른쪽 칸의 작업 현황. 하위 대화는 보통 대화와 같은 화면으로 연다
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { agentChatsApi, CENTRAL_RID, type ChatEffort, type ChatMessageBody, type ChatRow } from './api'
import { Composer } from './ChatComposer'
import { Icon } from './icons'
import { ChatStateMark, stateName } from './AgentChats'
import { shownState } from './agentSeen'
import { boardCounts, boardRows, STALL_MIN, type BoardGroup, type BoardRow } from './centralBoard'
import { t } from './i18n'
import { screenLine } from './screenView'
import { SideSection } from './SideSection'
import { relativeTime } from './format'
import { qk } from './queries'
import { go } from './router'
import { useDismiss } from './useDismiss'

/** 중앙 대화가 아직 없을 때 여는 화면의 주소 id (#/agent/central) */
export const CENTRAL_PAGE = 'central'

const useCentral = () => useQuery({ queryKey: qk.agentCentral, queryFn: () => agentChatsApi.central() })

/** 대화 목록 맨 위의 「중앙」 줄: 작업 현황의 남음 · 내 차례 · 정체 */
export function CentralLine({ row, on, onOpen }: { row?: ChatRow; on: boolean; onOpen?(id: string): void }) {
  const { counts } = useBoard()
  return (
    <button className={`nav ac-line ac-central${on ? ' on' : ''}`} data-ui="중앙 대화 줄" onClick={() => (onOpen ? row && onOpen(row.id) : go({ page: 'agent', id: row?.id ?? CENTRAL_PAGE }))}>
      <span className="ac-line-top"><span className="ac-line-dot">{row && <ChatStateMark state={shownState(row)} name={stateName(row)} />}</span><span className="label">{t('중앙', 'Central')}</span></span>
      <span className="ac-line-meta">
        {row ? <CountLine counts={counts} />
          : onOpen ? t('아래 입력란에 말하면 중앙이 열립니다', 'Type below to start the central conversation') : t('질문 · 앱 고치기 · 프로젝트 작성을 한곳에서', 'Questions, app fixes and project writing in one place')}
      </span>
    </button>
  )
}

/**
 * 중앙 대화가 없을 때: 첫 말을 보내면 중앙을 열고 그 대화로 간다.
 * 입력란은 새 대화와 같은 상자 (11/20 피드백 "새 대화창의 디자인을 통일"): ＋ 붙이기 · 모델 · 생각 · 계정은 상자 안 아래 줄, 둥근 보내기.
 * 중앙은 파일을 고치지 않아 맡기는 정도는 고르지 않는다. 그림은 연 뒤의 입력란에서 붙인다
 */
export function CentralStart() {
  const client = useQueryClient()
  const [start, setStart] = useState<{ model: string; effort: ChatEffort; account?: string }>({ model: 'opus', effort: 'medium' })
  const submit = async (m: ChatMessageBody) => {
    if (m.images?.length) throw new Error(t('중앙의 첫 말에는 그림을 붙일 수 없습니다. 연 뒤에 붙이세요', 'Images can be attached after Central opens'))
    const c = await agentChatsApi.talk(m.text, screenLine(), start, m.attach)
    client.setQueryData(qk.agentChat(c.id), c)
    void client.invalidateQueries({ queryKey: qk.agentChatLists })
    go({ page: 'agent', id: c.id })
    return true
  }
  return (
    <div className="scroll"><div className="page-body ac-start" data-ui="중앙 시작">
      <h1 className="ac-h">{t('중앙', 'Central')}</h1>
      <div className="ac-new">
        <Composer rid={CENTRAL_RID} keep="new:central" agentFixed noTrust autoFocus
          settings={{ trust: 'read', agent: 'claude', model: start.model, effort: start.effort, account: start.account ?? 'default' }}
          onSettings={(s) => setStart((o) => ({ ...o, ...(s.model && { model: s.model }), ...(s.effort && { effort: s.effort }), ...(s.account && { account: s.account }) }))}
          onSubmit={submit} placeholder={t('무엇이든 먼저 말하세요. 질문에는 바로 답하고, 앱 고치기 · 프로젝트 작성 · 피드백 처리는 하위 대화에 맡깁니다', 'Say anything first. Questions get answered here; app fixes, project writing and feedback go to sub-conversations')} />
      </div>
    </div></div>
  )
}

/** 작업 현황의 시각 · 정체를 1분마다 다시 센다 */
function useMinute() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const h = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(h) }, [])
  return now
}

function useBoard() {
  const s = useCentral().data
  const now = useMinute()
  const b = s ? boardRows(s, now) : { rows: [], moreFeedback: 0 }
  return { ...b, counts: boardCounts(b.rows, b.moreFeedback) }
}

const GROUP_NAME: Record<BoardGroup, string> = { turn: t('내 차례', 'Your turn'), doing: t('진행 중', 'In progress'), ready: t('합칠 준비', 'Ready to merge'), done: t('종료 · 오늘', 'Done today') }

/** 머리 한 줄: 남음 n · 내 차례 n · 정체 n */
function CountLine({ counts: n }: { counts: ReturnType<typeof boardCounts> }) {
  return (
    <span className="cb-counts">
      {t(`남음 ${n.left}`, `${n.left} left`)} · <span className={n.turn ? 'ac-central-turn' : undefined}>{t(`내 차례 ${n.turn}`, `${n.turn} for you`)}</span>
      {n.stalled > 0 && <> · <span className="ac-central-turn">{t(`정체 ${n.stalled}`, `${n.stalled} stalled`)}</span></>}
    </span>
  )
}

/**
 * 중앙의 작업 현황 (11/19 피드백 "뭐가 남아있고, 뭐가 정체되어 있는지", 시안 2026-11-19-central-checklist 안 A):
 * 맡긴 하위 대화 · 자리 기다림 · 사용자가 답할 피드백을 묶음(내 차례 → 진행 중 → 합칠 준비 → 종료 · 오늘)마다 한 줄씩.
 * 줄은 서버가 대화를 바꿀 때마다(차례 끝 · 허락 · CI · 합침 · 사용자 고름) 바로 바뀐다
 */
export function CentralBoard({ onPick }: { onPick?(): void }) {
  const { rows, moreFeedback, counts } = useBoard()
  const [doneOpen, setDoneOpen] = useState(false)
  const pick = (to: () => void) => () => { to(); onPick?.() }
  const row = (r: BoardRow) => {
    const open = r.id ? pick(() => go({ page: 'agent', id: r.id! })) : r.feedback ? pick(() => go({ page: 'feedback' })) : undefined
    const body = <>
      <span className={`cb-mark ${r.mark}`} role="img" aria-label={r.stage} />
      <span className="cb-title" title={r.title}>{r.title}</span>
      {r.at && <span className={`cb-time${r.stalled !== undefined ? ' stalled' : ''}`}>{relativeTime(Date.parse(r.at))}</span>}
      <span className="cb-sub">
        {r.feedback && <span className="tag">{t('피드백', 'Feedback')}</span>}
        <span className={r.mark === 'user' && r.group === 'turn' ? 'cb-stage turn' : 'cb-stage'}>{r.stage}</span>
        {r.extras.map((x) => <span key={x}>· {x}</span>)}
        {r.stalled !== undefined && <span className="cb-stall">{t(`정체 · ${r.stalled}분 그대로`, `Stalled · ${r.stalled} min unchanged`)}</span>}
      </span>
    </>
    return open
      ? <button key={r.key} className="cb-row" data-ui="작업 현황 줄" data-ui-item={r.title} onClick={open}>{body}</button>
      : <div key={r.key} className="cb-row" data-ui="작업 현황 줄" data-ui-item={r.title}>{body}</div>
  }
  const group = (g: BoardGroup) => {
    const list = rows.filter((r) => r.group === g)
    const n = list.length + (g === 'turn' ? moreFeedback : 0)
    if (!n) return null
    const folded = g === 'done' && !doneOpen
    return (
      <div key={g} className="cb-group" data-ui={`작업 현황 ${GROUP_NAME[g]}`}>
        <div className="cb-group-head">
          <b>{GROUP_NAME[g]}</b>{g === 'turn' ? <span className="rail-count">{n}</span> : <span className="muted">{n}</span>}
          {g === 'done' && <button className="a cb-fold" aria-expanded={doneOpen} onClick={() => setDoneOpen(!doneOpen)}>{doneOpen ? t('접기 ‹', 'Hide ‹') : t('펼치기 ›', 'Show ›')}</button>}
        </div>
        {!folded && list.map(row)}
        {g === 'turn' && moreFeedback > 0 && <button className="a cb-more" data-ui="피드백 모두 보기" onClick={pick(() => go({ page: 'feedback' }))}>{t(`피드백 ${moreFeedback}개 더 · 모두 보기 ›`, `${moreFeedback} more feedback · see all ›`)}</button>}
      </div>
    )
  }
  return (
    <SideSection title={t('작업 현황', 'Work status')} ui="작업 현황" aside={<CountLine counts={counts} />}>
      {rows.length || moreFeedback ? (['turn', 'doing', 'ready', 'done'] as const).map(group)
        : <span className="muted ac-hint">{t('맡긴 일이 없습니다. 중앙에게 말하면 하위 대화를 열어 여기에 한 줄씩 보입니다', 'Nothing handed off. Ask Central and each sub-conversation shows here as a row')}</span>}
      <span className="muted ac-hint cb-rule">{t(`정체: 진행 중 ${STALL_MIN.run}분 · CI ${STALL_MIN.ci}분 · 합칠 준비 ${STALL_MIN.ready}분 동안 움직임 없음`, `Stalled: no move for ${STALL_MIN.run} min working, ${STALL_MIN.ci} min on checks, ${STALL_MIN.ready} min ready to merge`)}</span>
    </SideSection>
  )
}

/** 중앙 대화 머리의 「작업 현황 n 남음」: 오른쪽 칸이 닫혔거나 좁은 화면(900px 아래, 칸이 숨음)에서 팝오버로 */
export function CentralBoardButton({ narrowOnly }: { narrowOnly: boolean }) {
  const { counts } = useBoard()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  useDismiss(open, box, () => setOpen(false))
  return (
    <span className={`cb-pop-wrap${narrowOnly ? ' narrow-only' : ''}`} ref={box}>
      <button className={`btn sm${open ? ' on' : ''}`} data-ui="작업 현황 버튼" aria-expanded={open} onClick={() => setOpen(!open)}>
        {t('작업 현황', 'Work status')}{counts.left > 0 && <span className={counts.turn ? 'ac-central-turn' : 'muted'}>{t(` ${counts.left} 남음`, ` ${counts.left} left`)}</span>}
      </button>
      {open && <div className="cb-pop" data-ui="작업 현황 팝오버"><CentralBoard onPick={() => setOpen(false)} /></div>}
    </span>
  )
}
