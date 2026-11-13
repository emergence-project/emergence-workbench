import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { problemsApi, PROBLEM_LIMIT_STEP, type Attempt, type ClaimSide, type DirectionReport, type ProblemDoc, type ProblemRow, type ProjectKind, type ProblemState, type ProblemStop } from './api'
import { Icon } from './icons'
import { t } from './i18n'
import { ATTEMPT_DOT, AttemptRow, CandidateInput, errorOf, when, who } from './ProblemAttempt'
import { ClaimInput, ClaimPeek, ClaimRow, ClaimView, Moves } from './ProblemClaim'
import { CloseDialog, ProblemDialog, VerdictDialog } from './ProblemDialogs'
import { FlowsChart, ROOT_ID, TreeChart } from './ProblemChart'
import { Exceptions } from './ProblemExceptions'
import { ANSWER_NAME, ATTEMPT_NAME } from './problemNames'
import { flowName } from './projectProfile'
import { qk } from './queries'
import { RepoPathContext } from './repoPaths'
import { go, href, type FlowView } from './router'

/**
 * 흐름: 질문 하나와 그 아래의 주장 · 시도 (11/11 사용자 결정 "메시지 관문", 11/13 "점 = 주장, 시도는 근거").
 * 흐름은 사용자가 메시지(답이 예 · 아니오일 때의 한 문장)와 독자를 쓰고 시작해야 열린다. 에이전트는 그 아래에 시도 후보를 늘어놓고 하나씩 해 보며,
 * 성립 · 폐기는 일한 쪽이 아닌 쪽이 정한다. 한도나 정체에서는 방향 보고가 오고 사용자가 계속 · 좁히기 · 종료를 정한다.
 * 점 하나는 판단할 수 있는 주장 하나다. 시도는 주장(아직 없으면 질문)을 겨눈 방법 하나로 그 주장의 근거가 되고, 판정은 그 주장이 그 시도의 근거에서 따라 나오는지만 본다.
 * 주장의 상태는 근거(시도와 아래 주장)에서 계산된다. 사실로 받아들이는 승인은 사용자가 흐름을 답과 함께 닫을 때 그 답이 기대는 주장에 한다.
 * 보기는 둘이다: 차트(질문에서 주장이 왼쪽에서 오른쪽으로 갈라지는 나무)와 목록(주장마다 그 아래에 시도). 같은 자료를 다르게 그릴 뿐이다.
 * 파일은 workbench/problems/<id>/ (docs/repo-format.md §16). 에이전트는 MCP 도구(problem_brief · attempt_* · direction_report)로 같은 것을 쓴다.
 */

const STATE_NAME: Record<ProblemState, string> = { proposed: t('제안', 'Proposed'), draft: t('쓰는 중', 'Draft'), open: t('진행', 'Open'), closed: t('종료', 'Closed') }
const STOP_TEXT: Record<ProblemStop, string> = {
  decision: t('방향 보고: 결정 대기', 'Direction report: waiting for your decision'),
  limit: t('한도 도달: 다음은 방향 보고', 'Limit reached: a direction report comes next'),
  stuck: t('폐기 연속: 다음은 방향 보고', 'Dropped in a row: a direction report comes next'),
  exhausted: t('후보 없음', 'No candidates left'),
}
/** 흐름 목록 (화면 캐시 qk.problems: 흐름 파일 알림이 오면, 화면이 쓰면 다시 읽는다). 사이드바의 수도 이것을 쓴다 */
export function useProblems(rid: string) {
  return useQuery({ queryKey: qk.problems(rid), queryFn: () => problemsApi(rid).list() })
}
/** 사용자 차례: 방향 보고가 결정을 기다리는 흐름 수 */
export const problemTurns = (rows: ProblemRow[] | undefined) => rows?.filter((p) => p.waiting).length ?? 0

