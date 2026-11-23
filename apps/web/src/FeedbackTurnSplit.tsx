import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, type FeedbackItem } from './api'
import { userTurn } from '@rw/core'
import { flash } from './flash'
import { t } from './i18n'
import { qk } from './queries'
import { approveEach, TurnGroupHead } from './TurnGroup'

/** 표의 줄 끝에 붙일 단추. open은 그 줄을 펼친다 */
export type FeedbackRowAct = (e: FeedbackItem, open: () => void) => ReactNode

/**
 * 피드백 › 확인 필요를 두 묶음으로 (11/23 시안 turn-split ①): 결정 필요(답할 것: 동의 · 질의 · 진행 여부)는 위에 지금 표 그대로,
 * 확인만(반영이 끝나 승인 · 반려만 남은 것)은 아래에 옅은 표로 두고 줄 끝의 반려(줄을 펼쳐 쓴다) · 승인, 머리의 모두 승인.
 * 표는 피드백 화면의 표(table)를 그대로 받아 그린다.
 */
export function FeedbackTurnSplit({ list, table }: { list: FeedbackItem[]; table(list: FeedbackItem[], act?: FeedbackRowAct): ReactNode }) {
  const client = useQueryClient()
  const decide = list.filter((e) => userTurn(e) !== 'confirm')
  const confirm = list.filter((e) => userTurn(e) === 'confirm')
  const done = () => void client.invalidateQueries({ queryKey: qk.feedback })
  const approve = (e: FeedbackItem) => api.reviewFeedback(e.key, '승인')
  const approveAll = async () => {
    let ok = 0
    await approveEach(confirm, async (e) => { try { await approve(e); ok++ } catch (err) { flash(err instanceof Error ? err.message : String(err), undefined, { error: true }) } })
    done()
    flash(t(`${ok}개를 승인했습니다`, `Approved ${ok}`))
  }
  const act: FeedbackRowAct = (e, open) => <span className="fbp-turn-act">
    <button className="a" data-ui="반려" onClick={(ev) => { ev.stopPropagation(); open() }}>{t('반려', 'Revise')}</button>
    <button className="btn sm" data-ui="승인" onClick={(ev) => { ev.stopPropagation(); void approve(e).then(done, (err: Error) => flash(err.message, undefined, { error: true })) }}>{t('승인', 'Approve')}</button>
  </span>
  if (!confirm.length) return <>{table(decide)}</>
  return <>
    {decide.length > 0 && <><TurnGroupHead count={decide.length} />{table(decide)}</>}
    <TurnGroupHead pale count={confirm.length} note={t('반영 끝 · 승인하면 닫힘', 'Fixed · approve to close')} onApproveAll={approveAll} />
    <div className="turn-pale-row">{table(confirm, act)}</div>
  </>
}
