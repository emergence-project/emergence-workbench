import { useState } from 'react'
import { t } from './i18n'

/**
 * 「내 차례」의 두 묶음 머리 (11/23 시안 turn-split): 결정 필요는 진한 주황 점 · 수, 확인만은 옅은 고리 · 옅은 수와
 * 오른쪽 끝 「모두 승인」. 모두 승인은 되돌릴 수 있는 일이라 확인 창 없이 바로 한다(디자인 기준: 확인은 지우기만).
 * 기록 › 내 차례, 피드백 › 확인 필요, 프로젝트 정보 › 내 차례, 폰 › 내 차례가 같이 쓴다.
 */
export function TurnGroupHead({ pale, count, note, onApproveAll }: {
  pale?: boolean; count: number; note?: string
  /** 확인만 묶음의 「모두 승인」. 하나씩 차례로 승인한다 */
  onApproveAll?(): Promise<unknown>
}) {
  const [busy, setBusy] = useState(false)
  const all = onApproveAll && (async () => { setBusy(true); try { await onApproveAll() } finally { setBusy(false) } })
  return (
    <div className={`turn-group${pale ? ' pale' : ''}`} data-ui={pale ? '확인만 머리' : '결정 필요 머리'}>
      <span className={`turn-dot${pale ? ' pale' : ''}`} aria-hidden />
      {pale ? t('확인만', 'Confirm only') : t('결정 필요', 'Needs a decision')}
      <span className={`rail-count${pale ? ' pale' : ''}`}>{count}</span>
      {note && <span className="turn-group-note">{note}</span>}
      {all && <button className="btn sm turn-group-end" data-ui="모두 승인" disabled={busy} onClick={() => void all()}>{t('모두 승인', 'Approve all')}</button>}
    </div>
  )
}

/** 나란히 놓는 두 수: 결정 수는 진하게, 확인만 수는 옅게 (0이면 그 수를 빼고, 둘 다 0이면 아무것도) */
export function TurnCounts({ decide, confirm, className = '' }: { decide: number; confirm: number; className?: string }) {
  const tip = t(`결정 ${decide} · 확인 ${confirm}`, `Decide ${decide} · Confirm ${confirm}`)
  return <>
    {decide > 0 && <span className={`rail-count ${className}`} title={tip}>{decide}</span>}
    {confirm > 0 && <span className={`rail-count pale ${className}`} title={tip}>{confirm}</span>}
  </>
}

/** 차례로 승인한다 (하나가 실패해도 나머지는 계속) */
export async function approveEach<T>(list: readonly T[], approve: (x: T) => Promise<unknown>): Promise<void> {
  for (const x of list) { try { await approve(x) } catch { /* 각 승인이 스스로 알린다 */ } }
}
