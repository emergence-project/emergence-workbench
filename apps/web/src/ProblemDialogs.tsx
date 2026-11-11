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
      <label className="field"><span>{t('질문 (예 · 아니오로 답할 수 있는 한 문장)', 'Question (one sentence with a yes or no answer)')}</span>
        <textarea rows={2} autoFocus value={question} onChange={(e) => setQuestion(e.target.value)} /></label>
      <p className="pb-form-hint">{t('메시지: 답이 예일 때와 아니오일 때 논문에 쓸 한 문장씩. 둘 중 하나라도 쓸 수 없으면 아직 흐름을 열 때가 아닙니다.', 'Message: the one sentence you would write in the paper if the answer is yes, and if it is no. If you cannot write either one, it is too early to open a flow.')}</p>
      <label className="field"><span>{t('예이면', 'If yes')}</span><textarea rows={2} value={ifYes} onChange={(e) => setIfYes(e.target.value)} /></label>
      <label className="field"><span>{t('아니오이면', 'If no')}</span><textarea rows={2} value={ifNo} onChange={(e) => setIfNo(e.target.value)} /></label>
      <label className="field"><span>{t('독자 (누가 왜 궁금해하나)', 'Reader (who wants to know, and why)')}</span><input value={reader} onChange={(e) => setReader(e.target.value)} /></label>
      {problem && <>
        <label className="field"><span>{t('첫 시험 (가장 싸게 방향이 틀렸음을 보일 시험)', 'First test (the cheapest check that would show the direction is wrong)')}</span><textarea rows={2} value={firstTest} onChange={(e) => setFirstTest(e.target.value)} /></label>
        <label className="field"><span>{t('채점 (무엇으로 맞음을 가리나. 비우면 탐색)', 'Grading (how a result is judged right. Empty means exploratory)')}</span><textarea rows={2} value={grading} onChange={(e) => setGrading(e.target.value)} /></label>
        <label className="field pb-limit"><span>{t('한도 (해 볼 시도 수)', 'Limit (number of attempts)')}</span><input type="number" min={1} max={99} value={limit} onChange={(e) => setLimit(e.target.value)} /></label>
      </>}
    </Dialog>
  )
}

/** 시도의 판정: 일한 쪽이 아닌 쪽이 원자료로. 성립은 맞춘 조건 밖의 확인이, 폐기는 교훈이 있어야 한다 */
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
  // 해 보지 않은 후보를 닫을 때는 교훈이 없어도 된다
  const untried = attempt.state === 'candidate'
  const ready = !!note.trim() && (holds ? !!check.trim() && tested !== 'fail' : untried || !!lesson.trim())
  const save = async () => {
    setBusy(true); setError(null)
    try {
      onDone(await problemsApi(rid).verdict(problem.id, attempt.id, { result, note: note.trim(), ...(holds && { check: check.trim() }), ...(tested && { tested }), ...(!holds && lesson.trim() && { lesson: lesson.trim() }), ...(!holds && reopen.trim() && { reopen: reopen.trim() }) }))
    } catch (e) { setError(errorOf(e)); setBusy(false) }
  }
  const title = holds ? t(`${attempt.label} 성립`, `${attempt.label} holds`) : t(`${attempt.label} 폐기`, `Drop ${attempt.label}`)
  return (
    <Dialog title={title} ui="시도 판정" onClose={onClose} footer={<>
      {error && <span className="error-text pb-err">{error}</span>}
      <button className="btn" onClick={onClose}>{t('취소', 'Cancel')}</button>
      <button className="btn primary" disabled={busy || !ready} onClick={() => void save()}>{holds ? t('성립', 'Holds') : t('폐기', 'Drop')}</button>
    </>}>
      <p className="pb-form-hint">{attempt.method}</p>
      <label className="field"><span>{untried ? t('이유', 'Reason') : t('무엇을 다시 돌리거나 읽었고 무엇이 나왔나', 'What you reran or read, and what came out')}</span>
        <textarea rows={3} autoFocus value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {attempt.test && !untried && <div className="field" data-ui="검사 결과"><span>{t('검사 명령을 다시 돌린 결과', 'Result of rerunning the test command')}</span>
        <code className="pb-test-cmd">{attempt.test}</code>
        <div className="segmented" role="group" aria-label={t('검사 결과', 'Test result')}>
          {([['', t('돌리지 않음', 'Not rerun')], ['pass', t('통과', 'Passed')], ['fail', t('실패', 'Failed')]] as const).map(([k, name]) =>
            <button key={k} type="button" className={tested === k ? 'on' : ''} aria-pressed={tested === k} onClick={() => setTested(k)}>{name}</button>)}
        </div>
        {holds && tested === 'fail' && <span className="error-text">{t('검사가 실패했으면 성립이 아닙니다', 'A failed test is not a holds verdict')}</span>}</div>}
      {holds && <label className="field"><span>{t('맞춘 조건 밖의 확인 (다른 크기 · 다른 매개변수 · 독립 구현 · 극한)', 'Check outside the fitted condition (another size, other parameters, an independent implementation, a limit)')}</span>
        <textarea rows={2} value={check} onChange={(e) => setCheck(e.target.value)} /></label>}
      {!holds && <>
        <label className="field"><span>{untried ? t('교훈 한 줄 (없어도 됨)', 'One-line lesson (optional)') : t('교훈 한 줄 (다음 시도가 되풀이하지 않을 것)', 'One-line lesson (what the next attempt should not repeat)')}</span>
          <input value={lesson} onChange={(e) => setLesson(e.target.value)} /></label>
        <label className="field"><span>{t('다시 열 조건 (없어도 됨)', 'Condition to reopen (optional)')}</span><input value={reopen} onChange={(e) => setReopen(e.target.value)} /></label>
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
      <p className="pb-form-hint">{t('종료한 흐름은 이유와 시도 나무가 그대로 남습니다. 종료는 정상 결과입니다.', 'A closed flow keeps its reason and its attempt tree. Closing is a normal outcome.')}</p>
      <label className="field"><span>{t('이유', 'Reason')}</span><textarea rows={3} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} /></label>
    </Dialog>
  )
}
