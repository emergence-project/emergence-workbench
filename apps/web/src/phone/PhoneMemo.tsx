import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { flash } from '../flash'
import { t } from '../i18n'
import { Icon } from '../icons'
import { qk } from '../queries'
import type { Route } from '../router'
import { recordWrites } from '../useRecordActions'
import { Sheet } from './Sheet'

const KINDS = ['메모', '할 일', '질문'] as const
type Kind = typeof KINDS[number]
const KIND_NAME: Record<Kind, () => string> = { 메모: () => t('메모', 'Memo'), '할 일': () => t('할 일', 'To-do'), 질문: () => t('질문', 'Question') }

/** 지금 화면의 프로젝트: 프로젝트 화면이면 그것, 아니면 없음 */
const routeProject = (r: Route): string | undefined => ('rid' in r ? r.rid : r.page === 'projects' ? r.project : undefined)

/**
 * 폰의 ＋ 메모 (10/31 폰 시안 ①, 3단계): 어느 화면에서나 오른쪽 아래 버튼으로 프로젝트 기록(메모 · 할 일 · 질문)을 남긴다.
 * 프로젝트는 지금 보는 프로젝트가 먼저 골라져 있다. 쓴 것은 그 프로젝트의 기록 › 이 프로젝트에 붙는다(맥 기록 화면과 같은 파일).
 */
export function PhoneMemo({ route }: { route: Route }) {
  const [open, setOpen] = useState(false)
  // 대화 화면에는 입력란이 있고, 설정에는 기록할 곳이 없어 버튼을 두지 않는다
  if (route.page === 'agent' || route.page === 'settings') return null
  return <>
    <button className="ph-fab" data-ui="폰 메모 버튼" aria-label={t('메모 남기기', 'Write a memo')} onClick={() => setOpen(true)}>{Icon.plus}<span>{t('메모', 'Memo')}</span></button>
    {open && <MemoSheet start={routeProject(route)} onClose={() => setOpen(false)} />}
  </>
}

function MemoSheet({ start, onClose }: { start?: string; onClose(): void }) {
  const projects = (useQuery({ queryKey: qk.researches, queryFn: () => api.researches() }).data?.researches ?? []).filter((r) => r.available && r.state !== 'done')
  const [picked, setPicked] = useState(start)
  const rid = picked ?? projects[0]?.id
  const project = projects.find((r) => r.id === rid)
  const [kind, setKind] = useState<Kind>('메모')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    if (!project || !text.trim()) return
    setBusy(true); setError(null)
    try {
      await recordWrites(project.id).add('project', { kind, text: text.trim(), title: project.title })
      flash(t(`${kind} 저장됨 — 기록 · ${project.title}`, `${KIND_NAME[kind]()} saved to records · ${project.title}`))
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  return (
    <Sheet head={t('메모 남기기', 'Write a memo')} ui="폰 메모 시트" onClose={onClose}>
      {error && <div className="banner danger" role="alert">{error}</div>}
      <select className="rs-select ph-memo-project" aria-label={t('프로젝트', 'Project')} value={rid ?? ''} onChange={(e) => setPicked(e.target.value)}>
        {projects.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
      </select>
      <div className="segmented ph-seg" role="radiogroup" aria-label={t('종류', 'Kind')}>
        {KINDS.map((k) => <button key={k} role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{KIND_NAME[k]()}</button>)}
      </div>
      <textarea className="fbp-input ph-memo-text" rows={5} autoFocus value={text} onChange={(e) => setText(e.target.value)}
        placeholder={kind === '질문' ? t('에이전트에게 물을 것', 'What to ask the agent') : kind === '할 일' ? t('할 일', 'To-do') : t('메모', 'Memo')} aria-label={KIND_NAME[kind]()} />
      <button className="btn primary ph-memo-save" disabled={busy || !project || !text.trim()} onClick={() => void save()}>{t('저장', 'Save')}</button>
    </Sheet>
  )
}
