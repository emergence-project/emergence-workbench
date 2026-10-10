import { useEffect, useRef, useState, type ReactNode } from 'react'
import { relativeTime } from './format'
import { Icon } from './icons'
import { t } from './i18n'

/**
 * 노트 도구 줄 (10/5 시안 "노트 도구 줄"): 연구노트 · 계산 노트 · 보조 노트가 같은 줄을 쓴다.
 * - 읽을 때: 왼쪽 노트 상태, 오른쪽 저장 상태 · 코멘트(말풍선) · 고치기(연필) · 컴파일 ▶ · ⋯
 * - 고칠 때: 왼쪽 제목 · 상태, 가운데 보기 전환(Markdown 노트), 오른쪽 저장 상태 · "편집 완료"
 * ⋯에는 컴파일에 딸린 설정과 드문 일(서식 고르기 · PDF 보기 · 내보내기 · 파일 다시 읽기 · Finder에서 보기 · 지우기)을 둔다.
 */
export type ToolbarSave = 'saved' | 'dirty' | 'saving' | 'conflict' | 'error'
export type EditView = 'source' | 'split' | 'live'
export interface ToolbarItem { label: string; onClick(): void; disabled?: boolean; danger?: boolean; tip?: string; ui?: string }

const SAVE_LABEL: Record<ToolbarSave, string> = { saved: t('저장됨', 'Saved'), dirty: t('고치는 중…', 'Editing…'), saving: t('저장 중…', 'Saving…'), conflict: t('저장 멈춤', 'Save paused'), error: t('저장 실패', 'Save failed') }
export const EDIT_VIEWS: { id: EditView; label: string; tip: string }[] = [
  { id: 'source', label: t('원문', 'Source'), tip: t('원문만 봅니다', 'Show the source only') },
  { id: 'split', label: t('원문 | 미리보기', 'Source | Preview'), tip: t('왼쪽 원문, 오른쪽 미리보기', 'Source on the left, preview on the right') },
  { id: 'live', label: t('바로 보기', 'Live'), tip: t('커서가 있는 줄만 원문으로 보이고 나머지는 미리보기', 'Only the cursor line shows as source; the rest is preview') },
]

/** "저장됨 · 3분 전". 30초마다 다시 그린다 */
function useSaveLabel(save: ToolbarSave, at?: number | null) {
  const [, tick] = useState(0)
  useEffect(() => { const h = window.setInterval(() => tick((x) => x + 1), 30_000); return () => window.clearInterval(h) }, [])
  return SAVE_LABEL[save] + (save === 'saved' && at ? ` · ${relativeTime(at)}` : '')
}

/** 노트 도구 줄에 넘기는 것. 노트 화면 틀(NoteScreen)도 이 모양으로 받는다 */
export interface NoteToolbarProps {
  /** 고치는 중 본문에서 올라온 제목 입력칸 */
  title?: ReactNode
  /** 왼쪽 첫 자리의 노트 상태 (색 점과 이름, 있는 경우 상태 메뉴도 함께) */
  status?: ReactNode
  save: ToolbarSave
  savedAt?: number | null
  /** 충돌 · 실패를 해결하는 기존 행동. 좁은 칸에서도 숨기지 않는다 */
  saveAction?: ReactNode
  saveUi?: string
  /** PDF가 이전 결과일 때 짧은 알림 (C3, "PDF는 이전 결과") */
  pdfNote?: string | null
  editing: boolean
  /** 고칠 때의 보기 (Markdown 노트만) */
  view?: EditView
  onView?(v: EditView): void
  /** 연필. 없으면 보이지 않는다 */
  onEdit?(): void
  editDisabled?: boolean
  onDone?(): void
  doneDisabled?: boolean
  onComment(): void
  commentOn?: boolean
  onCompile?(): void
  /** ⌘↵로도 컴파일한다(LaTeX 편집기만). 툴팁에 단축키를 적는다 */
  compileKey?: boolean
  compiling?: boolean
  compileDisabled?: boolean
  compileTip?: string
  compileUi?: string
  menu: (ToolbarItem | null | false | undefined)[]
  /** ⋯ 옆에 붙여 둘 상자의 자리 (컴파일 서식 · 내보내기 상자가 여기서 열린다) */
  anchors?: ReactNode
  /** 오른쪽 기호들 앞에 둘 것 (예: 할 일 칸 여닫기) */
  extra?: ReactNode
}

