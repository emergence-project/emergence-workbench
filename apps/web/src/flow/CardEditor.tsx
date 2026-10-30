import { useState, type ReactNode } from 'react'
import type { FlowNode, FlowPatchBody } from '../api'
import { Icon } from '../icons'
import { t as tr } from '../i18n'
import { flowBy } from './flowBy'
import { MarkIcon, judgeName } from './marks'

type Card = NonNullable<FlowNode['card']>
type TermRow = { word: string; def: string; ref: string }
export type CardDraft = { givens: string[]; terms: TermRow[]; tools: string; assignee: string; findings: string }

export const cardDraft = (c?: Card): CardDraft => ({
  givens: c?.givens ?? [], terms: (c?.terms ?? []).map((x) => ({ word: x.word, def: x.def ?? '', ref: x.ref ?? '' })),
  tools: (c?.tools ?? []).join('\n'), assignee: c?.assignee ?? '', findings: c?.findings === undefined ? '' : String(c.findings),
})
export const cardOut = (d: CardDraft): NonNullable<FlowPatchBody['set']['card']> => ({
  givens: d.givens,
  terms: d.terms.filter((x) => x.word.trim()).map((x) => ({ word: x.word.trim(), ...(x.def.trim() && { def: x.def.trim() }), ...(x.ref.trim() && { ref: x.ref.trim() }) })),
  tools: d.tools.split('\n').map((x) => x.trim()).filter(Boolean),
  ...(d.assignee && { assignee: d.assignee }),
  ...(/^\d+$/.test(d.findings.trim()) && { findings: Number(d.findings.trim()) }),
})

const AGENTS = ['claude-code', 'codex']

/**
 * 점 고치기 › 카드 (10/23 "판단 설계" 2절): 용어 · 왜 · 사전 연구와 도구 · 언제 끝나나 · 범위와 자원 · 돌려받을 것.
 * 물음 · 예상 답은 계획 묶음에 그대로 있고, 판정 기준은 여기의 "완료 조건 · 예"가 된다. 맨 아래는 시작 전에 걸릴 것의 검사 줄
 */
