import { useCallback, useState, type CSSProperties } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { problemsApi, type Attempt, type Claim, type ClaimSide, type ProblemDoc } from './api'
import { Icon } from './icons'
import { t } from './i18n'
import { AttemptDot, AttemptRow, attemptNote, CandidateInput, errorOf, when, who } from './ProblemAttempt'
import { claimTally, ROOT_ID, TreeChart } from './ProblemChart'
import { VerdictDialog } from './ProblemDialogs'
import { nearOf } from './problemLayout'
import { ATTEMPT_NAME, SIDE_NAME, SideTag } from './problemNames'
import { qk } from './queries'
import { RepoPathContext } from './repoPaths'
import { go } from './router'

/**
 * 주장을 보여 주는 부품과 주장 화면 (11/13 사용자 결정 "점 = 주장, 시도는 근거").
 * 차트의 점 하나는 판단할 수 있는 주장 하나이고, 근거는 두 가지다: 그 주장을 겨눈 시도(해 본 방법과 결과)와 그 아래의 주장.
 * 점은 두 단계로 읽는다 (11/12 "메인 창에서는 미리보기, 자세히 볼 때 세부 창으로"): 흐름 화면에서 점을 누르면 차트 아래에 미리보기(ClaimPeek: 진술과 근거 한 줄씩),
 * 「열기」가 주장 화면(ClaimView: 경로 · 진술 · 조건 · 근거마다의 전부 · 판정)으로 간다. 질문도 점이다: 번호 0으로 열고, 근거는 질문을 바로 겨눈 시도와 질문 바로 아래의 주장이다.
 */

/** 번호 고리: 차트의 점과 같은 모양. 주장은 번호, 시도는 글자라 한눈에 갈린다 */
export function ClaimNum({ c }: { c: Claim }) {
  return <span className="pb-num" aria-label={t(`주장 ${c.id}`, `Claim ${c.id}`)}>{c.id}</span>
}

/** 줄 끝 태그: 근거 대기 · 승인 · 기각 · 판정 후 변경 */
export function ClaimTags({ c }: { c: Claim }) {
  if (!c.waiting && !c.accepted && !c.rejected && !c.stale) return null
  return (
    <span className="pb-tags">
      {c.waiting && <span className="tag" title={t('시도는 성립했고, 아래 주장이 성립하면 이 주장도 성립합니다', 'An attempt holds; this claim holds once the claims below it hold')}>{t('근거 대기', 'Awaiting grounds')}</span>}
      {c.accepted && <span className="tag pb-accepted" title={t(`사용자 승인 ${when(c.accepted.at)}`, `Accepted by you ${when(c.accepted.at)}`)}><span className="ico" aria-hidden>{Icon.check}</span>{t('승인', 'Accepted')}</span>}
      {c.rejected && <span className="tag" title={c.rejected.note}>{t('기각', 'Rejected')}</span>}
      {c.stale && <span className="tag pb-stale" data-ui="판정 후 변경" title={t('성립으로 판정한 뒤 진술이나 파일이 바뀌었습니다', 'The statement or a file changed after the holds verdict')}><span className="turn-dot" aria-hidden />{t('판정 후 변경', 'Changed after verdict')}</span>}
    </span>
  )
}

/** 근거 목록 · 목록 보기의 주장 한 줄. 누르면 그 주장을 연다 */
export function ClaimRow({ c, style, onOpen }: { c: Claim; style?: CSSProperties; onOpen(): void }) {
  return (
    <div className={`pb-node pb-claim-row s-${c.state}`} style={style} data-ui="주장" data-ui-item={`${c.id} ${c.statement}`}>
      <div className="pb-node-row">
        <button className="pb-node-main" onClick={onOpen}>
          <span className="pb-state"><AttemptDot s={c.state} label /></span>
          <ClaimNum c={c} />
          <span className="pb-method">{c.statement}<SideTag side={c.side} /></span>
          <ClaimTags c={c} />
        </button>
      </div>
      {c.condition && <div className="pb-sub">{t(`조건: ${c.condition}`, `Condition: ${c.condition}`)}</div>}
    </div>
  )
}

