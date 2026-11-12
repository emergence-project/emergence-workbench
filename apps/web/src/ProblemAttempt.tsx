import { useCallback, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { problemsApi, type Attempt, type AttemptState, type ProblemDoc } from './api'
import { Author } from './Author'
import { Icon } from './icons'
import { t } from './i18n'
import { TreeChart } from './ProblemChart'
import { VerdictDialog } from './ProblemDialogs'
import { nearOf } from './problemLayout'
import { ATTEMPT_NAME, SideTag } from './problemNames'
import { qk } from './queries'
import { CodeText, RepoPathContext } from './repoPaths'
import { go } from './router'
import { agentName } from './taskView'

/**
 * 시도 하나를 보여 주는 부품 (Problems.tsx에서 옮김)과 시도 화면.
 * 차트의 점은 두 단계로 읽는다 (11/12 사용자 의견 "메인 창에서는 미리보기, 자세히 볼 때 세부 창으로"):
 * 흐름 화면에서 점을 누르면 차트 아래에 미리보기(Peek: 주장과 두세 줄)가 뜨고, 「열기」가 시도 화면(AttemptView: 경로 · 단계 · 주장 · 보고 · 판정 · 행동)으로 간다.
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

/** 보고한 시도는 주장(진술)으로 읽는다. 진술이 없으면 방법 */
export const claimedOf = (a: Attempt) => !!a.statement && (a.state === 'holds' || a.state === 'reported')

/** 시도의 이름 칸: 진술(없으면 방법)과 예 · 아니오 근거, 분해 */
export function AttemptName({ a }: { a: Attempt }) {
  const claimed = claimedOf(a)
  return <>{claimed ? a.statement : a.method}{claimed && <SideTag side={a.side} />}{a.needs === 'all' && <span className="tag pb-all" title={t('하위 시도가 모두 성립해야 성립', 'Holds only if every attempt below holds')}>{t('분해', 'All')}</span>}</>
}

/** 줄 끝 태그: 다음 · 승인 · 판정 후 변경. 없으면 아무것도 그리지 않는다 */
export function AttemptTags({ a, next }: { a: Attempt; next: boolean }) {
  const stale = [...(a.restated ? [t('주장', 'the claim')] : []), ...(a.changed ?? [])]
  if (!next && !a.accepted && !stale.length) return null
  return (
    <span className="pb-tags">
      {next && <span className="tag pb-next" title={t('다음에 할 후보', 'The next candidate to try')}>{t('다음', 'Next')}</span>}
      {a.accepted && <span className="tag pb-accepted" title={t(`사용자 승인 ${when(a.accepted.at)}`, `Accepted by you ${when(a.accepted.at)}`)}><span className="ico" aria-hidden>{Icon.check}</span>{t('승인', 'Accepted')}</span>}
      {stale.length > 0 && <span className="tag pb-stale" data-ui="판정 후 변경" title={t(`성립으로 판정한 뒤 바뀌었습니다: ${stale.join(', ')}`, `Changed after the holds verdict: ${stale.join(', ')}`)}><span className="turn-dot" aria-hidden />{t('판정 후 변경', 'Changed after verdict')}</span>}
    </span>
  )
}

/** 후보 입력란: 방법 한 줄. Enter로 추가, Esc로 닫는다 */
export function CandidateInput({ under, busy, onAdd, onClose }: { under?: string; busy: boolean; onAdd(method: string): void; onClose(): void }) {
  const [method, setMethod] = useState('')
  const add = () => { const m = method.trim(); if (m) onAdd(m) }
  return (
    <div className="pb-add" data-ui="후보 입력란">
      <input autoFocus aria-label={t('방법 한 줄', 'Method, one line')} placeholder={under ? t(`${under}의 하위 후보: 방법 한 줄`, `Candidate under ${under}: method, one line`) : t('방법 한 줄', 'Method, one line')}
        value={method} onChange={(e) => setMethod(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) add(); if (e.key === 'Escape') onClose() }} />
      <button className="btn sm primary" disabled={busy || !method.trim()} onClick={add}>{t('추가', 'Add')}</button>
      <button className="btn sm" onClick={onClose}>{t('취소', 'Cancel')}</button>
    </div>
  )
}

