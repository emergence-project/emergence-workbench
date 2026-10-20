import { useState } from 'react'
import { flowApi, type FlowNode } from '../api'
import { MathText } from '../cardParts'
import { Dialog } from '../dialogs'
import { t as tr } from '../i18n'
import { EVK } from './marks'
import { approvedBy } from './evidence'

/** 사람 승인 또는 거두기. 기록은 덧붙이기만 한다 */
export function ApproveDialog({ rid, n, ev, step, onClose, onDone, fail }: { rid: string; n: FlowNode; ev?: number; step?: number; onClose(): void; onDone(): void; fail(e: unknown): void }) {
  const st = step !== undefined ? n.steps[step] : undefined
  const e = ev !== undefined ? n.evidence[ev] : undefined
  const on = approvedBy((st ?? e)!, 'human')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    try { await flowApi(rid).check(n.id, { baseHash: n.hash, ...(st ? { step } : { ev }), revoked: on || undefined, note: note.trim() || undefined }); onDone() } catch (x) { onClose(); fail(x) }
  }
  if (st) return <Dialog title={on ? tr('승인 거두기', 'Revoke approval') : tr(`단계 ${step! + 1} 승인`, `Approve step ${step! + 1}`)} ui="흐름 승인" onClose={onClose} footer={<>
    <button className="btn" onClick={onClose}>{tr('취소', 'Cancel')}</button>
    <button className="btn primary" disabled={busy} onClick={() => void submit()}>{on ? tr('거두기', 'Revoke') : tr('승인', 'Approve')}</button>
  </>}>
    <p className="fl-help">{on ? tr('이 단계의 사람 승인을 거둡니다. 지금까지의 기록은 그대로 남습니다.', 'Revokes the human approval of this step. Earlier records stay.')
      : tr('이 단계가 앞의 것에서 빈틈 없이 나온다고 확인했다고 기록합니다. 단계 글이 바뀌면 승인은 낡은 것으로 보입니다.', 'Records that this step follows from what it uses with no gap. If the step text changes, the approval shows as outdated.')}</p>
    <div className="fl-approve-ev"><MathText text={st.text} />{st.uses && <div className="muted">{tr('쓰는 것', 'Uses')}: {st.uses}</div>}</div>
    <label className="field"><span>{tr('메모', 'Note')} <em>{tr('선택', 'optional')}</em></span><input autoFocus value={note} maxLength={500} onChange={(x) => setNote(x.target.value)} onKeyDown={(x) => { if (x.key === 'Enter') void submit() }} /></label>
  </Dialog>
  if (!e) return null
  return <Dialog title={on ? tr('승인 거두기', 'Revoke approval') : tr('근거 승인', 'Approve evidence')} ui="흐름 승인" onClose={onClose} footer={<>
    <button className="btn" onClick={onClose}>{tr('취소', 'Cancel')}</button>
    <button className="btn primary" disabled={busy} onClick={() => void submit()}>{on ? tr('거두기', 'Revoke') : tr('승인', 'Approve')}</button>
  </>}>
    <p className="fl-help">{on
      ? tr('이 근거의 사람 승인을 거둡니다. 지금까지의 기록은 그대로 남고 거둔 기록이 더해집니다.', 'Revokes the human approval of this evidence. Earlier records stay; a revoke record is added.')
      : tr('이 근거를 읽고 확인했다고 기록합니다.', 'Records that you read and confirmed this evidence.')}
      {n.kind === 'finding' && e.kind === 'proof' && !on && ' ' + tr('증명을 승인하면 이 발견은 정리가 됩니다.', 'Approving the proof makes this finding a theorem.')}</p>
    <div className="fl-approve-ev"><b>{EVK[e.kind]()}</b> · {e.title ?? e.ref ?? e.file}<div>{e.text ? <MathText text={e.text} /> : null}</div></div>
    <label className="field"><span>{tr('메모', 'Note')} <em>{tr('선택', 'optional')}</em></span><input autoFocus value={note} maxLength={500} onChange={(x) => setNote(x.target.value)} onKeyDown={(x) => { if (x.key === 'Enter') void submit() }} /></label>
  </Dialog>
}

// ---------- 노트 오른쪽 사이드바의 흐름 칸 ----------
