import { useEffect, useState } from 'react'
import type { BlockRow, ResearchSummary, Statement } from './api'
import { statusLabel, statusOf } from './format'
import { Icon } from './icons'
import { ProofMark, StatusDot } from './StatusDot'
import {
  isGiven, KIND_COLOR, KIND_LABEL, paperOrder, PROOF_TEXT, proofState, proofsOf, provesOf, shortLabel, statementGroup, usedBy,
} from './notes'
import { go } from './router'
import { t } from './i18n'

/**
 * 지도: 진술(과 작업노트)이 무엇에 기대고 어디까지 했나.
 * - 초점 보기(기본): 고른 노트를 가운데, 왼쪽에 바로 기대는 것, 오른쪽에 바로 쓰이는 곳. 선이 없다
 * - 목록: 논문 순서대로, 관계는 칩으로
 * 진술 폴더가 없는 프로젝트는 작업노트끼리의 관계(머리말의 갈라져 나온 곳 = 기대는 것)로 그린다.
 */
type Focus = { k: 'statement' | 'derivation'; id: string }
const FOCUS_KEY = (rid: string) => `rw-map-${rid}`

export function MapPage({ rid, summary }: { rid: string; summary: ResearchSummary }) {
  const st = summary.statements
  const byS = new Map(st.map((s) => [s.id, s]))
  const byB = new Map(summary.blocks.map((b) => [b.id, b]))
  const first: Focus | null = st.length
    ? { k: 'statement', id: (st.find((s) => proofState(summary, s) === 'in-progress') ?? st[0]!).id }
    : summary.tree.frontier[0] ? { k: 'derivation', id: summary.tree.frontier[0] } : summary.blocks[0] ? { k: 'derivation', id: summary.blocks[0].id } : null
  const [view, setView] = useState<'focus' | 'list'>('focus')
  const [focus, setFocus] = useState<Focus | null>(() => { try { return JSON.parse(localStorage.getItem(FOCUS_KEY(rid)) ?? 'null') ?? first } catch { return first } })
  const [trail, setTrail] = useState<Focus[]>([])
  const valid = focus && (focus.k === 'statement' ? byS.has(focus.id) : byB.has(focus.id)) ? focus : first
  useEffect(() => { try { localStorage.setItem(FOCUS_KEY(rid), JSON.stringify(valid)) } catch { /* 무시 */ } }, [rid, valid])
  const to = (f: Focus) => { setFocus(f); setView('focus'); setTrail((t) => [...t.filter((x) => x.id !== f.id), f].slice(-6)) }

  const counts = { st: st.length, dv: summary.blocks.length }
  return (
    <div className="ws-doc" data-ui="지도">
      <section className="pane">
        <div className="pane-head map-head" data-ui="머리줄">
          <span className="map-trail" data-ui="지나온 길">
            {view === 'focus' && trail.length > 1 && <>{t('지나온 길: ', 'Path: ')}{trail.map((f, i) => (
              <span key={f.id}>{i > 0 && ' › '}<button className="link-like" onClick={() => setFocus(f)}>{f.k === 'statement' ? shortLabel(byS.get(f.id)!) : byB.get(f.id)?.title ?? f.id}</button></span>
            ))}</>}
          </span>
          <div className="segmented small" role="radiogroup" aria-label={t('지도 보기', 'Map view')} data-ui="지도 보기 전환">
            <button role="radio" aria-checked={view === 'focus'} className={view === 'focus' ? 'on' : ''} onClick={() => setView('focus')}>{t('초점', 'Focus')}</button>
            <button role="radio" aria-checked={view === 'list'} className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>{t('목록', 'List')}</button>
          </div>
          <span className="map-counts muted">{counts.st > 0 && <span>{t('진술', 'Statements')} {counts.st} ·</span>}<span>{t('노트', 'Notes')} {counts.dv}</span></span>
        </div>
        <div className="scroll">
          {!valid
            ? <p className="empty map-empty">{t('아직 표시할 노트나 진술이 없습니다.', 'No notes or statements to show yet.')}</p>
            : view === 'focus' ? <FocusView summary={summary} rid={rid} focus={valid} onFocus={to} /> : <ListView summary={summary} onFocus={to} focus={valid} />}
        </div>
      </section>
    </div>
  )
}

