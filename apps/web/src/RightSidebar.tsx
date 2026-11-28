import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import { SendArea, SendBox } from './SendArea'
import { ConflictError, notesApi, type NoteCategory, type NoteHeadPatch, type NoteLinks, type NoteRow, type ProjectKind, type Statement, type Topic, LIMITS } from './api'
import { descriptionLines, MathText } from './cardParts'
import { useConceptMacros } from './conceptMacros'
import { Icon } from './icons'
import { shortLabel } from './notes'
import { LOOSE_NOTES_LABEL, NO_KIND_LABEL, NOTE_KIND_LABEL, noteKindChoices } from './noteKinds'
import { HistoryButton, NoteHistorySide, setNoteHistory, useNoteHistory } from './NoteHistory'
import { headWriterOf, setInfoEditing, setInfoLeave, toggleInfoEditing, useInfoEditing, useInfoTools, useInfoToolsOwner, useRecordsWide, useRightMode, useRightSlotsOwner, type RightMode } from './noteScreen'
import { go, type Route } from './router'
import { StatusDot } from './StatusDot'
import { store } from './store'
import { josa, t } from './i18n'
import { SideTerminalClose, TerminalPane, useTerminalAvailable } from './TerminalPane'

/**
 * 오른쪽 사이드바: 정보 · 기록 · 에이전트 (10/22 안 A). 칸은 오른쪽 레일로 고른다(11/28, RightRail.tsx. 11/24~11/27에는 사이드바 맨 위 아이콘 줄). 칸을 바꿔도 적던 내용은 남긴다.
 * 맨 위는 머리줄(칸 이름, 탭 바와 같은 높이)이다. 에이전트 칸은 대화 머리가 그 자리를 쓴다.
 * 에이전트 탭은 이 프로젝트의 대화(레일 › 에이전트와 같은 목록)이고, 패널 자리를 작업 화면 아래로 옮겼으면 그 자리를 알린다.
 * 터미널 칸(terminalRid가 있고 이 컴퓨터에서 연 화면일 때)은 그 프로젝트 폴더의 셸로, 코드 블록 「터미널에서 실행」만 연다(상단바 아이콘은 11/23에 뺌). 한 번 열면 다른 갈래로 가도 셸을 그대로 둔다
 */
export function RightSidebar({ info, records, agent, terminalRid, ownSlots = true }: {
  /** 열린 것의 정보. null이면 정보 칸이 없다(레일에 버튼도 없다) */
  info: ReactNode | null; records: ReactNode; agent?: ReactNode; terminalRid?: string
  /** false면 칸 목록을 바깥 화면이 알린다(사이드바가 닫혀 있어도 레일이 그 화면의 칸을 보이게) */
  ownSlots?: boolean
}) {
  const chosen = useRightMode()
  const terminal = useTerminalAvailable() && !!terminalRid
  // 에이전트 · 터미널 탭이 없는 사이드바(개념노트 화면 안 등)에서는 정보를 보인다
  const wanted = (chosen === 'agent' && !agent) || (chosen === 'terminal' && !terminal) ? 'info' : chosen
  const mode = wanted === 'info' && info === null ? 'records' : wanted
  const [termOpened, setTermOpened] = useState(false)
  useEffect(() => { if (mode === 'terminal') setTermOpened(true) }, [mode])
  // 터미널은 레일에 두지 않는다(11/23: 터미널은 에이전트 대화 창 안). 코드 블록 「터미널에서 실행」(openRight)만 이 칸을 연다
  const modes: RightMode[] = [...(info === null ? [] : ['info' as const]), 'records', ...(agent ? ['agent' as const] : [])]
  useRightSlotsOwner(ownSlots ? modes : null)
  const tools = useInfoTools()
  const history = useNoteHistory()
  const editing = useInfoEditing()
  const recordsWide = useRecordsWide()
  return (
    <div className="rs" data-ui="오른쪽 사이드바">
      {(mode === 'info' || mode === 'records') && <div className="rs-head rs-name" data-ui="오른쪽 사이드바 머리줄"><span className="rs-name-t">{mode === 'info' ? t('정보', 'Info') : t('기록', 'Records')}</span>
        {mode === 'info' && tools.history && <HistoryButton on={history.on} onChange={setNoteHistory} />}
        {mode === 'info' && tools.edit && !(tools.history && history.on) && <button className={`icon-btn${editing ? ' on' : ''}`} data-ui="정보 고치기" aria-pressed={editing}
          data-tip={editing ? t('편집 완료', 'Done editing') : t('수정 — 정보', 'Edit info')} aria-label={t('수정 — 정보', 'Edit info')} onClick={() => void toggleInfoEditing()}>{Icon.pencil}</button>}
        {/* 넓게 보기: 이 칸의 전체 화면(기록 화면)을 왼쪽에서 연다. 지식 라이브러리에는 기록 화면이 없다 */}
        {mode === 'records' && recordsWide && <button className="icon-btn" data-ui="모두 보기" data-tip={t('기록 화면에서 넓게 보기', 'Open wide in Records')} aria-label={t('넓게 보기', 'Open wide')} onClick={recordsWide}>{Icon.openNote}</button>}
      </div>}
      {mode === 'info' && <div className="rs-scroll">{info}</div>}
      <div className="rs-col" hidden={mode !== 'records'}>{records}</div>
      {mode === 'agent' && agent && <div className="rs-col">{agent}</div>}
      {terminal && (termOpened || mode === 'terminal') && <div className="rs-col" hidden={mode !== 'terminal'}><TerminalPane key={terminalRid} rid={terminalRid} attach tools={<SideTerminalClose />} /></div>}
    </div>
  )
}

