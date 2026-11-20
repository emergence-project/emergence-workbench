// 토론 (11/20 사용자 결정 「토론 + 정해진 4단계」, 시안 https://claude.ai/artifact/R88teWLKuf7DgokaYQA61n):
// 중앙과 따로 연 대화. 머리 아래 단계 띠(① 각자 답 ② 서로 비판 ③ 고친 답 ④ 정리), 답마다 「답 A」 · 판정 · 입장 바꿈,
// 오른쪽 칸의 토론 설정(비판 회수 · 같으면 건너뛰기 · 참가자와 정리의 모델 · 생각), 머리의 「토론 끝내기」, 중앙의 한 줄
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ROOM_NAME } from '@rw/core'
import type { DebateSeat, DebateStage } from '@rw/core/contract/agentChats'
import { agentChatsApi, type Chat, type ChatEffort, type ChatItem } from './api'
import { AGENT_KINDS, effortsOf, isClaude, modelFamilies, useModels } from './AgentPick'
import { EFFORT_NAME, effortLabel } from './ChatComposer'
import { Seg, tallyText, V_NAME, Who, type ComposerRoom } from './CentralRoom'
import { Icon } from './icons'
import { t } from './i18n'
import { MemoText } from './memo'
import { qk } from './queries'
import { go } from './router'
import { SideSection } from './SideSection'

/** 계약의 DEBATE_STAGES와 같은 차례 (값을 가져오면 화면 번들에 zod가 들어간다) */
const DEBATE_STAGES: DebateStage[] = ['answer', 'critique', 'revise', 'sum']
export const STAGE_NAME: Record<DebateStage, string> = { answer: t('각자 답', 'Answer alone'), critique: t('서로 비판', 'Critique'), revise: t('고친 답', 'Revise'), sum: t('정리', 'Sum up') }
const STAGE_TIP: Record<DebateStage, string> = {
  answer: t('서로의 답을 보지 않고 동시에 답합니다', 'Everyone answers at once without seeing the others'),
  critique: t('이름을 가리고(답 A · 답 B) 서로의 답에서 틀린 곳을 짚습니다. 모두 같은 판정이면 건너뜁니다', 'With names hidden (answer A, B), each points out errors in the others. Skipped when all agree'),
  revise: t('비판을 읽고 답을 고칩니다. 입장을 바꾸려면 「새 근거:」를 적어야 합니다', 'Each revises after reading the critiques. Changing a position needs a "New reason:" line'),
  sum: t('정리 모델이 투표하지 않고, 이름을 가린 마지막 답으로 세 줄을 씁니다', 'The summarizer does not vote; it writes three lines from the final answers with names hidden'),
}

/** 머리 아래 단계 띠: 지금 단계 · 지난 단계 ✓, 참가자와 정리 */
export function DebateStrip({ chat }: { chat: Chat }) {
  const d = chat.debate
  if (!d) return null
  const at = d.step === 'done' ? DEBATE_STAGES.length : DEBATE_STAGES.indexOf(d.step)
  const ran = (s: DebateStage) => chat.items.some((x) => x.kind === 'member' && x.stage === s)
  return (
    <div className="room-strip debate-strip" data-ui="토론 단계">
      {DEBATE_STAGES.map((s, i) => {
        // 끝난 토론에서 돌지 않은 단계는 ✓를 그리지 않는다: 비판 · 고친 답은 건너뜀, 멈추거나 답이 없어 정리가 없으면 정리도 (11/21)
        const skipped = d.step === 'done' && !ran(s)
        return <span key={s} className={`debate-step${i === at ? ' on' : ''}${i < at && !skipped ? ' done' : ''}`} data-tip={STAGE_TIP[s]}>
          {i < at && !skipped ? Icon.check : <b>{i + 1}</b>}{STAGE_NAME[s]}{s === 'critique' && (skipped ? <span className="muted"> · {t('건너뜀', 'skipped')}</span> : d.rounds > 1 && i === at && <span className="muted"> {d.round}/{d.rounds}</span>)}
        </span>
      })}
      <span className="sp" />
      <span className="muted">{t('참가', 'With')}</span>{d.seats.map((s) => <Who key={s.agent} agent={s.agent} />)}
      <span className="muted">· {t('정리', 'Sum')}</span><Who agent={d.judge.agent} />
    </div>
  )
}

