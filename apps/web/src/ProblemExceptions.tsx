import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { problemsApi, type FlowException, type NewExceptionBody, type ProblemRow } from './api'
import { Dialog } from './dialogs'
import { t } from './i18n'
import { EXCEPTION_NAME } from './problemNames'
import { qk } from './queries'
import { go } from './router'
import { agentName } from './taskView'

/**
 * 예외 기록 (11/11 사용자 결정 "해 보면서 판단": 2주 뒤 평가에 쓴다). 흐름의 규칙대로 되지 않은 일을 한 줄씩 모은다.
 * 앱이 규칙으로 거절한 것은 앱이 적고(거절), 에이전트와 사용자는 한 줄을 추가한다. 파일은 workbench/problems/_exceptions/ (docs/repo-format.md §16).
 * 흐름 목록에서는 프로젝트 전체를, 흐름 하나에서는 그 흐름의 것만 접어서 보인다.
 */

type Kind = NewExceptionBody['kind']
const KINDS: Kind[] = ['no-claim', 'no-verdict', 'needs-user', 'workaround', 'other']
const KIND_HINT: Record<Kind, string> = {
  'no-claim': t('결과는 있는데 판단할 수 있는 한 문장으로 적지 못함', 'There is a result, but it cannot be written as one judgeable sentence'),
  'no-verdict': t('판정하지 못함 (원자료 없음 · 다시 돌리지 못함 · 진술이 모호함)', 'Could not judge (no raw data, cannot rerun, vague statement)'),
  'needs-user': t('사용자 차례가 아닌 곳에서 결정이 필요했음', 'A decision was needed where it was not your turn'),
  workaround: t('규칙을 돌아서 일함', 'Went around a rule to keep working'),
  other: t('그 밖의 걸림', 'Anything else that got in the way'),
}
const who = (name: string) => (name === 'user' ? t('사용자', 'You') : agentName(name))
const when = (s: string) => s.slice(5, 16).replace('-', '/').replace('T', ' ')
const errorOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function Exceptions({ rid, problem, flows }: { rid: string; problem?: string; flows?: ProblemRow[] }) {
  const client = useQueryClient()
  const q = useQuery({ queryKey: qk.problemExceptions(rid), queryFn: () => problemsApi(rid).exceptions() })
  const [adding, setAdding] = useState(false)
  const all = q.data ?? []
  const list = problem ? all.filter((e) => e.problem === problem) : all
  const question = (id: string) => flows?.find((p) => p.id === id)?.question ?? id
  const where = (e: FlowException) => (e.attempt ? e.attempt.toUpperCase() : '')
  return (
    <details className="pb-fold pb-exc" data-ui="예외 기록">
      <summary>{t('예외', 'Exceptions')} {list.length}<span className="pb-sum-hint">{t('규칙대로 되지 않은 일', 'Where the rules did not fit')}</span></summary>
      {list.length > 0 && <ul className="pb-exc-list">{list.map((e) => (
        <li key={e.id} data-ui="예외 줄" data-ui-item={e.what}>
          <span className="tag">{EXCEPTION_NAME[e.kind]}</span>
          <span className="pb-exc-what">{e.what}{e.instead && <span className="pb-exc-instead">{t(`대처: ${e.instead}`, `Instead: ${e.instead}`)}</span>}</span>
          <span className="pb-exc-meta">{who(e.by)} · {when(e.at)}{where(e) && (problem || !e.problem) && <> · {where(e)}</>}</span>
          {e.problem && !problem && <span className="pb-exc-meta">
            <button className="a" onClick={() => go({ page: 'problems', rid, id: e.problem })}>{question(e.problem)}</button>{where(e) && <> · {where(e)}</>}
          </span>}
        </li>
      ))}</ul>}
      <div className="pb-exc-add"><button className="btn sm" data-ui="예외 추가" onClick={() => setAdding(true)}>＋ {t('예외', 'Exception')}</button></div>
      {adding && <ExceptionDialog rid={rid} problem={problem} onClose={() => setAdding(false)} onDone={() => { setAdding(false); void client.invalidateQueries({ queryKey: qk.problemExceptions(rid) }) }} />}
    </details>
  )
}

function ExceptionDialog({ rid, problem, onClose, onDone }: { rid: string; problem?: string; onClose(): void; onDone(): void }) {
  const [kind, setKind] = useState<Kind>('other')
  const [what, setWhat] = useState('')
  const [instead, setInstead] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    setBusy(true); setError(null)
    try { await problemsApi(rid).addException({ kind, what: what.trim(), ...(instead.trim() && { instead: instead.trim() }), ...(problem && { problem }) }); onDone() } catch (e) { setError(errorOf(e)); setBusy(false) }
  }
  return (
    <Dialog title={t('예외 추가', 'Add an exception')} ui="예외" onClose={onClose} footer={<>
      {error && <span className="error-text pb-err">{error}</span>}
      <button className="btn" onClick={onClose}>{t('취소', 'Cancel')}</button>
      <button className="btn primary" disabled={busy || !what.trim()} onClick={() => void save()}>{t('추가', 'Add')}</button>
    </>}>
      <label className="field pb-field"><span>{t('종류', 'Kind')}</span>
        <select value={kind} onChange={(e) => { const k = KINDS.find((x) => x === e.target.value); if (k) setKind(k) }}>
          {KINDS.map((k) => <option key={k} value={k}>{EXCEPTION_NAME[k]}: {KIND_HINT[k]}</option>)}
        </select></label>
      <label className="field pb-field"><span>{t('내용', 'What happened')}</span>
        <textarea rows={3} autoFocus placeholder={t('무슨 일이 있었나, 사실로', 'What happened, as facts')} value={what} onChange={(e) => setWhat(e.target.value)} /></label>
      <label className="field pb-field"><span>{t('대처', 'Done instead')} <em>{t('선택', 'Optional')}</em></span><input value={instead} onChange={(e) => setInstead(e.target.value)} /></label>
    </Dialog>
  )
}
