// 중앙 대화 (11/16 사용자 결정 "중앙 에이전트", 시안 https://claude.ai/artifact/9x2Bud4dVQyYkS6RhdnbAG §2):
// 대화 목록 맨 위에 고정한 「중앙」 줄, 처음 말하는 화면, 중앙 오른쪽 칸의 작업 현황. 하위 대화는 보통 대화와 같은 화면으로 연다
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { agentChatsApi, type ChatEffort, type ChatRow } from './api'
import { effortsOf, familyName, familyOf, fitEffort, modelFamilies, pickFamily, useModels } from './AgentPick'
import { EFFORT_NAME, PopButton } from './ChatComposer'
import { accountLabel, useAgentAccounts } from './ClaudeAccountsSettings'
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

/** 중앙 대화가 없을 때: 첫 말을 보내면 중앙을 열고 그 대화로 간다 */
export function CentralStart() {
  const client = useQueryClient()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState<string | null>(null)
  const [start, setStart] = useState<{ model: string; effort: ChatEffort; account?: string }>({ model: 'opus', effort: 'medium' })
  const submit = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    setFail(null)
    try {
      const c = await agentChatsApi.talk(text.trim(), screenLine(), start)
      client.setQueryData(qk.agentChat(c.id), c)
      void client.invalidateQueries({ queryKey: qk.agentChatLists })
      go({ page: 'agent', id: c.id })
    } catch (e) { setFail(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  return (
    <div className="scroll"><div className="page-body ac-start" data-ui="중앙 시작">
      <h1 className="ac-h">{t('중앙', 'Central')}</h1>
      <p className="muted ac-central-what">{t(
        '무엇이든 여기에 먼저 말하세요. 질문에는 바로 답하고, 앱 고치기 · 프로젝트 작성 · 피드백 처리는 하위 대화를 열어 맡깁니다. 중앙은 파일을 고치지 않지만 커밋 · 푸시 · PR 합치기(squash)는 직접 하고, 다시 시작은 내가 합니다.',
        'Say anything here first. It answers questions directly and hands app fixes, project writing and feedback to sub-conversations. Central does not edit files but commits, pushes and squash-merges PRs itself; restarting stays with you.',
      )}</p>
      <textarea id="central-first" className="ac-central-input" rows={4} value={text} autoFocus placeholder={t('예: 피드백에서 그림이 안 보인대. 고쳐 줘', 'Example: pictures do not show in feedback. Fix it')}
        aria-label={t('중앙에게 말하기', 'Talk to Central')} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) { e.preventDefault(); void submit() } }} />
      <div className="ac-central-send">
        <span className="ac-central-picks"><StartPicks start={start} onChange={(s) => setStart((o) => ({ ...o, ...s }))} /></span>
        {fail && <span className="error-text">{fail}</span>}
        <button className="btn primary" disabled={!text.trim() || busy} onClick={() => void submit()}>{t('보내기', 'Send')}</button>
      </div>
    </div></div>
  )
}

/**
 * 중앙을 처음 열 때 고르는 모델 · 생각 깊이 · 계정 (11/20 시안 5절 "모델 변경/크레딧을 사용하는 계정도 변경할 수 있게").
 * 중앙은 Claude가 맡으므로 에이전트는 고르지 않는다. 연 뒤에는 중앙 입력란의 같은 메뉴로 바꾼다
 */
function StartPicks({ start, onChange }: { start: { model: string; effort: ChatEffort; account?: string }; onChange(s: Partial<{ model: string; effort: ChatEffort; account: string }>): void }) {
  const models = useModels('claude-code')
  const accounts = (useAgentAccounts('claude').data?.accounts ?? []).filter((a) => a.login)
  const fam = familyOf(start.model, models)
  const efforts = effortsOf(start.model, models)
  const check = (on: boolean) => <span className="ac-pop-check" aria-hidden>{on ? Icon.check : null}</span>
  const account = accounts.find((a) => a.id === start.account)
  return <>
    <PopButton ui="모델 고르기" tip={t('모델', 'Model')} down label={<>{familyName(start.model, models)} ▾</>}>
      {(close) => modelFamilies(models).filter((f) => f.base !== 'default').map((f) => {
        const on = (fam.family?.base ?? '') === f.base, value = pickFamily(f, fam.suffix)
        return <button key={f.base} role="menuitemradio" aria-checked={on} className={on ? 'on' : ''} onClick={() => { close(); onChange({ model: value, ...fitEffort(start.effort, effortsOf(value, models)) }) }}>{check(on)}{f.name}</button>
      })}
    </PopButton>
    {efforts.length > 0 && <PopButton ui="생각 고르기" tip={t('생각 깊이', 'Thinking')} down label={<>{EFFORT_NAME[start.effort]} ▾</>}>
      {(close) => efforts.map((m) => <button key={m} role="menuitemradio" aria-checked={start.effort === m} className={start.effort === m ? 'on' : ''} onClick={() => { close(); onChange({ effort: m }) }}>{check(start.effort === m)}{EFFORT_NAME[m]}</button>)}
    </PopButton>}
    {accounts.length > 1 && <PopButton ui="중앙 계정" tip={t('크레딧을 쓰는 계정', 'Account whose credits are used')} down label={<>{account ? accountLabel(account) : t('기본 계정', 'Default account')} ▾</>}>
      {(close) => accounts.map((a) => <button key={a.id} role="menuitemradio" aria-checked={start.account === a.id} className={start.account === a.id ? 'on' : ''} onClick={() => { close(); onChange({ account: a.id }) }}>{check(start.account === a.id)}{accountLabel(a)}</button>)}
    </PopButton>}
  </>
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