function StatementCard({ s, summary, onClick, more }: { s: Statement; summary: ResearchSummary; onClick(): void; more?: string }) {
  const p = proofState(summary, s)
  return (
    <button className="map-node" onClick={onClick} title={`${s.label ?? ''}\n${s.title ?? ''}\n${PROOF_TEXT[p]}`} data-ui="진술 카드" data-ui-item={shortLabel(s)}>
      <span className="kind-chip" style={{ background: KIND_COLOR[s.kind] ?? KIND_COLOR.statement }}>{KIND_LABEL[s.kind] ?? s.kind}</span>
      <span className="map-node-t"><b>{shortLabel(s)}</b><span>{s.title}</span></span>
      <ProofMark p={p} />
      {more && <span className="map-more">{more}</span>}
    </button>
  )
}

function DerivationCard({ b, onClick, more }: { b: BlockRow; onClick(): void; more?: string }) {
  const s = statusOf(b.status)
  return (
    <button className="map-node" onClick={onClick} title={`${t('노트', 'Note')} · ${statusLabel(s)}${b.next ? `\n${t('다음', 'Next')}: ${b.next}` : ''}`} data-ui="작업노트 카드" data-ui-item={b.title ?? b.id}>
      <span className="kind-chip deriv">{t('작업', 'Work')}</span>
      <span className="map-node-t"><b>{b.title ?? b.id}</b><span>{statusLabel(s)}{b.next ? ` · ${b.next}` : ''}</span></span>
      <StatusDot s={s} />
      {more && <span className="map-more">{more}</span>}
    </button>
  )
}

function FocusView({ summary, rid, focus, onFocus }: { summary: ResearchSummary; rid: string; focus: Focus; onFocus(f: Focus): void }) {
  const byS = new Map(summary.statements.map((s) => [s.id, s]))
  const byB = new Map(summary.blocks.map((b) => [b.id, b]))
  const sCard = (s: Statement) => <StatementCard key={s.id} s={s} summary={summary} onClick={() => onFocus({ k: 'statement', id: s.id })} />
  const dCard = (b: BlockRow) => <DerivationCard key={b.id} b={b} onClick={() => onFocus({ k: 'derivation', id: b.id })} />

  if (focus.k === 'statement') {
    const s = byS.get(focus.id)!
    const left = s.uses.map((u) => byS.get(u)).filter((x): x is Statement => !!x)
    const right = usedBy(summary, s.id)
    const proofs = proofsOf(summary, s)
    const p = proofState(summary, s)
    return (
      <div className="map-focus">
        <Column title={`${t('기대는 것', 'Relies on')} ${left.length}`} empty={t('없음 — 바탕', 'None (foundation)')}>{left.map(sCard)}</Column>
        <div className="map-arrow">→</div>
        <div className="map-center" data-ui="초점 진술">
          <div><span className="kind-chip" style={{ background: KIND_COLOR[s.kind] ?? KIND_COLOR.statement }}>{KIND_LABEL[s.kind] ?? s.kind}</span> <span className="muted">{s.label}</span></div>
          <h3><button className="a" data-tip={t('진술 열기', 'Open statement')} onClick={() => go({ page: 'statement', rid, sid: s.id })}>{s.title ?? s.id}</button></h3>
          <p><ProofMark p={p} /> {PROOF_TEXT[p]}</p>
          {s.source && <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{t('출처', 'Source')} {s.source}{s.page ? ` p.${s.page.split(' ')[0]}` : ''}</span>}
          {!isGiven(s) && (
            <div className="map-proofs" data-ui="증명 작업">
              <div className="map-col-h">{t('증명 작업 (노트)', 'Proof work (notes)')} {proofs.length}</div>
              {proofs.map((b) => (
                <button key={b.id} className="map-proof" onClick={() => go({ page: 'block', rid, bid: b.id })}>
                  <StatusDot s={statusOf(b.status)} /><span className="ico" aria-hidden>{Icon.block}</span> {b.title ?? b.id}<span className="muted"> · {statusLabel(statusOf(b.status))}</span>
                </button>
              ))}
              {proofs.length === 0 && <span className="muted" style={{ fontSize: 'var(--fs-sm)' }}>{t('아직 없습니다', 'None yet')}</span>}
            </div>
          )}
        </div>
        <div className="map-arrow">→</div>
        <Column title={`${t('쓰이는 곳', 'Used by')} ${right.length}`} empty={t('없음 — 끝 결과', 'None (final result)')}>{right.map(sCard)}</Column>
      </div>
    )
  }
  const b = byB.get(focus.id)!
  const parent = b.parent ? byB.get(b.parent) : undefined
  const children = (summary.tree.children[b.id] ?? []).map((id) => byB.get(id)).filter((x): x is BlockRow => !!x)
  const proves = provesOf(summary, b.id)
  const s = statusOf(b.status)
  return (
    <div className="map-focus">
      <Column title={`${t('기대는 것', 'Relies on')} ${(parent ? 1 : 0) + proves.length}`} empty={t('없음', 'None')}>
        {proves.map((x) => <StatementCard key={x.id} s={x} summary={summary} onClick={() => onFocus({ k: 'statement', id: x.id })} more={t('증명 대상', 'Proves')} />)}
        {parent && dCard(parent)}
      </Column>
      <div className="map-arrow">→</div>
      <div className="map-center" data-ui="초점 작업노트">
        <div><span className="kind-chip deriv">{t('작업', 'Work')}</span></div>
        <h3><button className="a" data-tip={t('노트 열기', 'Open note')} onClick={() => go({ page: 'block', rid, bid: b.id })}>{b.title ?? b.id}</button></h3>
        <p><StatusDot s={s} /> {statusLabel(s)}{b.next && <><br /><span className="muted">{t('다음', 'Next')}: {b.next}</span></>}</p>
        {s === 'blocked' && b.resumeCondition && <p className="muted">{t('다시 시작할 조건', 'Resume when')}: {b.resumeCondition}</p>}
      </div>
      <div className="map-arrow">→</div>
      <Column title={`${t('이어지는 노트', 'Follow-up notes')} ${children.length}`} empty={t('없음', 'None')}>{children.map(dCard)}</Column>
    </div>
  )
}

