import { useState, type ReactNode } from 'react'
import { ConflictError, flowApi, type FlowNode, type NoteRow } from '../api'
import { go } from '../router'
import { openFlowDot } from '../FlowView'
import { t as tr } from '../i18n'
import { useFlow } from './data'
import { AskButton, FieldThreads, useJudgeThreads } from './JudgeThreads'
import { EvidenceSource } from './FlowCard'
import { FlowText } from './evidence'
import { flowBy } from './flowBy'
import { CARD_FIELD, CARD_GROUPS, FIELD, KIND, MarkIcon, judgeName, markOf, turnOf } from './marks'

type Verdict = 'approve' | 'send-back' | 'reject' | 'start' | 'end'
export const VERDICT_NAME: Record<Verdict, () => string> = {
  approve: () => tr('승인', 'Approve'), 'send-back': () => tr('수정', 'Revise'), reject: () => tr('기각', 'Reject'),
  start: () => tr('시작', 'Start'), end: () => tr('종료', 'End'),
}

/**
 * 판단 화면 (10/23 "판단 설계" 5단계): 명제 하나 또는 카드 하나를 읽고 판단한다.
 * 명제는 진술 · 조건 · 근거를 보고 기각 · 수정 · 승인, 카드는 칸 · 사전 연구 · 용어를 보고 종료 · 수정 · 시작.
 * 수정 · 기각 · 종료는 이유를 적어야 보낸다. 판단은 점 파일의 judgments에 덧붙고, 내용이 바뀌면 그 판단은 낡는다.
 */