/** 토론의 답 하나: 단계 · 답 A · 판정 · 입장 바꿈(근거 없는 바꿈). 정리는 판정 모음 칩 */
export function DebateMember({ it }: { it: Extract<ChatItem, { kind: 'member' }> }) {
  const stage = it.stage!
  const tally = it.votes && it.votes.length >= 2 ? tallyText(it.votes) : undefined
  const body = it.text ? <MemoText text={it.text} /> : it.error ? <span className="error-text">! {it.error}</span> : <span className="muted">{t('답하는 중…', 'Answering…')}</span>
  return (
    <li className={`room-member debate-member ${stage}`} data-ui="토론 답" title={new Date(it.at).toLocaleString()}>
      <div className="room-member-h">
        <span className="debate-stage">{STAGE_NAME[stage]}{it.round && stage !== 'answer' && stage !== 'sum' ? ` ${it.round}` : ''}</span>
        <Who agent={it.by} />{it.label && <span className="debate-label">{t(`답 ${it.label}`, `Answer ${it.label}`)}</span>}
        {it.prev && it.verdict && <span className="verdict-stance" data-ui="입장 바꿈">{t(`입장 바꿈 · ${V_NAME[it.prev]} → ${V_NAME[it.verdict]}`, `Changed · ${V_NAME[it.prev]} → ${V_NAME[it.verdict]}`)}{it.bare && <span data-ui="근거 없는 바꿈" data-tip={t('「새 근거:」 없이 판정을 바꿨습니다', 'Changed the verdict without a "New reason:" line')}> · {t('근거 없음', 'no reason')}</span>}</span>}
        {it.verdict && <span className="verdict-chip" data-ui="판정">{t('판정', 'Verdict')} · {V_NAME[it.verdict]}</span>}
        {tally && <span className={`verdict-chip${tally.split ? ' split' : ''}`} data-ui="판정 모음">{tally.text}{it.changed ? t(` · 바꿈 ${it.changed}`, ` · ${it.changed} changed`) : ''}</span>}
      </div>
      {body}
    </li>
  )
}

/** 중앙의 토론 한 줄: 물음 · 결과 · 열기 */
export function DebateLine({ it }: { it: Extract<ChatItem, { kind: 'debate' }> }) {
  const tally = it.votes?.length ? tallyText(it.votes) : undefined
  // 멈추거나 답이 없어 정리가 없는 토론을 「정리됨」이라 하지 않는다 (결론 줄과 판정이 정리의 표시다)
  const state = it.state === 'running' ? t('도는 중', 'Running') : it.state === 'ended' ? t('끝냄', 'Ended') : it.line ? t('정리됨 · 끝내기 전', 'Summed up · not ended') : t('멈춤 · 정리 없음', 'Stopped · no summary')
  return (
    <li className="ac-note debate-line" data-ui="토론 줄" title={new Date(it.at).toLocaleString()}>
      <span className="debate-tag">{t('토론', 'Debate')}</span>
      <span className="debate-q" title={it.q}>{it.q}{it.line && <span className="muted"> — {it.line}</span>}</span>
      {tally && <span className={`verdict-chip${tally.split ? ' split' : ''}`}>{tally.text}{it.changed ? t(` · 바꿈 ${it.changed}`, ` · ${it.changed} changed`) : ''}</span>}
      <span className="muted debate-state">{state}</span>
      <button className="a" data-ui="토론 열기" onClick={() => go({ page: 'agent', id: it.chat })}>{t('열기 ›', 'Open ›')}</button>
    </li>
  )
}

function useDebateChange(id: string, onError: (m: string) => void) {
  const client = useQueryClient()
  return async (run: () => Promise<Chat>) => {
    try { client.setQueryData(qk.agentChat(id), await run()); void client.invalidateQueries({ queryKey: qk.agentChatLists }) } catch (e) { onError(e instanceof Error ? e.message : String(e)) }
  }
}

/** 머리의 「토론 끝내기」: 기록에 한 줄 · 중앙에 결론 · 보관함 */
export function DebateEnd({ chat, onError }: { chat: Chat; onError(m: string): void }) {
  const change = useDebateChange(chat.id, onError)
  if (!chat.debate || chat.debate.ended || chat.state === 'running') return null
  return <button className="btn sm" data-ui="토론 끝내기" data-tip={t('토론 기록에 한 줄 남기고, 중앙에 결론을 적고, 이 대화를 보관함에 넣습니다', 'Logs one line, writes the conclusion in Central and archives this conversation')}
    onClick={() => void change(() => agentChatsApi.debateEnd(chat.id))}>{t('토론 끝내기', 'End debate')}</button>
}

/** 생각 깊이 값 (계약의 CHAT_EFFORTS와 같은 차례) */
const EFFORT_KEYS: ChatEffort[] = ['low', 'medium', 'high', 'xhigh', 'max']
const effortName = (x: string) => { const k = EFFORT_KEYS.find((y) => y === x); return k ? EFFORT_NAME[k] : effortLabel(x) }

