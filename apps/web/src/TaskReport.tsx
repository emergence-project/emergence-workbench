import { useEffect, useRef, useState } from 'react'
import { ConflictError, tasksApi, type Task, type Topic } from './api'
import type { FlashAction } from './flash'
import { Icon } from './icons'
import { useNoteSections } from './MarkdownNote'
import { ObsidianMarkdown } from './ObsidianMarkdown'
import { go } from './router'
import { StatusDot } from './StatusDot'
import { answerNoteSaveTicket, answerQuestionKeys, beginAnswerNoteSave, editAnswerNote, finishAnswerNoteSave, mergeAnswerNotes, unassignedAnswerNotes, type AnswerNoteDrafts } from './taskAnswerNotes'
import { agentName, askOptionLabel, askOptions, cardAsks, cardConclusion, splitReport, TASK_DOT, TASK_STATE_LABEL, taskTiming } from './taskView'
import { agentAction, copyAgentPrompt, JudgeButtons, sendJudgment, SendBackRow, TaskDialog, TaskMoreMenu, useTasks, type TaskDraft } from './WorkTasks'
import { t as tr } from './i18n'

const END_CHECK = { pass: tr('✓ 통과', '✓ Met'), fail: tr('! 미달', '! Not met'), unknown: tr('확인 못 함', 'Not checked') }

/**
 * 맡긴 일의 보고서 (시안 v31): 작업 파일 자체를 읽는 화면.
 * 머리 표(프로젝트 · 주제 · 상태 · 시각 · 에이전트 · 종결 조건 · 검증 · 파일), 1 요약과 결론(사용자 확인 요청에 답하기),
 * 2 근거, 3 남은 문제, 4 다음 지시(승인 · 고치기 · 빼기, 직접 적기). 접힌 절: 검증 상세, 맡길 때 적은 것.
 * 판단에 쓴 시간은 이 화면을 연 때부터 잰다(보이지 않음).
 */
