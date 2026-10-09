import { JOURNAL_LABEL, parseMemo, RESEARCH_TARGET, type Inline, type JournalEntry } from '@rw/core'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { journalWhen } from './format'
import { go } from './router'
import { onListKey } from './listInput'
import { Icon } from './icons'
import { askConfirm } from './askText'
import { journalDeletePrompt, journalEntryActions } from './journalActions'
import { isNoteTarget, journalTargetRoute } from './journalTargets'
import { shown, t } from './i18n'
export { isNoteTarget } from './journalTargets'

function InlineText({ parts }: { parts: Inline[] }) {
  return <>{parts.map((p, i) => {
    switch (p.kind) {
      case 'math': return <span key={i} dangerouslySetInnerHTML={{ __html: katex.renderToString(p.tex, { throwOnError: false }) }} />
      case 'bold': return <strong key={i}>{p.text}</strong>
      case 'code': return <code key={i} className="memo-code">{p.text}</code>
      default: return <span key={i}>{p.text}</span>
    }
  })}</>
}

/** 같은 이름의 줄 단추를 가려 부르게 이름 뒤에 붙이는 글 (도구·화면 읽기 프로그램용) */
const short = (t: string) => { const x = t.replace(/\s+/g, ' ').trim(); return x.length > 40 ? `${x.slice(0, 40)}…` : x }

/** 메모 본문: 목록(-, *, 1.)·굵게·코드·수식을 그린다 */
export function MemoText({ text }: { text: string }) {
  const blocks = useMemo(() => parseMemo(text), [text])
  return (
    <div className="memo-text">
      {blocks.map((b, i) => b.kind === 'para'
        ? <p key={i}>{b.lines.map((line, j) => <span key={j}>{j > 0 && <br />}<InlineText parts={line} /></span>)}</p>
        : (() => {
          const Tag = b.ordered ? 'ol' : 'ul'
          return <Tag key={i}>{b.items.map((it, j) => <li key={j} style={{ marginLeft: `calc(var(--sp-4) * ${it.depth})`, listStyleType: b.ordered ? undefined : it.depth === 0 ? 'disc' : it.depth === 1 ? 'circle' : 'square' }}><InlineText parts={it.inline} /></li>)}</Tag>
        })())}
    </div>
  )
}

/** 메모 입력칸. 빠른 메모 창과 메모 탭이 함께 쓴다 */
export function MemoComposer({ target, targetLabel, autoFocus, compact, onSave, onEscape }: {
  target: string
  targetLabel: string
  autoFocus?: boolean
  compact?: boolean
  onSave(kind: 'memo' | 'todo', text: string, target: string): Promise<void>
  onEscape?(): void
}) {
  const [text, setText] = useState('')
  const [todo, setTodo] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ta = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (autoFocus) ta.current?.focus() }, [autoFocus])

  const save = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    try {
      await onSave(todo ? 'todo' : 'memo', text.trim(), target)
      setText(''); setTodo(false); setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const has = text.trim() !== ''
  return (
    <div className={`memo${compact ? ' compact' : ''}${has ? ' has-text' : ''}`} data-ui="메모 입력">
      <textarea ref={ta} rows={compact ? 1 : 3} value={text} aria-label={t('메모', 'Memo')}
        placeholder={compact ? t(`${targetLabel}에 메모 — 생각, 의문, 다음 할 일 (- 목록, $수식$)`, `Memo on ${targetLabel}: thoughts, doubts, next steps (- list, $math$)`) : t('떠오른 생각을 적고 ⌘↵ — Esc로 닫기. - 로 목록, $…$로 수식', 'Write a thought and press ⌘↵. Esc closes. - for a list, $…$ for math')}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save() }
          else if (e.key === 'Escape') onEscape?.()
          else onListKey(e, setText)
        }} />
      <div className="memo-bar">
        <span className="memo-chip" data-ui="붙는 곳" title={t('이 메모가 붙는 곳', 'Where this memo is attached')}>↳ {targetLabel}</span>
        <button data-ui="할 일로 버튼" className={`memo-chip${todo ? ' on' : ''}`} onClick={() => setTodo((v) => !v)} aria-pressed={todo}>{t('할 일로', 'As to-do')}</button>
        {error && <span className="error-text">{error}</span>}
        <span className="sp" />
        <span className="memo-hint">{t('오늘 일지에 저장 · ⌘↵', "Saves to today's journal · ⌘↵")}</span>
        <button className="memo-send" data-ui="저장 버튼" aria-label={t('메모 저장', 'Save memo')} disabled={!has || busy} onClick={() => void save()}>
          <svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
        </button>
      </div>
    </div>
  )
}

/**
 * 메모·할 일이 붙은 곳: 작업노트 id, 연구 전체(RESEARCH_TARGET), 또는 TeX·Markdown 노트 파일.
 */
export const targetTitle = (target: string, titleOf: (id: string) => string) => isNoteTarget(target) ? target.split('/').pop()! : titleOf(target)
export const openTarget = (rid: string, target: string) => go(journalTargetRoute(rid, target))

