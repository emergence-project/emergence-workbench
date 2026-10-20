import { useRef, useState } from 'react'
import { ConflictError, LIBRARY_SCOPE, FLOW_EDGES, FLOW_EVIDENCE, FLOW_FIELDS, FLOW_KINDS, flowApi, type FlowEdge, type FlowEvidence, type FlowKind, type FlowNode, type FlowResult, type NoteRow } from '../api'
import { forgetFigures, useFigureList } from '../figureEmbed'
import { flash } from '../flash'
import { Icon } from '../icons'
import { t as tr } from '../i18n'
import { KIND, FIELD, EDGE, EVK, MarkSvg, MarkIcon, PROGRESS, resultName } from './marks'
import type { TopicRef } from './data'
import { FlowText } from './evidence'
import { FIGURE_FILE, uploadFigure, FigureMenu } from './figures'

/** 받는 점의 종류로 정하는 기본 선 종류 (서버가 종류 없는 선을 읽는 규칙과 같다) */
const defaultEdge = (k: FlowKind): FlowEdge => k === 'question' ? 'origin' : 'support'

function KindPicker({ value, onChange, compact }: { value: FlowKind; onChange(k: FlowKind): void; compact?: boolean }) {
  return <div className={compact ? 'fl-kinds fl-kinds-row' : 'fl-kinds'} role="radiogroup" aria-label={tr('종류', 'Kind')} data-ui="흐름 종류 고르기">
    {FLOW_KINDS.map((k) => <button key={k} type="button" role="radio" aria-checked={value === k} className={value === k ? 'on' : ''} title={KIND[k].def()} onClick={() => onChange(k)}>
      <svg className="fl-icon" width={compact ? 18 : 22} height={compact ? 18 : 22} viewBox="0 0 30 30" aria-hidden><MarkSvg m={k} x={15} y={15} state="active" /></svg>
      <span>{KIND[k].name()}</span>
    </button>)}
  </div>
}