/** 단계 띠: 제안 › 작업 › 판정, 성립한 시도는 승인까지. 단계마다 누가 · 언제. 지난 단계는 회색 점, 지금 단계는 상태 색 점, 남은 단계는 옅은 점 */
function Steps({ a }: { a: Attempt }) {
  const judged = a.state === 'holds' || a.state === 'dropped'
  const worked = !!a.worker
  const by = (name: string, at?: string) => <><span><Author by={who(name)} /></span>{at && <span className="pb-step-at">{when(at)}</span>}</>
  const step = (name: string, dot: string, body: ReactNode, tip?: string) => (
    <li className={`pb-step${body ? '' : ' todo'}`} title={tip}><span className={`g ${dot}`} aria-hidden /><span className="pb-step-name">{name}</span>{body && <span className="pb-step-by">{body}</span>}</li>
  )
  return (
    <ol className={`pb-steps${a.state === 'holds' ? ' four' : ''}`} data-ui="시도 단계">
      {step(t('제안', 'Proposed'), 'pb-done', by(a.by, a.created))}
      {step(t('작업', 'Work'), a.state === 'active' ? ATTEMPT_DOT.active : worked ? 'pb-done' : 'none', worked && by(a.worker!, a.started))}
      {step(t('판정', 'Verdict'), judged || a.state === 'reported' ? ATTEMPT_DOT[a.state] : 'none',
        judged && a.verdict ? <><span>{ATTEMPT_NAME[a.state]}</span>{by(a.verdict.by, a.verdict.at)}</> : a.state === 'reported' && t('대기', 'Waiting'),
        t('작업하지 않은 쪽이 판정합니다: 진술이 근거에서 따라 나오는가', 'Someone other than the worker gives the verdict: does the statement follow from the grounds'))}
      {a.state === 'holds' && step(t('승인', 'Accepted'), a.accepted ? 'pb-done' : 'none', a.accepted && by(a.accepted.by, a.accepted.at),
        t('사실로 받아들이는 승인은 사용자가 흐름을 답과 함께 종료할 때 합니다', 'You accept a claim as a fact when you close the flow with an answer'))}
    </ol>
  )
}