export function TaskReport({ rid, id, version, project, topics, onSaved, tocOwner = null }: {
  rid: string; id: string; version: number; project: string; topics: Topic[]; onSaved(m: string, action?: FlashAction): void
  /** 이 보고서가 지금 칸에서 보이면 그 탭 key: 절(요약과 결론 · 근거 · 남은 문제 · 다음 지시)을 왼쪽 사이드바 맨 아래 목차에 알린다 */
  tocOwner?: string | null
}) {
  const { tasks, loaded, reload } = useTasks(rid, version)
  const t = tasks.find((x) => x.id === id)
  const opened = useRef(Date.now())
  const scroller = useRef<HTMLDivElement>(null)
  useNoteSections(scroller, t ? tocOwner : null, t ? `${t.hash}` : '', '.tk-sec > h2')
  const [sendBack, setSendBack] = useState(false)
  const [dialog, setDialog] = useState<TaskDraft | null>(null)
  if (!t) return <div className="ws-doc"><section className="pane"><p className="muted tk-empty tk-pad">{loaded ? `${tr('맡긴 일을 찾지 못했습니다', 'Delegated task not found')}: workbench/tasks/${id}.md` : tr('불러오는 중…', 'Loading…')}</p></section></div>
  const seconds = () => (Date.now() - opened.current) / 1000
  const judge = (verdict: 'approve' | 'send-back' | 'pause' | 'discard', note?: string) => sendJudgment(rid, t, verdict, { note, seconds: seconds() }, onSaved, reload)
  const canJudge = t.state === 'result' || t.state === 'proposed'
  const { summary, evidence } = splitReport(t.body)
  const topic = t.topic ? topics.find((x) => x.id === t.topic)?.title ?? t.topic : null
  const timing = taskTiming(t)
  const titleOf = (tid: string) => tasks.find((x) => x.id === tid)?.title ?? tid
  const fromTask = t.references.map((r) => /^workbench\/tasks\/(.+)\.md$/.exec(r)?.[1]).filter((x): x is string => !!x)
  const human = t.check.human ?? (canJudge ? tr('판단 대기', 'Awaiting decision') : t.state === 'done' ? tr('승인', 'Approved') : tr('아직', 'Not yet'))
  const conflict = (e: unknown) => onSaved(e instanceof ConflictError ? tr('에이전트가 파일을 고쳤습니다. 새 내용을 보고 다시 하세요', 'The agent edited the file. Check the new content and try again') : (e as Error).message)
  const next = (i: number, action: 'start' | 'drop' | 'restore') => tasksApi(rid).next(t.id, { i, action, baseHash: t.hash })
    .then((r) => onSaved(action === 'start' ? tr('맡겼습니다', 'Delegated') : action === 'drop' ? tr('뺐습니다', 'Removed') : tr('되살렸습니다', 'Restored'), r.started && agentAction(r.started.file, onSaved)), conflict).then(reload)
  return (
    <div className="ws-doc" data-ui="보고서">
      <section className="pane">
        <div className="pane-head tk-rep-head" data-ui="머리줄">
          <span className="tk-state"><StatusDot s={TASK_DOT[t.state]} name={TASK_STATE_LABEL[t.state]} />{TASK_STATE_LABEL[t.state]}</span>
          <span className="muted crumb" title={timing.tip}>{agentName(t.agent)} · {timing.text}</span>
          <span className="sp" />
          {canJudge && <JudgeButtons approveTip={t.state === 'proposed' ? tr('승인: 이 종결 조건으로 시작', 'Approve: start with these criteria') : tr('승인', 'Approve')} onApprove={() => void judge('approve')} onSendBack={() => setSendBack(true)} />}
          {t.state !== 'stopped' && <TaskMoreMenu items={[
            ...(t.state === 'working' ? [{ label: tr('에이전트에게 줄 말 복사', 'Copy prompt for agent'), onClick: () => copyAgentPrompt(t.file, onSaved) }] : []),
            ...(t.state !== 'paused' ? [{ label: tr('멈춤으로 두기', 'Mark blocked'), dot: 'blocked' as const, onClick: () => void judge('pause') }] : []),
            { label: tr('폐기', 'Drop'), dot: 'stopped' as const, onClick: () => void judge('discard') },
          ]} />}
        </div>
        <div className="tk-rep" ref={scroller}>
          {sendBack && <SendBackRow onCancel={() => setSendBack(false)} onSend={(note) => { setSendBack(false); void judge('send-back', note) }} />}
          <h1 className="tk-rep-title">{t.title}</h1>
          <dl className="tk-props" aria-label={tr('기본 정보', 'Details')}>
            <dt>{tr('프로젝트', 'Project')}</dt><dd>{project}</dd>
            {topic && <><dt>{tr('주제', 'Topic')}</dt><dd><button className="a" onClick={() => go({ page: 'topic', rid, tid: t.topic! })}>{topic}</button></dd></>}
            <dt>{tr('상태', 'Status')}</dt><dd><StatusDot s={TASK_DOT[t.state]} name={TASK_STATE_LABEL[t.state]} /> {TASK_STATE_LABEL[t.state]}</dd>
            <dt>{tr('맡긴 날', 'Delegated on')}</dt><dd>{t.created}</dd>
            {t.resultAt && <><dt>{tr('결과', 'Result')}</dt><dd>{t.resultAt}</dd></>}
            <dt>{tr('맡은 에이전트', 'Agent')}</dt><dd>{agentName(t.agent)}</dd>
            <dt>{tr('종결 조건', 'Completion criteria')}</dt><dd>{t.endCheck && <b className="tk-pass">{END_CHECK[t.endCheck]}</b>}{t.endCheck && t.endCondition && ' · '}
              {t.endCondition ?? (t.proposal ? <span className="muted">{tr('제안', 'Proposed')}: {t.proposal.endCondition.join(', ')}</span> : <span className="muted">{tr('에이전트가 먼저 제안합니다', 'The agent proposes them first')}</span>)}</dd>
            <dt>{tr('검증', 'Verification')}</dt><dd className="tk-verify">
              <span>{tr('기계', 'Machine')} <span className="muted">{t.check.machine ? '✓' : tr('아직', 'Not yet')}</span></span>
              <span>{tr('재현', 'Reproduced')} <span className="muted">{t.check.repro ?? tr('아직', 'Not yet')}</span></span>
              <span>{tr('사람', 'Human')} <span className={canJudge ? 'turn' : 'muted'}>{human}</span></span></dd>
            <dt>{tr('파일', 'File')}</dt><dd className="mono">{t.file}</dd>
          </dl>

          <section className="tk-sec" data-ui="요약과 결론">
            <h2>1. {tr('요약과 결론', 'Summary and conclusion')}</h2>
            {cardConclusion(t) ? <p className="tk-rep-concl">{cardConclusion(t)}</p> : <p className="muted">{tr('아직 결과가 없습니다.', 'No result yet.')}</p>}
            {t.state === 'proposed' && t.proposal && <div className="tk-prop"><ol>{t.proposal.endCondition.map((c, i) => <li key={i}>{c}</li>)}</ol>{t.proposal.reason && <p className="muted">{tr('이유', 'Reason')}: {t.proposal.reason}</p>}
              <button className="btn" onClick={() => setDialog({ mode: 'proposal', from: t, endCondition: t.proposal!.endCondition.length === 1 ? t.proposal!.endCondition[0] : t.proposal!.endCondition.map((c, i) => `${i + 1}) ${c}`).join('\n') })}>{Icon.pencil}{tr('고쳐서 승인', 'Edit and approve')}</button></div>}
            {summary && <div className="tk-plain"><ObsidianMarkdown text={summary} /></div>}
            <Asks key={`${rid}/${t.id}`} rid={rid} t={t} onSaved={onSaved} reload={reload} />
          </section>

          <section className="tk-sec" data-ui="근거">
            <h2>2. {tr('근거', 'Grounds')}</h2>
            {evidence ? <ObsidianMarkdown text={evidence} /> : <p className="muted">{tr('아직 없습니다.', 'None yet.')}</p>}
            {t.outputs.length > 0 && <div className="tk-outputs"><span className="muted">{tr('산출물', 'Outputs')}</span>{t.outputs.map((o) => <code key={o}>{o}</code>)}</div>}
          </section>

          <section className="tk-sec" data-ui="남은 문제">
            <h2>3. {tr('남은 문제', 'Open issues')}</h2>
            {t.issues.length ? <ol className="tk-issues">{t.issues.map((x, i) => (
              <li key={i}><span>{x.text}</span>{(x.impact || x.next) && <span className="tk-issue-m">{[x.impact, x.next ? tr(`다음 지시 ${x.next}`, `Next step ${x.next}`) : ''].filter(Boolean).join(' · ')}</span>}</li>
            ))}</ol> : <p className="muted">{tr('없음', 'None')}</p>}
          </section>

          <section className="tk-sec" data-ui="다음 지시">
            <h2>4. {tr('다음 지시', 'Next steps')}</h2>
            <div className="tk-next">
              {t.next.map((n, k) => {
                const i = k + 1
                return (
                  <div key={i} className={`tk-next-row${n.started || n.dropped ? ' sent' : ''}`} data-ui="다음 지시 줄">
                    <span className="n">{i}</span>
                    <div className="b"><div>{n.task}</div>{n.endCondition && <div className="c">{tr('종결 조건', 'Completion criteria')} · {n.endCondition}</div>}</div>
                    {n.started ? <button className="a" onClick={() => go({ page: 'task', rid, task: n.started! })}>{tr('맡김', 'Delegated')} · {titleOf(n.started)}</button>
                      : n.dropped ? <button className="a" onClick={() => void next(i, 'restore')}>{tr('되살리기', 'Restore')}</button>
                      : <span className="tk-next-act">
                        <button className="icon-btn" data-tip={tr('승인: 이대로 맡기기', 'Approve: delegate as is')} aria-label={tr('승인: 이대로 맡기기', 'Approve: delegate as is')} onClick={() => void next(i, 'start')}>{Icon.approve}</button>
                        <button className="icon-btn" data-tip={tr('고치기', 'Edit')} aria-label={tr('고쳐서 맡기기', 'Edit and delegate')} onClick={() => setDialog({ mode: 'next', from: t, nextIndex: i, title: n.task.slice(0, 80), task: n.task, endCondition: n.endCondition, topic: t.topic, agent: t.agent, avoid: t.avoid, references: [t.file] })}>{Icon.pencil}</button>
                        <button className="icon-btn" data-tip={tr('빼기', 'Remove')} aria-label={tr('빼기', 'Remove')} onClick={() => void next(i, 'drop')}>{Icon.x}</button>
                      </span>}
                  </div>
                )
              })}
              <button className="tk-next-own" onClick={() => setDialog({ mode: 'new', topic: t.topic, agent: t.agent, references: [t.file] })}>{Icon.plus}{tr('직접 적기', 'Write your own')}</button>
            </div>
          </section>

          <details className="tk-fold"><summary>{tr('검증 상세', 'Verification details')}</summary>
            <dl className="tk-kv2"><dt>{tr('기계', 'Machine')}</dt><dd>{t.check.machine ?? tr('아직', 'Not yet')}</dd><dt>{tr('재현', 'Reproduced')}</dt><dd>{t.check.repro ?? tr('아직', 'Not yet')}</dd><dt>{tr('사람', 'Human')}</dt><dd>{human}</dd></dl>
          </details>
          <details className="tk-fold"><summary>{tr('맡길 때 적은 것', 'What was written when delegating')}</summary>
            <dl className="tk-kv2">
              <dt>{tr('작업 내용', 'Task')}</dt><dd>{t.task}</dd>
              <dt>{tr('종결 조건', 'Completion criteria')}</dt><dd>{t.endCondition ?? tr('에이전트가 먼저 제안', 'The agent proposes first')}</dd>
              {t.references.length > 0 && <><dt>{tr('참고 자료', 'References')}</dt><dd>{t.references.map((r) => <div key={r} className="mono">{fromTask.some((f) => r.endsWith(`${f}.md`)) ? <button className="a" onClick={() => go({ page: 'task', rid, task: /tasks\/(.+)\.md$/.exec(r)![1]! })}>{titleOf(/tasks\/(.+)\.md$/.exec(r)![1]!)}</button> : r}</div>)}</dd></>}
              {t.avoid && <><dt>{tr('하지 말 것', 'Avoid')}</dt><dd>{t.avoid}</dd></>}
            </dl>
          </details>
          {t.judged.length > 0 && <details className="tk-fold"><summary>{tr('판단 기록', 'Decisions')} {t.judged.length}</summary>
            <ul className="tk-judged">{t.judged.map((j, k) => <li key={k}><span className="muted">{j.at}</span> {({ approve: tr('승인', 'Approved'), 'send-back': tr('수정', 'Revise'), pause: tr('멈춤', 'Blocked'), discard: tr('폐기', 'Dropped') })[j.verdict]}{j.note ? ` · ${j.note}` : ''}</li>)}</ul>
          </details>}
        </div>
      </section>
      {dialog && <TaskDialog rid={rid} topics={topics} draft={dialog} onClose={() => setDialog(null)} onSaved={onSaved} reload={reload} />}
    </div>
  )
}