const SIDES: ClaimSide[] = ['for_yes', 'for_no', 'neither']
/** 주장 입력란: 판단할 수 있는 한 문장. 질문 바로 아래(under 없음)면 어느 쪽 근거인지도 고른다. Enter로 추가, Esc로 닫는다 */
export function ClaimInput({ under, busy, onAdd, onClose }: { under?: string; busy: boolean; onAdd(statement: string, side?: ClaimSide): void; onClose(): void }) {
  const [statement, setStatement] = useState('')
  const [side, setSide] = useState<ClaimSide>('for_yes')
  const add = () => { const s = statement.trim(); if (s) onAdd(s, under ? undefined : side) }
  return (
    <div className="pb-add" data-ui="주장 입력란">
      <input autoFocus aria-label={t('판단할 수 있는 한 문장', 'One sentence that can be judged')} placeholder={under ? t(`주장 ${under}을 받치는, 판단할 수 있는 한 문장`, `One judgeable sentence that supports claim ${under}`) : t('판단할 수 있는 한 문장', 'One sentence that can be judged')}
        value={statement} onChange={(e) => setStatement(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) add(); if (e.key === 'Escape') onClose() }} />
      {!under && <div className="segmented small" role="radiogroup" aria-label={t('질문의 어느 쪽 근거인가', 'Which answer it supports')}>
        {SIDES.map((k) => <button key={k} type="button" role="radio" aria-checked={side === k} className={side === k ? 'on' : ''} onClick={() => setSide(k)}>{SIDE_NAME[k]}</button>)}
      </div>}
      <button className="btn sm primary" disabled={busy || !statement.trim()} onClick={add}>{t('추가', 'Add')}</button>
      <button className="btn sm" onClick={onClose}>{t('취소', 'Cancel')}</button>
    </div>
  )
}

/** 그 점(주장, 없으면 질문)의 근거: 겨눈 시도와 바로 아래 주장 */
export const groundsOf = (p: ProblemDoc, claim: Claim | undefined) => ({
  tries: p.attempts.filter((a) => a.claim === claim?.id),
  subs: p.claims.filter((c) => c.under === claim?.id),
})

/**
 * 미리보기: 차트에서 고른 점의 요점만. 첫 줄은 상태 · 번호 · 진술 · 태그와 「열기」, 그 아래에 조건과 근거(시도 한 줄씩, 아래 주장 한 줄씩).
 * 시도의 전부(작업 내용 · 파일 · 판정)는 주장 화면에 있다. claim이 없으면 질문 점이다
 */
export function ClaimPeek({ p, claim, onOpen }: { p: ProblemDoc; claim?: Claim; onOpen(): void }) {
  const { tries, subs } = groundsOf(p, claim)
  const none = <span className="muted">{t('없음', 'None')}</span>
  return (
    <div className={`pb-peek${claim ? ` s-${claim.state}` : ''}`} data-ui="점 미리보기" data-ui-item={claim ? `${claim.id} ${claim.statement}` : p.question}>
      <div className="pb-peek-head">
        {claim ? <><span className="pb-state"><AttemptDot s={claim.state} label /></span><ClaimNum c={claim} /></> : <span className="pb-state">{t('질문', 'Question')}</span>}
        <span className="pb-method">{claim ? <>{claim.statement}<SideTag side={claim.side} /></> : p.question}</span>
        {claim && <ClaimTags c={claim} />}
        <button className="btn sm" data-ui="주장 열기" onClick={onOpen}>{t('열기', 'Open')}</button>
      </div>
      <dl className="pb-facts pb-peek-facts">
        {claim?.condition && <><dt>{t('조건', 'Condition')}</dt><dd>{claim.condition}</dd></>}
        <dt>{t('시도', 'Attempts')}</dt>
        <dd className="pb-grounds-cell">{tries.length ? <ul className="pb-grounds" data-ui="근거 시도">{tries.map((a) => {
          const note = attemptNote(a)
          return <li key={a.id} className={`s-${a.state}`} title={ATTEMPT_NAME[a.state]}><AttemptDot s={a.state} /><b>{a.label}</b><span>{a.method}{a.next && !p.stop && <span className="tag pb-next">{t('다음', 'Next')}</span>}{note && <small>{note}</small>}</span></li>
        })}</ul> : none}</dd>
        {(subs.length > 0 || claim) && <><dt>{t('주장', 'Claims')}</dt>
          <dd className="pb-grounds-cell">{subs.length ? <ul className="pb-grounds" data-ui="근거 주장">{subs.map((c) => (
            <li key={c.id} className={`s-${c.state}`}><AttemptDot s={c.state} /><b>{c.id}</b><span>{c.statement}<small>{claimTally(c)}</small></span></li>
          ))}</ul> : none}</dd></>}
      </dl>
    </div>
  )
}

