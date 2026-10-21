import { useEffect, useRef, useState } from 'react'
import { flowApi, type FlowEvidence, type FlowNode, type NoteRow } from '../api'
import { MathText } from '../cardParts'
import { StatusDot } from '../StatusDot'
import { routeOfNote } from '../RightSidebar'
import { go } from '../router'
import { askConfirm } from '../askText'
import { flash } from '../flash'
import { Icon } from '../icons'
import { useDismiss } from '../useDismiss'
import { t as tr } from '../i18n'
import { KIND, FIELD, EDGE, EVK, PRIORITY, markOf, stateOf, stateName, DOT, MarkIcon } from './marks'
import { Check, Chain, FlowText, approvedBy } from './evidence'
import { ApproveDialog } from './ApproveDialog'
import { flowBy } from './flowBy'
import { citeKeys } from '../ObsidianMarkdown'
import { taskTitles } from '../taskView'

export function FlowCard({ reveal, rid, n, all, byId, notes, manual, row, onPick, onAdd, onPickFrom, onEdit, onUnplace, onDeleted, reload, fail }: {
  reveal: React.MutableRefObject<boolean>; rid: string; n: FlowNode; all: FlowNode[]; byId: Map<string, FlowNode>; notes: NoteRow[]
  /** 손으로 옮긴 자리인지 */
  manual: boolean
  /** 이 점이 있는 줄의 이름 (10/21: 줄 이름은 여기서 고친다) */
  row?: { name: string; save(name: string): void }
  onPick(id: string): void; onAdd(): void; onPickFrom(): void; onEdit(): void; onUnplace(): void; onDeleted(): void; reload(): void; fail(e: unknown): void
}) {
  const [rowText, setRowText] = useState<string | null>(null)
  const saveRow = () => { if (rowText !== null) row?.save(rowText); setRowText(null) }
  const [approving, setApproving] = useState<{ ev: number } | { step: number } | null>(null)
  const remove = async () => {
    const out = all.filter((m) => m.from.some((f) => f.id === n.id)).length
    const ok = await askConfirm({
      title: tr(`점 "${n.short}"을 지울까요?`, `Delete the dot "${n.short}"?`),
      hint: tr(`점 파일(${n.file})과 이 점의 기록을 workbench/flow/.trash/로 옮깁니다${out ? `. 이 점에서 이어진 선 ${out}개도 빠집니다` : ''}. 근거로 단 노트·논문은 그대로 남습니다.`, `Moves the dot file (${n.file}) and this dot's records to workbench/flow/.trash/${out ? `, and removes the ${out} line(s) leading from it` : ''}. Notes and papers used as evidence stay.`),
      ok: tr('지우기', 'Delete'),
    })
    if (!ok) return
    try { await flowApi(rid).remove(n.id, n.hash); flash(tr(`점 "${n.short}"을 지웠습니다`, `Deleted the dot "${n.short}"`)); onDeleted() } catch (e) { fail(e) }
  }
  const K = KIND[markOf(n)]
  const el = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!reveal.current) return
    reveal.current = false
    el.current?.scrollIntoView({ block: 'nearest' })
  }, [n.id, reveal])
  // 문헌 점의 "문헌" 칸은 설명과 떼어 따로 보인다 (10/20 15:22 피드백)
  const order = [...Object.keys(FIELD).filter((f) => n.fields[f]), ...Object.keys(n.fields).filter((f) => !FIELD[f])].filter((f) => f !== 'reading')
  const reading = n.fields.reading
  const prev = n.from.map((f) => ({ f, m: byId.get(f.id)! })).filter((x) => x.m)
  const next = all.filter((m) => m.from.some((f) => f.id === n.id)).map((m) => ({ f: m.from.find((f) => f.id === n.id)!, m }))
  const hasProof = n.kind === 'finding' && n.evidence.some((e) => e.kind === 'proof')
  const openLink = (m: FlowNode) => onPick(m.id)
  const link = ({ f, m }: { f: { type: string }; m: FlowNode }) => (
    <li key={m.id}>
      <span className="fl-ety">{EDGE[f.type]!()}</span>
      <button className="a fl-pill" onClick={() => openLink(m)} title={m.title}><MarkIcon n={m} size={16} /><span>{m.short}</span></button>
    </li>
  )
  return (
    <article className="fl-card" ref={el} data-ui="흐름 점 자세히">
      <div className="fl-head"><MarkIcon n={n} size={30} /><span className="fl-short">{n.short}</span>
        <span className="fl-tools">
          {manual && <button className="btn" title={tr('손으로 옮긴 자리를 풀고 자동 자리로', 'Release the manual position')} onClick={onUnplace}>{tr('자동 자리로', 'Auto position')}</button>}
          <NextDotButtons onAdd={onAdd} onPickFrom={onPickFrom} />
          <button className="icon-btn" data-ui="흐름 점 고치기" title={tr('고치기', 'Edit')} aria-label={tr('점 고치기', 'Edit dot')} onClick={onEdit}>{Icon.pencil}</button>
          <button className="icon-btn" data-ui="흐름 점 지우기" title={tr('지우기', 'Delete')} aria-label={tr('점 지우기', 'Delete dot')} onClick={() => void remove()}>{Icon.trash}</button>
        </span>
      </div>
      {/* 짧은 제목(위 큰 글)과 제목은 따로 저장한다: 제목에 이름을 달아 구분 (10/20 15:22 피드백) */}
      <div className="fl-full"><i>{tr('제목', 'Title')}</i>{n.title}</div>
      <div className="fl-cls">
        <span title={K.def()}><i>{tr('종류', 'Kind')}</i>{K.act ? tr('행위', 'Action') : tr('진술', 'Statement')} · {K.name()}</span>
        {hasProof && !n.theorem && <span className="muted">{tr('증명 승인 대기 · 승인하면 정리', 'Proof awaiting approval · becomes a theorem when approved')}</span>}
        <span><i>{tr('상태', 'State')}</i><StatusDot s={DOT[stateOf(n)]} name={stateName(n)} label /></span>
        {n.end && <span title={tr('이 갈래는 여기서 끝나 뒤에 이어질 점이 없음', 'This branch ends here; no dot follows')}>{tr('흐름 종료', 'Flow ends')}</span>}
        {n.date && <span><i>{tr('시작일', 'Started')}</i>{n.date}</span>}
        {n.ended && <span><i>{tr('끝난 날', 'Ended')}</i>{n.ended}</span>}
        {n.by && <span><i>{tr('한 이', 'By')}</i>{flowBy(n.by)}</span>}
        {n.task && <span><i>{tr('작업', 'Task')}</i><button className="a" data-ui="흐름 점 작업" title={tr('이 점을 만든 맡긴 일 보고서 열기', 'Open the delegated task report behind this dot')} onClick={() => go({ page: 'task', rid, task: n.task! })}>{taskTitles.get(n.task) ?? n.task}</button></span>}
        {row && <span className="fl-rowfield" data-ui="흐름 줄 이름 고치기"><i>{tr('줄', 'Row')}</i>
          {rowText !== null
            ? <input className="fl-rowname-in" autoFocus aria-label={tr('줄 이름', 'Row name')} placeholder={tr('줄 이름', 'Row name')} value={rowText}
              onChange={(e) => setRowText(e.target.value)} onBlur={saveRow}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveRow() } else if (e.key === 'Escape') setRowText(null) }} />
            : <>{row.name || <span className="muted">{tr('이름 없음', 'No name')}</span>}
              <button className="icon-btn sm" title={tr('줄 이름 고치기', 'Rename row')} aria-label={tr('줄 이름 고치기', 'Rename row')} onClick={() => setRowText(row.name)}>{Icon.pencil}</button></>}
        </span>}
      </div>
      {n.gaps.length > 0 && <ul className="fl-gaps" data-ui="흐름 빈틈">
        <li><b>{tr(`빈틈 ${n.gaps.length}`, `${n.gaps.length} gaps`)}</b></li>
        {n.gaps.map((g, i) => <li key={i}>{g.text}</li>)}
      </ul>}
      {reading && <section className="fl-sec" data-ui="흐름 문헌">
        <h3>{tr('문헌', 'Reading')}</h3>
        <FlowText rid={rid} text={reading} />
        {citeKeys(reading).length > 0 && <div className="fl-cites">{[...new Set(citeKeys(reading))].map((k) => <button key={k} className="a fl-ref-link" title={tr('라이브러리에서 열기', 'Open in the library')} onClick={() => go({ page: 'shelf', open: k })}>{Chain}<span>{k}</span></button>)}</div>}
      </section>}
      <section className="fl-sec">
        <h3>{tr('설명', 'Description')}</h3>
        {order.length ? <dl className="fl-fields">{order.map((f) => <div key={f}><dt>{FIELD[f]?.() ?? f}</dt><dd><FlowText rid={rid} text={n.fields[f]!} /></dd></div>)}</dl>
          : <span className="muted">{tr('아직 없음. 연필로 적습니다.', 'None yet. Use the pencil to write.')}</span>}
      </section>
      {n.run && <section className="fl-sec" data-ui="흐름 실행">
        <h3>{tr('실행', 'Run')}</h3>
        <dl className="fl-fields">
          {n.run.code && <div><dt>{tr('코드', 'Code')}</dt><dd className="mono">{n.run.code}{n.run.commit && ` @ ${n.run.commit}`}</dd></div>}
          {!n.run.code && n.run.commit && <div><dt>{tr('커밋', 'Commit')}</dt><dd className="mono">{n.run.commit}</dd></div>}
          {n.run.params && Object.keys(n.run.params).length > 0 && <div><dt>{tr('매개변수', 'Parameters')}</dt><dd className="fl-tags">{Object.entries(n.run.params).map(([k, v]) => <span key={k}>{k} {v}</span>)}</dd></div>}
          {n.run.output && <div><dt>{tr('결과 파일', 'Output')}</dt><dd className="mono">{n.run.output}</dd></div>}
        </dl>
      </section>}
      {n.steps.length > 0 && <section className="fl-sec" data-ui="흐름 단계">
        <h3 className="fl-grp-h">{tr('증명 단계', 'Proof steps')}<span className="fl-cnt">{tr(`확인 ${n.steps.filter((x) => x.uses && (approvedBy(x, 'agent') || approvedBy(x, 'human'))).length} / ${n.steps.length}`, `${n.steps.filter((x) => x.uses && (approvedBy(x, 'agent') || approvedBy(x, 'human'))).length} of ${n.steps.length} checked`)}</span></h3>
        <ol className="fl-steps">{n.steps.map((x, i) => {
          const ok = !!x.uses && (approvedBy(x, 'agent') || approvedBy(x, 'human'))
          return <li key={i}>
            <span className={`fl-stepno ${ok ? 'ok' : 'gap'}`} title={ok ? tr('확인된 단계', 'Checked step') : tr('빈틈: 쓰는 것이 없거나 확인되지 않은 단계', 'Gap: no "uses" or not checked')}>{i + 1}</span>
            <div><MathText text={x.text} /><small>{x.uses ? `${tr('쓰는 것', 'Uses')}: ${x.uses}` : tr('쓰는 것이 적히지 않음', 'What it uses is not written')}</small>{x.stale && <span className="fl-stale">{tr('확인 뒤 바뀜', 'changed since checked')}</span>}</div>
            <Check e={x} role="agent" />
            <Check e={x} role="human" onClick={() => setApproving({ step: i })} />
          </li>
        })}</ol>
      </section>}
      {(n.reason || n.next) && <section className="fl-sec" data-ui="흐름 끝맺음">
        <h3>{tr('끝맺음', 'Outcome')}</h3>
        <dl className="fl-fields">
          {n.reason && <div><dt>{tr('이유', 'Reason')}</dt><dd><FlowText rid={rid} text={n.reason} /></dd></div>}
          {n.next && <div><dt>{tr('다음 할 일', 'Next')}</dt><dd>{n.next}{n.priority && <span className="muted"> · {tr('우선', 'priority')} {PRIORITY[n.priority]()}</span>}</dd></div>}
        </dl>
      </section>}
      <section className="fl-sec" data-ui="흐름 근거">
        <h3>{tr('근거', 'Evidence')}</h3>
        {n.evidence.length ? <div className="fl-tbox"><table className="fl-ev">
          <thead><tr><th>{tr('종류', 'Kind')}</th><th>{tr('내용', 'What it shows')}</th><th>{tr('노트와 출처', 'Note and source')}</th>
            <th className="vc" title={tr('에이전트가 확인했는지', 'Checked by an agent')}>{tr('AI 검토', 'AI check')}</th>
            <th className="vc" title={tr('사람이 승인했는지', 'Approved by a person')}>{tr('사람 승인', 'Approved')}</th></tr></thead>
          <tbody>{n.evidence.map((e, i) => <tr key={i}>
            <td className="kd">{EVK[e.kind]()}</td>
            <td>{e.text ? <MathText text={e.text} /> : <span className="muted">—</span>}</td>
            <td><EvidenceSource rid={rid} e={e} notes={notes} />{e.section && <span className="fl-sec-ref"> › {e.section}</span>}{e.stale && <div className="fl-stale">{tr('확인 뒤 바뀜', 'changed since checked')}</div>}</td>
            <td className="vc"><Check e={e} role="agent" /></td>
            <td className="vc"><Check e={e} role="human" onClick={() => setApproving({ ev: i })} /></td>
          </tr>)}</tbody>
        </table></div> : <span className="muted">{tr('없음. 연필로 노트·논문을 근거로 답니다.', 'None. Use the pencil to attach notes or papers.')}</span>}
        {approving && <ApproveDialog rid={rid} n={n} {...approving} onClose={() => setApproving(null)} onDone={() => { setApproving(null); reload() }} fail={fail} />}
      </section>
      {(n.guesses.length > 0 || n.sources.length > 0) && <details className="fl-sec fl-fold">
        <summary><h3>{tr('기록', 'Records')}</h3><span className="muted">{n.guesses.length > 0 && tr(`추정 ${n.guesses.length} · `, `${n.guesses.length} guessed · `)}{tr(`출처 ${n.sources.length}`, `${n.sources.length} sources`)}</span></summary>
        {n.guesses.length > 0 && <><h4>{tr('추정 (에이전트가 짐작한 것)', 'Guessed by the agent')}</h4><ul>{n.guesses.map((g, i) => <li key={i}>{g}</li>)}</ul></>}
        {n.sources.length > 0 && <><h4>{tr('출처', 'Sources')}</h4><ul className="fl-src">{n.sources.map((g, i) => <li key={i}>{g}</li>)}</ul></>}
        <p className="muted fl-file">{n.file}</p>
      </details>}
      <details className="fl-sec fl-fold" data-ui="흐름 연결">
        <summary><h3>{tr('연결', 'Links')}</h3><span className="muted">{tr(`이전 ${prev.length} · 이후 ${next.length}`, `${prev.length} before · ${next.length} after`)}</span></summary>
        <div className="fl-links">
          <div><h4>{tr('이전', 'Before')}</h4>{prev.length ? <ul>{prev.map(link)}</ul> : <span className="muted">{tr('없음 (시작점)', 'None (start)')}</span>}</div>
          <div><h4>{tr('이후', 'After')}</h4>{next.length ? <ul>{next.map(link)}</ul> : <span className="muted">{tr('없음', 'None')}</span>}</div>
        </div>
      </details>
    </article>
  )
}