export function NoteToolbar({ title, status, save, savedAt, saveAction, saveUi, pdfNote, editing, view, onView, onEdit, editDisabled, onDone, doneDisabled, onComment, commentOn, onCompile, compiling, compileDisabled, compileTip, compileKey, compileUi = '컴파일 버튼', menu, anchors, extra }: NoteToolbarProps) {
  const [open, setOpen] = useState(false)
  const saveLabel = useSaveLabel(save, savedAt)
  const hasView = editing && view && onView
  const box = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])
  const items = menu.filter((x): x is ToolbarItem => !!x)
  return (
    <div className="note-toolbar" data-ui="노트 도구 줄">
      <div className={`nt-row${hasView ? ' nt-with-view' : ''}`}>
        <div className="nt-left">{editing && title}{status}</div>
        {hasView && <div className="segmented small nt-view" role="radiogroup" aria-label={t('보기', 'View')} data-ui="편집 보기">
            {EDIT_VIEWS.map((v) => <button key={v.id} className={view === v.id ? 'on' : ''} role="radio" aria-checked={view === v.id} title={v.tip} onClick={() => onView(v.id)}>{v.label}</button>)}
          </div>}
        <div className="nt-right">
          <span className="nt-state" data-ui={saveUi}>
            <span className={`save-state ${save}`} data-ui="저장 상태" title={saveLabel} role="status">
              {SAVE_LABEL[save]}{save === 'saved' && savedAt ? <span className="nt-save-time">{saveLabel.slice(SAVE_LABEL[save].length)}</span> : null}
            </span>
            {saveAction}
            {!editing && pdfNote && <span className={`nt-pdf${pdfNote.includes(t('실패', 'failed')) ? ' bad' : ''}`} role="status" data-ui="PDF 이전 결과">{pdfNote}</span>}
          </span>
          <div className="nt-actions">
            {editing ? <>
              <button className="btn primary" data-ui="다 고침" disabled={doneDisabled} title={t(`${saveLabel} — 고치기를 마칩니다 (Esc). 고친 것은 저절로 저장됩니다`, `${saveLabel}. Finish editing (Esc). Edits save automatically`)} onClick={onDone}>{t('편집 완료', 'Done')}</button>
            </> : <>
              {extra}
              <button className={`icon-btn${commentOn ? ' on' : ''}`} data-ui="코멘트 버튼" data-tip={t('코멘트', 'Comment')} aria-label={t('코멘트 — 오른쪽 사이드바에서', 'Comment in the right sidebar')} aria-pressed={!!commentOn}
                // The selection menu closes on document pointerdown. Preserve the selection until this button's click attaches it.
                onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.preventDefault()} onClick={onComment}>{Icon.comment}</button>
              {onEdit && <button className="icon-btn" data-ui="고치기" data-tip={`${t('고치기', 'Edit')} · ${saveLabel}`} aria-label={t('고치기', 'Edit')} disabled={editDisabled} onClick={onEdit}>{Icon.pencil}</button>}
              {onCompile && <button className="btn primary btn-icon nt-play" data-ui={compileUi} disabled={compileDisabled || compiling} aria-label={compileTip ?? t('컴파일', 'Compile')} title={t(`${compileTip ?? '컴파일'} — 컴파일하고 PDF를 엽니다${compileKey ? ' (⌘↵)' : ''}`, `${compileTip ?? 'Compile'}: compile and open the PDF${compileKey ? ' (⌘↵)' : ''}`)} onClick={onCompile}>{compiling ? '…' : Icon.play}</button>}
              <span className="nt-more" ref={box}>
                <button className={`icon-btn${open ? ' on' : ''}`} data-ui="더 보기 메뉴" data-tip={t('더 보기', 'More')} aria-label={t('더 보기', 'More')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{Icon.more}</button>
                {open && (
                  <div className="menu nt-menu" role="menu" data-ui="더 보기 항목">
                    {items.map((it) => (
                      <button key={it.label} role="menuitem" className={it.danger ? 'danger' : ''} data-ui={it.ui} title={it.tip} disabled={it.disabled} onClick={() => { setOpen(false); it.onClick() }}>{it.label}</button>
                    ))}
                  </div>
                )}
                {anchors}
              </span>
            </>}
          </div>
        </div>
      </div>
    </div>
  )
}

/** 도구 줄로 옮겨도 이름을 저장하는 경로는 호출하는 화면에 그대로 둔다. */
export function NoteTitleInput({ title, draft, onDraft }: { title: string; draft?: string; onDraft(v: string): void }) {
  return <input className="note-title-input" data-ui="노트 이름" aria-label={t('노트 이름', 'Note name')} title={draft ?? title} value={draft ?? title} size={Math.max(1, (draft ?? title).length)} maxLength={120} onChange={(e) => onDraft(e.target.value)} />
}

/** 읽는 본문의 큰 제목. 고치는 중 제목은 도구 줄에 둔다. */
export function NoteHead({ title, editing, draft, onDraft, children }: {
  title: string; editing: boolean; draft?: string; onDraft?(v: string): void; children?: ReactNode
}) {
  return (
    <div className="note-head" data-ui="노트 머리">
      {editing && onDraft
        ? <NoteTitleInput title={title} draft={draft} onDraft={onDraft} />
        : <h1 className="note-title">{title}</h1>}
      {children}
    </div>
  )
}
