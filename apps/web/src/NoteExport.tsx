import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { blockExportUrl, networkApi, noteExportApi, noteExportUrl, type ExportChoice, type ExportOptions, type ManuscriptInfo, type PersonView } from './api'
import { NOTE_KIND_LABEL } from './NewNote'
import { Icon } from './icons'
import { Avatar } from './NetworkPage'
import { t, plural } from './i18n'

/** 목록에서 at번째를 by칸 옮긴 새 목록 */
function moved<T>(list: T[], at: number, by: number): T[] {
  const next = [...list]
  const [x] = next.splice(at, 1)
  next.splice(at + by, 0, x!)
  return next
}

/** 표 한 줄 끝의 ↑ ↓ × (문서 4절: 순서 바꾸기 ↑ ↓, 빼기 ×) */
function RowTools({ at, count, what, onMove, onRemove }: { at: number; count: number; what: string; onMove(by: number): void; onRemove(): void }) {
  return (
    <td className="ex-tools">
      <button className="icon-btn" disabled={at === 0} title={t(`위로 — ${what}에서 한 칸 앞으로`, `Move up one place in the ${what}`)} aria-label={t('위로', 'Move up')} onClick={() => onMove(-1)}>{Icon.up}</button>
      <button className="icon-btn" disabled={at === count - 1} title={t(`아래로 — ${what}에서 한 칸 뒤로`, `Move down one place in the ${what}`)} aria-label={t('아래로', 'Move down')} onClick={() => onMove(1)}>{Icon.down}</button>
      <button className="icon-btn" title={t(`빼기 — 이번 내보내기의 ${what}에서만 빠집니다`, `Remove from the ${what} for this export only`)} aria-label={t('빼기', 'Remove')} onClick={onRemove}>{Icon.x}</button>
    </td>
  )
}

/**
 * 내보낼 저자 (10/4 17:06 "author 줄 순서는 내보내기에서 지정", 18:46 "저자 순서는 표처럼, 저자 더하기는 둘러보며 누르기와 검색 둘 다").
 * 후보는 네트워킹의 사람(저자 정보가 있는 사람 먼저). 처음에는 저자 정보가 있는 사람을 그 차례대로 넣고,
 * 고른 것은 연구마다 이 브라우저에 기억한다.
 */
const memoKey = (rid: string) => `rw.exportAuthors.${rid}`
function useExportAuthors(rid: string, on: boolean) {
  const [pool, setPool] = useState<PersonView[] | null>(null)
  const [order, setOrderState] = useState<string[]>([])
  useEffect(() => {
    if (!on || pool) return
    networkApi.list().then(({ people }) => {
      setPool(people)
      const names = new Set(people.map((p) => p.name))
      let saved: unknown = null
      try { saved = JSON.parse(localStorage.getItem(memoKey(rid)) ?? 'null') } catch { /* 기억이 없으면 저자 목록 차례 그대로 */ }
      setOrderState(Array.isArray(saved) ? saved.filter((n): n is string => typeof n === 'string' && names.has(n)) : people.filter((p) => p.author).map((p) => p.name))
    }).catch(() => setPool([]))
  }, [on, rid, pool])
  const setOrder = (next: string[]) => {
    setOrderState(next)
    try { localStorage.setItem(memoKey(rid), JSON.stringify(next)) } catch { /* 기억하지 못해도 이번에는 그대로 쓴다 */ }
  }
  return { pool, order, setOrder }
}