/** 시도 하나의 전부: 단계 띠, 주장(진술 · 조건), 보고(방법 · 결과 · 작업 내용 · 파일 · 실행 · 검사), 판정(근거 · 교차 검증 · 폐기 사유 · 다시 열 조건) */
export function Detail({ a, locked, busy, titled, onVerdict, onAddUnder }: {
  a: Attempt; locked: boolean; busy: boolean
  /** 진술이 이미 화면의 제목이다 (시도 화면): 진술 줄을 다시 적지 않는다 */
  titled?: boolean
  onVerdict(a: Attempt, r: 'holds' | 'dropped'): void; onAddUnder(): void
}) {
  const row = (k: string, v: ReactNode, cls?: string) => (v ? <><dt>{k}</dt><dd className={cls}>{v}</dd></> : null)
  const tested = a.verdict?.tested
  // 해 보지 않고 폐기한 후보는 사유 하나만 적는다 (근거와 같은 글)
  const sameReason = !!a.lesson && a.lesson === a.verdict?.note
  return (
    <div className="pb-detail">
      <Steps a={a} />
      {a.returned && a.state !== 'holds' && a.state !== 'dropped' && <p className="pb-returned" data-ui="수정 요청"><span className="turn-dot" aria-hidden />{t(`수정 요청 ${when(a.returned.at)}`, `Sent back ${when(a.returned.at)}`)}<span>{a.returned.note}</span></p>}
      {a.statement && !(titled && !a.condition) && <dl className="pb-facts pb-claim" data-ui="주장">
        {!titled && row(t('진술', 'Statement'), <>{a.statement}<SideTag side={a.side} />{a.restated && <span className="pb-stale-file"><span className="turn-dot" aria-hidden />{t('판정 후 변경', 'changed after verdict')}</span>}</>, 'pb-result')}
        {row(t('조건', 'Condition'), a.condition)}
      </dl>}
      <dl className="pb-facts">
        {a.statement && row(t('방법', 'Method'), a.method)}
        {row(t('결과', 'Result'), a.result, a.statement ? undefined : 'pb-result')}
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
      {!locked && a.state !== 'dropped' && <div className="pb-acts">
        {a.state === 'reported' && <button className="btn sm" data-ui="성립" disabled={busy || !a.statement} title={a.statement ? undefined : t('진술이 없는 시도는 성립으로 판정할 수 없습니다', 'An attempt without a statement cannot hold')} onClick={() => onVerdict(a, 'holds')}>{t('성립', 'Holds')}</button>}
        {(a.state === 'reported' || a.state === 'candidate') && <button className="btn sm" data-ui="폐기" disabled={busy} title={a.state === 'candidate' ? t('해 보지 않고 폐기합니다', 'Drop without trying') : undefined} onClick={() => onVerdict(a, 'dropped')}>{t('폐기', 'Drop')}</button>}
        <span className="sp" />
        <button className="btn sm" data-ui="아래에 후보 추가" disabled={busy} onClick={onAddUnder}>＋ {t('하위 후보', 'Sub-candidate')}</button>
      </div>}
    </div>
  )
}

/**
 * 미리보기: 차트에서 고른 점의 요점만. 첫 줄은 목록의 시도 줄과 같은 칸(상태 · 자리 이름 · 진술이나 방법 · 태그)이고 끝에 「열기」,
 * 그 아래는 상태에 맞는 두세 줄(조건 · 방법 / 결과 / 근거 / 폐기 사유 / 누가 언제). 길면 두 줄에서 줄인다. 전부는 시도 화면에 있다
 */
export function Peek({ a, next, onOpen, children }: { a: Attempt; next: boolean; onOpen(): void; /** 「열기」 앞에 둘 것 (후보의 순서 바꾸기) */ children?: ReactNode }) {
  const claimed = claimedOf(a)
  const row = (k: string, v: ReactNode) => (v ? <><dt>{k}</dt><dd>{v}</dd></> : null)
  const by = (name: string, at?: string) => `${who(name)}${at ? ` · ${when(at)}` : ''}`
  return (
    <div className={`pb-peek s-${a.state}`} data-ui="점 미리보기" data-ui-item={`${a.label} ${a.method}`}>
      <div className="pb-peek-head">
        <span className="pb-state"><AttemptDot s={a.state} label /></span>
        <span className="pb-label">{a.label}</span>
        <span className="pb-method"><AttemptName a={a} /></span>
        <AttemptTags a={a} next={next} />
        {children}
        <button className="btn sm" data-ui="시도 열기" onClick={onOpen}>{t('열기', 'Open')}</button>
      </div>
      <dl className="pb-facts pb-peek-facts">
        {claimed && row(t('조건', 'Condition'), a.condition)}
        {claimed && row(t('방법', 'Method'), a.method)}
        {!claimed && (a.state === 'holds' || a.state === 'reported') && row(t('결과', 'Result'), a.result)}
        {a.state === 'holds' && row(t('근거', 'Basis'), a.verdict?.note)}
        {a.state === 'dropped' && row(t('폐기 사유', 'Why dropped'), a.lesson ?? a.verdict?.note)}
        {a.state === 'dropped' && row(t('다시 열 조건', 'Reopen if'), a.reopen)}
        {a.state === 'active' && a.returned && row(t('수정 요청', 'Sent back'), a.returned.note)}
        {a.state === 'active' && row(t('작업', 'Work'), by(a.worker ?? a.by, a.started))}
        {a.state === 'candidate' && row(t('제안', 'Proposed'), by(a.by, a.created))}
      </dl>
    </div>
  )
}

