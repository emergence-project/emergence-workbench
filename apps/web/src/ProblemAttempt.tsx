import { useState, type CSSProperties, type ReactNode } from 'react'
import type { Attempt, AttemptState, Claim } from './api'
import { Author } from './Author'
import { Icon } from './icons'
import { t } from './i18n'
import { ATTEMPT_NAME, objOf, TargetSelect } from './problemNames'
import { CodeText } from './repoPaths'
import { agentName } from './taskView'

/**
 * 시도 하나를 보여 주는 부품. 시도는 주장(없으면 질문)을 겨눈 방법 하나이고, 주장의 근거 목록에 한 줄로 놓인다 (11/13 "점 = 주장, 시도는 근거").
 * 줄을 누르면 그 아래에 전부(단계 · 보고 · 판정 · 행동)가 펼쳐진다. 주장을 보여 주는 부품과 주장 화면은 ProblemClaim.tsx.
 */

/** 색 점: 진행 파랑 · 판정 대기 주황 · 성립 청록 · 폐기 회색 고리 · 후보 옅은 점 (디자인 문서 2절 "색은 상태에만") */
export const ATTEMPT_DOT: Record<AttemptState, string> = { candidate: 'none', active: 'in-progress', reported: 'blocked', holds: 'solved', dropped: 'stopped' }
export const who = (name: string) => (name === 'user' ? t('사용자', 'You') : agentName(name))
/** "2026-11-11T14:02" → "11/11 14:02" */
export const when = (s: string | undefined) => (s ? s.slice(5, 16).replace('-', '/').replace('T', ' ') : '')
export const errorOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function AttemptDot({ s, label }: { s: AttemptState; label?: boolean }) {
  return <><span className={`g ${ATTEMPT_DOT[s]}`} role="img" aria-label={ATTEMPT_NAME[s]} title={ATTEMPT_NAME[s]} />{label && <span className="g-name">{ATTEMPT_NAME[s]}</span>}</>
}

/** 줄 끝 태그: 다음 · 수정 요청 · 판정 후 변경. 없으면 아무것도 그리지 않는다 */
export function AttemptTags({ a, next }: { a: Attempt; next: boolean }) {
  const stale = [...(a.restated ? [t('주장', 'the claim')] : []), ...(a.changed ?? [])]
  const back = a.state === 'active' && !!a.returned
  if (!next && !back && !stale.length) return null
  return (
    <span className="pb-tags">
      {next && <span className="tag pb-next" title={t('다음에 할 후보', 'The next candidate to try')}>{t('다음', 'Next')}</span>}
      {back && <span className="tag pb-stale"><span className="turn-dot" aria-hidden />{t('수정 요청', 'Sent back')}</span>}
      {stale.length > 0 && <span className="tag pb-stale" data-ui="판정 후 변경" title={t(`성립으로 판정한 뒤 바뀌었습니다: ${stale.join(', ')}`, `Changed after the holds verdict: ${stale.join(', ')}`)}><span className="turn-dot" aria-hidden />{t('판정 후 변경', 'Changed after verdict')}</span>}
    </span>
  )
}

/** 후보 입력란: 방법 한 줄. under는 겨눌 주장의 번호(없으면 질문). Enter로 추가, Esc로 닫는다 */
export function CandidateInput({ under, targets, busy, onAdd, onClose }: { under?: string; targets?: readonly Claim[]; busy: boolean; onAdd(method: string, under?: string): void; onClose(): void }) {
  const [method, setMethod] = useState('')
  const [to, setTo] = useState(under ?? '')
  const add = () => { const m = method.trim(); if (m) onAdd(m, to || undefined) }
  return (
    <div className="pb-add" data-ui="후보 입력란">
      {targets && <TargetSelect claims={targets} value={to} onChange={setTo} />}
      <input autoFocus aria-label={t('방법 한 줄', 'Method, one line')} placeholder={to ? t(`주장 ${to}${objOf(to)} 겨눈 방법 한 줄`, `Method aimed at claim ${to}, one line`) : t('질문을 겨눈 방법 한 줄', 'Method aimed at the question, one line')}
        value={method} onChange={(e) => setMethod(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) add(); if (e.key === 'Escape') onClose() }} />
      <button className="btn sm primary" disabled={busy || !method.trim()} onClick={add}>{t('추가', 'Add')}</button>
      <button className="btn sm" onClick={onClose}>{t('취소', 'Cancel')}</button>
    </div>
  )
}