function AuthorSection({ pool, order, setOrder }: { pool: PersonView[] | null; order: string[]; setOrder(next: string[]): void }) {
  const [query, setQuery] = useState('')
  const byName = useMemo(() => new Map((pool ?? []).map((p) => [p.name, p])), [pool])
  if (!pool) return <p className="muted ex-note">{t('저자 후보를 읽는 중…', 'Loading author candidates…')}</p>
  const q = query.trim().toLowerCase()
  const rest = pool.filter((p) => !order.includes(p.name))
    .filter((p) => !q || [p.name, ...p.aliases, ...p.affiliations, ...p.orgs].some((s) => s.toLowerCase().includes(q)))
  const add = (name: string) => { setOrder([...order, name]); setQuery('') }
  // 둘러보기: 기관별로 묶고, 기관을 모르는 사람은 "네트워킹"에
  const groups = new Map<string, PersonView[]>()
  for (const p of rest) for (const g of p.orgs.length ? p.orgs.slice(0, 1) : [t('네트워킹', 'Networking')]) groups.set(g, [...(groups.get(g) ?? []), p])
  return (
    <div className="ex-sec" data-ui="내보낼 저자">
      <h3 className="ex-h">{t('저자 순서', 'Author order')}</h3>
      {order.length > 0 ? (
        <table className="ex-table">
          <thead><tr><th>{t('순서', 'Order')}</th><th>{t('이름', 'Name')}</th><th>{t('소속', 'Affiliation')}</th><th /></tr></thead>
          <tbody>
            {order.map((name, at) => {
              const p = byName.get(name)
              return (
                <tr key={name}>
                  <td className="ex-n">{at + 1}</td>
                  <td><span className="ex-person"><Avatar name={name} />{name}</span></td>
                  <td className="muted ex-aff" title={p?.affiliations[0]}>{p?.affiliations[0] ?? (p?.author ? '' : t('소속 없음 (네트워킹에서 더함)', 'No affiliation (add it in Networking)'))}</td>
                  <RowTools at={at} count={order.length} what={t('저자 순서', 'author order')} onMove={(by) => setOrder(moved(order, at, by))} onRemove={() => setOrder(order.filter((n) => n !== name))} />
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : <p className="muted ex-note">{t('저자 없이 내보냅니다. 아래에서 더하세요.', 'Exporting without authors. Add them below.')}</p>}
      <div className="ex-add" data-ui="저자 더하기">
        <label className="ex-search">
          {Icon.search}
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('저자 더하기 — 이름이나 기관으로 찾기', 'Add author: search by name or institution')} aria-label={t('저자 찾기', 'Search authors')} data-ui="저자 찾기"
            onKeyDown={(e) => { if (e.key === 'Enter' && q && rest[0]) add(rest[0].name); if (e.key === 'Escape') setQuery('') }} />
          {q && <span className="muted ex-count">{t(`${rest.length}명`, plural(rest.length, 'person', 'people'))}</span>}
        </label>
        <div className="ex-cands">
          {rest.length === 0 && <p className="muted ex-note ex-empty">{q ? t(`"${query.trim()}"에 맞는 사람이 없습니다`, `No one matches "${query.trim()}"`) : t('더할 사람이 없습니다. 네트워킹에서 사람을 더할 수 있습니다', 'No one to add. You can add people in Networking')}</p>}
          {[...groups].map(([g, list]) => (
            <div key={g} className="ex-cgroup">
              <div className="ex-gname">{g} <span className="muted">{list.length}</span></div>
              <div className="ex-cgrid">
                {list.map((p, i) => (
                  <button key={p.name} className={`ex-cand${q && i === 0 && g === [...groups.keys()][0] ? ' first' : ''}`} title={t('더하기 — 저자 순서 끝에 넣습니다', 'Add to the end of the author order')} onClick={() => add(p.name)}>
                    <Avatar name={p.name} />
                    <span className="ex-cname"><b>{p.name}</b><span className="muted">{p.affiliations[0] ?? t('소속 없음', 'No affiliation')}</span></span>
                    <span className="ex-cplus" aria-hidden>{Icon.plus}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * 내보내기 설정 (10/4 16:16, 18:14 반려 "내보낼 때 바로 내보내지 말고 옵션으로 선택: 1. 디자인 템플릿 2. 저자 포함 여부 3. 날짜 등").
 * 서식은 처음에 프로젝트 서식. 저자·날짜는 원고(처음: 저자 넣기, 오늘)와 연구·계산 노트(처음: 저자 없이, 날짜 없이)를 따로 기억한다.
 * 고른 것은 연구마다 이 브라우저에 기억한다 (저자 순서는 위의 기억 그대로).
 */
type Group = 'paper' | 'note'
type DateMode = 'none' | 'today' | 'pick'
interface GroupChoice { withAuthors: boolean; dateMode: DateMode; date: string }
interface Saved { template?: string; paper?: Partial<GroupChoice>; note?: Partial<GroupChoice> }
const DEFAULTS: Record<Group, GroupChoice> = {
  paper: { withAuthors: true, dateMode: 'today', date: '' },
  note: { withAuthors: false, dateMode: 'none', date: '' },
}
const optKey = (rid: string) => `rw.exportOptions.${rid}`
const CHANGED = 'rw-export-options'
function readSaved(rid: string): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(optKey(rid)) ?? 'null') as unknown
    if (v && typeof v === 'object') return v as Saved
  } catch { /* 기억이 없으면 처음 값 */ }
  return {}
}
const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const DATE_MODES: [DateMode, string, string][] = [
  ['none', t('없음', 'None'), t('날짜 줄을 넣지 않습니다', 'No date line')],
  ['today', t('오늘', 'Today'), t('컴파일한 날의 날짜가 들어갑니다', 'Uses the date of the compile')],
  ['pick', t('날짜 지정', 'Pick date'), t('고른 날짜를 그대로 넣습니다', 'Uses the date you pick')],
]

/**
 * 기억해 둔 서식·저자·날짜를 서버에 보낼 꼴로 (컴파일이 쓴다: 컴파일 설정 상자를 열지 않아도 같은 값으로).
 * 기억이 없으면 처음 값: 서식은 서버가 프로젝트 서식으로, 원고는 저자 모두·오늘, 노트는 저자·날짜 없이.
 */
export function savedLatexChoice(rid: string, group: Group): ExportChoice {
  const saved = readSaved(rid)
  const choice: GroupChoice = { ...DEFAULTS[group], ...saved[group] }
  let order: unknown = null
  try { order = JSON.parse(localStorage.getItem(memoKey(rid)) ?? 'null') } catch { /* 기억이 없으면 서버가 저자 목록 차례대로 */ }
  return {
    ...(saved.template && { template: saved.template }),
    ...(choice.withAuthors
      ? Array.isArray(order) && { authors: order.filter((n): n is string => typeof n === 'string') }
      : { authors: [] }),
    date: choice.dateMode === 'pick' ? (choice.date || todayIso()) : choice.dateMode,
  }
}
export const groupOf = (ms: Pick<ManuscriptInfo, 'kind'>): Group => (ms.kind === 'paper' ? 'paper' : 'note')

// on: 서식 목록을 읽을지, authorsOn: 저자 후보를 읽을지 (상자를 열었을 때만)
function useExportChoice(rid: string, group: Group, on: boolean, authorsOn = on) {
  const [saved, setSaved] = useState<Saved>(() => readSaved(rid))
  const [opts, setOpts] = useState<ExportOptions | null>(null)
  // 컴파일 설정과 내보내기 상자가 같은 기억을 쓴다: 한쪽에서 바꾸면 다른 쪽도 다시 읽는다
  useEffect(() => {
    const again = () => setSaved(readSaved(rid))
    window.addEventListener(CHANGED, again)
    return () => window.removeEventListener(CHANGED, again)
  }, [rid])
  useEffect(() => {
    if (!on || opts) return
    noteExportApi.options(rid).then(setOpts).catch(() => setOpts({ template: '', templates: [] }))
  }, [on, rid, opts])
  const choice: GroupChoice = { ...DEFAULTS[group], ...saved[group] }
  const au = useExportAuthors(rid, authorsOn && choice.withAuthors)
  // 고르지 않았을 때: 노트는 노트 서식(한 단), 원고는 프로젝트 서식
  const base = (group === 'note' ? opts?.noteTemplate || opts?.template : opts?.template) ?? ''
  const template = saved.template && opts?.templates.some((t) => t.id === saved.template) ? saved.template : base
  const save = (next: Saved) => {
    setSaved(next)
    try { localStorage.setItem(optKey(rid), JSON.stringify(next)) } catch { /* 기억하지 못해도 이번에는 그대로 쓴다 */ }
    window.dispatchEvent(new Event(CHANGED))
  }
  const setTemplate = (id: string) => save({ ...saved, template: id })
  const setChoice = (patch: Partial<GroupChoice>) => save({ ...saved, [group]: { ...choice, ...patch } })
  /** 처음 값으로: 프로젝트 서식, 이 갈래(원고·노트)의 저자·날짜 처음 값. 저자 순서 기억은 그대로 */
  const reset = () => { const { template: _t, [group]: _g, ...rest } = saved; save(rest) }
  const isDefault = !saved.template && !saved[group]
  const ready = opts !== null && (!choice.withAuthors || au.pool !== null)
  const query: ExportChoice = {
    ...(template && { template }),
    authors: choice.withAuthors ? au.order : [],
    date: choice.dateMode === 'pick' ? (choice.date || todayIso()) : choice.dateMode,
  }
  return { opts, base, template, setTemplate, choice, setChoice, reset, isDefault, au, ready, query }
}

/** 서식·저자·날짜 고르기. 한 줄에 하나씩, 왼쪽에 이름 */
function ExportOptionsForm({ c, title = t('내보내기 설정', 'Export settings') }: { c: ReturnType<typeof useExportChoice>; title?: string }) {
  const { opts, base, template, choice } = c
  return (
    <>
      <div className="ex-sec" data-ui="내보내기 설정">
        <h3 className="ex-h">{title}</h3>
        <div className="ex-opts">
          <span className="ex-label">{t('서식', 'Template')}</span>
          {opts
            ? <select className="ex-select" value={template} onChange={(e) => c.setTemplate(e.target.value)} aria-label={t('내보낼 서식', 'Export template')}>
                {opts.templates.map((tp) => <option key={tp.id} value={tp.id}>{tp.name}{tp.id === base ? t(' (기본)', ' (default)') : ''}</option>)}
              </select>
            : <span className="muted ex-note">{t('서식 목록을 읽는 중…', 'Loading templates…')}</span>}
          <span className="ex-label">{t('저자', 'Authors')}</span>
          <div className="segmented" role="radiogroup" aria-label={t('저자', 'Authors')}>
            {([[false, t('넣지 않음', 'Leave out')], [true, t('넣기', 'Include')]] as const).map(([v, label]) => (
              <button key={label} role="radio" aria-checked={choice.withAuthors === v} className={choice.withAuthors === v ? 'on' : ''} onClick={() => c.setChoice({ withAuthors: v })}>{label}</button>
            ))}
          </div>
          <span className="ex-label">{t('날짜', 'Date')}</span>
          <div className="ex-date-row">
            <div className="segmented" role="radiogroup" aria-label={t('날짜', 'Date')}>
              {DATE_MODES.map(([m, label, title]) => (
                <button key={m} role="radio" aria-checked={choice.dateMode === m} className={choice.dateMode === m ? 'on' : ''} title={title}
                  onClick={() => c.setChoice({ dateMode: m, ...(m === 'pick' && !choice.date && { date: todayIso() }) })}>{label}</button>
              ))}
            </div>
            {choice.dateMode === 'pick' && <input type="date" className="ex-date" aria-label={t('넣을 날짜', 'Date to use')} value={choice.date || todayIso()} onChange={(e) => c.setChoice({ date: e.target.value })} />}
          </div>
        </div>
      </div>
      {choice.withAuthors && <AuthorSection {...c.au} />}
    </>
  )
}

/** 바깥(노트 도구 줄의 ⋯ 메뉴)이 여닫는 상자 */
export interface PopoverControl { open: boolean; setOpen(v: boolean): void }
function usePopover(control?: PopoverControl) {
  const [ownOpen, setOwnOpen] = useState(false)
  const open = control ? control.open : ownOpen
  const setOpen = (v: boolean | ((x: boolean) => boolean)) => { const next = typeof v === 'function' ? v(open) : v; if (control) control.setOpen(next); else setOwnOpen(next) }
  const wrap = useRef<HTMLSpanElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  // 가운데 창으로 띄운다 (10/7 19:49 "우측에 앵커된 상자 대신 중앙 팝업"). 바깥(어두운 바탕)을 누르거나 Esc로 닫힌다
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { const t = e.target as Node; if (!wrap.current?.contains(t) && !pop.current?.contains(t)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 열고 닫힐 때만 바깥 클릭 · Esc를 단다
  }, [open])
  return { open, setOpen, wrap, pop }
}

/** 컴파일 설정 · 내보내기 창: 맨 위 층 가운데, 머리와 아래 버튼은 고정이고 가운데만 스크롤한다 */
function PopDialog({ pop, ui, title, children, foot }: { pop: React.RefObject<HTMLDivElement>; ui: string; title: string; children: React.ReactNode; foot: React.ReactNode }) {
  return createPortal(
    <div className="overlay ex-overlay">
      <div className="ex-pop" ref={pop} role="dialog" aria-modal="true" aria-label={title} data-ui={ui}>
        <span className="ex-title">{title}</span>
        <div className="ex-pop-body">{children}</div>
        <div className="nn-row ex-pop-foot">{foot}</div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * 노트 하나 내보내기: 컴파일되는 LaTeX 폴더 zip (본문만 있는 노트는 서식의 머리를 붙여서).
 * 누르면 바로 받지 않고 서식·저자·날짜를 고르는 상자가 열린다 (10/4 반려). 머리가 있는 노트는 파일을 그대로 묶어 고를 것이 없다고 알린다.
 * small: 카드 오른쪽 위의 아이콘 버튼, icon: 머리줄의 기호 버튼, 둘 다 없으면 글자 버튼.
 */
export type ExportNote = Pick<ManuscriptInfo, 'name' | 'kind' | 'ownHeader'> & ({ key: string } | { block: string })

export function ExportLink({ rid, ms, icon, small, control }: { rid: string; ms: ExportNote; icon?: boolean; small?: boolean
  /** 있으면 단추 없이 바깥(⋯ 메뉴)이 연다 */
  control?: PopoverControl }) {
  const { open, setOpen, wrap, pop } = usePopover(control)
  const c = useExportChoice(rid, groupOf(ms), open && !ms.ownHeader)
  const title = t('그대로 컴파일되는 LaTeX 폴더(zip)로 받습니다. 누르면 서식·저자·날짜를 고릅니다', 'Download a LaTeX folder (zip) that compiles as is. Click to choose template, authors and date')
  const toggle = () => setOpen((v) => !v)
  return (
    <span className="ex-pop-wrap" ref={wrap}>
      {control ? null : small
        ? <button className={`icon-btn${open ? ' on' : ''}`} data-ui="노트 내보내기" aria-label={t('내보내기', 'Export')} aria-expanded={open} title={t(`내보내기 — ${title}`, `Export. ${title}`)} onClick={toggle}>{Icon.download}</button>
        : icon
          ? <button className={`btn btn-icon${open ? ' on' : ''}`} data-ui="노트 내보내기" aria-label={t('내보내기', 'Export')} aria-expanded={open} title={t(`내보내기 — ${title}`, `Export. ${title}`)} onClick={toggle}>{Icon.download}</button>
          : <button className={`a${open ? ' on' : ''}`} data-ui="노트 내보내기" aria-expanded={open} title={title} onClick={toggle}>{t('내보내기', 'Export')}</button>}
      {open && (
        <PopDialog pop={pop} ui="내보내기 저자 고르기" title={t(`${ms.name} 내보내기`, `Export ${ms.name}`)} foot={<>
          {ms.ownHeader || c.ready
            ? <a className="btn primary" href={'block' in ms ? blockExportUrl(rid, ms.block, ms.ownHeader ? {} : c.query) : noteExportUrl(rid, [ms.key], ms.ownHeader ? {} : c.query)} download onClick={() => setOpen(false)}>{t('내보내기', 'Export')}</a>
            : <button className="btn primary" disabled>{t('내보내기', 'Export')}</button>}
          <button className="btn" onClick={() => setOpen(false)}>{t('닫기', 'Close')}</button>
        </>}>
          {ms.ownHeader
            ? <p className="muted ex-note">{t('이 노트에는 머리(\\documentclass …)가 있어 파일을 그대로 묶습니다. 서식·저자·날짜는 노트에 적힌 대로입니다.', 'This note has its own header (\\documentclass …), so the files are packed as they are. Template, authors and date are as written in the note.')}</p>
            : <ExportOptionsForm c={c} />}
        </PopDialog>
      )}
    </span>
  )
}

/**
 * 컴파일 설정 (10/4 20:56 "컴파일시, 템플릿 설정에 대한 기본값을 정해두고, 추가로 원할때 변경하게 하고 싶어").
 * 머리줄의 ▶ 옆 단추에 지금 쓰는 서식 이름이 보이고, 누르면 서식·저자·날짜를 바꾼다. 처음 값은 프로젝트 서식.
 * 고른 것은 연구마다 이 브라우저에 기억해 ▶ 컴파일과 내보내기 상자가 같이 쓴다. 머리가 있는 노트는 고를 것이 없어 단추가 없다.
 */
export function CompileSettings({ rid, ms, disabled, onCompile, control }: { rid: string; ms: Pick<ManuscriptInfo, 'name' | 'kind' | 'ownHeader'>; disabled?: boolean; onCompile(): void; control?: PopoverControl }) {
  const { open, setOpen, wrap, pop } = usePopover(control)
  const c = useExportChoice(rid, groupOf(ms), !ms.ownHeader, open && !ms.ownHeader)
  if (ms.ownHeader) return null
  const name = c.opts?.templates.find((t) => t.id === c.template)?.name ?? t('서식', 'Template')
  return (
    <span className="ex-pop-wrap" ref={wrap}>
      {!control && <button className={`btn cs-btn${open ? ' on' : ''}`} data-ui="컴파일 설정" aria-expanded={open} title={t(`컴파일 설정 — 지금 서식: ${name}. 누르면 서식·저자·날짜를 바꿉니다`, `Compile settings. Current template: ${name}. Click to change template, authors and date`)} onClick={() => setOpen((v) => !v)}>{name}</button>}
      {open && (
        <PopDialog pop={pop} ui="컴파일 설정 상자" title={t(`${ms.name} 컴파일`, `Compile ${ms.name}`)} foot={<>
          <button className="btn primary" disabled={disabled || !c.ready} onClick={() => { setOpen(false); onCompile() }}>{t('컴파일', 'Compile')}</button>
          <button className="btn" disabled={c.isDefault} onClick={c.reset}>{t('기본값으로 되돌리기', 'Reset to defaults')}</button>
          <button className="btn" onClick={() => setOpen(false)}>{t('닫기', 'Close')}</button>
        </>}>
          <ExportOptionsForm c={c} title={t('컴파일 설정', 'Compile settings')} />
          <p className="muted ex-note">{t('고른 것은 이 프로젝트에 기억되어 ▶ 컴파일과 내보내기가 같이 씁니다. 처음 값은 프로젝트 서식입니다.', 'Your choice is remembered for this project and used by both ▶ Compile and Export. The default is the project template.')}</p>
        </PopDialog>
      )}
    </span>
  )
}

/**
 * 노트 골라 한 번에 내보내기 (10/4 사용자 "노트 메인에서는 선택한 노트들을 모아서 한번에 내보내는 것도", 18:46 "고른 노트들의 순서를 조정").
 * 고른 노트는 표에서 배치 순서를 바꾸고, 그 순서대로 main.tex 하나에 모은 LaTeX 폴더(zip)를 받는다.
 * 서식·저자·날짜도 여기서 고른다 (원고가 섞이면 원고의 기억을 따른다).
 */
export function ExportPicker({ rid, manuscripts, onClose }: { rid: string; manuscripts: ManuscriptInfo[]; onClose(): void }) {
  const [picked, setPicked] = useState<string[]>([])
  const byKey = new Map(manuscripts.map((m) => [m.key, m]))
  const rest = manuscripts.filter((m) => !picked.includes(m.key))
  const group: Group = picked.some((k) => byKey.get(k)?.kind === 'paper') ? 'paper' : 'note'
  const c = useExportChoice(rid, group, true)
  return (
    <div className="new-note export-pick" data-ui="노트 골라 내보내기">
      <div className="ex-sec">
        <h3 className="ex-h">{t('문서 배치 순서', 'Document order')}</h3>
        {picked.length > 0 ? (
          <table className="ex-table">
            <thead><tr><th>{t('순서', 'Order')}</th><th>{t('종류', 'Kind')}</th><th>{t('노트', 'Note')}</th><th /></tr></thead>
            <tbody>
              {picked.map((k, at) => {
                const m = byKey.get(k)!
                return (
                  <tr key={k}>
                    <td className="ex-n">{at + 1}</td>
                    <td className="ex-kind"><span className="nk-tag">{NOTE_KIND_LABEL[m.kind]}</span></td>
                    <td>{m.name} <span className="muted ex-path">{m.main}</span></td>
                    <RowTools at={at} count={picked.length} what={t('문서 배치 순서', 'document order')} onMove={(by) => setPicked(moved(picked, at, by))} onRemove={() => setPicked(picked.filter((x) => x !== k))} />
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : <p className="muted ex-note">{t('아래에서 내보낼 노트를 더하세요. 더한 순서대로 한 문서(main.tex)에 배치됩니다.', 'Add notes to export below. They are placed in one document (main.tex) in the order you add them.')}</p>}
        {rest.length > 0 && (
          <div className="ex-group">
            {rest.map((m) => <button key={m.key} className="chip ex-chip" title={t('더하기 — 문서 배치 순서 끝에 둡니다', 'Add to the end of the document order')} onClick={() => setPicked([...picked, m.key])}>＋ {m.name}</button>)}
            {rest.length > 1 && <button className="a" onClick={() => setPicked([...picked, ...rest.map((m) => m.key)])}>{t('모두 더하기', 'Add all')}</button>}
          </div>
        )}
      </div>
      <ExportOptionsForm c={c} />
      <div className="nn-row">
        {picked.length > 0 && c.ready
          ? <a className="btn primary" href={noteExportUrl(rid, picked, c.query)} download data-ui="고른 노트 내보내기">{t(`고른 노트 ${picked.length}개 내보내기`, `Export ${plural(picked.length, 'selected note')}`)}</a>
          : <button className="btn primary" disabled>{t('고른 노트 내보내기', 'Export selected notes')}</button>}
        <button className="btn" onClick={onClose}>{t('닫기', 'Close')}</button>
      </div>
    </div>
  )
}
