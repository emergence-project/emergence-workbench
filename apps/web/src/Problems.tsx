import { useCallback, useState, type CSSProperties, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { problemsApi, PROBLEM_LIMIT_STEP, type Attempt, type AttemptState, type DirectionReport, type ProblemDoc, type ProblemRow, type ProjectKind, type ProblemState, type ProblemStop } from './api'
import { Author } from './Author'
import { Icon } from './icons'
import { t } from './i18n'
import { CloseDialog, ProblemDialog, VerdictDialog } from './ProblemDialogs'
import { flowName } from './projectProfile'
import { qk } from './queries'
import { CodeText, RepoPathContext } from './repoPaths'
import { go } from './router'
import { agentName } from './taskView'

/**
 * 흐름과 시도 나무 (11/11 사용자 결정 "흐름을 시도 나무로 · 메시지 관문", 시안 J2uZ 4절).
 * 흐름은 사용자가 메시지(답이 예 · 아니오일 때의 한 문장)와 독자를 쓰고 시작해야 열린다. 에이전트는 그 아래에 시도 후보를 늘어놓고 하나씩 해 보며,
 * 성립 · 폐기는 일한 쪽이 아닌 쪽이 정한다. 한도나 정체에서는 방향 보고가 오고 사용자가 계속 · 좁히기 · 종료를 정한다.
 * 파일은 workbench/problems/<id>/ (docs/repo-format.md §16). 에이전트는 MCP 도구(problem_brief · attempt_* · direction_report)로 같은 것을 쓴다.
 */

const STATE_NAME: Record<ProblemState, string> = { proposed: t('제안', 'Proposed'), draft: t('쓰는 중', 'Draft'), open: t('진행', 'Open'), closed: t('종료', 'Closed') }
const ATTEMPT_NAME: Record<AttemptState, string> = { candidate: t('후보', 'Candidate'), active: t('진행', 'Working'), reported: t('판정 대기', 'To judge'), holds: t('성립', 'Holds'), dropped: t('폐기', 'Dropped') }
/** 색 점: 진행 파랑 · 판정 대기 주황 · 성립 청록 · 폐기 회색 고리 · 후보 옅은 점 (디자인 문서 2절 "색은 상태에만") */
const ATTEMPT_DOT: Record<AttemptState, string> = { candidate: 'none', active: 'in-progress', reported: 'blocked', holds: 'solved', dropped: 'stopped' }
const STOP_TEXT: Record<ProblemStop, string> = {
  decision: t('방향 보고: 결정 대기', 'Direction report: waiting for your decision'),
  limit: t('한도 도달: 다음은 방향 보고', 'Limit reached: a direction report comes next'),
  stuck: t('폐기 연속: 다음은 방향 보고', 'Dropped in a row: a direction report comes next'),
  exhausted: t('후보 없음', 'No candidates left'),
}
const who = (name: string) => (name === 'user' ? t('사용자', 'You') : agentName(name))
/** "2026-11-11T14:02" → "11/11 14:02" */
const when = (s: string | undefined) => (s ? s.slice(5, 16).replace('-', '/').replace('T', ' ') : '')
const errorOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** 흐름 목록 (화면 캐시 qk.problems: 흐름 파일 알림이 오면, 화면이 쓰면 다시 읽는다). 사이드바의 수도 이것을 쓴다 */
export function useProblems(rid: string) {
  return useQuery({ queryKey: qk.problems(rid), queryFn: () => problemsApi(rid).list() })
}
/** 사용자 차례: 방향 보고가 결정을 기다리는 흐름 수 */
export const problemTurns = (rows: ProblemRow[] | undefined) => rows?.filter((p) => p.waiting).length ?? 0

function AttemptDot({ s, label }: { s: AttemptState; label?: boolean }) {
  return <><span className={`g ${ATTEMPT_DOT[s]}`} role="img" aria-label={ATTEMPT_NAME[s]} title={ATTEMPT_NAME[s]} />{label && <span className="g-name">{ATTEMPT_NAME[s]}</span>}</>
}

export function ProblemsPage({ rid, id, kind, onSaved }: { rid: string; id?: string; kind?: ProjectKind; onSaved(msg: string): void }) {
  return (
    <div className="ws-doc" data-ui="흐름 쪽">
      <section className="pane" data-ui="본문">
        <div className="scroll">
          <div className="page-body pb-page">{id ? <ProblemView key={id} rid={rid} id={id} onSaved={onSaved} /> : <ProblemList rid={rid} kind={kind} />}</div>
        </div>
      </section>
    </div>
  )
}

// ---------- 목록 ----------

/** 목록 줄 오른쪽: 상태 점과 수(성립 · 폐기 · 판정 대기 · 진행), 끝에 시도 수 / 한도. 이름은 툴팁과 읽어 주는 말에 */
function Counts({ p }: { p: ProblemRow }) {
  const shown = (['holds', 'dropped', 'reported', 'active'] as const).filter((s) => p.counts[s] > 0)
  const said = [t(`시도 ${p.used} / 한도 ${p.limit}`, `Attempts ${p.used} / limit ${p.limit}`), ...shown.map((s) => `${ATTEMPT_NAME[s]} ${p.counts[s]}`)].join(' · ')
  return (
    <span className="pb-nums" role="img" aria-label={said} title={said}>
      <span className="pb-used">{t(`시도 ${p.used}/${p.limit}`, `Attempts ${p.used}/${p.limit}`)}</span>
      {shown.map((s) => <span key={s} className="pb-count"><span className={`g ${ATTEMPT_DOT[s]}`} />{p.counts[s]}</span>)}
    </span>
  )
}

function Row({ rid, p }: { rid: string; p: ProblemRow }) {
  const now = p.state !== 'open' ? (p.source ? t(`출처: ${p.source}`, `Source: ${p.source}`) : '')
    : p.stop ? STOP_TEXT[p.stop] : p.next ? t(`다음 ${p.next.label} ${p.next.method}`, `Next ${p.next.label} ${p.next.method}`) : ''
  return (
    <button className="pb-row" data-ui="흐름 줄" data-ui-item={p.question} onClick={() => go({ page: 'problems', rid, id: p.id })}>
      <span className="pb-q">{p.question}</span>
      {p.waiting && <span className="rail-count" title={STOP_TEXT.decision}>1</span>}
      {p.state === 'open' && <Counts p={p} />}
      {now && <span className="pb-now">{now}</span>}
    </button>
  )
}

function Group({ ui, title, hint, rows, rid, folded }: { ui: string; title: string; hint?: string; rows: ProblemRow[]; rid: string; folded?: boolean }) {
  if (!rows.length) return null
  const list = <div className="pb-rows">{rows.map((p) => <Row key={p.id} rid={rid} p={p} />)}</div>
  if (folded) return <details className="pb-fold" data-ui={ui}><summary>{title} {rows.length}{hint && <span className="pb-sum-hint">{hint}</span>}</summary>{list}</details>
  return <section className="pb-sec" data-ui={ui}><h3 className="pb-h3">{title} <span className="muted">{rows.length}</span></h3>{list}</section>
}

function ProblemList({ rid, kind }: { rid: string; kind?: ProjectKind }) {
  const q = useProblems(rid)
  const client = useQueryClient()
  const [adding, setAdding] = useState(false)
  const rows = q.data?.problems ?? []
  const of = (s: ProblemState) => rows.filter((p) => p.state === s)
  return <>
    <header className="pb-head">
      <h2 className="pb-h">{flowName(kind)}</h2><span className="sp" />
      <button className="btn" data-ui="흐름 추가" onClick={() => setAdding(true)}>＋ {t('흐름', 'Flow')}</button>
    </header>
    {q.error && <div className="banner danger">{t(`읽지 못했습니다: ${errorOf(q.error)}`, `Could not read: ${errorOf(q.error)}`)}</div>}
    {q.data?.diagnostics.map((d) => <div key={d.file} className="banner" data-ui="흐름 파일 오류">{d.file}: {d.message}</div>)}
    {q.data && rows.length === 0 && <p className="empty">{t('흐름이 없습니다. 「＋ 흐름」으로 질문 하나를 추가합니다. 메시지와 독자를 쓰면 시작할 수 있습니다.', 'No flows. Add a question with "＋ Flow". It can start once it has a message and a reader.')}</p>}
    <Group ui="진행 흐름" title={t('진행', 'Open')} rows={of('open')} rid={rid} />
    <Group ui="쓰는 중 흐름" title={t('쓰는 중', 'Draft')} rows={of('draft')} rid={rid} />
    <Group ui="제안 흐름" title={t('제안', 'Proposed')} hint={t('에이전트가 제안한 질문', 'Questions proposed by agents')} rows={of('proposed')} rid={rid} folded />
    <Group ui="종료 흐름" title={t('종료', 'Closed')} rows={of('closed')} rid={rid} folded />
    {adding && <ProblemDialog rid={rid} onClose={() => setAdding(false)} onDone={(p) => { setAdding(false); void client.invalidateQueries({ queryKey: qk.problems(rid) }); go({ page: 'problems', rid, id: p.id }) }} />}
  </>
}

// ---------- 흐름 하나 ----------

type Open = { k: 'edit' } | { k: 'close' } | { k: 'verdict'; attempt: Attempt; result: 'holds' | 'dropped' }

function ProblemView({ rid, id, onSaved }: { rid: string; id: string; onSaved(msg: string): void }) {
  const client = useQueryClient()
  const q = useQuery({ queryKey: qk.problem(rid, id), queryFn: () => problemsApi(rid).get(id) })
  const [open, setOpen] = useState<Open | null>(null)
  const [busy, setBusy] = useState(false)
  const api = problemsApi(rid)
  const reload = useCallback(() => client.invalidateQueries({ queryKey: qk.problems(rid) }), [client, rid])
  /** 쓰기 하나: 끝나면 다시 읽고, 실패하면 이유를 알린다 (그새 바뀐 것이면 다시 읽은 것이 보인다) */
  const run = async (work: () => Promise<unknown>, done?: string) => {
    setBusy(true)
    try { await work(); if (done) onSaved(done) } catch (e) { onSaved(errorOf(e)) } finally { setBusy(false); void reload() }
  }
  const saved = (msg: string) => () => { setOpen(null); onSaved(msg); void reload() }
  if (q.error) return <div className="banner danger">{t(`읽지 못했습니다: ${errorOf(q.error)}`, `Could not read: ${errorOf(q.error)}`)}</div>
  const p = q.data
  if (!p) return <p className="muted">{t('읽는 중…', 'Reading…')}</p>
  const started = p.state === 'open' || p.state === 'closed'
  const ready = !!p.if_yes && !!p.if_no && !!p.reader
  const report = p.reports.at(-1)
  const pending = p.stop === 'decision' && report ? report : null
  return <>
    <header className="pb-head" data-ui="흐름 머리">
      <button className="a pb-back" onClick={() => go({ page: 'problems', rid })}>{t('흐름', 'Flows')}</button>
      <span className="sp" />
      <button className="icon-btn" data-ui="흐름 수정" data-tip={t('수정', 'Edit')} aria-label={t('수정', 'Edit')} disabled={p.state === 'closed'} onClick={() => setOpen({ k: 'edit' })}>{Icon.pencil}</button>
      {!started && <button className="icon-btn" data-ui="흐름 삭제" data-tip={t('삭제', 'Delete')} aria-label={t('삭제', 'Delete')} disabled={busy}
        onClick={() => void run(async () => { await api.remove(p.id, p.hash); go({ page: 'problems', rid }) }, t('삭제했습니다 (problems/.trash/에 남습니다)', 'Deleted (kept in problems/.trash/)'))}>{Icon.trash}</button>}
      {p.state === 'open' && !pending && <button className="btn" data-ui="흐름 종료" onClick={() => setOpen({ k: 'close' })}>{t('종료', 'Close')}</button>}
      {!started && <button className="btn primary" data-ui="흐름 시작" disabled={busy || !ready} title={ready ? t('시작하면 에이전트가 이 흐름에서 시도합니다', 'Once started, agents work on attempts in this flow') : t('메시지와 독자를 쓰면 시작할 수 있습니다', 'Write the message and the reader to start')}
        onClick={() => void run(() => api.open(p.id, p.hash), t('시작했습니다', 'Started'))}>{t('시작', 'Start')}</button>}
    </header>
    <h2 className="pb-title" data-ui="흐름 질문">{p.question}</h2>
    <div className="pb-meta">
      <span>{STATE_NAME[p.state]}</span>
      {p.needs === 'all' && <span title={t('시도가 모두 성립해야 끝나는 분해', 'A decomposition: every attempt must hold')}>{t('분해', 'Decomposition')}</span>}
      {p.by !== 'user' && <span>{t(`${who(p.by)}의 제안`, `Proposed by ${who(p.by)}`)}</span>}
      {p.source && <span>{t(`출처: ${p.source}`, `Source: ${p.source}`)}</span>}
      {p.closed && <span>{t(`종료 ${when(p.closed.at)}`, `Closed ${when(p.closed.at)}`)}{p.closed.reason ? `: ${p.closed.reason}` : ''}</span>}
    </div>
    {!started && !ready && <p className="pb-gate" data-ui="메시지 관문"><span className="turn-dot" aria-hidden /> {t('메시지와 독자를 쓰면 시작할 수 있습니다.', 'Write the message and the reader to start.')}</p>}

    {pending && <Decision p={p} report={pending} busy={busy}
      onDecide={(verdict, note, limit) => void run(async () => { await api.decide(p.id, p.hash, verdict, note, limit); if (verdict === 'narrow') setOpen({ k: 'edit' }) }, verdict === 'close' ? t('종료했습니다', 'Closed') : t('한도를 올렸습니다', 'Limit raised'))} />}
    {p.stop && p.stop !== 'decision' && <p className="pb-stop" data-ui="멈춤">{STOP_TEXT[p.stop]}</p>}

    <Gate p={p} busy={busy} onDropLiterature={(i) => void run(() => api.patch(p.id, p.hash, { literature: p.literature.filter((_, j) => j !== i).map(({ ref, fact }) => ({ ref, fact })) }))} />

    {p.lessons.length > 0 && <section className="pb-sec" data-ui="폐기 사유">
      <h3 className="pb-h3">{t('폐기 사유', 'Why dropped')} <span className="muted">{p.lessons.length}</span></h3>
      <ul className="pb-lessons">{p.lessons.map((l) => <li key={l.id}><span className="g stopped" aria-hidden /><b>{l.label}</b><span>{l.lesson}{l.reopen && <span className="pb-reopen" title={t('다시 열 조건', 'Reopen if')}><span className="ico" aria-hidden>{Icon.reopen}</span>{l.reopen}</span>}</span></li>)}</ul>
    </section>}

    {started && <RepoPathContext.Provider value={{ rid }}><Tree p={p} busy={busy} locked={p.state === 'closed'}
      onAdd={(method, parent) => void run(() => api.addAttempts(p.id, [{ method, ...(parent && { parent }) }]))}
      onOrder={(order) => void run(() => api.patch(p.id, p.hash, { order }))}
      onVerdict={(attempt, result) => setOpen({ k: 'verdict', attempt, result })} /></RepoPathContext.Provider>}

    {p.reports.some((r) => r.decision) && <details className="pb-fold" data-ui="지난 방향 보고">
      <summary>{t('지난 방향 보고', 'Earlier direction reports')} {p.reports.filter((r) => r.decision).length}</summary>
      {p.reports.filter((r) => r.decision).map((r) => <div key={r.at} className="pb-past"><ReportFacts r={r} /><p className="pb-past-d">{t(`결정 ${when(r.decision?.at)}: `, `Decision ${when(r.decision?.at)}: `)}<b>{VERDICT_NAME[r.decision?.verdict ?? 'continue']}</b>{r.decision?.limit ? t(` · 한도 ${r.decision.limit}`, ` · limit ${r.decision.limit}`) : ''}{r.decision?.note ? ` · ${r.decision.note}` : ''}</p></div>)}
    </details>}

    {open?.k === 'edit' && <ProblemDialog rid={rid} problem={p} onClose={() => setOpen(null)} onDone={saved(t('저장했습니다', 'Saved'))} />}
    {open?.k === 'close' && <CloseDialog rid={rid} problem={p} onClose={() => setOpen(null)} onDone={saved(t('종료했습니다', 'Closed'))} />}
    {open?.k === 'verdict' && <VerdictDialog rid={rid} problem={p} attempt={open.attempt} result={open.result} onClose={() => setOpen(null)} onDone={saved(t('판정을 적었습니다', 'Verdict saved'))} />}
  </>
}

const VERDICT_NAME = { continue: t('계속', 'Continue'), narrow: t('좁히기', 'Narrow'), close: t('종료', 'Close') }

/** 흐름 열기: 사용자의 두 줄(메시지 · 독자)과 에이전트의 세 줄(문헌 대조 · 첫 시험 · 채점) */
function Gate({ p, busy, onDropLiterature }: { p: ProblemDoc; busy: boolean; onDropLiterature(i: number): void }) {
  const none = <span className="muted">{t('없음', 'None')}</span>
  const line = (k: string, by: string, v: ReactNode) => <><dt>{k}<small>{by}</small></dt><dd>{v}</dd></>
  const me = t('사용자', 'You'), agent = t('에이전트', 'Agent')
  return (
    <section className="pb-sec" data-ui="흐름 열기">
      <dl className="pb-gate-list">
        {line(t('예이면', 'If yes'), me, p.if_yes ?? none)}
        {line(t('아니오이면', 'If no'), me, p.if_no ?? none)}
        {line(t('독자', 'Reader'), me, p.reader ?? none)}
        {line(t('문헌 대조', 'Literature'), agent, p.literature.length ? <ul className="pb-lit">{p.literature.map((l, i) => (
          <li key={`${l.ref}/${i}`}><span className="pb-ref">{l.ref}</span> {l.fact}
            {p.state !== 'closed' && <button className="icon-btn sm" data-tip={t('제거', 'Remove')} aria-label={t(`제거: ${l.ref}`, `Remove: ${l.ref}`)} disabled={busy} onClick={() => onDropLiterature(i)}>{Icon.x}</button>}</li>
        ))}</ul> : none)}
        {line(t('첫 시험', 'First test'), agent, p.first_test ?? none)}
        {line(t('채점', 'Grading'), agent, p.grading ?? <span className="muted">{t('탐색 (기준 없음)', 'Exploratory (no rule)')}</span>)}
      </dl>
    </section>
  )
}

function ReportFacts({ r }: { r: DirectionReport }) {
  return (
    <dl className="pb-facts">
      {r.for_yes && <><dt>{t('예 근거', 'For yes')}</dt><dd>{r.for_yes}</dd></>}
      {r.for_no && <><dt>{t('아니오 근거', 'For no')}</dt><dd>{r.for_no}</dd></>}
      {r.neither && <><dt>{t('무관', 'For neither')}</dt><dd>{r.neither}</dd></>}
    </dl>
  )
}

const WHY: Record<DirectionReport['why'], string> = { limit: t('한도 도달', 'limit reached'), stuck: t('폐기 연속', 'dropped in a row'), exhausted: t('후보 없음', 'no candidates left'), asked: t('에이전트 요청', 'asked by the agent') }

/** 방향 보고와 결정: 계속 · 좁히기 · 종료 (사용자 차례) */
function Decision({ p, report, busy, onDecide }: { p: ProblemDoc; report: DirectionReport; busy: boolean; onDecide(verdict: 'continue' | 'narrow' | 'close', note: string, limit?: number): void }) {
  const [note, setNote] = useState('')
  const [limit, setLimit] = useState(String(Math.max(p.limit, p.used) + PROBLEM_LIMIT_STEP))
  const n = Number(limit)
  const ok = Number.isInteger(n) && n > p.used && n <= 99
  return (
    <section className="pb-decision" data-ui="방향 보고">
      <h3 className="pb-h3"><span className="turn-dot" aria-hidden /> {t('방향 보고', 'Direction report')} <span className="muted">{who(report.by)} · {when(report.at)} · {WHY[report.why]}</span></h3>
      <p className="pb-msg"><span>{t('예이면', 'If yes')}</span> {p.if_yes}<br /><span>{t('아니오이면', 'If no')}</span> {p.if_no}</p>
      <ReportFacts r={report} />
      <div className="pb-decide">
        <input className="pb-note" aria-label={t('덧붙일 말 (선택)', 'Note (optional)')} placeholder={t('덧붙일 말 (선택)', 'Note (optional)')} value={note} onChange={(e) => setNote(e.target.value)} />
        <label className="pb-newlimit">{t('새 한도', 'New limit')} <input type="number" min={p.used + 1} max={99} value={limit} onChange={(e) => setLimit(e.target.value)} /></label>
        <button className="btn" data-ui="계속" disabled={busy || !ok} title={t('한도를 올리고 같은 질문으로 계속합니다', 'Raise the limit and continue with the same question')} onClick={() => onDecide('continue', note, n)}>{VERDICT_NAME.continue}</button>
        <button className="btn" data-ui="좁히기" disabled={busy || !ok} title={t('한도를 올리고 질문 · 메시지를 좁힙니다', 'Raise the limit and narrow the question or message')} onClick={() => onDecide('narrow', note, n)}>{VERDICT_NAME.narrow}</button>
        <button className="btn" data-ui="종료" disabled={busy} title={t('사유와 시도를 남기고 종료합니다', 'Close the flow, keeping the reason and the attempts')} onClick={() => onDecide('close', note)}>{VERDICT_NAME.close}</button>
      </div>
    </section>
  )
}

// ---------- 시도 나무 ----------

const depthStyle = (depth: number): CSSProperties => ({ paddingLeft: `calc(${depth} * var(--sp-5))` })

function Tree({ p, busy, locked, onAdd, onOrder, onVerdict }: {
  p: ProblemDoc; busy: boolean; locked: boolean
  onAdd(method: string, parent?: string): void
  onOrder(order: string[]): void
  onVerdict(attempt: Attempt, result: 'holds' | 'dropped'): void
}) {
  const [shown, setShown] = useState<string | null>(null)
  const [adding, setAdding] = useState<{ parent?: string } | null>(null)
  const [method, setMethod] = useState('')
  const ids = p.attempts.map((a) => a.id)
  /** 형제 사이에서 한 칸 위 · 아래로: 보이는 순서 전체를 순서로 적는다 (보이는 순서 = 일하는 순서) */
  const move = (a: Attempt, by: -1 | 1) => {
    const sibs = p.attempts.filter((x) => x.parent === a.parent).map((x) => x.id)
    const i = sibs.indexOf(a.id), j = i + by
    if (j < 0 || j >= sibs.length) return
    const swapped = sibs.map((x, k) => (k === i ? sibs[j]! : k === j ? a.id : x))
    // 형제의 새 순서를 앞에, 나머지는 지금 보이는 순서대로
    onOrder([...swapped, ...ids.filter((x) => !sibs.includes(x))])
  }
  const add = () => { const m = method.trim(); if (!m) return; onAdd(m, adding?.parent); setMethod(''); setAdding(null) }
  const sibsOf = (a: Attempt) => p.attempts.filter((x) => x.parent === a.parent)
  return (
    <section className="pb-sec" data-ui="시도 목록">
      <h3 className="pb-h3">{t('시도', 'Attempts')} <span className="muted">{t(`${p.used} / 한도 ${p.limit}`, `${p.used} / limit ${p.limit}`)}</span><span className="sp" />
        {!locked && <button className="btn sm" data-ui="후보 추가" onClick={() => { setAdding({}); setMethod('') }}>＋ {t('후보', 'Candidate')}</button>}</h3>
      {p.attempts.length === 0 && <p className="empty">{t('시도가 없습니다. 「＋ 후보」로 추가합니다.', 'No attempts. Add one with "＋ Candidate".')}</p>}
      <div className="pb-tree">
        {p.attempts.map((a) => {
          const sibs = sibsOf(a), i = sibs.indexOf(a)
          const sub = a.state === 'dropped' ? a.lesson ?? a.verdict?.note : a.state === 'holds' || a.state === 'reported' ? a.result : a.state === 'active' ? `${who(a.worker ?? a.by)} · ${when(a.started)}` : undefined
          const on = shown === a.id
          return (
            <div key={a.id} className={`pb-node s-${a.state}${on ? ' on' : ''}`} style={depthStyle(a.depth)} data-ui="시도" data-ui-item={`${a.label} ${a.method}`}>
              <div className="pb-node-row">
                <button className="pb-node-main" aria-expanded={on} onClick={() => setShown(on ? null : a.id)}>
                  <span className="pb-state"><AttemptDot s={a.state} label /></span>
                  <span className="pb-label">{a.label}</span>
                  <span className="pb-method">{a.method}{a.needs === 'all' && <span className="tag pb-all" title={t('하위 시도가 모두 성립해야 성립', 'Holds only if every attempt below holds')}>{t('분해', 'All')}</span>}</span>
                  {a.next && !p.stop && <span className="tag pb-next" title={t('다음에 할 후보', 'The next candidate to try')}>{t('다음', 'Next')}</span>}
                  {a.changed && <span className="tag pb-stale" data-ui="판정 후 변경" title={t(`성립으로 판정한 뒤 파일이 바뀌었습니다: ${a.changed.join(', ')}`, `Files changed after the holds verdict: ${a.changed.join(', ')}`)}><span className="turn-dot" aria-hidden />{t('판정 후 변경', 'Changed after verdict')}</span>}
                </button>
                {a.state === 'candidate' && !locked && <span className="pb-move">
                  <button className="icon-btn sm" data-tip={t('위로', 'Move up')} aria-label={t(`${a.label} 위로`, `Move ${a.label} up`)} disabled={busy || i === 0} onClick={() => move(a, -1)}>{Icon.up}</button>
                  <button className="icon-btn sm" data-tip={t('아래로', 'Move down')} aria-label={t(`${a.label} 아래로`, `Move ${a.label} down`)} disabled={busy || i === sibs.length - 1} onClick={() => move(a, 1)}>{Icon.down}</button>
                </span>}
              </div>
              {sub && !on && <div className="pb-sub">{sub}</div>}
              {on && <Detail a={a} locked={locked} busy={busy} onVerdict={onVerdict} onAddUnder={() => { setAdding({ parent: a.id }); setMethod('') }} />}
            </div>
          )
        })}
      </div>
      {adding && <div className="pb-add" data-ui="후보 입력란">
        <input autoFocus aria-label={t('방법 한 줄', 'Method, one line')} placeholder={adding.parent ? t(`${adding.parent.toUpperCase()}의 하위 후보: 방법 한 줄`, `Candidate under ${adding.parent.toUpperCase()}: method, one line`) : t('방법 한 줄', 'Method, one line')}
          value={method} onChange={(e) => setMethod(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) add(); if (e.key === 'Escape') setAdding(null) }} />
        <button className="btn sm primary" disabled={busy || !method.trim()} onClick={add}>{t('추가', 'Add')}</button>
        <button className="btn sm" onClick={() => setAdding(null)}>{t('취소', 'Cancel')}</button>
      </div>}
    </section>
  )
}

