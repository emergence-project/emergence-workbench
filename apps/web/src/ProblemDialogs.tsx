import { useState } from 'react'
import { problemsApi, PROBLEM_LIMIT, type Attempt, type BasisReview, type ClaimSide, type FlowAnswer, type ProblemDoc } from './api'
import { Dialog } from './dialogs'
import { t } from './i18n'
import { ANSWER_NAME, objOf, SIDE_NAME, SideTag, TargetSelect } from './problemNames'

/**
 * 흐름 화면의 창 셋 (Problems.tsx): 흐름 추가 · 수정, 시도의 판정, 흐름 종료(답과 그 답이 기대는 주장의 승인).
 * 메시지(답이 예 · 아니오일 때의 한 문장)와 독자는 사용자가 쓴다 (11/11 결정 "메시지 관문").
 */

const errorOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** 흐름 추가(problem 없음) 또는 수정. 추가하면 "쓰는 중"으로 생기고, 메시지와 독자를 채워야 시작할 수 있다 */
export function ProblemDialog({ rid, problem, onClose, onDone }: { rid: string; problem?: ProblemDoc; onClose(): void; onDone(p: ProblemDoc): void }) {
  const [question, setQuestion] = useState(problem?.question ?? '')
  const [ifYes, setIfYes] = useState(problem?.if_yes ?? '')
  const [ifNo, setIfNo] = useState(problem?.if_no ?? '')
  const [reader, setReader] = useState(problem?.reader ?? '')
  const [firstTest, setFirstTest] = useState(problem?.first_test ?? '')
  const [grading, setGrading] = useState(problem?.grading ?? '')
  const [limit, setLimit] = useState(String(problem?.limit ?? PROBLEM_LIMIT))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const n = Number(limit)
  const limitOk = Number.isInteger(n) && n >= 1 && n <= 99
  const save = async () => {
    setBusy(true); setError(null)
    try {
      const api = problemsApi(rid)
      onDone(problem
        ? await api.patch(problem.id, problem.hash, { question: question.trim(), if_yes: ifYes, if_no: ifNo, reader, first_test: firstTest, grading, limit: n })
        : await api.create({ question: question.trim(), ...(ifYes.trim() && { if_yes: ifYes.trim() }), ...(ifNo.trim() && { if_no: ifNo.trim() }), ...(reader.trim() && { reader: reader.trim() }) }))
    } catch (e) { setError(errorOf(e)); setBusy(false) }
  }
  return (
    <Dialog title={problem ? t('흐름 수정', 'Edit flow') : t('흐름 추가', 'Add a flow')} ui="흐름" wide onClose={onClose} footer={<>
      {error && <span className="error-text pb-err">{error}</span>}
      <button className="btn" onClick={onClose}>{t('취소', 'Cancel')}</button>
      <button className="btn primary" disabled={busy || !question.trim() || !limitOk} onClick={() => void save()}>{problem ? t('저장', 'Save') : t('추가', 'Add')}</button>
    </>}>
      <label className="field pb-field"><span>{t('질문', 'Question')}</span>
        <textarea rows={2} autoFocus placeholder={t('예 · 아니오로 답할 수 있는 한 문장', 'One sentence with a yes or no answer')} value={question} onChange={(e) => setQuestion(e.target.value)} /></label>
      <fieldset className="pb-group" data-ui="메시지">
        <legend>{t('메시지', 'Message')} <em>{t('답이 나왔을 때 쓸 한 문장씩', 'One sentence for each answer')}</em></legend>
        <label className="field pb-field"><span>{t('예이면', 'If yes')}</span><textarea rows={2} value={ifYes} onChange={(e) => setIfYes(e.target.value)} /></label>
        <label className="field pb-field"><span>{t('아니오이면', 'If no')}</span><textarea rows={2} value={ifNo} onChange={(e) => setIfNo(e.target.value)} /></label>
      </fieldset>
      <label className="field pb-field"><span>{t('독자', 'Reader')}</span><input placeholder={t('누가, 왜 궁금해하는가', 'Who wants to know, and why')} value={reader} onChange={(e) => setReader(e.target.value)} /></label>
      {problem && <>
        <label className="field pb-field"><span>{t('첫 시험', 'First test')} <em>{t('선택', 'Optional')}</em></span><textarea rows={2} placeholder={t('방향이 틀렸음을 가장 싸게 보일 시험', 'The cheapest check that would show the direction is wrong')} value={firstTest} onChange={(e) => setFirstTest(e.target.value)} /></label>
        <label className="field pb-field"><span>{t('채점', 'Grading')} <em>{t('선택', 'Optional')}</em></span><textarea rows={2} placeholder={t('맞고 틀림을 가릴 기준. 비우면 탐색', 'The rule that decides right or wrong. Empty means exploratory')} value={grading} onChange={(e) => setGrading(e.target.value)} /></label>
        <label className="field pb-field pb-limit"><span>{t('한도', 'Limit')} <em>{t('시도 수', 'Number of attempts')}</em></span><input type="number" min={1} max={99} value={limit} onChange={(e) => setLimit(e.target.value)} /></label>
      </>}
    </Dialog>
  )
}

