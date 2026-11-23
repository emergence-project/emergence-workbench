import { useState } from 'react'
import type { Task } from './api'
import type { FlashAction } from './flash'
import { t } from './i18n'
import { taskLine } from './taskView'
import { approveEach, TurnGroupHead } from './TurnGroup'
import { SendBackRow, sendJudgment, TaskCard } from './WorkTasks'

type Saved = (message: string, action?: FlashAction) => void

/** 여럿을 승인할 때 알림을 한 번만: 실패한 것만 그 말을 보이고, 끝에 승인한 수를 알린다 */
export async function approveTasks(rid: string, list: readonly Task[], onSaved: Saved, reload: () => unknown) {
  let ok = 0
  const fails: string[] = []
  await approveEach(list, (tk) => sendJudgment(rid, tk, 'approve', {}, (m) => { if (m === t('승인했습니다', 'Approved')) ok++; else fails.push(m) }, () => undefined))
  await reload()
  onSaved(fails[0] ?? t(`${ok}개를 승인했습니다`, `Approved ${ok}`))
}

/**
 * 확인만 묶음의 맡긴 일 (11/23 시안 turn-split ②): 종결 조건을 통과해 승인 한 번이면 끝나는 결과.
 * 옅은 한 줄에 수정 요청 · 승인을 바로 두고, 줄을 누르면 판단 카드를 펼쳐 보고서를 읽는다
 */
export function ConfirmTaskList({ rid, tasks, openId, onToggle, onSaved, reload, onEditProposal, head = true }: {
  rid: string; tasks: Task[]; openId: string | null; onToggle(id: string): void
  onSaved: Saved; reload(): unknown; onEditProposal(t: Task): void
  /** 묶음 머리(확인만 n · 모두 승인)를 붙일지 */
  head?: boolean
}) {
  if (!tasks.length) return null
  return <>
    {head && <TurnGroupHead pale count={tasks.length} note={t('끝난 일 · 승인하면 닫힘', 'Finished · approve to close')} onApproveAll={() => approveTasks(rid, tasks, onSaved, reload)} />}
    {tasks.map((tk) => openId === tk.id
      ? <TaskCard key={tk.id} rid={rid} task={tk} open onToggle={() => onToggle(tk.id)} onSaved={onSaved} reload={reload} onEditProposal={onEditProposal} />
      : <ConfirmTaskRow key={tk.id} rid={rid} task={tk} onToggle={() => onToggle(tk.id)} onSaved={onSaved} reload={reload} />)}
  </>
}

function ConfirmTaskRow({ rid, task: tk, onToggle, onSaved, reload }: { rid: string; task: Task; onToggle(): void; onSaved: Saved; reload(): unknown }) {
  const [sendBack, setSendBack] = useState(false)
  return (
    <article className="tk tk-confirm" data-ui="확인만 줄" data-ui-item={tk.id}>
      <div className="tk-confirm-line">
        <button className="tk-row" aria-expanded={false} onClick={onToggle}>
          <span className="turn-dot pale" role="img" aria-label={t('확인만', 'Confirm only')} />
          <span className="tk-title"><span className="tk-kind">{t('맡긴 일', 'Task')}</span>{tk.title}</span>
          <span className="tk-meta"><span>{taskLine(tk)}</span></span>
        </button>
        <span className="tk-confirm-act">
          <button className="a" data-ui="수정 요청" onClick={() => setSendBack(true)}>{t('수정 요청', 'Revise')}</button>
          <button className="btn sm" data-ui="승인" onClick={() => void sendJudgment(rid, tk, 'approve', {}, onSaved, reload)}>{t('승인', 'Approve')}</button>
        </span>
      </div>
      {sendBack && <div className="tk-sendback"><SendBackRow onCancel={() => setSendBack(false)} onSend={(note) => { setSendBack(false); void sendJudgment(rid, tk, 'send-back', { note }, onSaved, reload) }} /></div>}
    </article>
  )
}