/** 자리 한 줄: 에이전트 · 모델 · 생각 (× 빼기) */
function SeatRow({ seat, role, onPick, onRemove, disabled }: { seat: DebateSeat; role?: string; onPick(s: DebateSeat): void; onRemove?(): void; disabled?: string }) {
  const list = useModels(seat.agent)
  const fams = modelFamilies(list).filter((f) => f.base !== 'default')
  const fam = fams.find((f) => f.base === seat.model)
  const efforts: string[] = isClaude(seat.agent) ? effortsOf(seat.model ?? 'default', list) : (fam ?? fams[0])?.variants.map((v) => v.suffix) ?? []
  return (
    <div className="debate-seat" data-ui="토론 자리" data-ui-item={ROOM_NAME[seat.agent]}>
      <Who agent={seat.agent} />{role && <span className="muted">{role}</span>}
      <select className="mini-select" aria-label={t('모델', 'Model')} data-ui="토론 모델" value={seat.model ?? ''} onChange={(e) => { const { model: _m, ...rest } = seat; onPick(e.target.value ? { ...rest, model: e.target.value } : rest) }}>
        <option value="">{t('기본 모델', 'Default model')}</option>
        {fams.map((f) => <option key={f.base} value={f.base}>{f.name}</option>)}
      </select>
      {efforts.length > 0 ? <select className="mini-select" aria-label={t('생각 깊이', 'Thinking')} data-ui="토론 생각" value={seat.effort ?? ''} onChange={(e) => { const { effort: _e, ...rest } = seat; onPick(e.target.value ? { ...rest, effort: EFFORT_KEYS.find((k) => k === e.target.value) } : rest) }}>
        <option value="">{t('생각 기본', 'Default thinking')}</option>
        {efforts.map((x) => <option key={x} value={x}>{effortName(x)}</option>)}
      </select> : <span />}
      {onRemove ? <button className="icon-btn sm" data-ui="토론 참가자 빼기" aria-label={t('참가자 제거', 'Remove participant')} data-tip={disabled ?? t('참가자 제거', 'Remove participant')} disabled={!!disabled} onClick={onRemove}>{Icon.x}</button> : <span />}
    </div>
  )
}

/** 오른쪽 칸의 토론 설정. 고른 값은 다음 토론의 기본이 된다 */
export function DebatePanel({ chat }: { chat: Chat }) {
  const [fail, setFail] = useState<string | null>(null)
  const change = useDebateChange(chat.id, setFail)
  const d = chat.debate
  if (!d) return null
  const running = chat.state === 'running' ? t('토론이 도는 중에는 참가자를 바꾸지 않습니다', 'Participants do not change while the debate runs') : undefined
  const seats = (s: DebateSeat[]) => void change(() => agentChatsApi.debateSettings(chat.id, { seats: s }))
  const free = AGENT_KINDS.filter((a) => !d.seats.some((s) => s.agent === a))
  return (
    <SideSection title={t('토론', 'Debate')} ui="토론 설정" aside={<span className="cb-counts">{t('고른 값은 다음 토론에도', 'Kept for the next debate')}</span>}>
      <div className="room-rule"><span>{t('서로 비판 회수', 'Critique rounds')}</span><Seg value={d.rounds} name={t('서로 비판 회수', 'Critique rounds')} ui="토론 회수" onPick={(n) => void change(() => agentChatsApi.debateSettings(chat.id, { rounds: n }))} options={[0, 1, 2].map((n) => ({ v: n, label: String(n) }))} /></div>
      <label className="room-rule"><span>{t('모두 같은 판정이면 비판 건너뛰기', 'Skip critique when all agree')}</span><input type="checkbox" data-ui="토론 건너뛰기" checked={d.skip} onChange={(e) => void change(() => agentChatsApi.debateSettings(chat.id, { skip: e.target.checked }))} /></label>
      <div className="debate-seats">
        {d.seats.map((s, i) => <SeatRow key={s.agent} seat={s} onPick={(n) => seats(d.seats.map((x, j) => (j === i ? n : x)))} onRemove={d.seats.length > 2 ? () => seats(d.seats.filter((_, j) => j !== i)) : undefined} disabled={running} />)}
        {free.length > 0 && !running && <div className="debate-add">{free.map((a) => <button key={a} className="a" data-ui="토론 참가자 더하기" onClick={() => seats([...d.seats, { agent: a }])}>＋ {ROOM_NAME[a]}</button>)}</div>}
        <SeatRow seat={d.judge} role={t('정리 · 투표 안 함', 'Sums up · no vote')} onPick={(j) => void change(() => agentChatsApi.debateSettings(chat.id, { judge: j }))} />
      </div>
      <span className="muted ac-hint">{t('참가자는 다음 물음부터 바뀝니다. 더 물으면 1단계부터 다시 돕니다', 'Participant changes apply from the next question. Asking more starts again from step 1')}</span>
      {fail && <span className="error-text ac-hint">{fail}</span>}
    </SideSection>
  )
}

/** 입력란: 설정 없이 받는 이만 */
export const debateComposer = (chat: Chat): ComposerRoom | undefined => chat.debate && {
  people: [], plain: true,
  hint: () => <span className="room-to" data-ui="받는 이">{t('받는 이', 'To')} · {t('참가자 모두', 'All participants')}{chat.debate!.seats.map((s) => <Who key={s.agent} agent={s.agent} />)}· {t('정리는', 'Sum by')} <Who agent={chat.debate!.judge.agent} /></span>,
}