/**
 * 시도의 판정: 작업하지 않은 쪽이 한다. 묻는 것은 하나, 이 시도가 겨눈 주장이 이 시도의 근거에서 따라 나오는가다 (아래 주장은 따로 판정받는다).
 * 성립은 근거와 교차 검증이, 폐기는 근거와 폐기 사유가 있어야 한다.
 * 칸 이름은 짧게, 무엇을 적는지는 입력란 안의 흐린 글로 (11/11 피드백 "설명이 길다").
 */
export function VerdictDialog({ rid, problem, attempt, result, onClose, onDone }: {
  rid: string; problem: ProblemDoc; attempt: Attempt; result: 'holds' | 'dropped'; onClose(): void; onDone(p: ProblemDoc): void
}) {
  const [note, setNote] = useState('')
  const [check, setCheck] = useState('')
  const [tested, setTested] = useState<'pass' | 'fail' | ''>('')
  const [lesson, setLesson] = useState(attempt.lesson ?? '')
  const [reopen, setReopen] = useState(attempt.reopen ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const holds = result === 'holds'
  const claim = problem.claims.find((c) => c.id === attempt.claim)
  // 해 보지 않은 후보는 폐기 사유 하나만 적는다 (근거로도 같은 글이 남는다)
  const untried = attempt.state === 'candidate'
  const reason = untried ? lesson.trim() : note.trim()
  // 지난 일의 확인(사용자만): 기록이 맞는지만 본다. 교차 검증은 묻지 않는다
  const past = attempt.origin === 'past'
  const ready = !!reason && (holds ? (past || !!check.trim()) && tested !== 'fail' : !!lesson.trim())
  const save = async () => {
    setBusy(true); setError(null)
    try {
      onDone(await problemsApi(rid).verdict(problem.id, attempt.id, { result, note: reason, ...(holds && check.trim() && { check: check.trim() }), ...(tested && { tested }), ...(!holds && lesson.trim() && { lesson: lesson.trim() }), ...(!holds && reopen.trim() && { reopen: reopen.trim() }) }))
    } catch (e) { setError(errorOf(e)); setBusy(false) }
  }
  const optional = <em>{t('선택', 'Optional')}</em>
  return (
    <Dialog title={past ? (holds ? t('지난 일 확인: 성립', 'Check past work: holds') : t('지난 일 확인: 폐기', 'Check past work: drop')) : holds ? t('성립 판정', 'Verdict: holds') : t('폐기 판정', 'Verdict: drop')} ui="시도 판정" onClose={onClose} footer={<>
      {error && <span className="error-text pb-err">{error}</span>}
      <button className="btn" onClick={onClose}>{t('취소', 'Cancel')}</button>
      <button className="btn primary" disabled={busy || !ready} onClick={() => void save()}>{holds ? t('성립', 'Holds') : t('폐기', 'Drop')}</button>
    </>}>
      <div className="pb-judged" data-ui="판정할 시도">
        {claim && <p className="pb-judged-head"><b>{claim.id}</b>{claim.statement}<SideTag side={claim.side} /></p>}
        {claim?.condition && <p className="pb-judged-result">{t(`조건: ${claim.condition}`, `Condition: ${claim.condition}`)}</p>}
        <p className={claim ? 'pb-judged-try' : 'pb-judged-head'}><b>{attempt.label}</b>{attempt.method}</p>
        {attempt.result && <p className="pb-judged-result">{attempt.result}</p>}
      </div>
      {!untried && <label className="field pb-field"><span>{t('근거', 'Basis')}</span>
        <textarea rows={3} autoFocus placeholder={past ? t('무엇과 맞춰 봤나 (일지 · 노트 · 커밋)', 'What you checked it against (journal, note, commit)') : t('다시 돌리거나 읽은 것과 나온 값', 'What you reran or read, and what came out')} value={note} onChange={(e) => setNote(e.target.value)} /></label>}
      {attempt.test && !untried && <div className="field pb-field" data-ui="검사 결과"><span>{t('검사', 'Test')}</span>
        <div className="pb-test">
          <code className="pb-test-cmd">{attempt.test}</code>
          <div className="segmented small" role="group" aria-label={t('검사 결과', 'Test result')}>
            {([['', t('미실행', 'Not run')], ['pass', t('통과', 'Passed')], ['fail', t('실패', 'Failed')]] as const).map(([k, name]) =>
              <button key={k} type="button" className={tested === k ? 'on' : ''} aria-pressed={tested === k} onClick={() => setTested(k)}>{name}</button>)}
          </div>
        </div>
        {holds && tested === 'fail' && <span className="error-text">{t('검사가 실패하면 성립으로 판정할 수 없습니다', 'A failed test cannot be judged as holds')}</span>}</div>}
      {holds && <label className="field pb-field"><span>{t('교차 검증', 'Cross-check')}{past && <> {optional}</>}</span>
        <textarea rows={2} placeholder={t('다른 크기 · 다른 매개변수 · 독립 구현 · 극한', 'Another size, other parameters, an independent implementation, a limit')} value={check} onChange={(e) => setCheck(e.target.value)} /></label>}
      {!holds && <>
        <label className="field pb-field"><span>{t('폐기 사유', 'Why dropped')}</span>
          <input autoFocus={untried} placeholder={untried ? undefined : t('다음 시도가 피할 것 한 줄', 'One line the next attempt should avoid')} value={lesson} onChange={(e) => setLesson(e.target.value)} /></label>
        <label className="field pb-field"><span>{t('다시 열 조건', 'Reopen if')} {optional}</span><input value={reopen} onChange={(e) => setReopen(e.target.value)} /></label>
      </>}
    </Dialog>
  )
}

type Review = BasisReview['verdict']
const REVIEWS: [Review, string][] = [['approve', t('승인', 'Approve')], ['return', t('수정', 'Send back')], ['reject', t('기각', 'Reject')]]

/**
 * 흐름 종료: 답(예 · 아니오 · 답 없음)을 고른다. 답이 있으면 그 답이 기대는 주장(그 쪽을 받치는 성립한 주장과 그 아래 근거 주장)을 앱이 모아 보이고,
 * 사용자가 하나씩 승인 · 수정 · 기각한다. 모두 승인이면 닫히고, 수정 · 기각이 있으면 닫지 않고 그 주장을 돌려보낸다. 답 없이는 사유 한 줄.
 */
export function CloseDialog({ rid, problem, note, onClose, onDone }: { rid: string; problem: ProblemDoc; note?: string; onClose(): void; onDone(p: ProblemDoc): void }) {
  const [answer, setAnswer] = useState<FlowAnswer | ''>('')
  const [reviews, setReviews] = useState<Record<string, { verdict: Review; note: string }>>({})
  const [reason, setReason] = useState(note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ids = answer ? problem.basis[answer] : []
  const basis = problem.claims.filter((c) => ids.includes(c.id))
  const against = answer ? problem.claims.filter((c) => problem.basis[answer === 'yes' ? 'no' : 'yes'].includes(c.id) && !ids.includes(c.id)) : []
  const of = (id: string) => reviews[id] ?? { verdict: 'approve' as const, note: '' }
  const put = (id: string, next: Partial<{ verdict: Review; note: string }>) => setReviews((r) => ({ ...r, [id]: { ...of(id), ...next } }))
  const allApproved = basis.every((a) => of(a.id).verdict === 'approve')
  const ready = answer ? basis.length > 0 && basis.every((a) => of(a.id).verdict === 'approve' || !!of(a.id).note.trim()) : !!reason.trim()
  const save = async () => {
    setBusy(true); setError(null)
    try {
      onDone(await problemsApi(rid).close(problem.id, {
        baseHash: problem.hash, ...(reason.trim() && { reason: reason.trim() }),
        ...(answer && { answer, reviews: basis.map((a) => ({ id: a.id, verdict: of(a.id).verdict, ...(of(a.id).note.trim() && { note: of(a.id).note.trim() }) })) }),
      }))
    } catch (e) { setError(errorOf(e)); setBusy(false) }
  }
  return (
    <Dialog title={t('흐름 종료', 'Close flow')} wide onClose={onClose} footer={<>
      {error && <span className="error-text pb-err">{error}</span>}
      <button className="btn" onClick={onClose}>{t('취소', 'Cancel')}</button>
      <button className="btn primary" disabled={busy || !ready} onClick={() => void save()}>{answer && !allApproved ? t('저장', 'Save') : t('종료', 'Close')}</button>
    </>}>
      <div className="field pb-field" data-ui="흐름의 답 고르기"><span>{t('답', 'Answer')}</span>
        <div className="segmented small" role="group" aria-label={t('답', 'Answer')}>
          {([['yes', ANSWER_NAME.yes], ['no', ANSWER_NAME.no], ['', t('답 없음', 'No answer')]] as const).map(([k, name]) =>
            <button key={k} type="button" className={answer === k ? 'on' : ''} aria-pressed={answer === k} onClick={() => setAnswer(k)}>{name}</button>)}
        </div>
        {answer && <p className="pb-close-msg">{answer === 'yes' ? problem.if_yes : problem.if_no}</p>}</div>
      {answer && <div className="field pb-field" data-ui="답의 근거"><span>{t('근거', 'Basis')} <em>{t('이 답이 기대는 성립한 주장', 'Held claims this answer rests on')}</em></span>
        {basis.length === 0 && <p className="error-text">{t('이 답을 받치는 성립한 주장이 없습니다. 답 없이 종료하거나 시도를 더 합니다.', 'No held claim supports this answer. Close without an answer, or run more attempts.')}</p>}
        <ul className="pb-basis">{basis.map((a) => {
          const r = of(a.id)
          return (
            <li key={a.id} data-ui="근거 주장" data-ui-item={a.id} style={a.depth ? { paddingLeft: `calc(var(--sp-3) + ${Math.min(a.depth, 4)} * var(--sp-4))` } : undefined}>
              <p className="pb-basis-claim"><b>{a.id}</b><span>{a.statement}<SideTag side={a.side} />{a.stale && <span className="pb-stale-file"><span className="turn-dot" aria-hidden />{t('판정 후 변경', 'changed after verdict')}</span>}{a.condition && <small>{t(`조건: ${a.condition}`, `Condition: ${a.condition}`)}</small>}</span></p>
              <div className="pb-basis-act">
                <div className="segmented small" role="group" aria-label={t(`${a.id} 판단`, `Decision on ${a.id}`)}>
                  {REVIEWS.map(([k, name]) => <button key={k} type="button" className={r.verdict === k ? 'on' : ''} aria-pressed={r.verdict === k} onClick={() => put(a.id, { verdict: k })}>{name}</button>)}
                </div>
                {r.verdict !== 'approve' && <input aria-label={t('이유', 'Reason')} placeholder={r.verdict === 'return' ? t('고칠 것', 'What to fix') : t('기각 사유', 'Why rejected')} value={r.note} onChange={(e) => put(a.id, { note: e.target.value })} />}
              </div>
            </li>
          )
        })}</ul>
        {against.length > 0 && <p className="pb-against">{t('반대쪽 성립', 'Held for the other answer')}: {against.map((a) => `${a.id} ${a.statement}`).join(' · ')}</p>}
        {basis.length > 0 && !allApproved && <p className="pb-close-note">{t('수정 · 기각이 있으면 종료하지 않고 그 주장을 돌려보냅니다.', 'With a send-back or a reject, the flow stays open and those claims are returned.')}</p>}</div>}
      <label className="field pb-field"><span>{t('사유', 'Reason')} {answer && <em>{t('선택', 'Optional')}</em>}</span>
        <textarea rows={2} autoFocus placeholder={t('사유와 시도는 그대로 남습니다', 'The reason and the attempts are kept')} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
    </Dialog>
  )
}

/**
 * 지난 일 적기 (「＋ 한 일」, 11/14 "추천대로 시작"): 흐름을 열기 전에 한 일을 그 한 날과 함께 근거로 둔다. 한도에 세지 않는다.
 * 사용자가 적으니 고른 대로(성립 · 폐기) 곧바로 판정된 근거가 된다. 새 주장 한 문장을 적으면 겨눈 곳 아래에 주장이 생긴다
 */
export function RecordDialog({ rid, problem, under, onClose, onDone }: { rid: string; problem: ProblemDoc; under?: string; onClose(): void; onDone(p: ProblemDoc): void }) {
  const [to, setTo] = useState(under ?? '')
  const [method, setMethod] = useState('')
  const [day, setDay] = useState('')
  const [result, setResult] = useState('')
  const [statement, setStatement] = useState('')
  const [side, setSide] = useState<ClaimSide | ''>('')
  const [outcome, setOutcome] = useState<'holds' | 'dropped'>('holds')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fresh = !!statement.trim()
  // 성립에는 주장이 있어야 한다 (겨눈 주장이나 새 주장). 질문 바로 아래의 새 주장에는 쪽
  const ready = !!method.trim() && !!result.trim() && (outcome === 'dropped' || !!to || fresh) && (!fresh || !!to || !!side)
  const save = async () => {
    setBusy(true); setError(null)
    try {
      onDone(await problemsApi(rid).record(problem.id, {
        method: method.trim(), result: result.trim(), outcome, ...(to && { claim: to }), ...(day && { when: day }),
        ...(fresh && { statement: statement.trim(), ...(!to && side && { side }) }),
      }))
    } catch (e) { setError(errorOf(e)); setBusy(false) }
  }
  return (
    <Dialog title={t('한 일 추가', 'Add past work')} ui="한 일" wide onClose={onClose} footer={<>
      {error && <span className="error-text pb-err">{error}</span>}
      <button className="btn" onClick={onClose}>{t('취소', 'Cancel')}</button>
      <button className="btn primary" disabled={busy || !ready} onClick={() => void save()}>{t('추가', 'Add')}</button>
    </>}>
      <div className="field pb-field"><span>{t('겨눈 곳', 'Aimed at')}</span><TargetSelect claims={problem.claims} value={to} onChange={setTo} /></div>
      <label className="field pb-field"><span>{t('한 일', 'What was done')}</span>
        <input autoFocus placeholder={t('방법 한 줄', 'Method, one line')} value={method} onChange={(e) => setMethod(e.target.value)} /></label>
      <label className="field pb-field pb-day"><span>{t('한 날', 'Done on')} <em>{t('선택', 'Optional')}</em></span>
        <input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></label>
      <label className="field pb-field"><span>{t('결과', 'Result')}</span>
        <textarea rows={2} placeholder={t('사실로: 값 · 크기 · 어디서 막혔나', 'As facts: values, sizes, where it stopped')} value={result} onChange={(e) => setResult(e.target.value)} /></label>
      <div className="field pb-field" data-ui="한 일 결과"><span>{t('판정', 'Verdict')}</span>
        <div className="segmented small" role="group" aria-label={t('판정', 'Verdict')}>
          {([['holds', t('성립', 'Holds')], ['dropped', t('폐기', 'Drop')]] as const).map(([k, name]) =>
            <button key={k} type="button" className={outcome === k ? 'on' : ''} aria-pressed={outcome === k} onClick={() => setOutcome(k)}>{name}</button>)}
        </div></div>
      <label className="field pb-field"><span>{t('새 주장', 'New claim')} <em>{t('선택', 'Optional')}</em></span>
        <input placeholder={to ? t(`주장 ${to}${objOf(to)} 받치는, 판단할 수 있는 한 문장`, `A judgeable sentence that supports claim ${to}`) : t('판단할 수 있는 한 문장', 'One judgeable sentence')} value={statement} onChange={(e) => setStatement(e.target.value)} /></label>
      {fresh && !to && <div className="field pb-field"><span>{t('쪽', 'Side')}</span>
        <div className="segmented small" role="group" aria-label={t('쪽', 'Side')}>
          {SIDES.map((k) => <button key={k} type="button" className={side === k ? 'on' : ''} aria-pressed={side === k} onClick={() => setSide(k)}>{SIDE_NAME[k]}</button>)}
        </div></div>}
      {outcome === 'holds' && !to && !fresh && <p className="pb-close-note">{t('성립한 일에는 주장이 있어야 합니다. 겨눌 주장을 고르거나 새 주장을 적습니다.', 'Work that holds needs a claim. Pick one to aim at, or write a new one.')}</p>}
    </Dialog>
  )
}
const SIDES: ClaimSide[] = ['for_yes', 'for_no', 'neither']