export function CardSection({ n, card, setCard, all, fields, row }: {
  rid: string; n: FlowNode; card: CardDraft; setCard(c: CardDraft): void; all: FlowNode[]
  fields: Record<string, string>; row(f: string): ReactNode
}) {
  const [pick, setPick] = useState('')
  const byId = new Map(all.map((m) => [m.id, m]))
  const set = (p: Partial<CardDraft>) => setCard({ ...card, ...p })
  const setTerm = (i: number, p: Partial<TermRow>) => set({ terms: card.terms.map((x, j) => j === i ? { ...x, ...p } : x) })
  // 고를 명제: 승인된 것 먼저, 판단 전은 "판단 전"을 붙인다 (고르면 판단 대기에 오른다)
  const findings = all.filter((m) => m.kind === 'finding' && m.id !== n.id && !card.givens.includes(m.id))
    .sort((a, b) => Number(b.verdict === 'approve') - Number(a.verdict === 'approve') || a.short.localeCompare(b.short))
  const undefinedTerms = card.terms.filter((x) => x.word.trim() && !x.def.trim() && !x.ref.trim()).map((x) => x.word.trim())
  const openGivens = card.givens.filter((g) => byId.get(g)?.verdict !== 'approve')
  const doneWhen = !!(fields.criterion?.trim() && fields.criterion_no?.trim())
  const head = (title: string) => <h4 className="fl-card-h">{title}</h4>

  return <section className="fl-sec" data-ui="흐름 카드 고치기">
    <h3>{tr('카드', 'Card')}</h3>

    {head(tr('용어', 'Terms'))}
    <div className="fl-terms">{card.terms.map((x, i) => <div key={i} className="fl-term-row">
      <input className="fl-in" aria-label={tr(`용어 ${i + 1}`, `Term ${i + 1}`)} placeholder={tr('말 · 기호', 'Word or symbol')} value={x.word} maxLength={80} onChange={(e) => setTerm(i, { word: e.target.value })} />
      <input className={`fl-in${x.word.trim() && !x.def.trim() && !x.ref.trim() ? ' fl-need-in' : ''}`} aria-label={tr(`용어 ${i + 1}의 정의`, `Definition of term ${i + 1}`)} placeholder={tr('정의 (한 줄)', 'Definition (one line)')} value={x.def} maxLength={1000} onChange={(e) => setTerm(i, { def: e.target.value })} />
      <input className="fl-in mono" aria-label={tr(`용어 ${i + 1}의 출처`, `Source of term ${i + 1}`)} placeholder={tr('출처 (노트 경로#절)', 'Source (note path#section)')} value={x.ref} maxLength={300} onChange={(e) => setTerm(i, { ref: e.target.value })} />
      <button type="button" className="icon-btn" title={tr('이 용어 제거', 'Remove this term')} aria-label={tr('용어 제거', 'Remove term')} onClick={() => set({ terms: card.terms.filter((_, j) => j !== i) })}>{Icon.x}</button>
    </div>)}</div>
    <div className="fl-linkrow"><button type="button" className="a" onClick={() => set({ terms: [...card.terms, { word: '', def: '', ref: '' }] })}>＋ {tr('용어', 'Term')}</button>
      <span className="fl-help">{tr('물음 · 완료 조건에 쓴 기호마다 정의나 출처를 적습니다. 둘 다 없으면 검사가 시작을 막습니다.', 'Give each symbol used in the question or done-when a definition or a source. Without either, the check blocks the start.')}</span></div>

    {head(tr('의의', 'Why'))}
    <dl className="fl-fields">{row('value')}</dl>

    {head(tr('사전 연구와 도구', 'Prior work and tools'))}
    <ul className="fl-fromlist" data-ui="흐름 카드 사전 연구">{card.givens.map((g) => { const m = byId.get(g); return <li key={g}>
      {m && <MarkIcon n={m} size={16} />}<span className="fl-grow">{m?.short ?? g}</span>
      <span className={m?.verdict === 'approve' ? 'muted' : 'fl-turn-name'}>{m ? judgeName(m) ?? tr('판단 전', 'Not judged') : tr('없는 점', 'Missing dot')}</span>
      <button type="button" className="icon-btn" title={tr('사전 연구에서 제거', 'Remove from prior work')} aria-label={tr('사전 연구 제거', 'Remove prior work')} onClick={() => set({ givens: card.givens.filter((x) => x !== g) })}>{Icon.x}</button>
    </li> })}</ul>
    {findings.length > 0 ? <div className="fl-linkrow">
      <select className="fl-in fl-grow" aria-label={tr('사전 연구로 고를 명제', 'Proposition to use as prior work')} value={pick} onChange={(e) => setPick(e.target.value)}>
        <option value="">{tr('명제 고르기…', 'Choose a proposition…')}</option>
        {findings.map((m) => <option key={m.id} value={m.id}>{m.short}{m.verdict === 'approve' ? '' : ` · ${tr('판단 전', 'not judged')}`}</option>)}
      </select>
      <button type="button" className="btn" disabled={!pick} onClick={() => { set({ givens: [...card.givens, pick] }); setPick('') }}>{tr('추가', 'Add')}</button>
    </div> : !card.givens.length && <span className="muted fl-help">{tr('이 흐름에 명제가 없습니다', 'No propositions in this flow')}</span>}
    <p className="fl-help">{tr('판단 전 명제를 고르면 판단 대기에 오르고, 모두 승인되어야 카드를 시작할 수 있습니다.', 'A proposition not yet judged joins the judgment queue; the card can start only when all are approved.')}</p>
    <dl className="fl-fields"><div><dt>{tr('도구', 'Tools')}</dt>
      <dd><textarea className="fl-in mono" aria-label={tr('도구', 'Tools')} placeholder={tr('쓸 코드 · 폴더 (한 줄에 하나). 비우면 에이전트가 고르고 보고서에 적습니다', 'Code or folders to use (one per line). If empty, the agent picks and says so in the report')} rows={Math.max(1, card.tools.split('\n').length)} value={card.tools} onChange={(e) => set({ tools: e.target.value })} /></dd></div></dl>

    {head(tr('종료 조건 (계산 전에 고정)', 'When it ends (fixed before computing)'))}
    <dl className="fl-fields">{['criterion', 'criterion_no', 'criterion_unclear', 'stop'].map(row)}</dl>

    {head(tr('범위와 자원', 'Scope and resources'))}
    <dl className="fl-fields">{['out_of_scope', 'budget'].map(row)}</dl>

    {head(tr('산출물', 'What comes back'))}
    <dl className="fl-fields">
      {row('deliverable')}
      <div><dt>{tr('명제', 'Propositions')}</dt>
        <dd className="fl-card-count"><input className="fl-in fl-line" type="number" min={0} max={20} aria-label={tr('돌려받을 명제 수', 'Propositions to return')} placeholder="2" value={card.findings} onChange={(e) => set({ findings: e.target.value })} />
          <span className="fl-help">{tr('개까지. 판단 대기 상한(3)에 들어갈 만큼만', 'at most. Only as many as fit the judgment queue cap (3)')}</span></dd></div>
      <div><dt>{tr('담당', 'Assignee')}</dt>
        <dd><select className="fl-chip" aria-label={tr('담당', 'Assignee')} value={card.assignee} onChange={(e) => set({ assignee: e.target.value })}>
          <option value="">{tr('정하지 않음', 'Not set')}</option>
          {[...new Set([...AGENTS, ...(card.assignee ? [card.assignee] : [])])].map((a) => <option key={a} value={a}>{flowBy(a)}</option>)}</select></dd></div>
    </dl>

    <ul className="fl-card-check" data-ui="흐름 카드 검사">
      <li className={undefinedTerms.length ? 'no' : 'ok'}>{undefinedTerms.length ? tr(`용어 ${undefinedTerms.length}개 정의 없음 (${undefinedTerms.join(', ')})`, `${undefinedTerms.length} terms undefined (${undefinedTerms.join(', ')})`) : tr('용어 정의', 'Terms defined')}</li>
      <li className={openGivens.length ? 'no' : 'ok'}>{openGivens.length ? tr(`사전 연구 판단 전 ${openGivens.length}`, `${openGivens.length} prior work not judged`) : tr('사전 연구 판단됨', 'Prior work judged')}</li>
      <li className={doneWhen ? 'ok' : 'no'}>{doneWhen ? tr('완료 조건이 계산 전에 적힘', 'Done-when written before computing') : tr('완료 조건 예 · 아니오를 적어 주세요', 'Write done-when yes and no')}</li>
    </ul>
    <p className="fl-help">{tr('저장하면 판단 대기에 오르고, 사용자가 판단 화면에서 시작해야 이 카드 아래 일이 열립니다. 시작한 뒤 물음이나 완료 조건을 바꾸면 다시 판단합니다.', 'Saved, it joins the judgment queue; work under it opens only after you start it on the judgment screen. Changing the question or done-when after the start needs a new judgment.')}</p>
  </section>
}