function Column({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <div className="map-col">
      <div className="map-col-h">{title}</div>
      <div className="map-stack">{children.length ? children : <span className="muted" style={{ fontSize: 'var(--fs-sm)' }}>{empty}</span>}</div>
    </div>
  )
}

function ListView({ summary, onFocus, focus }: { summary: ResearchSummary; onFocus(f: Focus): void; focus: Focus }) {
  const byS = new Map(summary.statements.map((s) => [s.id, s]))
  let group = ''
  return (
    <div className="map-list" data-ui="지도 목록">
      {summary.statements.length > 0 && (
        <table>
          <thead><tr><th style={{ width: 170 }}>{t('진술', 'Statement')}</th><th>{t('제목', 'Title')}</th><th style={{ width: 150 }}>{t('어디까지', 'Progress')}</th><th>{t('기대는 것', 'Relies on')}</th></tr></thead>
          <tbody>
            {paperOrder(summary.statements).flatMap((s) => {
              const g = statementGroup(s)
              const head = g !== group ? (group = g, [<tr key={`g-${g}`} className="grp"><td colSpan={4}>{g}</td></tr>]) : []
              const p = proofState(summary, s)
              return [...head, (
                <tr key={s.id} className={focus.k === 'statement' && focus.id === s.id ? 'sel' : ''}>
                  <td><button className="link-like" onClick={() => onFocus({ k: 'statement', id: s.id })}><span className="kind-chip" style={{ background: KIND_COLOR[s.kind] ?? KIND_COLOR.statement }}>{KIND_LABEL[s.kind] ?? s.kind}</span> <b>{shortLabel(s)}</b></button></td>
                  <td>{s.title}</td>
                  <td><ProofMark p={p} /> {PROOF_TEXT[p]}</td>
                  <td>{s.uses.map((u) => byS.get(u)).filter((x): x is Statement => !!x).map((u) => (
                    <button key={u.id} className="dep-chip" onClick={() => onFocus({ k: 'statement', id: u.id })}>{shortLabel(u)}</button>
                  ))}</td>
                </tr>
              )]
            })}
          </tbody>
        </table>
      )}
      <table>
        <thead><tr><th style={{ width: 170 }}>{t('노트', 'Note')}</th><th>{t('다음 할 일', 'Next step')}</th><th style={{ width: 150 }}>{t('상태', 'Status')}</th><th>{t('증명 대상', 'Proves')}</th></tr></thead>
        <tbody>
          {summary.tree.order.map(({ id, depth }) => {
            const b = summary.blocks.find((x) => x.id === id)!
            const s = statusOf(b.status)
            return (
              <tr key={id} className={focus.k === 'derivation' && focus.id === id ? 'sel' : ''}>
                <td style={{ paddingLeft: 12 + depth * 12 }}><button className="link-like" onClick={() => onFocus({ k: 'derivation', id })}><span className="ico" aria-hidden>{Icon.block}</span> {b.title ?? id}</button></td>
                <td className="muted">{b.next}</td>
                <td><StatusDot s={s} /> {statusLabel(s)}</td>
                <td>{provesOf(summary, id).map((x) => <button key={x.id} className="dep-chip" onClick={() => onFocus({ k: 'statement', id: x.id })}>{shortLabel(x)}</button>)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
