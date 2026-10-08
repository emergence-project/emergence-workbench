import { BLOCK_STATUSES, type BlockStatus } from '@rw/core'
import { useEffect, useRef, useState } from 'react'
import type { NoteState } from './api'
import { statusLabel } from './format'
import { Icon } from './icons'
import { StatusDot } from './StatusDot'
import { t } from './i18n'

/** 도구 줄의 네 상태를 연구노트·계산 노트 note.yaml의 기존 값으로 쓴다. */
export const NOTE_STATE: Record<BlockStatus, NoteState> = { 'in-progress': 'active', blocked: 'paused', stopped: 'stopped', solved: 'done' }

/** 노트 상태는 같은 색 점과 이름. 바꿀 수 있을 때만 넷 중에서 고르는 메뉴를 연다. */
export function NoteStatus({ status, onChange, title, disabled }: {
  status: BlockStatus
  onChange?(status: BlockStatus): void
  title?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', escape) }
  }, [open])
  return (
    <div className="note-status" ref={box}>
      {onChange ? <button type="button" className="note-status-control" data-ui="상태 버튼"
        title={t(`상태 바꾸기 — 지금 ${statusLabel(status)}${title ? ` · ${title}` : ''}`, `Change status (now ${statusLabel(status)})${title ? ` · ${title}` : ''}`)} disabled={disabled}
        aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <StatusDot s={status} label /><span className="ico note-status-chevron" aria-hidden>{Icon.forward}</span>
      </button> : <span className="note-status-control" title={title}><StatusDot s={status} label /></span>}
      {open && onChange && <div className="menu note-status-menu" role="menu" data-ui="상태 메뉴" onMouseLeave={() => setOpen(false)}>
        {BLOCK_STATUSES.map((s) => <button key={s} type="button" role="menuitem" className={s === status ? 'on' : ''}
          onClick={() => { setOpen(false); onChange(s) }}><StatusDot s={s} label /></button>)}
      </div>}
    </div>
  )
}