/** 후보의 순서 바꾸기: 같은 곳을 겨눈 시도 사이에서 한 칸 위 · 아래로. 일하는 순서 전체에서 두 시도의 자리를 맞바꾼다 */
export function Moves({ p, a, busy, onOrder }: { p: ProblemDoc; a: Attempt; busy: boolean; onOrder(order: string[]): void }) {
  if (a.state !== 'candidate' || p.state === 'closed') return null
  const sibs = p.attempts.filter((x) => x.claim === a.claim), i = sibs.indexOf(a)
  const move = (by: -1 | 1) => {
    const other = sibs[i + by]
    if (!other) return
    onOrder(p.attempts.map((x) => (x.id === a.id ? other.id : x.id === other.id ? a.id : x.id)))
  }
  return (
    <span className="pb-move">
      <button className="icon-btn sm" data-tip={t('위로', 'Move up')} aria-label={t(`${a.label} 위로`, `Move ${a.label} up`)} disabled={busy || i === 0} onClick={() => move(-1)}>{Icon.up}</button>
      <button className="icon-btn sm" data-tip={t('아래로', 'Move down')} aria-label={t(`${a.label} 아래로`, `Move ${a.label} down`)} disabled={busy || i === sibs.length - 1} onClick={() => move(1)}>{Icon.down}</button>
    </span>
  )
}

/**
 * 주장 화면: 점 하나의 전부. 위에서부터 돌아가는 링크(질문), 경로 차트(질문 ─ 위 주장 ─ 이 주장 ─ 바로 아래 주장. 점을 누르면 그 주장으로),
 * 진술과 조건, 근거(시도마다 한 줄, 누르면 단계 · 보고 · 판정 · 성립 · 폐기가 펼쳐진다. 아래 주장마다 한 줄), 행동(＋ 주장 · ＋ 후보).
 * at은 주소의 셋째 칸: 주장 번호, 0(질문), 또는 시도 글자(그 시도가 겨눈 주장을 열고 그 시도를 펼친다)
 */
