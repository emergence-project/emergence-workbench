import { useEffect, useState, type ReactNode } from 'react'
import { ConflictError, notesApi, type NoteCategory, type NoteHeadPatch, type NoteLinks, type NoteRow, type ProjectKind, type Topic, LIMITS } from './api'
import { descriptionLines, MathText } from './cardParts'
import { useConceptMacros } from './conceptMacros'
import { Icon } from './icons'
import { LOOSE_NOTES_LABEL, NO_KIND_LABEL, NOTE_KIND_LABEL, noteKindChoices } from './noteKinds'
import { headWriterOf, setRightMode, setRightSlot, useRightMode, type RightMode } from './noteScreen'
import { go, type Route } from './router'
import { StatusDot } from './StatusDot'
import { store } from './store'
import { t } from './i18n'

/** 오른쪽 사이드바: 정보 | 적기. 갈래를 바꿔도 적던 내용은 남긴다. */
export function RightSidebar({ info, records }: { info: ReactNode; records: ReactNode }) {
  const mode = useRightMode()
  const modes: [RightMode, string][] = [['info', t('정보', 'Info')], ['records', t('기록', 'Records')]]
  return (
    <div className="rs" data-ui="오른쪽 사이드바">
      <div className="rs-head">
        <div className="segmented small" role="tablist" aria-label={t('오른쪽 사이드바 갈래', 'Right sidebar view')} data-ui="오른쪽 사이드바 갈래">
          {modes.map(([m, label]) => <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => setRightMode(m)}>{label}</button>)}
        </div>
      </div>
      {mode === 'info' && <div className="rs-scroll">{info}</div>}
      <div className="rs-col" hidden={mode !== 'records'}>{records}</div>
    </div>
  )
}

/** 노트를 여는 주소: 보조 노트는 블록 화면, 연구노트·계산 노트는 본문 파일 */
export const routeOfNote = (rid: string, n: Pick<NoteRow, 'type' | 'id' | 'file'>): Route =>
  n.type === 'block' ? { page: 'block', rid, bid: n.id } : { page: 'part', rid, file: n.file }

/** 설명 글자 수 (줄바꿈은 세지 않는다, 서버와 같게) */
const lengthOf = (s: string) => s.replace(/\n/g, '').length

/** 접어 둔 칸 (data-ui 이름). 이 브라우저에 기억해 다른 노트를 열어도 접힌 채다 */
const FOLD_KEY = 'rw-rs-folded'
const foldedNow = () => new Set(store.get<string[]>(FOLD_KEY, []))

/**
 * 칸 하나: 이름 옆 개수(또는 짧은 도움말), 칸마다 접을 수 있다 (10/5 시안 "오른쪽 사이드바").
 * actions는 이름 줄 오른쪽 버튼(예: 설명 고치기 연필)으로, 눌러도 칸이 접히지 않는다
 */
function Section({ label, count, hint, actions, className, children, ui }: {
  label: string; count?: number; hint?: string; actions?: ReactNode; className?: string; children: ReactNode; ui: string
}) {
  const [open, setOpen] = useState(() => !foldedNow().has(ui))
  const toggle = (next: boolean) => {
    setOpen(next)
    const f = foldedNow()
    if (next) f.delete(ui); else f.add(ui)
    store.set(FOLD_KEY, [...f])
  }
  return (
    <details className={`rs-sec${className ? ` ${className}` : ''}`} open={open} data-ui={ui} onToggle={(e) => { const o = (e.currentTarget as HTMLDetailsElement).open; if (o !== open) toggle(o) }}>
      <summary className="rs-label" title={hint}>
        {label}{count !== undefined && <span className="rs-n">· {count}</span>}
        {actions && <span className="rs-sec-act" onClick={(e) => e.preventDefault()}>{actions}</span>}
        <span className="chev" aria-hidden>›</span>
      </summary>
      <div className="rs-sec-body">{children}</div>
    </details>
  )
}

/**
 * 설명 글: 카드와 똑같이 그린다 (`$…$` 안은 KaTeX, "- " 줄은 글머리표).
 * 공유 기호 파일의 정의를 쓰고, 그래도 그리지 못하는 수식 조각은 뺀다 — 메모용 그리개는 기호 정의를 읽지 않아 `\Kempe` 같은 명령이 빨간 글로 남았다.
 */
function DescriptionText({ text }: { text: string }) {
  const macros = useConceptMacros()
  return (
    <div className="rs-desc-text">
      {descriptionLines(text).map((l, i) => <div key={i} className={l.bullet ? 'b' : ''}><MathText text={l.text} macros={macros} dropBad /></div>)}
    </div>
  )
}

/** 5개까지 보이고 나머지는 "N개 더 보기"로 그 자리에서 편다 */
function MoreList<T>({ items, render, empty }: { items: T[]; render(x: T): ReactNode; empty: string }) {
  const [all, setAll] = useState(false)
  if (!items.length) return <p className="muted rs-empty">{empty}</p>
  const shown = all ? items : items.slice(0, 5)
  return <>
    <ul className="rs-list">{shown.map((x, i) => <li key={i}>{render(x)}</li>)}</ul>
    {items.length > 5 && !all && <button className="a rs-more" onClick={() => setAll(true)}>{t(`${items.length - 5}개 더 보기`, `Show ${items.length - 5} more`)}</button>}
  </>
}