/** 단계 띠: 제안 › 작업 › 판정. 단계마다 누가 · 언제. 지난 단계는 회색 점, 지금 단계는 상태 색 점, 남은 단계는 옅은 점 */
function Steps({ a }: { a: Attempt }) {
  const judged = a.state === 'holds' || a.state === 'dropped'
  const worked = !!a.worker
  const by = (name: string, at?: string) => <><Author by={who(name)} />{at ? ` · ${when(at)}` : ''}</>
  const step = (name: string, dot: string, body: ReactNode, tip?: string) => (
    <li className={`pb-step${body ? '' : ' todo'}`} title={tip}><span className={`g ${dot}`} aria-hidden /><span className="pb-step-name">{name}</span>{body && <span className="pb-step-by">{body}</span>}</li>
  )
  return (
    <ol className="pb-steps" data-ui="시도 단계">
      {step(t('제안', 'Proposed'), 'pb-done', by(a.by, a.created))}
      {step(t('작업', 'Work'), a.state === 'active' ? ATTEMPT_DOT.active : worked ? 'pb-done' : 'none', worked && by(a.worker!, a.started))}
      {step(t('판정', 'Verdict'), judged || a.state === 'reported' ? ATTEMPT_DOT[a.state] : 'none',
        judged && a.verdict ? <>{ATTEMPT_NAME[a.state]} · {by(a.verdict.by, a.verdict.at)}</> : a.state === 'reported' && t('대기', 'Waiting'),
        t('작업하지 않은 쪽이 판정합니다', 'Someone other than the worker gives the verdict'))}
    </ol>
  )
}