export function ClaimView({ rid, id, at, onSaved }: { rid: string; id: string; at: string; onSaved(msg: string): void }) {
  const client = useQueryClient()
  const q = useQuery({ queryKey: qk.problem(rid, id), queryFn: (): Promise<ProblemDoc> => problemsApi(rid).get(id) })
  const [shown, setShown] = useState<string | null>(/^[a-z]/.test(at) ? at : null)
  const [verdict, setVerdict] = useState<{ attempt: Attempt; result: 'holds' | 'dropped' } | null>(null)
  const [adding, setAdding] = useState<'try' | 'claim' | null>(null)
  const [busy, setBusy] = useState(false)
  const reload = useCallback(() => client.invalidateQueries({ queryKey: qk.problems(rid) }), [client, rid])
  if (q.error) return <div className="banner danger">{t(`읽지 못했습니다: ${errorOf(q.error)}`, `Could not read: ${errorOf(q.error)}`)}</div>
  const p = q.data
  if (!p) return <p className="muted">{t('읽는 중…', 'Reading…')}</p>
  const via = p.attempts.find((a) => a.id === at)
  const cid = via ? via.claim ?? ROOT_ID : at
  const claim = p.claims.find((c) => c.id === cid)
  const back = (sel?: string) => go({ page: 'problems', rid, id, ...(sel && { at: sel }) })
  const crumb = (
    <header className="pb-head bar3" data-ui="주장 머리">
      <span className="pb-crumb"><button className="a pb-back" onClick={() => go({ page: 'problems', rid })}>{t('흐름', 'Flows')}</button><span aria-hidden>›</span><button className="a pb-back pb-crumb-q" title={p.question} onClick={() => back(claim ? cid : ROOT_ID)}>{p.question}</button></span>
      <span />
      <span className="pb-head-acts" />
    </header>
  )
  if (!claim && cid !== ROOT_ID) return <>{crumb}<p className="empty">{t('이 흐름에 그 주장이 없습니다.', 'This flow has no such claim.')}</p></>
  const locked = p.state === 'closed'
  const { tries, subs } = groundsOf(p, claim)
  const api = problemsApi(rid)
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true)
    try { await work(); setAdding(null) } catch (e) { onSaved(errorOf(e)) } finally { setBusy(false); void reload() }
  }
  const open = (c: Claim) => go({ page: 'problems', rid, id, attempt: c.id })
  const near = claim ? nearOf(p.claims.map((c) => ({ ...c, parent: c.under })), claim.id) : subs
  const posed = claim && [who(claim.by), when(claim.created), claim.from && t(`시도 ${claim.from.toUpperCase()}의 보고에서`, `from the report of attempt ${claim.from.toUpperCase()}`)].filter(Boolean).join(' · ')
  return <>
    {crumb}
    <div className="pb-chart pb-near" data-ui="주장 경로">
      <TreeChart flow={{ ...p, claims: near }} selected={cid} rootName={t('질문', 'Question')} onRoot={() => { if (claim) go({ page: 'problems', rid, id, attempt: ROOT_ID }) }} onPick={(c) => { if (c.id !== cid) open(c) }} />
    </div>
    <h2 className="pb-title pb-attempt-title" data-ui="주장 진술">{claim ? <><ClaimNum c={claim} /><span>{claim.statement}<SideTag side={claim.side} /></span></> : <span>{p.question}</span>}</h2>
    {claim && <div className="pb-meta" data-ui="주장 정보">
      <span className="pb-state"><AttemptDot s={claim.state} label /></span>
      <ClaimTags c={claim} />
      {posed && <span>{posed}</span>}
    </div>}
    {claim && (claim.condition || claim.rejected) && <dl className="pb-facts">
      {claim.condition && <><dt>{t('조건', 'Condition')}</dt><dd>{claim.condition}</dd></>}
      {claim.rejected && <><dt>{t('기각 사유', 'Why rejected')}</dt><dd>{claim.rejected.note}</dd></>}
    </dl>}
    <RepoPathContext.Provider value={{ rid }}>
      <section className="pb-sec" data-ui="근거">
        <h3 className="pb-h3">{t('근거', 'Grounds')} <span className="muted">{t(`시도 ${tries.length} · 주장 ${subs.length}`, `${tries.length} attempts · ${subs.length} claims`)}</span><span className="sp" />
          {!locked && <button className="btn sm" data-ui="주장 추가" onClick={() => setAdding('claim')}>＋ {t('주장', 'Claim')}</button>}
          {!locked && <button className="btn sm" data-ui="후보 추가" onClick={() => setAdding('try')}>＋ {t('후보', 'Candidate')}</button>}</h3>
        {tries.length + subs.length === 0 && <p className="empty">{t('근거가 없습니다. 「＋ 후보」로 해 볼 방법을, 「＋ 주장」으로 이것을 받칠 주장을 추가합니다.', 'No grounds yet. Add a method to try with "＋ Candidate", or a supporting claim with "＋ Claim".')}</p>}
        {tries.length + subs.length > 0 && <div className="pb-tree">
          {tries.map((a) => <AttemptRow key={a.id} a={a} open={shown === a.id} next={!!a.next && !p.stop} locked={locked} busy={busy} onToggle={() => setShown(shown === a.id ? null : a.id)} onVerdict={(attempt, result) => setVerdict({ attempt, result })}>
            <Moves p={p} a={a} busy={busy} onOrder={(order) => void run(() => api.patch(p.id, p.hash, { order }))} />
          </AttemptRow>)}
          {subs.map((c) => <ClaimRow key={c.id} c={c} onOpen={() => open(c)} />)}
        </div>}
        {adding === 'try' && <CandidateInput under={claim?.id} busy={busy} onAdd={(method) => void run(() => api.addAttempts(p.id, [{ method, ...(claim && { claim: claim.id }) }]))} onClose={() => setAdding(null)} />}
        {adding === 'claim' && <ClaimInput under={claim?.id} busy={busy} onAdd={(statement, side) => void run(() => api.addClaim(p.id, { statement, ...(claim ? { under: claim.id } : { side }) }))} onClose={() => setAdding(null)} />}
      </section>
    </RepoPathContext.Provider>
    {verdict && <VerdictDialog rid={rid} problem={p} attempt={verdict.attempt} result={verdict.result} onClose={() => setVerdict(null)} onDone={() => { setVerdict(null); onSaved(t('판정을 적었습니다', 'Verdict saved')); void reload() }} />}
  </>
}
