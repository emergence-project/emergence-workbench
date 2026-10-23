import { useEffect, useRef, useState } from 'react'
import { ConflictError, LIBRARY_SCOPE, FLOW_EDGES, FLOW_EVIDENCE, FLOW_FIELDS, FLOW_KINDS, FLOW_PRIORITY, FLOW_REQUIRED, flowApi, flowGate, type FlowEdge, type FlowEvidence, type FlowKind, type FlowNode, type FlowProgress, type FlowResult, type FlowSearchReply, type NoteRow } from '../api'
import { forgetFigures, useFigureList } from '../figureEmbed'
import { flash } from '../flash'
import { Icon } from '../icons'
import { t as tr } from '../i18n'
import { KIND, FIELD, FIELD_HINT, END_FIELDS, EDGE, EVK, MarkIcon, PROGRESS, PRIORITY, markOf, resultName } from './marks'
import type { TopicRef } from './data'
import { FlowText } from './evidence'
import { FIGURE_FILE, uploadFigure, FigureMenu } from './figures'
import { flowBy } from './flowBy'

/** 받는 점의 종류로 정하는 기본 선 종류 (서버가 종류 없는 선을 읽는 규칙과 같다) */
const defaultEdge = (k: FlowKind): FlowEdge => k === 'question' ? 'origin' : 'support'