/** 정보 갈래: 상태와 다시 열 조건 · 성격 · 주제 · 설명 · 개념노트(본문에 쓴 것) · 이 노트를 인용한 노트 · 맨 아래 파일 경로 */
export function NoteInfo({ rid, row, topics, projectKind, version, onChanged, onSaved, slot }: {
  rid: string; row: NoteRow; topics: Topic[]
  /** 프로젝트 성격: 업무 프로젝트면 노트 성격에 설계를 더한다 */
  projectKind: ProjectKind
  version: number
  onChanged(): void; onSaved(m: string): void
  /** 노트 화면이 그려 넣는 칸이 있는지 (보조 노트의 연결) */
  slot?: boolean
}) {
  const [links, setLinks] = useState<NoteLinks | null>(null)
  useEffect(() => { notesApi(rid).links(row.file).then(setLinks).catch(() => setLinks(null)) }, [rid, row.file, version])
  const [desc, setDesc] = useState<string | null>(null)
  useEffect(() => setDesc(null), [row.file])
  /** 머리말 고치기. 보조 노트가 열려 있으면 그 화면이 맡는다(고치던 본문을 먼저 저장하고 편집기에 반영). 됐으면 true */
  const patch = (p: NoteHeadPatch, message: string): Promise<boolean> => {
    const writer = headWriterOf(rid, row.file)
    return (writer ? writer(p) : notesApi(rid).setHead(row.file, p, row.hash)).then(() => { onChanged(); onSaved(message); return true })
      .catch((e: Error) => { onSaved(e instanceof ConflictError ? t('다른 곳에서 노트 정보가 바뀌어 고치지 않았습니다. 다시 해 주세요.', 'The note info changed elsewhere, so nothing was changed. Try again.') : e.message); return false })
  }
  /** 설명 저장: 저장된 뒤에만 입력 칸을 닫는다 (실패하면 적던 글이 남는다) */
  const saveDesc = (v: string) => { void patch({ description: v }, t('설명을 적었습니다', 'Saved the description')).then((ok) => { if (ok) setDesc((d) => (d === v ? null : d)) }) }
  const titleOfTopic = (id: string) => topics.find((t) => t.id === id)?.title ?? id
  const rest = topics.filter((t) => !row.topics.includes(t.id))
  const moveUp = (i: number) => { const next = [...row.topics]; [next[i - 1], next[i]] = [next[i]!, next[i - 1]!]; void patch({ topics: next }, i === 1 ? t(`주 주제를 "${titleOfTopic(next[0]!)}"로 바꿨습니다`, `Main topic is now "${titleOfTopic(next[0]!)}"`) : t('주제 순서를 바꿨습니다', 'Changed the topic order')) }
  return (
    <div className="note-info" data-ui="노트 정보">
      <Section label={t('상태', 'Status')} ui="상태">
        <div><StatusDot s={row.status} label />{row.resume && <span className="rs-resume">{t(' · 다시 열 조건: ', ' · Reopen when: ')}{row.resume}</span>}</div>
      </Section>
      <Section label={t('성격', 'Kind')} ui="성격">
        <select id="rs-kind" aria-label={t('성격', 'Kind')} className="rs-select" value={row.kind ?? ''} title={row.kindAuto ? t('적지 않아 폴더(calc/)에서 정한 성격입니다', 'Not set, so the kind comes from the folder (calc/)') : undefined}
          onChange={(e) => { const k = (e.target.value || null) as NoteCategory | null; void patch({ kind: k }, t(`성격: ${k ? NOTE_KIND_LABEL[k] : NO_KIND_LABEL}`, `Kind: ${k ? NOTE_KIND_LABEL[k] : NO_KIND_LABEL}`)) }}>
          <option value="">{NO_KIND_LABEL}</option>
          {[...new Set([...noteKindChoices(projectKind), ...(row.kind ? [row.kind] : [])])].map((k) => <option key={k} value={k}>{NOTE_KIND_LABEL[k]}</option>)}
        </select>
      </Section>
      <Section label={t('주제', 'Topics')} hint={t('첫 번째 주제가 주 주제입니다', 'The first topic is the main topic')} ui="주제">
        <div className="rs-chips">
          {row.topics.map((id, i) => (
            <span key={id} className="tag rs-topic" data-ui="주제 이름표" data-ui-item={titleOfTopic(id)}>
              <button type="button" className="a" title={t('주제 화면으로', 'Go to topic')} onClick={() => go({ page: 'topic', rid, tid: id })}>{titleOfTopic(id)}</button>
              {i > 0 && <button className="x" title={t('위로 — 앞에 두면 주 주제', 'Move up. The first one is the main topic')} aria-label={t(`위로: ${titleOfTopic(id)}`, `Move up: ${titleOfTopic(id)}`)} onClick={() => moveUp(i)}>↑</button>}
              <button className="x" title={t('빼기', 'Remove')} aria-label={t(`빼기: ${titleOfTopic(id)}`, `Remove: ${titleOfTopic(id)}`)} onClick={() => void patch({ topics: row.topics.filter((x) => x !== id) }, t(`주제에서 뺐습니다: ${titleOfTopic(id)}`, `Removed from topic: ${titleOfTopic(id)}`))}>×</button>
            </span>
          ))}
          {row.topics.length === 0 && <span className="muted" title={t(`주제에 넣지 않은 노트는 ${LOOSE_NOTES_LABEL}에 모입니다`, `Notes without a topic are gathered in ${LOOSE_NOTES_LABEL}`)}>{t('없음', 'None')}</span>}
          {rest.length > 0 && (
            <select className="rs-select rs-add" value="" aria-label={t('주제 더하기', 'Add topic')} onChange={(e) => e.target.value && void patch({ topics: [...row.topics, e.target.value] }, t(`주제에 넣었습니다: ${titleOfTopic(e.target.value)}`, `Added to topic: ${titleOfTopic(e.target.value)}`))}>
              <option value="">{t('＋ 더하기…', '＋ Add…')}</option>
              {rest.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          )}
        </div>
      </Section>
      <Section label={t('설명', 'Description')} ui="설명" className="rs-desc"
        actions={desc === null && <span className="hover-actions rs-desc-act"><button className="icon-btn" title={t('고치기 — 설명', 'Edit description')} aria-label={t('고치기 — 설명', 'Edit description')} onClick={() => setDesc(row.descriptionAuto ? '' : row.description ?? '')}>{Icon.pencil}</button></span>}>
        {desc === null
          ? row.description
            ? <div className={row.descriptionAuto ? 'muted' : ''} title={row.descriptionAuto ? t('적은 설명이 없어 본문 첫 문단에서 뽑았습니다', 'No description written, so the first paragraph is used') : undefined}><DescriptionText text={row.description} /></div>
            : <p className="muted rs-empty" title={t('연필을 눌러 설명을 적습니다', 'Click the pencil to write a description')}>{t('없음', 'None')}</p>
          : <>
            <textarea className="rs-desc-input" autoFocus rows={4} value={desc} aria-label={t('설명', 'Description')} placeholder={t('여러 줄로 적고 "- "로 목록을 만듭니다. 비우면 본문 첫 문단을 씁니다.', 'Write several lines. Start a line with "- " for a list. Leave empty to use the first paragraph.')}
              onChange={(e) => setDesc(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setDesc(null); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && lengthOf(desc) <= LIMITS.description) saveDesc(desc) }} />
            <div className="rs-desc-bar">
              <span className={`rs-count${lengthOf(desc) > LIMITS.description ? ' over' : ''}`}>{lengthOf(desc)}/{LIMITS.description}</span>
              <span className="sp" />
              <button className="btn sm" onClick={() => setDesc(null)}>{t('취소', 'Cancel')}</button>
              <button className="btn primary sm" disabled={lengthOf(desc) > LIMITS.description} onClick={() => saveDesc(desc)}>{t('저장', 'Save')}</button>
            </div>
          </>}
      </Section>
      <Section label={t('본문에 쓴 개념노트', 'Concept notes used')} count={links?.bodyConcepts.length} hint={t('본문에 [[링크]]로 쓴 개념노트', 'Concept notes linked with [[links]] in the text')} ui="쓰는 개념노트">
        <MoreList items={links?.bodyConcepts ?? []} empty={t('없음', 'None')}
          render={(c) => <button type="button" className="a" onClick={() => go({ page: 'concept', rid, id: c.id })}>{c.title}</button>} />
      </Section>
      <Section label={t('이 노트를 인용한 노트', 'Cited by')} count={links?.citedBy.length} hint={t('이 노트로 연결되는 링크를 쓴 노트', 'Notes that link to this note')} ui="이 노트를 인용한 노트">
        <MoreList items={links?.citedBy ?? []} empty={t('없음', 'None')}
          render={(n) => <button type="button" className="a rs-note" onClick={() => go(routeOfNote(rid, n))}><StatusDot s={n.status} />{n.title}</button>} />
      </Section>
      {/* 보조 노트가 그려 넣는 칸: 증명할 진술 · 원고 장 · 개념 연결 · 기대는 노트 · 다른 방법 · 다음 할 일.
          위의 두 목록(앱이 링크에서 모은 것)에는 없는 것이라 그대로 두되, 이름은 다른 칸처럼 내용을 가리킨다 (data-ui 값은 이전 피드백 기록과 맞추어 그대로) */}
      {slot && <Section label={t('연결과 할 일', 'Links and to-dos')} ui="보조 노트 연결"><div ref={setRightSlot} className="rs-slot" /></Section>}
      <div className="rs-path mono" data-ui="파일 경로" title={row.file}>{row.file.split('/').filter(Boolean).pop() ?? row.file}</div>
    </div>
  )
}

/** 지금 연 것이 노트가 아닐 때 */
export function NoInfo() {
  return <p className="muted rs-empty rs-pad">{t('노트를 열면 정보가 여기에 보입니다.', 'Open a note to see its info here.')}</p>
}
