import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { problemsApi, PROBLEM_LIMIT_STEP, type Attempt, type DirectionReport, type ProblemDoc, type ProblemRow, type ProjectKind, type ProblemState, type ProblemStop } from './api'
import { Icon } from './icons'
import { t } from './i18n'
import { ATTEMPT_DOT, AttemptDot, AttemptName, AttemptTags, AttemptView, CandidateInput, claimedOf, Detail, errorOf, Peek, when, who } from './ProblemAttempt'
import { CloseDialog, ProblemDialog, VerdictDialog } from './ProblemDialogs'
import { FlowsChart, TreeChart } from './ProblemChart'
import { Exceptions } from './ProblemExceptions'
import { ANSWER_NAME, ATTEMPT_NAME } from './problemNames'
import { flowName } from './projectProfile'
import { qk } from './queries'
import { RepoPathContext } from './repoPaths'
import { go, href, type FlowView } from './router'

/**
 * 흐름과 시도 나무 (11/11 사용자 결정 "흐름을 시도 나무로 · 메시지 관문", 시안 J2uZ 4절).
 * 흐름은 사용자가 메시지(답이 예 · 아니오일 때의 한 문장)와 독자를 쓰고 시작해야 열린다. 에이전트는 그 아래에 시도 후보를 늘어놓고 하나씩 해 보며,
 * 성립 · 폐기는 일한 쪽이 아닌 쪽이 정한다. 한도나 정체에서는 방향 보고가 오고 사용자가 계속 · 좁히기 · 종료를 정한다.
 * 시도는 보고할 때 주장(판단할 수 있는 한 문장 · 조건 · 질문의 어느 쪽 근거인지)을 내놓고, 판정은 그 진술이 근거에서 따라 나오는지만 본다.
 * 사실로 받아들이는 승인은 사용자가 흐름을 답과 함께 닫을 때 그 답이 기대는 주장에 한다 (11/11 "해 보면서 판단", 규칙대로 되지 않은 일은 예외 기록에).
 * 보기는 둘이다 (11/12 "점 = 시도로 되살리기"): 차트(질문에서 시도가 왼쪽에서 오른쪽으로 갈라지는 나무, 점 하나가 시도 하나)와 목록. 같은 자료를 다르게 그릴 뿐이다.
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
          <div className="page-body pb-page">{id && attempt ? <AttemptView key={`${id}/${attempt}`} rid={rid} id={id} attempt={attempt} onSaved={onSaved} />
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
    ? <FlowsChart rid={rid} rows={rows} label={(p) => <ChartLabel rid={rid} p={p} />} onRoot={(p) => go({ page: 'problems', rid, id: p.id })} onPick={(p, a) => go({ page: 'problems', rid, id: p.id, at: a.id })} />
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
  // 차트 보기에서는 나무가 먼저 보이게 시도를 흐름 열기 위에 둔다. 목록 보기는 읽는 순서대로(열기 · 폐기 사유 · 시도)
  const tree = started && <RepoPathContext.Provider value={{ rid }}><Tree p={p} rid={rid} busy={busy} locked={p.state === 'closed'} chart={chart} at={at}
    onAdd={(method, parent) => void run(() => api.addAttempts(p.id, [{ method, ...(parent && { parent }) }]))}
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
      {p.needs === 'all' && <span title={t('시도가 모두 성립해야 끝나는 분해', 'A decomposition: every attempt must hold')}>{t('분해', 'Decomposition')}</span>}
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

// ---------- 시도 나무 ----------

const depthStyle = (depth: number): CSSProperties => ({ paddingLeft: `calc(${depth} * var(--sp-5))` })

function Tree({ p, rid, busy, locked, chart, at, onAdd, onOrder, onVerdict }: {
  p: ProblemDoc; rid: string; busy: boolean; locked: boolean
  /** 차트 보기: 나무를 차트로 그리고 고른 점의 미리보기만 그 아래에 둔다. 전부는 시도 화면에서 본다 */
  chart: boolean
  /** 처음부터 골라 둘 시도 (여러 흐름의 차트에서 점을 눌러 왔을 때, 시도 화면에서 돌아왔을 때) */
  at?: string
  onAdd(method: string, parent?: string): void
  onOrder(order: string[]): void
  onVerdict(attempt: Attempt, result: 'holds' | 'dropped'): void
}) {
  const [shown, setShown] = useState<string | null>(at ?? null)
  const [adding, setAdding] = useState<{ parent?: string } | null>(null)
  const section = useRef<HTMLElement>(null), peek = useRef<HTMLDivElement>(null)
  // 차트에서 점을 고르면 미리보기가 차트 아래에 뜬다. 화면 아래로 잘리면 시도 절을 맨 위로 올려 차트와 미리보기가 함께 보이게 한다
  useEffect(() => {
    const el = chart && shown ? peek.current : null
    if (!el) return
    const bottom = el.closest('.scroll')?.getBoundingClientRect().bottom ?? window.innerHeight
    if (el.getBoundingClientRect().bottom > bottom) section.current?.scrollIntoView({ block: 'start' })
  }, [chart, shown])
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
  const toggle = (a: Attempt) => setShown(shown === a.id ? null : a.id)
  /** 후보의 순서 바꾸기 (형제 사이에서 위 · 아래) */
  const moves = (a: Attempt) => {
    if (a.state !== 'candidate' || locked) return null
    const sibs = p.attempts.filter((x) => x.parent === a.parent), i = sibs.indexOf(a)
    return (
      <span className="pb-move">
        <button className="icon-btn sm" data-tip={t('위로', 'Move up')} aria-label={t(`${a.label} 위로`, `Move ${a.label} up`)} disabled={busy || i === 0} onClick={() => move(a, -1)}>{Icon.up}</button>
        <button className="icon-btn sm" data-tip={t('아래로', 'Move down')} aria-label={t(`${a.label} 아래로`, `Move ${a.label} down`)} disabled={busy || i === sibs.length - 1} onClick={() => move(a, 1)}>{Icon.down}</button>
      </span>
    )
  }
  /** 목록의 시도 한 줄. 누르면 그 아래에 전부가 펼쳐진다. 깊이만큼 들여 쓴다 */
  const node = (a: Attempt) => {
    // 보고한 시도는 주장(진술)으로 읽고 방법을 아랫줄에. 진술이 없으면 예전처럼 방법과 결과
    const sub = a.state === 'dropped' ? a.lesson ?? a.verdict?.note : claimedOf(a) ? a.method : a.state === 'holds' || a.state === 'reported' ? a.result
      : a.state === 'active' ? (a.returned ? t(`수정 요청: ${a.returned.note}`, `Sent back: ${a.returned.note}`) : `${who(a.worker ?? a.by)} · ${when(a.started)}`) : undefined
    const on = shown === a.id
    return (
      <div key={a.id} className={`pb-node s-${a.state}${on ? ' on' : ''}`} style={depthStyle(a.depth)} data-ui="시도" data-ui-item={`${a.label} ${a.method}`}>
        <div className="pb-node-row">
          <button className="pb-node-main" aria-expanded={on} onClick={() => toggle(a)}>
            <span className="pb-state"><AttemptDot s={a.state} label /></span>
            <span className="pb-label">{a.label}</span>
            <span className="pb-method"><AttemptName a={a} /></span>
            <AttemptTags a={a} next={!!a.next && !p.stop} />
          </button>
          {moves(a)}
        </div>
        {sub && !on && <div className="pb-sub">{sub}</div>}
        {on && <Detail a={a} locked={locked} busy={busy} onVerdict={onVerdict} onAddUnder={() => setAdding({ parent: a.id })} />}
      </div>
    )
  }
  const one = chart ? p.attempts.find((a) => a.id === shown) : undefined
  /** 미리보기에서 시도 화면으로. 돌아오면 같은 점이 골라져 있게 지금 주소에 고른 점을 남긴다 */
  const open = (a: Attempt) => {
    try { history.replaceState(history.state, '', href({ page: 'problems', rid, id: p.id, at: a.id })) } catch { /* 무시 */ }
    go({ page: 'problems', rid, id: p.id, attempt: a.id })
  }
  return (
    <section className="pb-sec" data-ui="시도 목록" ref={section}>
      <h3 className="pb-h3">{t('시도', 'Attempts')} <span className="muted">{t(`${p.used} / 한도 ${p.limit}`, `${p.used} / limit ${p.limit}`)}</span><span className="sp" />
        {!locked && <button className="btn sm" data-ui="후보 추가" onClick={() => setAdding({})}>＋ {t('후보', 'Candidate')}</button>}</h3>
      {p.attempts.length === 0 && <p className="empty">{t('시도가 없습니다. 「＋ 후보」로 추가합니다.', 'No attempts. Add one with "＋ Candidate".')}</p>}
      {chart ? p.attempts.length > 0 && <>
        <div className="pb-chart" data-ui="흐름 차트"><TreeChart flow={p} selected={shown} rootName={t('질문', 'Question')} onPick={toggle} /></div>
        {one ? <div ref={peek}><Peek a={one} next={!!one.next && !p.stop} onOpen={() => open(one)}>{moves(one)}</Peek></div>
          : <p className="pb-peek-none">{t('점을 누르면 그 시도의 미리보기가 여기에 보입니다.', 'Pick a dot to preview that attempt here.')}</p>}
      </> : <div className="pb-tree">{p.attempts.map(node)}</div>}
      {adding && <CandidateInput key={adding.parent ?? ''} under={p.attempts.find((x) => x.id === adding.parent)?.label} busy={busy} onAdd={(m) => { onAdd(m, adding.parent); setAdding(null) }} onClose={() => setAdding(null)} />}
    </section>
  )
}