/** 새 점의 처음 값: 앞선 점이 질문이면 증명, 아니면 질문. 주제는 고른 주제, 없으면 첫 앞선 점의 주제 */
export function newDraftNode(from: FlowNode[], topic?: string): FlowNode {
  const kind: FlowKind = from[0] ? (from[0].kind === 'question' ? 'proof' : 'question') : 'question'
  const d = new Date(), p2 = (v: number) => String(v).padStart(2, '0')
  return {
    id: '', file: '', hash: '', kind, progress: 'open', short: '', title: '', topics: topic ? [topic] : from[0]?.topics ?? [],
    date: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`, from: from.map((m) => ({ id: m.id, type: defaultEdge(kind) })),
    fields: {}, evidence: [], steps: [], gaps: [], sources: [], guesses: [], theorem: false, judgments: [],
  }
}

type EvRow = { kind: FlowEvidence['kind']; text: string; title: string; src: string; section: string }
const evRow = (e: FlowEvidence): EvRow => ({ kind: e.kind, text: e.text, title: e.title ?? '', src: e.ref ?? e.file ?? '', section: e.section ?? '' })
type StepRow = { text: string; uses: string }
/** 매개변수 글 "L=800; r=6–32" ↔ 표 */
const paramsText = (p?: Record<string, string>) => Object.entries(p ?? {}).map(([k, v]) => `${k}=${v}`).join('; ')
const paramsOf = (s: string) => Object.fromEntries(s.split(/;|\n/).map((x) => x.trim()).filter(Boolean).map((x) => { const i = x.indexOf('='); return i > 0 ? [x.slice(0, i).trim(), x.slice(i + 1).trim()] : [x, ''] }))
const ACTS: FlowKind[] = ['calc', 'analytic', 'proof']
const STATE: Record<string, () => string> = {
  open: () => tr('미해결', 'open'), active: () => tr('진행', 'in progress'), paused: () => tr('멈춤', 'paused'), solved: () => tr('해결', 'solved'),
  refuted: () => tr('반증', 'refuted'), dropped: () => tr('폐기', 'dropped'), theorem: () => tr('정리', 'theorem'),
}

/** 묶음 머리: 이름과 채운 수 / 칸 수 (10/20 안 A) */
function GroupHead({ title, filled, total }: { title: string; filled: number; total: number }) {
  return <h3 className="fl-grp-h">{title}{total > 0 && <span className="fl-cnt">{filled} / {total}</span>}</h3>
}

/**
 * 점 고치기 (10/20 안 A · 문서형): 자세히와 같은 모양으로, 칸마다 이름이 왼쪽, 빈 칸은 회색 한 줄로 무엇을 적을지,
 * 끝낼 때 꼭 필요한 빈 칸은 이름이 주황. 묶음(계획 · 실행 · 단계 · 끝맺음)마다 채운 수, 맨 아래에 남은 칸.
 * 창이 아니라 자세히가 있던 자리에서 고친다 (10/14 23:15 사용자: 팝업이 아닌 화면에서. docs/design-system.md 6절의 예외)
 */
export function FlowEditor({ rid, n, create, all, notes, topics, onClose, onSaved }: {
  rid: string; n: FlowNode
  /** 새 점: 저장하면 만들고, 만든 점을 onSaved로 돌려준다 */
  create?: boolean
  all: FlowNode[]; notes: NoteRow[]; topics: TopicRef[]; onClose(): void; onSaved(made?: FlowNode): void
}) {
  const [short, setShort] = useState(n.short)
  const [title, setTitle] = useState(n.title)
  const [kind, setKind] = useState(n.kind)
  const [progress, setProgress] = useState(n.progress)
  const [result, setResult] = useState<FlowResult>(n.result ?? 'solved')
  const [end, setEnd] = useState(!!n.end)
  const [fields, setFields] = useState<Record<string, string>>(n.fields)
  const [ev, setEv] = useState<EvRow[]>(n.evidence.map(evRow))
  const [from, setFrom] = useState(n.from)
  const [tops, setTops] = useState(n.topics)
  const [run, setRun] = useState({ code: n.run?.code ?? '', commit: n.run?.commit ?? '', params: paramsText(n.run?.params), output: n.run?.output ?? '' })
  const [steps, setSteps] = useState<StepRow[]>(n.steps.map((x) => ({ text: x.text, uses: x.uses ?? '' })))
  const [reason, setReason] = useState(n.reason ?? '')
  const [next, setNext] = useState(n.next ?? '')
  const [priority, setPriority] = useState(n.priority ?? '')
  const [pick, setPick] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const figs = (useFigureList()?.figures ?? []).filter((f) => f.scope === rid || f.scope === LIBRARY_SCOPE)
  /** 설명 칸마다 글 칸 (그림을 커서 자리에 넣으려고) */
  const areas = useRef<Record<string, HTMLTextAreaElement | null>>({})
  const act = KIND[kind].act
  const shownFields = [...FLOW_FIELDS[kind], ...Object.keys(fields).filter((f) => !FLOW_FIELDS[kind].includes(f) && fields[f]?.trim())]
  const planFields = shownFields.filter((f) => !END_FIELDS.includes(f)), endFields = shownFields.filter((f) => END_FIELDS.includes(f))
  const required = new Set<string>(FLOW_REQUIRED[kind])
  const showRun = kind === 'calc' || Object.values(run).some((v) => v.trim())
  const showSteps = kind === 'proof' || steps.length > 0
  const stopped = progress === 'paused' || (progress === 'done' && result !== 'solved')
  const showReason = stopped || !!reason.trim()
  const byId = new Map(all.map((m) => [m.id, m]))
  const candidates = all.filter((m) => m.id !== n.id && !from.some((f) => f.id === m.id))
    .sort((a, b) => Number(!a.topics.some((x) => tops.includes(x))) - Number(!b.topics.some((x) => tops.includes(x))) || a.short.localeCompare(b.short))
  const topicTitle = (id: string) => topics.find((x) => x.id === id)?.title ?? id
  const setEvAt = (i: number, p: Partial<EvRow>) => setEv(ev.map((x, j) => j === i ? { ...x, ...p } : x))
  const setStepAt = (i: number, p: Partial<StepRow>) => setSteps(steps.map((x, j) => j === i ? { ...x, ...p } : x))

  // 해결 문턱 (서버와 같은 검사): 끝냄 · 멈춤으로 넘어갈 때 모자란 칸
  const missing = flowGate({
    kind, progress, result: progress === 'done' ? result : undefined, fields, reason, run: { code: run.code, params: {} },
    evidence: ev.map((x) => ({ ...(x.kind === 'paper' ? { ref: x.src.trim() || undefined } : {}), section: x.section.trim() || undefined })),
    from, steps: steps.map((x) => ({ uses: x.uses })),
  }, create ? undefined : n)
  const need = (f: string) => required.has(f) && !fields[f]?.trim() && (progress === 'done' || progress === 'active')

  // 비슷한 지난 시도 (10/20 목적 4: 같은 계산 · 증명을 되풀이하지 않게): 새 행위 점에서 짧은 제목 · 목적의 낱말로 찾는다
  const [similar, setSimilar] = useState<FlowSearchReply['rows']>([])
  const words = `${short} ${fields.goal ?? ''}`.trim()
  useEffect(() => {
    if (!create || !ACTS.includes(kind) || words.length < 2) { setSimilar([]); return }
    const timer = setTimeout(() => { flowApi(rid).search(words).then((rows) => setSimilar(rows.slice(0, 3)), () => setSimilar([])) }, 350)
    return () => clearTimeout(timer)
  }, [create, kind, rid, words])

  const save = async () => {
    if (!short.trim()) return setError(tr('짧은 제목을 적어 주세요.', 'Enter a short title.'))
    const bad = ev.findIndex((x) => !x.src.trim())
    if (bad >= 0) return setError(tr(`근거 ${bad + 1}에 노트 경로나 논문 키를 적어 주세요.`, `Evidence ${bad + 1} needs a note path or a paper key.`))
    if (missing.length) return setError(tr(`끝내기 전에 채울 칸: ${missing.join(' · ')}`, `Fill these before finishing: ${missing.join(' · ')}`))
    setBusy(true); setError(null)
    const params = paramsOf(run.params)
    const hasRun = !!(run.code.trim() || run.commit.trim() || run.output.trim() || Object.keys(params).length)
    const set = {
      short: short.trim(), title: title.trim() || short.trim(), kind, progress, result: progress === 'done' ? result : null, end, topics: tops, from,
      fields: Object.fromEntries(Object.entries(fields).filter(([k]) => shownFields.includes(k)).map(([k, v]) => [k, v])),
      evidence: ev.map((x) => ({ kind: x.kind, text: x.text, ...(x.title.trim() && { title: x.title.trim() }), ...(x.kind === 'paper' ? { ref: x.src.trim() } : { file: x.src.trim(), ...(x.section.trim() && { section: x.section.trim() }) }) })),
      run: hasRun ? { ...(run.code.trim() && { code: run.code.trim() }), ...(run.commit.trim() && { commit: run.commit.trim() }), ...(Object.keys(params).length && { params }), ...(run.output.trim() && { output: run.output.trim() }) } : null,
      steps: steps.filter((x) => x.text.trim()).map((x) => ({ text: x.text.trim(), ...(x.uses.trim() && { uses: x.uses.trim() }) })),
      reason: reason.trim(), next: next.trim(), priority: (priority || null) as FlowNode['priority'] | null,
    }
    try {
      if (!create) { await flowApi(rid).patch(n.id, n.hash, set, true); return onSaved() }
      // 만들기가 받는 칸으로 만들고, 나머지(설명·근거·결과·흐름 종료)가 있으면 이어서 고친다. 시작일 · 한 이는 서버가 적는다 (10/21)
      const made = await flowApi(rid).create({ kind, short: set.short, title: set.title, progress: progress === 'done' || progress === 'paused' ? 'active' : progress, ...(tops.length && { topics: tops }), ...(from.length && { from }) })
      const more = end || progress !== made.progress || set.evidence.length > 0 || hasRun || set.steps.length > 0 || !!(set.reason || set.next || set.priority) || Object.values(set.fields).some((v) => v.trim())
      if (more) await flowApi(rid).patch(made.id, made.hash, set, true).catch((e: Error) => flash(tr(`점은 만들었지만 나머지 칸을 저장하지 못했습니다: ${e.message}`, `The dot was created, but the other fields were not saved: ${e.message}`)))
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
  /** 설명 칸 하나: 이름(필요한 빈 칸은 주황) · 밑줄 글 칸(빈 칸은 회색 안내) · 그림 ▾ */
  const fieldRow = (f: string) => <div key={f}><dt className={need(f) ? 'need' : undefined}>{FIELD[f]?.() ?? f}{!FLOW_FIELDS[kind].includes(f) && <em> {tr('다른 종류', 'other kind')}</em>}</dt>
    <dd className="fl-field">
      <FigureMenu figs={figs} onPick={(file) => insertFigure(f, file)} onFiles={(xs) => void addFiles(f, xs)} />
      <textarea ref={(el) => { areas.current[f] = el }} className="fl-in" aria-label={FIELD[f]?.() ?? f} placeholder={FIELD_HINT[f]?.()} rows={Math.min(12, Math.max(1, (fields[f] ?? '').split('\n').length))} value={fields[f] ?? ''}
        onChange={(e) => setFields({ ...fields, [f]: e.target.value })}
        onPaste={(e) => { const xs = [...e.clipboardData.files]; if (xs.length) { e.preventDefault(); void addFiles(f, xs) } }}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault() }}
        onDrop={(e) => { const xs = [...e.dataTransfer.files]; if (xs.length) { e.preventDefault(); void addFiles(f, xs) } }} />
      {/[$]|!\[/.test(fields[f] ?? '') && <div className="fl-preview" data-ui="흐름 설명 미리보기"><FlowText rid={rid} text={fields[f] ?? ''} /></div>}
    </dd></div>
  const filled = (fs: string[]) => fs.filter((f) => fields[f]?.trim()).length
  const line = (label: string, value: string, set: (v: string) => void, hint: string, opt?: { mono?: boolean; needed?: boolean; ui?: string }) =>
    <div><dt className={opt?.needed && !value.trim() ? 'need' : undefined}>{label}</dt>
      <dd><input className={`fl-in fl-line${opt?.mono ? ' mono' : ''}`} aria-label={label} placeholder={hint} value={value} maxLength={500} onChange={(e) => set(e.target.value)} /></dd></div>

  // 저장 · 취소는 머리 줄에만 (10/16 사용자 승인)
  const buttons = <>
    <button className="btn" onClick={onClose}>{tr('취소', 'Cancel')}</button>
    <button className="btn primary" disabled={busy} onClick={() => void save()}>{create ? tr('만들기', 'Create') : tr('저장', 'Save')}</button>
  </>
  const shown = { ...n, kind, progress, result: progress === 'done' ? result : undefined, fields }

  return <article className={`fl-card fl-editing${create ? ' fl-new' : ''}`} data-ui={create ? '흐름 새 점 창' : '흐름 점 고치기 창'} aria-label={create ? tr('새 점', 'New dot') : tr('점 고치기', 'Edit dot')}
    onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
    <div className="fl-head"><MarkIcon n={shown} size={30} />
      <input className="fl-in fl-short fl-grow" autoFocus aria-label={tr('짧은 제목', 'Short title')} placeholder={tr('짧은 제목', 'Short title')} value={short} maxLength={60} onChange={(e) => setShort(e.target.value)} />
      <span className="fl-tools">{buttons}</span></div>
    <input className="fl-in fl-full" aria-label={tr('제목', 'Title')} placeholder={tr('제목 (비우면 짧은 제목)', 'Title (empty = short title)')} value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} />

    {/* 종류 · 진행 · 결과는 이름을 단 작은 고르기 칸으로 (10/20 안 A, 10/21 칸 이름). 시작일 · 끝난 날 · 한 이는 앱이 적고 읽기만 한다 (10/21) */}
    <div className="fl-chips" data-ui="흐름 종류 고르기">
      <label className="fl-chip-l"><span>{tr('종류', 'Kind')}</span><select className="fl-chip" title={KIND[markOf(shown)].def()} value={kind} onChange={(e) => setKind(e.target.value as FlowKind)}>
        {FLOW_KINDS.map((k) => <option key={k} value={k}>{KIND[k].name()}</option>)}</select></label>
      <label className="fl-chip-l"><span>{tr('진행', 'Progress')}</span><select className="fl-chip" value={progress} onChange={(e) => setProgress(e.target.value as FlowProgress)}>
        {(['open', 'active', 'paused', 'done'] as const).map((p) => <option key={p} value={p}>{PROGRESS[p]()}</option>)}</select></label>
      {progress === 'done' && <label className="fl-chip-l"><span>{tr('결과', 'Result')}</span><select className="fl-chip" value={result} onChange={(e) => setResult(e.target.value as FlowResult)}>
        {(['solved', 'refuted', 'dropped'] as const).map((r) => <option key={r} value={r}>{resultName(r, act)}</option>)}</select></label>}
      <label className="check" title={tr('이 갈래는 여기서 끝나 뒤에 이어질 점이 없다는 표시. 켜면 흐름 화면이 "다음 점 없음"을 빈틈으로 알리지 않습니다', 'Marks that this branch ends here and no dot follows. When on, the flow does not flag "no next dot" as a gap')}><input type="checkbox" checked={end} onChange={(e) => setEnd(e.target.checked)} />{tr('흐름 종료', 'Flow ends')}</label>
      <FlowDates n={n} create={create} />
    </div>

    {similar.length > 0 && <div className="fl-similar" data-ui="흐름 비슷한 지난 시도">
      <b>{tr(`비슷한 지난 시도 ${similar.length}`, `${similar.length} similar earlier attempts`)}</b>
      {similar.map((x) => <span key={x.id}>{KIND[x.kind].name()} · {x.short} · {STATE[x.state]?.() ?? x.state}{x.params && ` · ${Object.entries(x.params).map(([k, v]) => `${k} ${v}`).join(', ')}`}{x.reason && ` · ${x.reason}`}</span>)}
    </div>}

    <section className="fl-sec">
      <GroupHead title={tr('계획', 'Plan')} filled={filled(planFields)} total={planFields.length} />
      <dl className="fl-fields">{planFields.map(fieldRow)}</dl>
      <p className="fl-help">{tr('글 속 수식 $…$, 줄 수식은 $$…$$를 따로 한 줄에, 빈 줄은 문단을 나눈다. 그림은 칸 오른쪽 위 "그림"으로 넣거나 붙여넣기(⌘V) · 끌어 놓기로 넣는다.', 'Inline math $…$; display math $$…$$ on its own line; a blank line starts a paragraph. Add figures with "Figure" at the top right of a field, or paste (⌘V) or drop them in.')}</p>
    </section>

    {showRun && <section className="fl-sec" data-ui="흐름 실행 고치기">
      <GroupHead title={tr('실행', 'Run')} filled={[run.code, run.commit, run.params, run.output].filter((v) => v.trim()).length} total={4} />
      <dl className="fl-fields">
        {line(tr('코드', 'Code'), run.code, (v) => setRun({ ...run, code: v }), tr('계산한 코드 파일 경로', 'Path of the code that ran'), { mono: true, needed: kind === 'calc' && progress === 'done' })}
        {line(tr('커밋', 'Commit'), run.commit, (v) => setRun({ ...run, commit: v }), tr('그 코드의 커밋', 'Commit of that code'), { mono: true })}
        {line(tr('매개변수', 'Parameters'), run.params, (v) => setRun({ ...run, params: v }), tr('이름=값; 이름=값 (예: L=800; r=6–32)', 'name=value; name=value (e.g. L=800; r=6–32)'))}
        {line(tr('결과 파일', 'Output'), run.output, (v) => setRun({ ...run, output: v }), tr('계산이 남긴 표 · 그림 경로', 'Table or figure the run left'), { mono: true })}
      </dl>
    </section>}

    {showSteps && <section className="fl-sec" data-ui="흐름 단계 고치기">
      <GroupHead title={tr('증명 단계', 'Proof steps')} filled={steps.filter((x) => x.text.trim() && x.uses.trim()).length} total={steps.length} />
      <ol className="fl-steps-edit">{steps.map((x, i) => <li key={i}>
        <span className="fl-stepno">{i + 1}</span>
        <div className="fl-grow">
          <textarea className="fl-in" aria-label={tr(`단계 ${i + 1}`, `Step ${i + 1}`)} placeholder={tr('이 단계에서 보이는 것', 'What this step shows')} rows={Math.max(1, x.text.split('\n').length)} value={x.text} onChange={(e) => setStepAt(i, { text: e.target.value })} />
          <input className={`fl-in fl-line${!x.uses.trim() ? ' fl-need-in' : ''}`} aria-label={tr(`단계 ${i + 1}이 쓰는 것`, `What step ${i + 1} uses`)} placeholder={tr('쓰는 것: 가정 · 앞 단계 · 공리 · 논문 (예: 가정 1, 단계 2)', 'Uses: assumptions, earlier steps, axioms, papers (e.g. assumption 1, step 2)')} value={x.uses} onChange={(e) => setStepAt(i, { uses: e.target.value })} />
        </div>
        <button type="button" className="icon-btn" title={tr('이 단계 빼기 (확인 기록도 빠짐)', 'Remove this step (and its checks)')} aria-label={tr('단계 빼기', 'Remove step')} onClick={() => setSteps(steps.filter((_, j) => j !== i))}>{Icon.x}</button>
      </li>)}</ol>
      <div className="fl-linkrow"><button type="button" className="a" onClick={() => setSteps([...steps, { text: '', uses: '' }])}>＋ {tr('단계', 'Step')}</button>
        <span className="fl-help">{tr('단계마다 무엇을 쓰는지 적어야 끝낼 수 있습니다. 단계마다 AI 검토 · 사람 승인을 받습니다.', 'Each step needs what it uses before the proof can finish. Each step gets its own AI check and approval.')}</span></div>
    </section>}

    <section className="fl-sec" data-ui="흐름 끝맺음 고치기">
      <GroupHead title={tr('끝맺음', 'Outcome')} filled={filled(endFields) + [showReason ? reason : null, next].filter((v) => v?.trim()).length} total={endFields.length + (showReason ? 1 : 0) + 1} />
      <dl className="fl-fields">
        {endFields.map(fieldRow)}
        {showReason && <div><dt className={stopped && !reason.trim() ? 'need' : undefined}>{tr('이유', 'Reason')}</dt>
          <dd><textarea className="fl-in" aria-label={tr('이유', 'Reason')} placeholder={tr('왜 멈추거나 반증 · 폐기했나 (다시 하지 않게)', 'Why it paused, failed or was dropped (so it is not repeated)')} rows={Math.max(1, reason.split('\n').length)} value={reason} onChange={(e) => setReason(e.target.value)} /></dd></div>}
        <div><dt>{tr('다음 할 일', 'Next')}</dt>
          <dd className="fl-next-in"><input className="fl-in fl-line fl-grow" aria-label={tr('다음 할 일', 'Next')} placeholder={tr('이어서 할 것 (뒤따른 점이 없을 때)', 'What comes next (when no dot follows yet)')} value={next} maxLength={2000} onChange={(e) => setNext(e.target.value)} />
            <select className="fl-chip" aria-label={tr('우선', 'Priority')} value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
              <option value="">{tr('우선 —', 'Priority —')}</option>
              {FLOW_PRIORITY.map((p) => <option key={p} value={p}>{PRIORITY[p]()}</option>)}</select></dd></div>
      </dl>
    </section>

    <section className="fl-sec" data-ui="흐름 근거 고치기">
      <h3>{tr('근거', 'Evidence')}</h3>
      <datalist id="fl-note-files">{notes.map((x) => <option key={x.file} value={x.file}>{x.title}</option>)}</datalist>
      <div className="fl-evlist">{ev.map((x, i) => <div key={i} className="fl-evrow">
        <select className="fl-in" aria-label={tr('근거 종류', 'Evidence kind')} value={x.kind} onChange={(e) => setEvAt(i, { kind: e.target.value as EvRow['kind'] })}>{FLOW_EVIDENCE.map((k) => <option key={k} value={k}>{EVK[k]()}</option>)}</select>
        <input className="fl-in" aria-label={x.kind === 'paper' ? tr('논문 키', 'Paper key') : tr('노트 경로', 'Note path')} list={x.kind === 'paper' ? undefined : 'fl-note-files'} value={x.src}
          placeholder={x.kind === 'paper' ? tr('논문 키 (예: kitaev2006)', 'Paper key (e.g. kitaev2006)') : tr('노트 경로 (workbench/…)', 'Note path (workbench/…)')} onChange={(e) => setEvAt(i, { src: e.target.value })} />
        {x.kind === 'paper' ? <input className="fl-in" aria-label={tr('보이는 이름', 'Shown name')} value={x.title} placeholder={tr('보이는 이름 (비우면 키)', 'Shown name (empty = key)')} onChange={(e) => setEvAt(i, { title: e.target.value })} />
          : <input className="fl-in" aria-label={tr('절', 'Section')} value={x.section} placeholder={tr('절 (노트 안의 제목 이름)', 'Section (a heading in the note)')} onChange={(e) => setEvAt(i, { section: e.target.value })} />}
        <button type="button" className="icon-btn" title={tr('이 근거 빼기 (확인 기록도 빠짐)', 'Remove this evidence (and its checks)')} aria-label={tr('근거 빼기', 'Remove evidence')} onClick={() => setEv(ev.filter((_, j) => j !== i))}>{Icon.x}</button>
        <input className="fl-in fl-evtext" aria-label={tr('무엇을 보이는지', 'What it shows')} value={x.text} placeholder={tr('이 근거가 무엇을 보이는지', 'What this evidence shows')} onChange={(e) => setEvAt(i, { text: e.target.value })} />
      </div>)}</div>
      <div className="fl-linkrow"><button type="button" className="a" onClick={() => setEv([...ev, { kind: ACTS.includes(kind) ? kind as EvRow['kind'] : 'other', text: '', title: '', src: '', section: '' }])}>＋ {tr('근거', 'Evidence')}</button>
        <span className="fl-help">{tr('절을 적으면 그 절이 바뀔 때 확인이 낡았다고 보입니다. 경로 · 키가 같은 근거는 확인 기록이 그대로 남습니다.', 'With a section, a check shows as outdated when that section changes. Evidence with the same path or key keeps its check records.')}</span></div>
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
    {missing.length > 0 && <p className="fl-gate" data-ui="흐름 남은 칸">{tr(`끝내기 전에 채울 칸 ${missing.length}: ${missing.join(' · ')}`, `${missing.length} left before finishing: ${missing.join(' · ')}`)}</p>}
    {error && <p className="error-text">{error}</p>}
  </article>
}

/** 시작일 · 끝난 날 · 한 이: 앱이 적고 고치기 창에서는 읽기만 (10/21 피드백 09:21) */
function FlowDates({ n, create }: { n: FlowNode; create?: boolean }) {
  return <span className="fl-dates" data-ui="흐름 날짜">
    <span><i>{tr('시작일', 'Started')}</i>{create ? tr('만들면 오늘', 'today on create') : n.date ?? tr('저장하면 오늘', 'today on save')}</span>
    {n.ended && <span><i>{tr('끝난 날', 'Ended')}</i>{n.ended}</span>}
    {!create && n.by && <span><i>{tr('한 이', 'By')}</i>{flowBy(n.by)}</span>}
  </span>
}
