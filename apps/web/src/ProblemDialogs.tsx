import { useState } from 'react'
import { problemsApi, PROBLEM_LIMIT, type Attempt, type ProblemDoc } from './api'
import { Dialog } from './dialogs'
import { t } from './i18n'

/**
 * 흐름 화면의 창 셋 (Problems.tsx): 흐름 추가 · 수정, 시도의 판정, 흐름 종료.
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
 * 시도의 판정: 작업하지 않은 쪽이 한다. 성립은 근거와 교차 검증이, 폐기는 근거와 폐기 사유가 있어야 한다.
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
  // 해 보지 않은 후보는 폐기 사유 하나만 적는다 (근거로도 같은 글이 남는다)
  const untried = attempt.state === 'candidate'
  const reason = untried ? lesson.trim() : note.trim()
  const ready = !!reason && (holds ? !!check.trim() && tested !== 'fail' : !!lesson.trim())
  const save = async () => {
    setBusy(true); setError(null)
    try {
      onDone(await problemsApi(rid).verdict(problem.id, attempt.id, { result, note: reason, ...(holds && { check: check.trim() }), ...(tested && { tested }), ...(!holds && lesson.trim() && { lesson: lesson.trim() }), ...(!holds && reopen.trim() && { reopen: reopen.trim() }) }))
    } catch (e) { setError(errorOf(e)); setBusy(false) }
  }
  const optional = <em>{t('선택', 'Optional')}</em>
  return (
    <Dialog title={holds ? t('성립 판정', 'Verdict: holds') : t('폐기 판정', 'Verdict: drop')} ui="시도 판정" onClose={onClose} footer={<>
      {error && <span className="error-text pb-err">{error}</span>}
      <button className="btn" onClick={onClose}>{t('취소', 'Cancel')}</button>
      <button className="btn primary" disabled={busy || !ready} onClick={() => void save()}>{holds ? t('성립', 'Holds') : t('폐기', 'Drop')}</button>
    </>}>
      <div className="pb-judged" data-ui="판정할 시도">
        <p className="pb-judged-head"><b>{attempt.label}</b>{attempt.method}</p>
        {attempt.result && <p className="pb-judged-result">{attempt.result}</p>}
      </div>
      {!untried && <label className="field pb-field"><span>{t('근거', 'Basis')}</span>
        <textarea rows={3} autoFocus placeholder={t('다시 돌리거나 읽은 것과 나온 값', 'What you reran or read, and what came out')} value={note} onChange={(e) => setNote(e.target.value)} /></label>}
      {attempt.test && !untried && <div className="field pb-field" data-ui="검사 결과"><span>{t('검사', 'Test')}</span>
        <div className="pb-test">
          <code className="pb-test-cmd">{attempt.test}</code>
          <div className="segmented small" role="group" aria-label={t('검사 결과', 'Test result')}>
            {([['', t('미실행', 'Not run')], ['pass', t('통과', 'Passed')], ['fail', t('실패', 'Failed')]] as const).map(([k, name]) =>
              <button key={k} type="button" className={tested === k ? 'on' : ''} aria-pressed={tested === k} onClick={() => setTested(k)}>{name}</button>)}
          </div>
        </div>
        {holds && tested === 'fail' && <span className="error-text">{t('검사가 실패하면 성립으로 판정할 수 없습니다', 'A failed test cannot be judged as holds')}</span>}</div>}
      {holds && <label className="field pb-field"><span>{t('교차 검증', 'Cross-check')}</span>
        <textarea rows={2} placeholder={t('다른 크기 · 다른 매개변수 · 독립 구현 · 극한', 'Another size, other parameters, an independent implementation, a limit')} value={check} onChange={(e) => setCheck(e.target.value)} /></label>}
      {!holds && <>
        <label className="field pb-field"><span>{t('폐기 사유', 'Why dropped')}</span>
          <input autoFocus={untried} placeholder={untried ? undefined : t('다음 시도가 피할 것 한 줄', 'One line the next attempt should avoid')} value={lesson} onChange={(e) => setLesson(e.target.value)} /></label>
        <label className="field pb-field"><span>{t('다시 열 조건', 'Reopen if')} {optional}</span><input value={reopen} onChange={(e) => setReopen(e.target.value)} /></label>
      </>}
    </Dialog>
  )
}

/** 방향 보고 없이 흐름을 종료할 때: 이유 한 줄 */
export function CloseDialog({ rid, problem, onClose, onDone }: { rid: string; problem: ProblemDoc; onClose(): void; onDone(p: ProblemDoc): void }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    setBusy(true); setError(null)
    try { onDone(await problemsApi(rid).close(problem.id, problem.hash, reason.trim())) } catch (e) { setError(errorOf(e)); setBusy(false) }
  }
  return (
    <Dialog title={t('흐름 종료', 'Close flow')} onClose={onClose} footer={<>
      {error && <span className="error-text pb-err">{error}</span>}
      <button className="btn" onClick={onClose}>{t('취소', 'Cancel')}</button>
      <button className="btn primary" disabled={busy || !reason.trim()} onClick={() => void save()}>{t('종료', 'Close')}</button>
    </>}>
      <label className="field pb-field"><span>{t('종료 사유', 'Reason for closing')}</span><textarea rows={3} autoFocus placeholder={t('사유와 시도는 그대로 남습니다', 'The reason and the attempts are kept')} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
    </Dialog>
  )
}