/** 새 점의 처음 값: 앞선 점이 질문이면 증명, 아니면 질문. 주제는 고른 주제, 없으면 첫 앞선 점의 주제 */
export function newDraftNode(from: FlowNode[], topic?: string): FlowNode {
  const kind: FlowKind = from[0] ? (from[0].kind === 'question' ? 'proof' : 'question') : 'question'
  const d = new Date(), p2 = (v: number) => String(v).padStart(2, '0')
  return {
    id: '', file: '', hash: '', kind, progress: 'open', short: '', title: '', topics: topic ? [topic] : from[0]?.topics ?? [],
    date: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`, from: from.map((m) => ({ id: m.id, type: defaultEdge(kind) })),
    fields: {}, evidence: [], sources: [], guesses: [], theorem: false,
  }
}

type EvRow = { kind: FlowEvidence['kind']; text: string; title: string; src: string }
const evRow = (e: FlowEvidence): EvRow => ({ kind: e.kind, text: e.text, title: e.title ?? '', src: e.ref ?? e.file ?? '' })

/**
 * 점 고치기: 이름·종류·상태·설명·근거·연결·주제를 한 번에. 창이 아니라 자세히가 있던 자리에서 고친다
 * (10/14 23:15 사용자: 팝업이 아닌 화면에서. docs/design-system.md 6절의 예외)
 */
export function FlowEditor({ rid, n, create, all, notes, topics, onClose, onSaved }: {
  rid: string; n: FlowNode
  /** 새 점: 저장하면 만들고, 만든 점을 onSaved로 돌려준다 */
  create?: boolean
  all: FlowNode[]; notes: NoteRow[]; topics: TopicRef[]; onClose(): void; onSaved(made?: FlowNode): void
}) {
  const [short, setShort] = useState(n.short)
  const [title, setTitle] = useState(n.title)
  const [date, setDate] = useState(n.date ?? '')
  const [kind, setKind] = useState(n.kind)
  const [progress, setProgress] = useState(n.progress)
  const [result, setResult] = useState<FlowResult>(n.result ?? 'solved')
  const [end, setEnd] = useState(!!n.end)
  const [fields, setFields] = useState<Record<string, string>>(n.fields)
  const [ev, setEv] = useState<EvRow[]>(n.evidence.map(evRow))
  const [from, setFrom] = useState(n.from)
  const [tops, setTops] = useState(n.topics)
  const [pick, setPick] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const figs = (useFigureList()?.figures ?? []).filter((f) => f.scope === rid || f.scope === LIBRARY_SCOPE)
  /** 설명 칸마다 글 칸 (그림을 커서 자리에 넣으려고) */
  const areas = useRef<Record<string, HTMLTextAreaElement | null>>({})
  const act = KIND[kind].act
  const shownFields = [...FLOW_FIELDS[kind], ...Object.keys(fields).filter((f) => !FLOW_FIELDS[kind].includes(f) && fields[f]?.trim())]
  const byId = new Map(all.map((m) => [m.id, m]))
  const candidates = all.filter((m) => m.id !== n.id && !from.some((f) => f.id === m.id))
    .sort((a, b) => Number(!a.topics.some((x) => tops.includes(x))) - Number(!b.topics.some((x) => tops.includes(x))) || a.short.localeCompare(b.short))
  const topicTitle = (id: string) => topics.find((x) => x.id === id)?.title ?? id
  const setEvAt = (i: number, p: Partial<EvRow>) => setEv(ev.map((x, j) => j === i ? { ...x, ...p } : x))

  const save = async () => {
    if (!short.trim()) return setError(tr('짧은 제목을 적어 주세요.', 'Enter a short title.'))
    const bad = ev.findIndex((x) => !x.src.trim())
    if (bad >= 0) return setError(tr(`근거 ${bad + 1}에 노트 경로나 논문 키를 적어 주세요.`, `Evidence ${bad + 1} needs a note path or a paper key.`))
    setBusy(true); setError(null)
    const set = {
      short: short.trim(), title: title.trim() || short.trim(), date: date.trim(), kind, progress, result: progress === 'done' ? result : null, end, topics: tops, from,
      fields: Object.fromEntries(Object.entries(fields).filter(([k]) => shownFields.includes(k)).map(([k, v]) => [k, v])),
      evidence: ev.map((x) => ({ kind: x.kind, text: x.text, ...(x.title.trim() && { title: x.title.trim() }), ...(x.kind === 'paper' ? { ref: x.src.trim() } : { file: x.src.trim() }) })),
    }
    try {
      if (!create) { await flowApi(rid).patch(n.id, n.hash, set); return onSaved() }
      // 만들기가 받는 칸으로 만들고, 나머지(날짜·설명·근거·결과·종결)가 있으면 이어서 고친다
      const made = await flowApi(rid).create({ kind, short: set.short, title: set.title, progress, ...(tops.length && { topics: tops }), ...(from.length && { from }) })
      const more = set.date !== made.date || end || progress === 'done' || set.evidence.length > 0 || Object.values(set.fields).some((v) => v.trim())
      if (more) await flowApi(rid).patch(made.id, made.hash, set).catch((e: Error) => flash(tr(`점은 만들었지만 나머지 칸을 저장하지 못했습니다: ${e.message}`, `The dot was created, but the other fields were not saved: ${e.message}`)))
      onSaved(made)
    } catch (e) {
      setBusy(false)
      setError(e instanceof ConflictError ? tr('다른 곳에서 점 파일이 바뀌어 저장하지 않았습니다. 취소하고 다시 고쳐 주세요.', 'The dot file changed elsewhere, so nothing was saved. Cancel and edit again.') : (e as Error).message)
    }
  }
  /** 설명 칸 f의 커서 자리(없으면 끝)에 그림 줄을 넣는다 */
  const insertFigure = (f: string, file: string) => {
    const el = areas.current[f]
    const old = fields[f] ?? ''
    const at = el && document.activeElement === el ? el.selectionStart : old.length
    const before = old.slice(0, at).replace(/\s+$/, '')
    const after = old.slice(at).replace(/^\s+/, '')
    const line = `![](${file})`
    setFields((cur) => ({ ...cur, [f]: `${before}${before ? '\n\n' : ''}${line}\n${after ? `\n${after}` : ''}` }))
  }
  /** 컴퓨터의 그림 · 붙여 넣은 그림을 이 프로젝트의 workbench/figures/에 두고 그 칸에 넣는다 (10/16 사용자 승인 "그림 ▾") */
  const addFiles = async (f: string, files: File[]) => {
    const pics = files.filter((x) => FIGURE_FILE.test(x.name) || /^image\//.test(x.type))
    if (!pics.length) return
    setError(null)
    const taken = new Set(figs.filter((x) => x.scope === rid).map((x) => x.file.toLowerCase()))
    for (const x of pics) {
      try {
        const file = await uploadFigure(rid, n.id || 'flow', x, taken)
        taken.add(file.toLowerCase())
        insertFigure(f, file)
      } catch (e) { setError((e as Error).message) }
    }
    forgetFigures()
  }
  // 저장 · 취소는 머리 줄에만 (10/16 사용자 승인)
  const buttons = <>
    <button className="btn" onClick={onClose}>{tr('취소', 'Cancel')}</button>
    <button className="btn primary" disabled={busy} onClick={() => void save()}>{create ? tr('만들기', 'Create') : tr('저장', 'Save')}</button>
  </>

  // 자세히와 같은 배치로, 칸마다 상자를 두지 않는다 (10/15 반려 "박스가 너무 많다")
  return <article className={`fl-card fl-editing${create ? ' fl-new' : ''}`} data-ui={create ? '흐름 새 점 창' : '흐름 점 고치기 창'} aria-label={create ? tr('새 점', 'New dot') : tr('점 고치기', 'Edit dot')}
    onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
    <div className="fl-head"><MarkIcon n={{ ...n, kind, progress, result: progress === 'done' ? result : undefined }} size={30} />
      <input className="fl-in fl-short fl-grow" autoFocus aria-label={tr('짧은 제목', 'Short title')} placeholder={tr('짧은 제목', 'Short title')} value={short} maxLength={60} onChange={(e) => setShort(e.target.value)} />
      <input className="fl-in fl-date-in" aria-label={tr('날짜', 'Date')} value={date} placeholder="2026-10-14" maxLength={20} onChange={(e) => setDate(e.target.value)} />
      <span className="fl-tools">{buttons}</span></div>
    <input className="fl-in fl-full" aria-label={tr('제목', 'Title')} placeholder={tr('제목 (비우면 짧은 제목)', 'Title (empty = short title)')} value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} />

    <div className="fl-cls fl-cls-edit">
      <span><i>{tr('종류', 'Kind')}</i><KindPicker value={kind} onChange={setKind} compact /></span>
      <span><i>{tr('상태', 'State')}</i>
        <span className="segmented small" role="radiogroup" aria-label={tr('진행', 'Progress')}>
          {(['open', 'active', 'paused', 'done'] as const).map((p) => <button key={p} type="button" role="radio" aria-checked={progress === p} className={progress === p ? 'on' : ''} onClick={() => setProgress(p)}>{PROGRESS[p]()}</button>)}
        </span>
        {progress === 'done' && <span className="segmented small" role="radiogroup" aria-label={tr('결과', 'Result')}>
          {(['solved', 'refuted', 'dropped'] as const).map((r) => <button key={r} type="button" role="radio" aria-checked={result === r} className={result === r ? 'on' : ''} onClick={() => setResult(r)}>{resultName(r, act)}</button>)}
        </span>}
        <label className="check"><input type="checkbox" checked={end} onChange={(e) => setEnd(e.target.checked)} />{tr('갈래 종결', 'Branch closed')}</label>
      </span>
    </div>

    <section className="fl-sec">
      <h3>{tr('설명', 'Description')}</h3>
      <dl className="fl-fields">{shownFields.map((f) => <div key={f}><dt>{FIELD[f]?.() ?? f}{!FLOW_FIELDS[kind].includes(f) && <em> {tr('다른 종류', 'other kind')}</em>}</dt>
        <dd className="fl-field">
          <FigureMenu figs={figs} onPick={(file) => insertFigure(f, file)} onFiles={(xs) => void addFiles(f, xs)} />
          <textarea ref={(el) => { areas.current[f] = el }} className="fl-in" aria-label={FIELD[f]?.() ?? f} rows={Math.min(12, Math.max(2, (fields[f] ?? '').split('\n').length + 1))} value={fields[f] ?? ''}
            onChange={(e) => setFields({ ...fields, [f]: e.target.value })}
            onPaste={(e) => { const xs = [...e.clipboardData.files]; if (xs.length) { e.preventDefault(); void addFiles(f, xs) } }}
            onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault() }}
            onDrop={(e) => { const xs = [...e.dataTransfer.files]; if (xs.length) { e.preventDefault(); void addFiles(f, xs) } }} />
          {/[$]|!\[/.test(fields[f] ?? '') && <div className="fl-preview" data-ui="흐름 설명 미리보기"><FlowText rid={rid} text={fields[f] ?? ''} /></div>}
        </dd></div>)}</dl>
      <p className="fl-help">{tr('글 속 수식 $…$, 줄 수식은 $$…$$를 따로 한 줄에, 빈 줄은 문단을 나눈다. 그림은 칸 오른쪽 위 "그림"으로 넣거나 붙여넣기(⌘V) · 끌어 놓기로 넣는다.', 'Inline math $…$; display math $$…$$ on its own line; a blank line starts a paragraph. Add figures with "Figure" at the top right of a field, or paste (⌘V) or drop them in.')}</p>
    </section>

    <section className="fl-sec" data-ui="흐름 근거 고치기">
      <h3>{tr('근거', 'Evidence')}</h3>
      <datalist id="fl-note-files">{notes.map((x) => <option key={x.file} value={x.file}>{x.title}</option>)}</datalist>
      <div className="fl-evlist">{ev.map((x, i) => <div key={i} className="fl-evrow">
        <select className="fl-in" aria-label={tr('근거 종류', 'Evidence kind')} value={x.kind} onChange={(e) => setEvAt(i, { kind: e.target.value as EvRow['kind'] })}>{FLOW_EVIDENCE.map((k) => <option key={k} value={k}>{EVK[k]()}</option>)}</select>
        <input className="fl-in" aria-label={x.kind === 'paper' ? tr('논문 키', 'Paper key') : tr('노트 경로', 'Note path')} list={x.kind === 'paper' ? undefined : 'fl-note-files'} value={x.src}
          placeholder={x.kind === 'paper' ? tr('논문 키 (예: kitaev2006)', 'Paper key (e.g. kitaev2006)') : tr('노트 경로 (workbench/…)', 'Note path (workbench/…)')} onChange={(e) => setEvAt(i, { src: e.target.value })} />
        <input className="fl-in" aria-label={tr('보이는 이름', 'Shown name')} value={x.title} placeholder={tr('보이는 이름 (비우면 노트 제목)', 'Shown name (empty = note title)')} onChange={(e) => setEvAt(i, { title: e.target.value })} />
        <button type="button" className="icon-btn" title={tr('이 근거 빼기 (확인 기록도 빠짐)', 'Remove this evidence (and its checks)')} aria-label={tr('근거 빼기', 'Remove evidence')} onClick={() => setEv(ev.filter((_, j) => j !== i))}>{Icon.x}</button>
        <input className="fl-in fl-evtext" aria-label={tr('무엇을 보이는지', 'What it shows')} value={x.text} placeholder={tr('이 근거가 무엇을 보이는지', 'What this evidence shows')} onChange={(e) => setEvAt(i, { text: e.target.value })} />
      </div>)}</div>
      <div className="fl-linkrow"><button type="button" className="a" onClick={() => setEv([...ev, { kind: kind === 'calc' || kind === 'analytic' || kind === 'proof' ? kind : 'other', text: '', title: '', src: '' }])}>＋ {tr('근거', 'Evidence')}</button>
        <span className="fl-help">{tr('경로·키가 같은 근거는 AI 검토·사람 승인 기록이 그대로 남습니다.', 'Evidence with the same path or key keeps its AI check and approval records.')}</span></div>
    </section>

    <section className="fl-sec" data-ui="흐름 연결 고치기">
      <h3>{tr('앞선 점', 'Earlier dots')}</h3>
      <ul className="fl-fromlist">{from.map((f, i) => { const m = byId.get(f.id); return <li key={f.id}>
        <select className="fl-in" aria-label={tr('선 종류', 'Line type')} value={f.type} onChange={(e) => setFrom(from.map((g, j) => j === i ? { ...g, type: e.target.value as FlowEdge } : g))}>{FLOW_EDGES.map((x) => <option key={x} value={x}>{EDGE[x]!()}</option>)}</select>
        {m && <MarkIcon n={m} size={16} />}<span className="fl-grow">{m?.short ?? f.id}</span>
        <button type="button" className="icon-btn" title={tr('이 선 빼기', 'Remove this line')} aria-label={tr('선 빼기', 'Remove line')} onClick={() => setFrom(from.filter((_, j) => j !== i))}>{Icon.x}</button>
      </li> })}</ul>
      {!from.length && <span className="muted fl-help">{tr('없음 (시작점)', 'None (start)')}</span>}
      {candidates.length > 0 && <div className="fl-linkrow">
        <select className="fl-in fl-grow" aria-label={tr('이을 점', 'Dot to link')} value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">{tr('이을 점 고르기…', 'Choose a dot to link…')}</option>
          {candidates.map((m) => <option key={m.id} value={m.id}>{m.short}{m.topics.some((x) => tops.includes(x)) ? '' : ` · ${m.topics.map(topicTitle).join(', ')}`}</option>)}
        </select>
        <button type="button" className="btn" disabled={!pick} onClick={() => { setFrom([...from, { id: pick, type: defaultEdge(kind) }]); setPick('') }}>{tr('잇기', 'Link')}</button>
      </div>}
    </section>

    {topics.length > 0 && <section className="fl-sec"><h3>{tr('주제', 'Topics')}</h3>
      <div className="fl-topics">{[...new Set([...topics.map((x) => x.id), ...tops])].map((id) => <label key={id} className="check">
        <input type="checkbox" checked={tops.includes(id)} onChange={(e) => setTops(e.target.checked ? [...tops, id] : tops.filter((x) => x !== id))} />{topicTitle(id)}</label>)}</div>
    </section>}
    {error && <p className="error-text">{error}</p>}
  </article>
}