/** 화면 아래쪽에 뜨는 빠른 메모 창 */
export function QuickMemo({ target, targetLabel, onClose, onSave }: {
  target: string; targetLabel: string; onClose(): void; onSave(kind: 'memo' | 'todo', text: string, target: string): Promise<void>
}) {
  return (
    <div className="quick" data-ui="빠른 메모" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="quick-box">
        <span className="quick-label">{t('빠른 메모', 'Quick memo')}</span>
        <MemoComposer autoFocus target={target} targetLabel={targetLabel} onEscape={onClose}
          onSave={async (k, t, g) => { await onSave(k, t, g); onClose() }} />
      </div>
    </div>
  )
}

/** 일지를 날짜별로. 메모·할 일은 고치기·지우기, 완료 기록은 지우기만 한다. */
export function MemoList({ entries, rid, titleOf, onToggle, onEdit, onDelete, hideTodoKind = false, empty }: {
  entries: JournalEntry[]
  rid: string
  titleOf(id: string): string
  onToggle(e: JournalEntry): void
  onEdit?(e: JournalEntry, text: string): Promise<void>
  onDelete?(e: JournalEntry): void
  hideTodoKind?: boolean
  empty: string
}) {
  if (entries.length === 0) return <div className="memo-empty">{empty}</div>
  const links = new Map<string, number>()
  for (const entry of entries) if (entry.link) links.set(entry.link, (links.get(entry.link) ?? 0) + 1)
  let day = ''
  return (
    <>
      {entries.map((e) => {
        const head = e.date !== day ? (day = e.date, <div key={`d-${e.date}`} className="memo-day" data-ui="날짜">{journalWhen(e.date, '').trim() || e.date}</div>) : null
        const key = e.link && links.get(e.link) === 1 ? `linked:${e.link}` : `position:${e.date}:${e.index}`
        return <Fragment key={key}>{head}<MemoItem key="entry" e={e} rid={rid} titleOf={titleOf} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} hideTodoKind={hideTodoKind} /></Fragment>
      })}
    </>
  )
}

function MemoItem({ e, rid, titleOf, onToggle, onEdit, onDelete, hideTodoKind }: {
  e: JournalEntry; rid: string; titleOf(id: string): string; onToggle(e: JournalEntry): void
  onEdit?(e: JournalEntry, text: string): Promise<void>; onDelete?(e: JournalEntry): void
  hideTodoKind: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const { editable, deletable } = journalEntryActions(e.kind)
  const save = () => {
    if (draft === null || !onEdit) return
    if (!draft.trim() || draft.trim() === e.text) return setDraft(null)
    onEdit(e, draft).then(() => setDraft(null)).catch(() => undefined)
  }
  return (
    <div className={`memo-item${e.done ? ' is-done' : ''}`} data-ui="메모 항목" data-todo-key={e.kind === 'todo' ? `${e.date}-${e.index}` : undefined}>
      {e.kind === 'todo'
        ? <button className={`mi-icon todo${e.done ? ' done' : ''}`} aria-label={`${e.done ? t('할 일 되돌리기', 'Mark to-do undone') : t('할 일 완료', 'Complete to-do')}: ${short(e.text)}`} onClick={() => onToggle(e)}>{e.done && Icon.check}</button>
        : <span className={`mi-icon ${e.kind === 'status' ? 'status' : 'note'}`} />}
      <div>
        {draft !== null
          ? <textarea className="mi-edit" autoFocus value={draft} rows={Math.min(8, draft.split('\n').length + 1)} onChange={(ev) => setDraft(ev.target.value)}
              onKeyDown={(ev) => { if (ev.key === 'Escape') setDraft(null); if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) save() }} />
          : <div className="mi-text"><MemoText text={e.text} /></div>}
        <div className="mi-meta" data-ui="시각·붙은 곳">
          <span>
            {e.time} · {e.target === RESEARCH_TARGET ? t('이 프로젝트', 'This project') : <button type="button" className="a" onClick={() => openTarget(rid, e.target)}>{targetTitle(e.target, titleOf)}</button>}
            {e.kind !== 'memo' && !(e.kind === 'todo' && hideTodoKind) && ` · ${shown(JOURNAL_LABEL[e.kind])}`}
          </span>
          {draft !== null && editable && onEdit
            ? <span className="mi-actions"><button className="a" onClick={save}>{t('저장', 'Save')}</button><button className="a" onClick={() => setDraft(null)}>{t('취소', 'Cancel')}</button></span>
            : ((editable && onEdit) || (deletable && onDelete)) && <span className="mi-actions icons" data-ui="고치기·지우기">
                {editable && onEdit && <button className="icon-btn" data-tip={t('고치기', 'Edit')} aria-label={`${t('고치기', 'Edit')}: ${short(e.text)}`} onClick={() => setDraft(e.text)}>{Icon.pencil}</button>}
                {deletable && onDelete && <button className="icon-btn" data-tip={t('지우기', 'Delete')} aria-label={`${t('지우기', 'Delete')}: ${short(e.text)}`} onClick={() => void askConfirm(journalDeletePrompt(e)).then((y) => { if (y) onDelete(e) })}>{Icon.trash}</button>}
              </span>}
        </div>
      </div>
    </div>
  )
}