/** 고른 보기는 이 브라우저에 남긴다. 주소에 보기가 있으면(보기를 고른 뒤, 찍는 화면) 그것이 앞선다 */
const VIEW_KEY = 'rw-flow-view'
const storedView = (): FlowView => { try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'chart' } catch { return 'chart' } }

export function ProblemsPage({ rid, id, kind, view: asked, at, attempt, onSaved }: { rid: string; id?: string; kind?: ProjectKind; view?: FlowView; at?: string; attempt?: string; onSaved(msg: string): void }) {
  const view = asked ?? storedView()
  const pick = (v: FlowView) => {
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* 무시 */ }
    go({ page: 'problems', rid, ...(id && { id }), view: v })
  }
  const views = (
    <div className="segmented small" role="radiogroup" aria-label={t('보기', 'View')} data-ui="흐름 보기">
      <button type="button" role="radio" aria-checked={view === 'chart'} className={view === 'chart' ? 'on' : ''} onClick={() => pick('chart')}>{t('차트', 'Chart')}</button>
      <button type="button" role="radio" aria-checked={view === 'list'} className={view === 'list' ? 'on' : ''} onClick={() => pick('list')}>{t('목록', 'List')}</button>
    </div>
  )
  return (
    <div className="ws-doc" data-ui="흐름 쪽">
      <section className="pane" data-ui="본문">
        <div className="scroll">
          <div className="page-body pb-page">{id && attempt ? <ClaimView key={`${id}/${attempt}`} rid={rid} id={id} at={attempt} onSaved={onSaved} />
            : id ? <ProblemView key={id} rid={rid} id={id} view={view} views={views} at={at} onSaved={onSaved} /> : <ProblemList rid={rid} kind={kind} view={view} views={views} />}</div>
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

/** 흐름 줄의 옅은 한 줄: 닫았으면 답(없으면 출처), 열려 있으면 멈춘 까닭이나 다음 후보 */
const nowOf = (p: ProblemRow) => (p.state !== 'open' ? (p.answer ? t(`답: ${ANSWER_NAME[p.answer]}`, `Answer: ${ANSWER_NAME[p.answer]}`) : p.source ? t(`출처: ${p.source}`, `Source: ${p.source}`) : '')
  : p.stop ? STOP_TEXT[p.stop] : p.next ? t(`다음 ${p.next.label} ${p.next.method}`, `Next ${p.next.label} ${p.next.method}`) : '')

function Row({ rid, p }: { rid: string; p: ProblemRow }) {
  const now = nowOf(p)
  return (
    <button className="pb-row" data-ui="흐름 줄" data-ui-item={p.question} onClick={() => go({ page: 'problems', rid, id: p.id })}>
      <span className="pb-q">{p.question}</span>
      {p.waiting && <span className="rail-count" title={STOP_TEXT.decision}>1</span>}
      {p.state === 'open' && <Counts p={p} />}
      {now && <span className="pb-now">{now}</span>}
    </button>
  )
}

/** 차트 줄의 왼쪽 칸: 목록의 흐름 줄과 같은 것(질문 · 사용자 차례 · 수 · 옅은 한 줄)을 세로로 */
function ChartLabel({ rid, p }: { rid: string; p: ProblemRow }) {
  const now = nowOf(p)
  return <>
    <button className="pb-chart-name" data-ui="흐름 줄" data-ui-item={p.question} onClick={() => go({ page: 'problems', rid, id: p.id })}>{p.question}</button>
    {(p.waiting || p.state === 'open') && <span className="pb-chart-nums">{p.waiting && <span className="rail-count" title={STOP_TEXT.decision}>1</span>}{p.state === 'open' && <Counts p={p} />}</span>}
    {now && <span className="pb-now" title={now}>{now}</span>}
  </>
}

function Group({ ui, title, hint, rows, rid, folded, chart }: { ui: string; title: string; hint?: string; rows: ProblemRow[]; rid: string; folded?: boolean; chart?: boolean }) {
  if (!rows.length) return null
  const list = chart
    ? <FlowsChart rid={rid} rows={rows} label={(p) => <ChartLabel rid={rid} p={p} />} onRoot={(p) => go({ page: 'problems', rid, id: p.id })} onPick={(p, c) => go({ page: 'problems', rid, id: p.id, at: c.id })} />
    : <div className="pb-rows">{rows.map((p) => <Row key={p.id} rid={rid} p={p} />)}</div>
  if (folded) return <details className="pb-fold" data-ui={ui}><summary>{title} {rows.length}{hint && <span className="pb-sum-hint">{hint}</span>}</summary>{list}</details>
  return <section className="pb-sec" data-ui={ui}><h3 className="pb-h3">{title} <span className="muted">{rows.length}</span></h3>{list}</section>
}

function ProblemList({ rid, kind, view, views }: { rid: string; kind?: ProjectKind; view: FlowView; views: ReactNode }) {
  const q = useProblems(rid)
  const client = useQueryClient()
  const [adding, setAdding] = useState(false)
  const rows = q.data?.problems ?? []
  const of = (s: ProblemState) => rows.filter((p) => p.state === s)
  return <>
    <header className="pb-head bar3">
      <h2 className="pb-h">{flowName(kind)}</h2>
      {views}
      <span className="pb-head-acts"><button className="btn" data-ui="흐름 추가" onClick={() => setAdding(true)}>＋ {t('흐름', 'Flow')}</button></span>
    </header>
    {q.error && <div className="banner danger">{t(`읽지 못했습니다: ${errorOf(q.error)}`, `Could not read: ${errorOf(q.error)}`)}</div>}
    {q.data?.diagnostics.map((d) => <div key={d.file} className="banner" data-ui="흐름 파일 오류">{d.file}: {d.message}</div>)}
    {q.data && rows.length === 0 && <p className="empty">{t('흐름이 없습니다. 「＋ 흐름」으로 질문 하나를 추가합니다. 메시지와 독자를 쓰면 시작할 수 있습니다.', 'No flows. Add a question with "＋ Flow". It can start once it has a message and a reader.')}</p>}
    <Group ui="진행 흐름" title={t('진행', 'Open')} rows={of('open')} rid={rid} chart={view === 'chart'} />
    <Group ui="쓰는 중 흐름" title={t('쓰는 중', 'Draft')} rows={of('draft')} rid={rid} />
    <Group ui="제안 흐름" title={t('제안', 'Proposed')} hint={t('에이전트가 제안한 질문', 'Questions proposed by agents')} rows={of('proposed')} rid={rid} folded />
    <Group ui="종료 흐름" title={t('종료', 'Closed')} rows={of('closed')} rid={rid} folded chart={view === 'chart'} />
    {q.data && <Exceptions rid={rid} flows={rows} />}
    {adding && <ProblemDialog rid={rid} onClose={() => setAdding(false)} onDone={(p) => { setAdding(false); void client.invalidateQueries({ queryKey: qk.problems(rid) }); go({ page: 'problems', rid, id: p.id }) }} />}
  </>
}

// ---------- 흐름 하나 ----------

type Open = { k: 'edit' } | { k: 'close'; note?: string } | { k: 'verdict'; attempt: Attempt; result: 'holds' | 'dropped' }

function ProblemView({ rid, id, view, views, at, onSaved }: { rid: string; id: string; view: FlowView; views: ReactNode; at?: string; onSaved(msg: string): void }) {
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
  const chart = view === 'chart'
  // 차트 보기에서는 나무가 먼저 보이게 주장을 흐름 열기 위에 둔다. 목록 보기는 읽는 순서대로(열기 · 폐기 사유 · 주장)
  const tree = started && <RepoPathContext.Provider value={{ rid }}><Tree p={p} rid={rid} busy={busy} locked={p.state === 'closed'} chart={chart} at={at}
    onAdd={(method, claim) => void run(() => api.addAttempts(p.id, [{ method, ...(claim && { claim }) }]))}
    onAddClaim={(statement, under, side) => void run(() => api.addClaim(p.id, { statement, ...(under ? { under } : { side }) }))}
    onOrder={(order) => void run(() => api.patch(p.id, p.hash, { order }))}
    onVerdict={(attempt, result) => setOpen({ k: 'verdict', attempt, result })} /></RepoPathContext.Provider>
  return <>
    <header className="pb-head bar3" data-ui="흐름 머리">
      <span><button className="a pb-back" onClick={() => go({ page: 'problems', rid })}>{t('흐름', 'Flows')}</button></span>
      {views}
      <span className="pb-head-acts">
      <button className="icon-btn" data-ui="흐름 수정" data-tip={t('수정', 'Edit')} aria-label={t('수정', 'Edit')} disabled={p.state === 'closed'} onClick={() => setOpen({ k: 'edit' })}>{Icon.pencil}</button>
      {!started && <button className="icon-btn" data-ui="흐름 삭제" data-tip={t('삭제', 'Delete')} aria-label={t('삭제', 'Delete')} disabled={busy}
        onClick={() => void run(async () => { await api.remove(p.id, p.hash); go({ page: 'problems', rid }) }, t('삭제했습니다 (problems/.trash/에 남습니다)', 'Deleted (kept in problems/.trash/)'))}>{Icon.trash}</button>}
      {p.state === 'open' && !pending && <button className="btn" data-ui="흐름 종료" onClick={() => setOpen({ k: 'close' })}>{t('종료', 'Close')}</button>}
      {!started && <button className="btn primary" data-ui="흐름 시작" disabled={busy || !ready} title={ready ? t('시작하면 에이전트가 이 흐름에서 시도합니다', 'Once started, agents work on attempts in this flow') : t('메시지와 독자를 쓰면 시작할 수 있습니다', 'Write the message and the reader to start')}
        onClick={() => void run(() => api.open(p.id, p.hash), t('시작했습니다', 'Started'))}>{t('시작', 'Start')}</button>}
      </span>
    </header>
    <h2 className="pb-title" data-ui="흐름 질문">{p.question}</h2>
    <div className="pb-meta">
      <span>{STATE_NAME[p.state]}</span>
      {p.by !== 'user' && <span>{t(`${who(p.by)}의 제안`, `Proposed by ${who(p.by)}`)}</span>}
      {p.source && <span>{t(`출처: ${p.source}`, `Source: ${p.source}`)}</span>}
      {p.closed && <span>{t(`종료 ${when(p.closed.at)}`, `Closed ${when(p.closed.at)}`)}{p.closed.reason ? `: ${p.closed.reason}` : ''}</span>}
    </div>
    {p.closed?.answer && <p className="pb-answer" data-ui="흐름의 답"><b>{t(`답: ${ANSWER_NAME[p.closed.answer]}`, `Answer: ${ANSWER_NAME[p.closed.answer]}`)}</b>{p.closed.answer === 'yes' ? p.if_yes : p.if_no}</p>}
    {!started && !ready && <p className="pb-gate" data-ui="메시지 관문"><span className="turn-dot" aria-hidden /> {t('메시지와 독자를 쓰면 시작할 수 있습니다.', 'Write the message and the reader to start.')}</p>}

    {pending && <Decision p={p} report={pending} busy={busy}
      onDecide={(verdict, note, limit) => {
        // 종료는 답을 묻는 종료 창으로 (적어 둔 말은 사유로 넘긴다)
        if (verdict === 'close') { setOpen({ k: 'close', note }); return }
        void run(async () => { await api.decide(p.id, p.hash, verdict, note, limit); if (verdict === 'narrow') setOpen({ k: 'edit' }) }, t('한도를 올렸습니다', 'Limit raised'))
      }} />}
    {p.stop && p.stop !== 'decision' && <p className="pb-stop" data-ui="멈춤">{STOP_TEXT[p.stop]}</p>}

    {chart && tree}
    <Gate p={p} busy={busy} onDropLiterature={(i) => void run(() => api.patch(p.id, p.hash, { literature: p.literature.filter((_, j) => j !== i).map(({ ref, fact }) => ({ ref, fact })) }))} />

    {p.lessons.length > 0 && <section className="pb-sec" data-ui="폐기 사유">
      <h3 className="pb-h3">{t('폐기 사유', 'Why dropped')} <span className="muted">{p.lessons.length}</span></h3>
      <ul className="pb-lessons">{p.lessons.map((l) => <li key={l.id}><span className="g stopped" aria-hidden /><b>{l.label}</b><span>{l.lesson}{l.reopen && <span className="pb-reopen" title={t('다시 열 조건', 'Reopen if')}><span className="ico" aria-hidden>{Icon.reopen}</span>{l.reopen}</span>}</span></li>)}</ul>
    </section>}

    {!chart && tree}

    {p.reports.some((r) => r.decision) && <details className="pb-fold" data-ui="지난 방향 보고">
      <summary>{t('지난 방향 보고', 'Earlier direction reports')} {p.reports.filter((r) => r.decision).length}</summary>
      {p.reports.filter((r) => r.decision).map((r) => <div key={r.at} className="pb-past"><ReportFacts r={r} /><p className="pb-past-d">{t(`결정 ${when(r.decision?.at)}: `, `Decision ${when(r.decision?.at)}: `)}<b>{VERDICT_NAME[r.decision?.verdict ?? 'continue']}</b>{r.decision?.limit ? t(` · 한도 ${r.decision.limit}`, ` · limit ${r.decision.limit}`) : ''}{r.decision?.note ? ` · ${r.decision.note}` : ''}</p></div>)}
    </details>}

    {open?.k === 'edit' && <ProblemDialog rid={rid} problem={p} onClose={() => setOpen(null)} onDone={saved(t('저장했습니다', 'Saved'))} />}
    {started && <Exceptions rid={rid} problem={p.id} />}

    {open?.k === 'close' && <CloseDialog rid={rid} problem={p} note={open.note} onClose={() => setOpen(null)}
      onDone={(q) => saved(q.state === 'closed' ? t('종료했습니다', 'Closed') : t('종료하지 않았습니다. 수정 · 기각한 주장을 돌려보냈습니다', 'Not closed. The claims you sent back or rejected were returned'))()} />}
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

// ---------- 주장과 시도 ----------

const depthStyle = (depth: number): CSSProperties => ({ paddingLeft: `calc(${depth} * var(--sp-5))` })

function Tree({ p, rid, busy, locked, chart, at, onAdd, onAddClaim, onOrder, onVerdict }: {
  p: ProblemDoc; rid: string; busy: boolean; locked: boolean
  /** 차트 보기: 주장의 나무를 차트로 그리고 고른 점의 미리보기만 그 아래에 둔다. 전부는 주장 화면에서 본다 */
  chart: boolean
  /** 처음부터 골라 둘 점: 주장 번호나 0(질문) (여러 흐름의 차트에서 점을 눌러 왔을 때, 주장 화면에서 돌아왔을 때) */
  at?: string
  onAdd(method: string, claim?: string): void
  onAddClaim(statement: string, under?: string, side?: ClaimSide): void
  onOrder(order: string[]): void
  onVerdict(attempt: Attempt, result: 'holds' | 'dropped'): void
}) {
  // 차트에서는 고른 점(주장 번호 · 0), 목록에서는 펼친 시도
  const [shown, setShown] = useState<string | null>(at ?? null)
  const [adding, setAdding] = useState<'try' | 'claim' | null>(null)
  const section = useRef<HTMLElement>(null), peek = useRef<HTMLDivElement>(null)
  // 차트에서 점을 고르면 미리보기가 차트 아래에 뜬다. 화면 아래로 잘리면 이 절을 맨 위로 올려 차트와 미리보기가 함께 보이게 한다
  useEffect(() => {
    const el = chart && shown ? peek.current : null
    if (!el) return
    const bottom = el.closest('.scroll')?.getBoundingClientRect().bottom ?? window.innerHeight
    if (el.getBoundingClientRect().bottom > bottom) section.current?.scrollIntoView({ block: 'start' })
  }, [chart, shown])
  const toggle = (id: string) => setShown(shown === id ? null : id)
  const picked = chart ? p.claims.find((c) => c.id === shown) : undefined
  const peeking = chart && (!!picked || shown === ROOT_ID)
  /** 미리보기에서 주장 화면으로. 돌아오면 같은 점이 골라져 있게 지금 주소에 고른 점을 남긴다 */
  const open = (cid: string) => {
    try { history.replaceState(history.state, '', href({ page: 'problems', rid, id: p.id, at: cid })) } catch { /* 무시 */ }
    go({ page: 'problems', rid, id: p.id, attempt: cid })
  }
  const row = (a: Attempt, depth: number) => (
    <AttemptRow key={a.id} a={a} open={shown === a.id} next={!!a.next && !p.stop} locked={locked} busy={busy} style={depthStyle(depth)} onToggle={() => toggle(a.id)} onVerdict={onVerdict}>
      <Moves p={p} a={a} busy={busy} onOrder={onOrder} />
    </AttemptRow>
  )
  const tries = (cid: string | undefined) => p.attempts.filter((a) => a.claim === cid)
  const empty = p.claims.length + p.attempts.length === 0
  return (
    <section className="pb-sec" data-ui="주장 목록" ref={section}>
      <h3 className="pb-h3">{t('주장', 'Claims')} <span className="muted">{p.claims.length}</span><span className="muted">{t(`시도 ${p.used} / 한도 ${p.limit}`, `Attempts ${p.used} / limit ${p.limit}`)}</span><span className="sp" />
        {!locked && <button className="btn sm" data-ui="주장 추가" onClick={() => setAdding('claim')}>＋ {t('주장', 'Claim')}</button>}
        {!locked && <button className="btn sm" data-ui="후보 추가" onClick={() => setAdding('try')}>＋ {t('후보', 'Candidate')}</button>}</h3>
      {empty && <p className="empty">{t('주장도 시도도 없습니다. 「＋ 주장」으로 판단할 문장을 세우고 「＋ 후보」로 해 볼 방법을 추가합니다.', 'No claims or attempts. Set up a sentence to judge with "＋ Claim", then add a method to try with "＋ Candidate".')}</p>}
      {chart ? !empty && <>
        <div className="pb-chart" data-ui="흐름 차트"><TreeChart flow={p} selected={shown} rootName={t('질문', 'Question')} onRoot={() => toggle(ROOT_ID)} onPick={(c) => toggle(c.id)} /></div>
        {peeking ? <div ref={peek}><ClaimPeek p={p} claim={picked} onOpen={() => open(picked?.id ?? ROOT_ID)} /></div>
          : <p className="pb-peek-none">{t('점을 누르면 그 주장과 근거가 여기에 보입니다.', 'Pick a dot to see that claim and its grounds here.')}</p>}
      </> : !empty && <div className="pb-tree">
        {tries(undefined).map((a) => row(a, 0))}
        {p.claims.map((c) => <Fragment key={c.id}>
          <ClaimRow c={c} style={depthStyle(c.depth)} onOpen={() => open(c.id)} />
          {tries(c.id).map((a) => row(a, c.depth + 1))}
        </Fragment>)}
      </div>}
      {adding === 'try' && <CandidateInput key={picked?.id ?? ''} under={picked?.id} busy={busy} onAdd={(m) => { onAdd(m, picked?.id); setAdding(null) }} onClose={() => setAdding(null)} />}
      {adding === 'claim' && <ClaimInput key={picked?.id ?? ''} under={picked?.id} busy={busy} onAdd={(statement, side) => { onAddClaim(statement, picked?.id, side); setAdding(null) }} onClose={() => setAdding(null)} />}
    </section>
  )
}