/** 사용자 확인 요청에 답하기: 고르는 즉시 answers에 적는다. 덧붙일 말은 칸을 떠날 때 같은 답과 함께 다시 적는다 */
function Asks({ rid, t, onSaved, reload }: { rid: string; t: Task; onSaved(m: string): void; reload(): unknown }) {
  const asks = cardAsks(t)
  const real = t.asks.length > 0
  const questionKeys = answerQuestionKeys(asks)
  const [notes, setNotes] = useState<AnswerNoteDrafts>(() => mergeAnswerNotes({}, t.answers, asks))
  const nextSaveId = useRef(0)
  useEffect(() => { setNotes((drafts) => mergeAnswerNotes(drafts, t.answers, asks)) }, [t.hash]) // eslint-disable-line react-hooks/exhaustive-deps
  const unassigned = unassignedAnswerNotes(notes)
  if (!asks.length && !unassigned.length) return null
  const answerOf = (n: number) => t.answers.find((a) => a.n === n)
  const left = asks.filter((_, k) => !answerOf(k + 1)).length
  const send = async (n: number, answer: string) => {
    const ticket = answerNoteSaveTicket(notes, questionKeys[n - 1]!, ++nextSaveId.current)
    setNotes((drafts) => beginAnswerNoteSave(drafts, ticket))
    try {
      const saved = await tasksApi(rid).answer(t.id, { n, answer, note: ticket.text, baseHash: t.hash })
      setNotes((drafts) => finishAnswerNoteSave(drafts, ticket, saved.answers.find((a) => a.n === n)?.note ?? ''))
      onSaved(tr('답을 적었습니다', 'Answer saved'))
    } catch (e) {
      setNotes((drafts) => finishAnswerNoteSave(drafts, ticket))
      onSaved(e instanceof ConflictError ? tr('에이전트가 파일을 고쳤습니다. 새 내용을 보고 다시 답하세요', 'The agent edited the file. Check the new content and answer again') : (e as Error).message)
    }
    return reload()
  }
  return (
    <div className="tk-asks" data-ui="사용자 확인 요청">
      <div className="tk-asks-h"><b>{tr('사용자 확인 요청', 'Questions for you')}</b>{real && <span className="muted">{left ? tr(`${left}개 남음`, `${left} left`) : tr('모두 답함', 'All answered')}</span>}</div>
      {asks.map((a, k) => {
        const n = k + 1
        const key = questionKeys[k]!
        const got = answerOf(n)
        return (
          <div key={key} className={`tk-ask${got ? ' done' : ''}`}>
            {asks.length > 1 && <span className="n">{n}</span>}
            <span className="q">{a.q}</span>
            {real ? <span className="segmented small" role="group" aria-label={tr(`${n}번 답`, `Answer ${n}`)}>
              {askOptions(a).map((o) => <button key={o} className={got?.answer === o ? 'on' : ''} aria-pressed={got?.answer === o} onClick={() => void send(n, o)}>{askOptionLabel(o)}</button>)}
            </span> : <span className="muted tk-ask-hint">{tr('위의 승인 · 수정으로 답합니다', 'Answer with Approve or Revise above')}</span>}
            {real && <input className="tk-ask-note" value={notes[key]?.text ?? ''} placeholder={tr('덧붙일 말 (선택)', 'Note (optional)')} aria-label={tr(`${n}번에 덧붙일 말`, `Note for ${n}`)}
              onChange={(e) => { const text = e.target.value; setNotes((drafts) => editAnswerNote(drafts, key, text, got?.note)) }} onBlur={() => { if (got && (notes[key]?.text ?? '') !== (got.note ?? '')) void send(n, got.answer) }} />}
          </div>
        )
      })}
      {unassigned.length > 0 && <details className="tk-fold">
        <summary>{tr(`연결하지 않은 초안 ${unassigned.length}개`, `Unlinked drafts: ${unassigned.length}`)}</summary>
        <p className="muted">{tr('질문이 바뀌어 이전 초안을 연결하지 않았습니다. 필요한 글을 복사해 현재 질문에 붙여 넣으세요.', 'The questions changed, so earlier drafts were not linked. Copy what you need into the current questions.')}</p>
        {unassigned.map((draft, i) => <div key={draft.key} className="tk-ask">
          <span className="q">{draft.question}</span>
          <button className="a" aria-label={tr(`${i + 1}번 보관 초안 복사`, `Copy kept draft ${i + 1}`)} onClick={() => {
            const failed = () => onSaved(tr('복사하지 못했습니다. 보관 초안에서 글을 직접 복사하세요', 'Could not copy. Copy the text from the kept draft yourself'))
            try { void navigator.clipboard.writeText(draft.text).then(() => onSaved(tr('초안을 복사했습니다', 'Draft copied')), failed) } catch { failed() }
          }}>{tr('복사', 'Copy')}</button>
          <input className="tk-ask-note" readOnly value={draft.text} aria-label={tr(`${i + 1}번 보관 초안`, `Kept draft ${i + 1}`)} />
        </div>)}
      </details>}
      {real && <p className="muted tk-ask-foot">{tr('답은 고르는 즉시 작업 파일에 적히고, 에이전트가 다음에 읽습니다. 승인은 따로 누릅니다.', 'Answers are written to the task file as soon as you pick them, and the agent reads them next. Approve separately.')}</p>}
    </div>
  )
}