/** 노트를 여는 주소: 본문 파일 */
export const routeOfNote = (rid: string, n: Pick<NoteRow, 'type' | 'id' | 'file'>): Route => ({ page: 'part', rid, file: n.file })

/** 설명 글자 수 (줄바꿈은 세지 않는다, 서버와 같게) */
const lengthOf = (s: string) => s.replace(/\n/g, '').length

/** 접어 둔 칸 (data-ui 이름). 이 브라우저에 기억해 다른 노트를 열어도 접힌 채다 */
const FOLD_KEY = 'rw-rs-folded'
const foldedNow = () => new Set(store.get<string[]>(FOLD_KEY, []))

/**
 * 칸 하나: 이름 옆 개수(또는 짧은 도움말), 칸마다 접을 수 있다 (10/5 시안 "오른쪽 사이드바").
 * 고치기는 머리줄의 연필 하나로 켠다(11/28). 평소에는 값만 보이고 빈 칸은 보이지 않는다
 */
function Section({ label, count, hint, className, children, ui }: {
  label: string; count?: number; hint?: string; className?: string; children: ReactNode; ui: string
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
  if (!items.length) return <p className="empty rs-empty">{empty}</p>
  const shown = all ? items : items.slice(0, 5)
  return <>
    <ul className="rs-list">{shown.map((x, i) => <li key={i}>{render(x)}</li>)}</ul>
    {items.length > 5 && !all && <button className="a rs-more" onClick={() => setAll(true)}>{t(`${items.length - 5}개 더 보기`, `Show ${items.length - 5} more`)}</button>}
  </>
}

/** 정보 갈래. 머리줄의 시계(이력 보기)가 켜져 있으면 Markdown 노트는 그 파일을 고친 커밋 목록 (11/16 시안 2절 ③′, 시계는 11/28에 툴바에서 머리줄로) */
export function NoteInfo(props: Parameters<typeof NoteInfoBody>[0]) {
  const history = useNoteHistory()
  const md = props.row.file.endsWith('.md')
  useInfoToolsOwner({ history: md, edit: true })
  useEffect(() => () => { setInfoEditing(false); setInfoLeave(null) }, [])
  return history.on && md ? <NoteHistorySide key={props.row.file} rid={props.rid} file={props.row.file} /> : <NoteInfoBody {...props} />
}

/** 상태와 다시 열 조건 · 성격 · 주제 · 설명 · 개념노트(본문에 쓴 것) · 이 노트를 인용한 노트 · 맨 아래 파일 경로 */
function NoteInfoBody({ rid, row, topics, proves = [], projectKind, version, onChanged, onSaved }: {
  rid: string; row: NoteRow; topics: Topic[]
  /** 이 노트를 증명으로 단 진술 (진술의 proofs) */
  proves?: Statement[]
  /** 프로젝트 성격: 업무 프로젝트면 노트 성격에 설계를 더한다 */
  projectKind: ProjectKind
  version: number
  onChanged(): void; onSaved(m: string): void
}) {
  const [links, setLinks] = useState<NoteLinks | null>(null)
  useEffect(() => { notesApi(rid).links(row.file).then(setLinks).catch(() => setLinks(null)) }, [rid, row.file, version])
  const editing = useInfoEditing()
  /** 적어 둔 설명 (저절로 뽑은 것은 빈 글로 고치기 시작한다) */
  const written = row.descriptionAuto ? '' : row.description ?? ''
  /** 고치는 중의 설명 글. null이면 고치지 않는 중 */
  const [desc, setDesc] = useState<string | null>(null)
  useEffect(() => setDesc(editing ? written : null), [editing, row.file]) // eslint-disable-line react-hooks/exhaustive-deps
  /** 머리말 고치기. 노트 화면이 열려 있으면 그 화면이 맡는다(고치던 본문을 먼저 저장하고 편집기에 반영). 됐으면 true */
  const patch = (p: NoteHeadPatch, message: string): Promise<boolean> => {
    const writer = headWriterOf(rid, row.file)
    return (writer ? writer(p) : notesApi(rid).setHead(row.file, p, row.hash)).then(() => { onChanged(); onSaved(message); return true })
      .catch((e: Error) => { onSaved(e instanceof ConflictError ? t('다른 곳에서 노트 정보가 바뀌어 고치지 않았습니다. 다시 해 주세요.', 'The note info changed elsewhere, so nothing was changed. Try again.') : e.message); return false })
  }
  const descOk = desc === null || lengthOf(desc) <= LIMITS.description
  const saveDesc = (v: string) => patch({ description: v }, t('설명을 적었습니다', 'Saved the description'))
  // 연필을 끌 때: 적던 설명이 달라졌으면 저장하고, 저장하지 못하면 고치는 채로 둔다 (적던 글이 남는다)
  useEffect(() => {
    setInfoLeave(async () => (desc === null || desc === written ? true : descOk ? saveDesc(desc) : false))
    return () => setInfoLeave(null)
  })
  const descKeys = (e: KeyboardEvent) => { if (e.key === 'Escape') setDesc(written) }
  const sendDesc = () => { if (desc !== null && descOk && desc !== written) void saveDesc(desc) }
  const titleOfTopic = (id: string) => topics.find((t) => t.id === id)?.title ?? id
  const rest = topics.filter((t) => !row.topics.includes(t.id))
  const moveUp = (i: number) => { const next = [...row.topics]; [next[i - 1], next[i]] = [next[i]!, next[i - 1]!]; void patch({ topics: next }, i === 1 ? t(`주 주제를 "${titleOfTopic(next[0]!)}"${josa(titleOfTopic(next[0]!), '로')} 바꿨습니다`, `Main topic is now "${titleOfTopic(next[0]!)}"`) : t('주제 순서를 바꿨습니다', 'Changed the topic order')) }
  const kindName = row.kind ? NOTE_KIND_LABEL[row.kind] : NO_KIND_LABEL
  return (
    <div className={`note-info${editing ? ' editing' : ''}`} data-ui="노트 정보">
      <Section label={t('상태', 'Status')} ui="상태">
        <div><StatusDot s={row.status} label />{row.resume && <span className="rs-resume">{t(' · 다시 열 조건: ', ' · Reopen when: ')}{row.resume}</span>}</div>
      </Section>
      {(editing || row.kind) && <Section label={t('성격', 'Kind')} ui="성격">
        {editing
          ? <select id="rs-kind" aria-label={t('성격', 'Kind')} className="rs-select" value={row.kind ?? ''} title={row.kindAuto ? t('적지 않아 폴더(calc/)에서 정한 성격입니다', 'Not set, so the kind comes from the folder (calc/)') : undefined}
            onChange={(e) => { const k = (e.target.value || null) as NoteCategory | null; void patch({ kind: k }, t(`성격: ${k ? NOTE_KIND_LABEL[k] : NO_KIND_LABEL}`, `Kind: ${k ? NOTE_KIND_LABEL[k] : NO_KIND_LABEL}`)) }}>
            <option value="">{NO_KIND_LABEL}</option>
            {[...new Set([...noteKindChoices(projectKind), ...(row.kind ? [row.kind] : [])])].map((k) => <option key={k} value={k}>{NOTE_KIND_LABEL[k]}</option>)}
          </select>
          : <div className="rs-value" title={row.kindAuto ? t('적지 않아 폴더(calc/)에서 정한 성격입니다', 'Not set, so the kind comes from the folder (calc/)') : undefined}>{kindName}</div>}
      </Section>}
      {(editing || row.topics.length > 0) && <Section label={t('주제', 'Topics')} hint={t('첫 번째 주제가 주 주제입니다', 'The first topic is the main topic')} ui="주제">
        <div className="rs-chips">
          {row.topics.map((id, i) => (
            <span key={id} className="tag rs-topic" data-ui="주제 이름표" data-ui-item={titleOfTopic(id)}>
              <button type="button" className="a" title={t('주제 화면으로', 'Go to topic')} onClick={() => go({ page: 'topic', rid, tid: id })}>{titleOfTopic(id)}</button>
              {editing && i > 0 && <button className="x" title={t('위로 — 앞에 두면 주 주제', 'Move up. The first one is the main topic')} aria-label={t(`위로: ${titleOfTopic(id)}`, `Move up: ${titleOfTopic(id)}`)} onClick={() => moveUp(i)}>↑</button>}
              {editing && <button className="x" title={t('제거', 'Remove')} aria-label={t(`제거: ${titleOfTopic(id)}`, `Remove: ${titleOfTopic(id)}`)} onClick={() => void patch({ topics: row.topics.filter((x) => x !== id) }, t(`주제에서 뺐습니다: ${titleOfTopic(id)}`, `Removed from topic: ${titleOfTopic(id)}`))}>×</button>}
            </span>
          ))}
          {row.topics.length === 0 && <span className="muted" title={t(`주제에 넣지 않은 노트는 ${LOOSE_NOTES_LABEL}에 모입니다`, `Notes without a topic are gathered in ${LOOSE_NOTES_LABEL}`)}>{t('없음', 'None')}</span>}
          {editing && rest.length > 0 && (
            <select className="rs-select rs-add" value="" aria-label={t('주제 추가', 'Add topic')} onChange={(e) => e.target.value && void patch({ topics: [...row.topics, e.target.value] }, t(`주제에 넣었습니다: ${titleOfTopic(e.target.value)}`, `Added to topic: ${titleOfTopic(e.target.value)}`))}>
              <option value="">{t('＋ 추가…', '＋ Add…')}</option>
              {rest.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          )}
        </div>
      </Section>}
      {(desc !== null || row.description) && <Section label={t('설명', 'Description')} ui="설명" className="rs-desc">
        {desc === null
          ? <div className={row.descriptionAuto ? 'muted' : ''} title={row.descriptionAuto ? t('적은 설명이 없어 본문 첫 문단에서 뽑았습니다', 'No description written, so the first paragraph is used') : undefined}><DescriptionText text={row.description ?? ''} /></div>
          : <>
            <SendArea className="rs-desc-input" rows={4} value={desc} aria-label={t('설명', 'Description')} placeholder={t('여러 줄로 적고 "- "로 목록을 만듭니다. 비우면 본문 첫 문단을 씁니다.', 'Write several lines. Start a line with "- " for a list. Leave empty to use the first paragraph.')}
              onChange={(e) => setDesc(e.target.value)} onSend={sendDesc} onKeyDown={descKeys} />
            <SendBox className="rs-desc-bar" onSend={sendDesc} onKeyDown={descKeys}>
              <span className={`rs-count${descOk ? '' : ' over'}`}>{lengthOf(desc)}/{LIMITS.description}</span>
              <span className="sp" />
              <button className="btn sm" disabled={desc === written} onClick={() => setDesc(written)}>{t('취소', 'Cancel')}</button>
              <button className="btn primary sm" disabled={!descOk || desc === written} onClick={sendDesc}>{t('저장', 'Save')}</button>
            </SendBox>
          </>}
      </Section>}
      {!!links?.bodyConcepts.length && <Section label={t('본문에 쓴 개념노트', 'Concept notes used')} count={links.bodyConcepts.length} hint={t('본문에 [[링크]]로 쓴 개념노트', 'Concept notes linked with [[links]] in the text')} ui="쓰는 개념노트">
        <MoreList items={links.bodyConcepts} empty={t('없음', 'None')}
          render={(c) => <button type="button" className="a" onClick={() => go({ page: 'concept', rid, id: c.id })}>{c.title}</button>} />
      </Section>}
      {!!links?.citedBy.length && <Section label={t('이 노트를 인용한 노트', 'Cited by')} count={links.citedBy.length} hint={t('이 노트로 연결되는 링크를 쓴 노트', 'Notes that link to this note')} ui="이 노트를 인용한 노트">
        <MoreList items={links.citedBy} empty={t('없음', 'None')}
          render={(n) => <button type="button" className="a rs-note" onClick={() => go(routeOfNote(rid, n))}><StatusDot s={n.status} />{n.title}</button>} />
      </Section>}
      {proves.length > 0 && <Section label={t('증명하는 진술', 'Statements proved')} count={proves.length} hint={t('이 노트를 증명으로 단 진술', 'Statements that list this note as a proof')} ui="증명하는 진술">
        <MoreList items={proves} empty={t('없음', 'None')}
          render={(s) => <button type="button" className="a" onClick={() => go({ page: 'statement', rid, sid: s.id })}>{shortLabel(s)}</button>} />
      </Section>}
      <div className="rs-path mono" data-ui="파일 경로" title={row.file}>{row.file.split('/').filter(Boolean).pop() ?? row.file}</div>
    </div>
  )
}

/** 지금 연 것이 노트가 아닐 때 */