/** 단계 띠: 제안 › 작업 › 판정. 단계마다 누가 · 언제. 지난 단계는 회색 점, 지금 단계는 상태 색 점, 남은 단계는 옅은 점 (승인은 시도가 아니라 주장에 한다) */
function Steps({ a }: { a: Attempt }) {
  const judged = a.state === 'holds' || a.state === 'dropped'
  const worked = !!a.worker
  const by = (name: string, at?: string) => <><span><Author by={who(name)} /></span>{at && <span className="pb-step-at">{when(at)}</span>}</>
  const step = (name: string, dot: string, body: ReactNode, tip?: string) => (
    <li className={`pb-step${body ? '' : ' todo'}`} title={tip}><span className={`g ${dot}`} aria-hidden /><span className="pb-step-name">{name}</span>{body && <span className="pb-step-by">{body}</span>}</li>
  )
  return (
    <ol className="pb-steps" data-ui="시도 단계">
      {step(t('제안', 'Proposed'), 'pb-done', by(a.by, a.created))}
      {step(t('작업', 'Work'), a.state === 'active' ? ATTEMPT_DOT.active : worked ? 'pb-done' : 'none', worked && by(a.worker!, a.started))}
      {step(t('판정', 'Verdict'), judged || a.state === 'reported' ? ATTEMPT_DOT[a.state] : 'none',
        judged && a.verdict ? <><span>{ATTEMPT_NAME[a.state]}</span>{by(a.verdict.by, a.verdict.at)}</> : a.state === 'reported' && t('대기', 'Waiting'),
        t('작업하지 않은 쪽이 판정합니다: 주장이 이 시도의 근거에서 따라 나오는가', 'Someone other than the worker gives the verdict: does the claim follow from this attempt\'s grounds'))}
    </ol>
  )
}

