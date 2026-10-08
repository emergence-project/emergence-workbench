import { useState } from 'react'
import type { ManuscriptInfo, NoteKind, ResearchApi } from './api'
import { go } from './router'
import { plural, t } from './i18n'

/** 노트 구분 이름 (10/4 피드백: 모든 프로젝트에 같은 셋) */
export const NOTE_KIND_LABEL: Record<NoteKind, string> = { paper: t('원고', 'Manuscript'), note: t('연구노트', 'Research note'), calc: t('연구노트', 'Research note') }
export const NOTE_KIND_DESC: Record<NoteKind, string> = {
  paper: t('결과를 모으는 개인 초고', 'A personal draft that collects results'),
  note: t('원고를 복사해 고쳐 쓰는 증명·유도', 'Proofs and derivations reworked from a copy of the manuscript'),
  calc: t('수치 계산과 그 결과·그림', 'Numerical calculations with their results and figures'),
}

const BLANK = '(blank)'

/**
 * 연구노트·계산 노트 만들기 (workbench/notes/, workbench/calc/ 아래 폴더 하나).
 * 시작은 빈 노트(LaTeX 공통 설정) 또는 원고 복사. 원고는 건드리지 않는다.
 */
export function NewNote({ rid, rapi, manuscripts, from, onChanged, onSaved, onClose }: {
  rid: string; rapi: ResearchApi; manuscripts: ManuscriptInfo[]; from?: string
  onChanged(): void; onSaved(message: string): void; onClose(): void
}) {
  const papers = manuscripts.filter((m) => m.kind === 'paper')
  const [kind, setKind] = useState<'note' | 'calc'>('note')
  // 첫 원고의 key가 ''라서 "빈 노트"는 따로 표시한다
  const [start, setStart] = useState(from ?? BLANK)
  const src = from !== undefined ? papers.find((m) => m.key === from) : undefined
  const [name, setName] = useState(src ? t(`${src.name} 연구노트`, `${src.name} research note`) : '')
  const [busy, setBusy] = useState(false)
  const create = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      const r = await rapi.createNote(kind, name.trim(), start === BLANK ? undefined : start)
      onSaved(t(`${NOTE_KIND_LABEL[r.kind]} "${r.name}"을 만들었습니다 (${r.path}${r.skipped.length ? ` · 원고 폴더 밖이라 복사하지 않은 파일 ${r.skipped.length}개: ${r.skipped.join(', ')}` : ''})`,
        `Created ${NOTE_KIND_LABEL[r.kind]!.toLowerCase()} "${r.name}" (${r.path}${r.skipped.length ? ` · ${plural(r.skipped.length, 'file')} outside the manuscript folder not copied: ${r.skipped.join(', ')}` : ''})`))
      onChanged(); onClose()
      go({ page: 'part', rid, file: r.path })
    } catch (e) { onSaved((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="new-note" data-ui="새 노트">
      <div className="nn-row">
        <div className="segmented small" role="radiogroup" data-ui="노트 구분 고르기">
          {(['note', 'calc'] as const).map((k) => (
            <button key={k} role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{k === 'note' ? t('증명·유도', 'Proof and derivation') : t('계산·결과', 'Calculation and results')}</button>
          ))}
        </div>
        <span className="muted">{NOTE_KIND_DESC[kind]}</span>
      </div>
      <div className="nn-row">
        <input className="nn-name" placeholder={t('이름 (예: 정리 1 증명 노트)', 'Name (e.g. Theorem 1 proof note)')} value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void create(); if (e.key === 'Escape') onClose() }} />
        <select className="mini-select" aria-label={t('어떻게 시작할지', 'How to start')} data-ui="시작 고르기" value={start} onChange={(e) => setStart(e.target.value)}>
          <option value={BLANK}>{t('빈 노트로 시작', 'Start with a blank note')}</option>
          {papers.map((m) => <option key={m.key} value={m.key}>{t(`원고 "${m.name}" 복사`, `Copy manuscript "${m.name}"`)}</option>)}
        </select>
        <button className="btn primary" disabled={busy || !name.trim()} onClick={() => void create()}>{t('만들기', 'Create')}</button>
        <button className="btn" onClick={onClose}>{t('닫기', 'Close')}</button>
      </div>
    </div>
  )
}
