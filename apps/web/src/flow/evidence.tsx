import { useMemo } from 'react'
import type { FlowEvidence } from '../api'
import { NoteMarkdown } from '../NoteMarkdown'
import { useFigureUrl } from '../figureEmbed'
import { t as tr } from '../i18n'

/** 확인을 받는 것: 근거 한 줄이나 증명 단계 하나 (stale: 확인한 뒤 내용이 바뀜, 10/20) */
type Checked = { checks: FlowEvidence['checks']; stale?: boolean }
/** 그 역할의 마지막 기록이 거둔 것도 낡은 것도 아니면 확인됨 (서버 flowGaps.ts confirmed와 같다) */
const lastCheck = (e: Checked, role: 'agent' | 'human') => [...e.checks].reverse().find((x) => x.role === role)
export const approvedBy = (e: Checked, role: 'agent' | 'human') => { const c = lastCheck(e, role); return !!c && !c.revoked && !e.stale }

export function Check({ e, role, onClick }: { e: Checked; role: 'agent' | 'human'; onClick?(): void }) {
  const c = lastCheck(e, role), on = approvedBy(e, role)
  const name = role === 'agent' ? tr('에이전트 검토', 'Agent check') : tr('사람 승인', 'Human approval')
  const tip = c ? `${name}: ${c.revoked ? tr('거둠', 'revoked') + ' · ' : ''}${e.stale && !c.revoked ? tr('확인 뒤 바뀜', 'changed since') + ' · ' : ''}${c.by} · ${c.at}${c.note ? `\n${c.note}` : ''}` : `${name}: ${tr('안 됨', 'not yet')}`
  const mark = <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>{on
    ? <><circle cx="8" cy="8" r="7" /><path d="M4.6 8.2l2.2 2.2 4.4-4.6" /></>
    : <circle cx="8" cy="8" r="6.2" />}</svg>
  if (onClick) return <button className={`fl-check${on ? ' on' : ''}`} data-ui="흐름 사람 승인" aria-label={`${tip}. ${on ? tr('누르면 승인 거두기', 'Click to revoke') : tr('누르면 승인', 'Click to approve')}`} title={`${tip}\n${on ? tr('누르면 승인을 거둡니다', 'Click to revoke') : tr('누르면 승인합니다', 'Click to approve')}`} onClick={onClick}>{mark}</button>
  return <span className={`fl-check${on ? ' on' : ''}`} role="img" aria-label={tip} title={tip}>{mark}</span>
}

export const Chain = <svg className="fl-chain" width="14" height="14" viewBox="0 0 16 16" aria-hidden><path d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2.3-2.3a2.6 2.6 0 0 0-3.7-3.7l-.9.9" /><path d="M9.2 6.8a2.6 2.6 0 0 0-3.7 0L3.2 9.1a2.6 2.6 0 0 0 3.7 3.7l.9-.9" /></svg>

// ---------- 고치기 (2단계) ----------

/** 설명 칸: 노트와 같게 그린다 (줄 바꿈 · $…$ · $$…$$ · ![설명](그림 파일 이름)은 이 프로젝트·공용 그림 라이브러리에서 찾는다) */
export function FlowText({ rid, text }: { rid: string; text: string }) {
  const figure = useFigureUrl(rid)
  const options = useMemo(() => ({ figure }), [figure])
  return <div className="fl-text"><NoteMarkdown text={text} options={options} /></div>
}