export function JudgePage({ rid, id, notes, onSaved }: { rid: string; id: string; notes: NoteRow[]; onSaved(m: string): void }) {
  const { scan, reload } = useFlow(rid)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const n = scan?.nodes.find((x) => x.id === id)
  const th = useJudgeThreads(rid, id, n?.title ?? id)
  if (!n) return <div className="ws-doc"><section className="pane"><p className="empty tk-empty tk-pad">{scan ? `${tr('점을 찾지 못했습니다', 'Dot not found')}: workbench/flow/${id}.yaml` : tr('불러오는 중…', 'Loading…')}</p></section></div>
  const byId = new Map(scan!.nodes.map((x) => [x.id, x]))
  const card = n.kind === 'question' && n.card
  const judgeable = n.kind === 'finding' || !!card
  const verdicts: Verdict[] = n.kind === 'finding' ? ['reject', 'send-back', 'approve'] : ['end', 'send-back', 'start']
  const openGivens = card ? n.card!.givens.filter((g) => byId.get(g)?.verdict !== 'approve') : []
  const needsNote = (v: Verdict) => v === 'send-back' || v === 'reject' || v === 'end'
  const blocked = (v: Verdict): string | null => needsNote(v) && !note.trim() ? tr('이유를 적어야 보냅니다', 'Write a reason first')
    : v === 'start' && openGivens.length ? tr('승인되지 않은 사전 연구가 있어 시작할 수 없습니다', 'Prior work is not approved yet')
      : null
  const queue = scan!.nodes.filter((x) => turnOf(x) && x.id !== n.id)
  const judge = async (v: Verdict) => {
    setBusy(true)
    try {
      await flowApi(rid).judge(n.id, n.hash, v, note)
      setNote('')
      onSaved(tr(`"${n.short}": ${VERDICT_NAME[v]()}`, `"${n.short}": ${VERDICT_NAME[v]()}`))
    } catch (e) {
      onSaved(e instanceof ConflictError ? tr('점 파일이 바뀌었습니다. 새 내용을 읽고 다시 판단하세요', 'The dot file changed. Read the new content and judge again') : (e as Error).message)
    }
    setBusy(false)
    reload()
  }
  const numberOf = (qid: string) => th.questions.findIndex((q) => q.id === qid) + 1
  const fieldRow = (f: string) => n.fields[f] && <div key={f}><dt>{(card && CARD_FIELD[f]?.()) || FIELD[f]?.() || f}</dt>
    <dd className="jd-dd"><div className="jd-val"><FlowText rid={rid} text={n.fields[f]!} /></div>{judgeable && <AskButton th={th} field={f} />}</dd>
    {judgeable && <FieldThreads th={th} field={f} numberOf={numberOf} />}</div>
  const tc = th.counts()
  const dot = (m: FlowNode, tail?: ReactNode) => <li key={m.id}>
    <button className="a fl-pill" title={m.title} onClick={() => go(m.kind === 'finding' || m.card ? { page: 'judge', rid, id: m.id } : { page: 'flow', rid })}><MarkIcon n={m} size={16} /><span>{m.short}</span></button>
    {tail}
  </li>
  const prev = n.from.map((f) => byId.get(f.id)).filter((m): m is FlowNode => !!m)
  return (
    <div className="ws-doc" data-ui="판단 화면">
      <section className="pane">
        <div className="pane-head tk-rep-head" data-ui="머리줄">
          <span className={`tk-state${turnOf(n) ? ' fl-turn-name' : ''}`}><MarkIcon n={n} size={18} />{judgeName(n) ?? KIND[markOf(n)].name()}</span>
          <span className="muted crumb">{KIND[markOf(n)].name()}{n.by && ` · ${flowBy(n.by)}`}{n.date && ` · ${n.date}`}</span>
          <span className="sp" />
          {(tc.all > 0 || tc.drafts > 0) && <span className="muted jd-qsum" data-ui="판단 화면 질문 수">{[tc.all && tr(`질문 ${tc.all}`, `${tc.all} questions`), tc.answered && <span key="a" className="fl-turn-name">{tr(`내 차례 ${tc.answered}`, `${tc.answered} your turn`)}</span>, tc.drafts && tr(`보내지 않음 ${tc.drafts}`, `${tc.drafts} not sent`)].filter(Boolean).flatMap((x, i) => i ? [' · ', x] : [x])}</span>}
          {tc.drafts > 0 && <button className="btn primary" data-ui="판단 화면 모아 보내기" disabled={th.busy} title={tr('모아 둔 질문을 한 번에 보내면 에이전트가 한 번에 답합니다', 'Send the kept questions together so the agent answers them at once')} onClick={() => void th.sendAll()}>{tr(`모아 보내기 (${tc.drafts})`, `Send kept (${tc.drafts})`)}</button>}
          <button className="btn" data-ui="판단 화면 흐름에서 보기" onClick={() => openFlowDot(rid, { id: n.id })}>{tr('흐름에서 보기', 'Show in the flow')}</button>
        </div>
        <div className="tk-rep jd">
          <h1 className="tk-rep-title">{n.title}</h1>
          {n.kind === 'finding' && <section className="tk-sec" data-ui="판단 화면 명제">
            <h2>{tr('명제', 'Proposition')}</h2>
            <dl className="fl-fields jd-claim">{['statement', 'condition'].map(fieldRow)}</dl>
            {!n.fields.statement && <p className="muted">{tr('진술이 비어 있습니다. 수정으로 돌려보냅니다.', 'The statement is empty. Send it back.')}</p>}
          </section>}
          {card && <>
            {CARD_GROUPS.map((g) => g.fields.some((f) => n.fields[f]) && <section key={g.fields[0]} className="tk-sec" data-ui="판단 화면 카드 칸">
              <h2>{g.h()}</h2>
              <dl className="fl-fields">{g.fields.map(fieldRow)}</dl>
            </section>)}
            {n.card!.terms.length > 0 && <section className="tk-sec" data-ui="판단 화면 용어">
              <h2>{tr('용어', 'Terms')}</h2>
              <dl className="fl-fields">{n.card!.terms.map((x) => <div key={x.word}><dt>{x.word}</dt><dd>{x.def ? <FlowText rid={rid} text={x.def} /> : <span className="fl-turn-name">{tr('정의 없음', 'Not defined')}</span>}{x.ref && <span className="muted mono"> · {x.ref}</span>}</dd></div>)}</dl>
            </section>}
            <section className="tk-sec" data-ui="판단 화면 사전 연구">
              <h2>{tr('사전 연구', 'Prior work')}</h2>
              {n.card!.givens.length ? <ul className="jd-dots">{n.card!.givens.map((g) => {
                const m = byId.get(g)
                return m ? dot(m, <span className={m.verdict === 'approve' ? 'muted' : 'fl-turn-name'}> {judgeName(m)}</span>) : <li key={g} className="muted mono">{g}</li>
              })}</ul> : <p className="muted">{tr('없음: 처음부터 시작합니다.', 'None: starts from scratch.')}</p>}
              {(n.card!.tools.length > 0 || n.card!.assignee || n.card!.findings !== undefined) && <dl className="fl-fields">
                {n.card!.tools.length > 0 && <div><dt>{tr('도구', 'Tools')}</dt><dd>{n.card!.tools.join(', ')}</dd></div>}
                {n.card!.assignee && <div><dt>{tr('담당', 'Assignee')}</dt><dd>{flowBy(n.card!.assignee)}</dd></div>}
                {n.card!.findings !== undefined && <div><dt>{tr('명제', 'Propositions')}</dt><dd>{tr(`${n.card!.findings}개까지 돌려받음`, `Up to ${n.card!.findings} returned`)}</dd></div>}
              </dl>}
            </section>
          </>}
          {prev.length > 0 && <section className="tk-sec" data-ui="판단 화면 앞선 점">
            <h2>{n.kind === 'finding' ? tr('나온 곳', 'Where it came from') : tr('발단', 'Origin')}</h2>
            <ul className="jd-dots">{prev.map((m) => dot(m))}</ul>
          </section>}
          {n.kind === 'finding' && <section className="tk-sec" data-ui="판단 화면 근거">
            <h2>{tr('근거', 'Evidence')}</h2>
            {n.evidence.length ? <ul className="jd-ev">{n.evidence.map((e, i) => <li key={i}><EvidenceSource rid={rid} e={e} notes={notes} />{e.section && <span className="muted"> › {e.section}</span>}{e.text && <span className="muted"> · {e.text}</span>}</li>)}</ul>
              : <p className="fl-turn-name">{tr('근거가 없습니다.', 'No evidence.')}</p>}
          </section>}
          {n.judgments.length > 0 && <section className="tk-sec" data-ui="판단 화면 기록">
            <h2>{tr('판단 기록', 'Judgments')}</h2>
            <ul className="tk-judged">{n.judgments.map((j, k) => <li key={k}><span className="muted">{j.at}</span> {VERDICT_NAME[j.verdict]()}{j.note ? ` · ${j.note}` : ''}{j.stale && <span className="fl-stale">{tr('판단 뒤 바뀜', 'changed since judged')}</span>}</li>)}</ul>
          </section>}
          {judgeable ? <section className="tk-sec jd-act" data-ui="판단 화면 판단">
            <h2>{tr('판단', 'Judge')}</h2>
            <div className="jd-whole"><span className="muted">{n.kind === 'finding' ? tr('명제 전체에 묻기', 'Ask about the whole proposition') : tr('카드 전체에 묻기', 'Ask about the whole card')}</span><AskButton th={th} field="" /></div>
            <FieldThreads th={th} field="" numberOf={numberOf} />
            {tc.all > 0 && <p className="muted">{tr('답을 기다리는 질문이 있어도 판단할 수 있습니다. 판단하면 열린 질문은 "판단 뒤 닫음"으로 남습니다.', 'You can judge with questions still open; they are closed as "closed after judgment".')}</p>}
            <textarea className="jd-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} aria-label={tr('판단 메모', 'Judgment note')}
              placeholder={n.kind === 'finding' ? tr('이유 (수정 · 기각은 꼭 적습니다)', 'Reason (required to revise or reject)') : tr('이유 (수정 · 종료는 꼭 적습니다)', 'Reason (required to revise or end)')} />
            <div className="jd-btns">{verdicts.map((v) => {
              const why = blocked(v)
              return <button key={v} className={`btn${v === 'approve' || v === 'start' ? ' primary' : ''}`} data-ui={`판단 ${VERDICT_NAME[v]()}`} disabled={busy || !!why} title={why ?? undefined} onClick={() => void judge(v)}>{VERDICT_NAME[v]()}</button>
            })}</div>
            {openGivens.length > 0 && <p className="muted">{tr(`사전 연구 ${openGivens.length}개를 먼저 판단해야 시작합니다.`, `Judge ${openGivens.length} prior result(s) before starting.`)}</p>}
          </section> : <p className="muted tk-sec">{tr('이 점은 판단하지 않습니다: 판단하는 것은 명제와 카드입니다.', 'This dot is not judged: only propositions and cards are.')}</p>}
          {queue.length > 0 && <section className="tk-sec" data-ui="판단 화면 다음">
            <h2>{tr(`다음 판단할 것 ${queue.length}`, `${queue.length} more to judge`)}</h2>
            <ul className="jd-dots">{queue.map((m) => dot(m))}</ul>
          </section>}
        </div>
      </section>
    </div>
  )
}