/**
 * 시도 화면: 시도 하나의 전부. 위에서부터 돌아가는 링크(질문), 경로 차트(질문 ─ 위 시도 ─ 이 시도 ─ 바로 아래 시도. 점을 누르면 그 시도로),
 * 이름(자리 이름과 진술이나 방법), 단계 띠 · 주장 · 보고 · 판정 · 행동(성립 · 폐기 · ＋ 하위 후보)
 */
export function AttemptView({ rid, id, attempt, onSaved }: { rid: string; id: string; attempt: string; onSaved(msg: string): void }) {
  const client = useQueryClient()
  const q = useQuery({ queryKey: qk.problem(rid, id), queryFn: (): Promise<ProblemDoc> => problemsApi(rid).get(id) })
  const [verdict, setVerdict] = useState<'holds' | 'dropped' | null>(null)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const reload = useCallback(() => client.invalidateQueries({ queryKey: qk.problems(rid) }), [client, rid])
  const back = (at?: string) => go({ page: 'problems', rid, id, ...(at && { at }) })
  if (q.error) return <div className="banner danger">{t(`읽지 못했습니다: ${errorOf(q.error)}`, `Could not read: ${errorOf(q.error)}`)}</div>
  const p = q.data
  if (!p) return <p className="muted">{t('읽는 중…', 'Reading…')}</p>
  const a = p.attempts.find((x) => x.id === attempt)
  const head = (
    <header className="pb-head bar3" data-ui="시도 머리">
      <span className="pb-crumb"><button className="a pb-back" onClick={() => go({ page: 'problems', rid })}>{t('흐름', 'Flows')}</button><span aria-hidden>›</span><button className="a pb-back pb-crumb-q" title={p.question} onClick={() => back(a?.id)}>{p.question}</button></span>
      <span />
      <span className="pb-head-acts" />
    </header>
  )
  if (!a) return <>{head}<p className="empty">{t('이 흐름에 그 시도가 없습니다.', 'This flow has no such attempt.')}</p></>
  const locked = p.state === 'closed'
  const add = async (method: string) => {
    setBusy(true)
    try { await problemsApi(rid).addAttempts(p.id, [{ method, parent: a.id }]); setAdding(false) } catch (e) { onSaved(errorOf(e)) } finally { setBusy(false); void reload() }
  }
  return <>
    {head}
    <div className="pb-chart pb-near" data-ui="시도 경로">
      <TreeChart flow={{ ...p, attempts: nearOf(p.attempts, a.id) }} selected={a.id} rootName={t('질문', 'Question')} onRoot={() => back()} onPick={(x) => { if (x.id !== a.id) go({ page: 'problems', rid, id, attempt: x.id }) }} />
    </div>
    <h2 className="pb-title pb-attempt-title" data-ui="시도 이름"><span className="pb-label">{a.label}</span><span><AttemptName a={a} /></span></h2>
    <AttemptTags a={a} next={!!a.next && !p.stop} />
    <RepoPathContext.Provider value={{ rid }}>
      <section className="pb-sec pb-attempt" data-ui="시도" data-ui-item={`${a.label} ${a.method}`}>
        <Detail a={a} locked={locked} busy={busy} titled={claimedOf(a)} onVerdict={(_, r) => setVerdict(r)} onAddUnder={() => setAdding(true)} />
        {adding && <CandidateInput under={a.label} busy={busy} onAdd={(m) => void add(m)} onClose={() => setAdding(false)} />}
      </section>
    </RepoPathContext.Provider>
    {verdict && <VerdictDialog rid={rid} problem={p} attempt={a} result={verdict} onClose={() => setVerdict(null)} onDone={() => { setVerdict(null); onSaved(t('판정을 적었습니다', 'Verdict saved')); void reload() }} />}
  </>
}