/** 시도 하나의 전부: 단계 띠, 보고(결과 · 작업 내용 · 파일 · 실행 · 검사), 판정(근거 · 교차 검증 · 폐기 사유 · 다시 열 조건) */
function Detail({ a, locked, busy, onVerdict, onAddUnder }: { a: Attempt; locked: boolean; busy: boolean; onVerdict(a: Attempt, r: 'holds' | 'dropped'): void; onAddUnder(): void }) {
  const row = (k: string, v: ReactNode, cls?: string) => (v ? <><dt>{k}</dt><dd className={cls}>{v}</dd></> : null)
  const tested = a.verdict?.tested
  // 해 보지 않고 폐기한 후보는 사유 하나만 적는다 (근거와 같은 글)
  const sameReason = !!a.lesson && a.lesson === a.verdict?.note
  return (
    <div className="pb-detail">
      <Steps a={a} />
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
      {!locked && a.state !== 'dropped' && <div className="pb-acts">
        {a.state === 'reported' && <button className="btn sm" data-ui="성립" disabled={busy} onClick={() => onVerdict(a, 'holds')}>{t('성립', 'Holds')}</button>}
        {(a.state === 'reported' || a.state === 'candidate') && <button className="btn sm" data-ui="폐기" disabled={busy} title={a.state === 'candidate' ? t('해 보지 않고 폐기합니다', 'Drop without trying') : undefined} onClick={() => onVerdict(a, 'dropped')}>{t('폐기', 'Drop')}</button>}
        <span className="sp" />
        <button className="btn sm" data-ui="아래에 후보 추가" disabled={busy} onClick={onAddUnder}>＋ {t('하위 후보', 'Sub-candidate')}</button>
      </div>}
    </div>
  )
}