/** 시도 하나의 전부: 단계 띠, 보고(결과 · 작업 내용 · 파일 · 실행 · 검사), 판정(근거 · 교차 검증 · 폐기 사유 · 다시 열 조건), 행동(성립 · 폐기) */
export function Detail({ a, locked, busy, onVerdict }: { a: Attempt; locked: boolean; busy: boolean; onVerdict(a: Attempt, r: 'holds' | 'dropped'): void }) {
  const row = (k: string, v: ReactNode, cls?: string) => (v ? <><dt>{k}</dt><dd className={cls}>{v}</dd></> : null)
  const tested = a.verdict?.tested
  // 해 보지 않고 폐기한 후보는 사유 하나만 적는다 (근거와 같은 글)
  const sameReason = !!a.lesson && a.lesson === a.verdict?.note
  const judging = !locked && (a.state === 'reported' || a.state === 'candidate')
  return (
    <div className="pb-detail">
      <Steps a={a} />
      {a.returned && a.state !== 'holds' && a.state !== 'dropped' && <p className="pb-returned" data-ui="수정 요청"><span className="turn-dot" aria-hidden />{t(`수정 요청 ${when(a.returned.at)}`, `Sent back ${when(a.returned.at)}`)}<span>{a.returned.note}</span></p>}
      <dl className="pb-facts">
        {row(t('결과', 'Result'), a.result, 'pb-result')}
        {row(t('작업 내용', 'Work done'), a.did)}
        {row(t('파일', 'Files'), a.files.length > 0 && <span className="pb-files">{a.files.map((f) => <span key={f}><CodeText text={f} />{a.changed?.includes(f) && <span className="pb-stale-file"><span className="turn-dot" aria-hidden />{t('판정 후 변경', 'changed after verdict')}</span>}</span>)}</span>)}
        {row(t('실행', 'Run'), a.run && <span className="pb-files">{a.run.command && <code>{a.run.command}</code>}{a.run.commit && <span className="muted">{t(`커밋 ${a.run.commit}`, `commit ${a.run.commit}`)}</span>}</span>)}
        {row(t('검사', 'Test'), a.test && <span className="pb-files"><code>{a.test}</code>{a.verdict && (tested === 'pass' ? <span className="pb-tested"><span className="ico" aria-hidden>{Icon.check}</span>{t('통과', 'Passed')}</span> : tested === 'fail' ? <span className="error-text">{t('실패', 'Failed')}</span> : <span className="muted">{t('미실행', 'Not run')}</span>)}</span>)}
      </dl>
      {(a.verdict?.note || a.verdict?.check || a.lesson || a.reopen) && <dl className="pb-facts pb-verdict" data-ui="판정 내용">
        {!sameReason && row(a.state === 'dropped' && !a.lesson ? t('폐기 사유', 'Why dropped') : t('근거', 'Basis'), a.verdict?.note)}
        {row(t('교차 검증', 'Cross-check'), a.verdict?.check)}
        {row(t('폐기 사유', 'Why dropped'), a.lesson)}
        {row(t('다시 열 조건', 'Reopen if'), a.reopen)}
      </dl>}
      {judging && <div className="pb-acts">
        {a.state === 'reported' && <button className="btn sm" data-ui="성립" disabled={busy || !a.claim} title={a.claim ? undefined : t('주장이 없는 시도는 성립으로 판정할 수 없습니다', 'An attempt without a claim cannot hold')} onClick={() => onVerdict(a, 'holds')}>{t('성립', 'Holds')}</button>}
        <button className="btn sm" data-ui="폐기" disabled={busy} title={a.state === 'candidate' ? t('해 보지 않고 폐기합니다', 'Drop without trying') : undefined} onClick={() => onVerdict(a, 'dropped')}>{t('폐기', 'Drop')}</button>
      </div>}
    </div>
  )
}

/** 시도 한 줄의 옅은 아랫줄: 폐기 사유, 판정의 근거, 결과, 누가 하고 있나 */
export const attemptNote = (a: Attempt): string | undefined => (a.state === 'dropped' ? a.lesson ?? a.verdict?.note : a.state === 'holds' ? a.result ?? a.verdict?.note : a.state === 'reported' ? a.result
  : a.state === 'active' ? (a.returned ? t(`수정 요청: ${a.returned.note}`, `Sent back: ${a.returned.note}`) : `${who(a.worker ?? a.by)} · ${when(a.started)}`) : undefined)

/** 근거 목록의 시도 한 줄 (목록 보기와 주장 화면이 함께 쓴다). 누르면 그 아래에 전부가 펼쳐진다 */
export function AttemptRow({ a, open, next, locked, busy, style, onToggle, onVerdict, children }: {
  a: Attempt; open: boolean; next: boolean; locked: boolean; busy: boolean; style?: CSSProperties
  onToggle(): void; onVerdict(a: Attempt, r: 'holds' | 'dropped'): void
  /** 줄 끝에 둘 것 (후보의 순서 바꾸기) */
  children?: ReactNode
}) {
  const sub = attemptNote(a)
  return (
    <div className={`pb-node pb-try s-${a.state}${open ? ' on' : ''}`} style={style} data-ui="시도" data-ui-item={`${a.label} ${a.method}`}>
      <div className="pb-node-row">
        <button className="pb-node-main" aria-expanded={open} onClick={onToggle}>
          <span className="pb-state"><AttemptDot s={a.state} label /></span>
          <span className="pb-label">{a.label}</span>
          <span className="pb-method">{a.method}</span>
          <AttemptTags a={a} next={next} />
        </button>
        {children}
      </div>
      {sub && !open && <div className="pb-sub">{sub}</div>}
      {open && <Detail a={a} locked={locked} busy={busy} onVerdict={onVerdict} />}
    </div>
  )
}