function EvidenceSource({ rid, e, notes }: { rid: string; e: FlowEvidence; notes: NoteRow[] }) {
  if (e.ref) return <button className="a fl-ref-link" title={tr('라이브러리에서 열기', 'Open in the library')} onClick={() => go({ page: 'shelf', open: e.ref })}>{Chain}<span>{e.title ?? e.ref}</span></button>
  const file = e.file ?? ''
  // 노트 폴더(note.md · note.yaml · 그림)의 어느 파일이든 그 노트로
  const dir = (f: string) => f.replace(/\/[^/]*$/, '')
  const row = notes.find((x) => x.file === file) ?? notes.find((x) => /\/note\.(md|tex)$/.test(x.file) && dir(x.file) === dir(file))
  const block = /^workbench\/blocks\/([^/]+)\.(tex|md)$/.exec(file)
  const open = row ? () => go(routeOfNote(rid, row)) : block ? () => go({ page: 'block', rid, bid: block[1]! }) : null
  const label = e.title ?? (row?.title || file)
  return open ? <button className="a fl-note" title={file} onClick={open}>{label}</button> : <span className="fl-note" title={file}>{label}</span>
}

/** 자세히의 ＋ (이 점에서 잇기)와 ▾ (앞선 점 여러 개 고르기) */
function NextDotButtons({ onAdd, onPickFrom }: { onAdd(): void; onPickFrom(): void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  useDismiss(!!open, box, () => setOpen(false))
  return <span className="fl-next" ref={box}>
    <button className="icon-btn" data-ui="흐름 다음 점" title={tr('이 점에서 이어지는 점 더하기', 'Add a dot following this one')} aria-label={tr('다음 점 더하기', 'Add next dot')} onClick={onAdd}>{Icon.plus}</button>
    <button className={`icon-btn fl-next-more${open ? ' on' : ''}`} data-ui="흐름 다음 점 메뉴" title={tr('다른 방법으로 잇기', 'Other ways to link')} aria-label={tr('다른 방법으로 잇기', 'Other ways to link')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>▾</button>
    {open && <div className="menu fl-next-pop" role="menu">
      <button role="menuitem" onClick={() => { setOpen(false); onAdd() }}>{tr('이 점에서 잇기', 'Follow this dot')}</button>
      <button role="menuitem" onClick={() => { setOpen(false); onPickFrom() }}>{tr('앞선 점 여러 개 고르기…', 'Choose several earlier dots…')}</button>
    </div>}
  </span>
}
