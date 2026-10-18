import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { api, ConflictError, type CommonRulesView } from './api'
import { NoteMarkdown } from './NoteMarkdown'
import { StatusDot } from './StatusDot'
import { Icon } from './icons'
import { qk } from './queries'
import { t } from './i18n'
import type { BlockStatus } from '@rw/core'

/**
 * 설정 › 공통 규칙 (2026-10-18 사용자 승인 시안): 모든 연구 저장소의 에이전트가 먼저 읽는 규칙 파일 하나(개인 저장소 사본의 rules/research.md).
 * 읽기는 절마다 그리고, 연필을 누르면 그 자리에 원문(머리말 뺀 본문) 입력란. 저장 · 취소는 머리 줄에만.
 * 저장이 곧 사용자 확인이라 서버가 상태를 확정과 오늘 날짜로 적고, 그 파일만 개인 저장소에 올린다.
 */

/** 파일이 없을 때 만들기가 여는 빈 틀 (서버 routes/commonRules.ts의 COMMON_RULES_TEMPLATE와 같다) */
const TEMPLATE = '# 연구 공통 규칙\n\n## 시작할 때\n\n## 내용\n\n## 고칠 때\n\n## 기록을 두는 곳\n\n## 말\n'

const STATE: Record<string, [BlockStatus, string]> = {
  accepted: ['solved', t('확정', 'Accepted')],
  'in-review': ['blocked', t('검토 중', 'In review')],
  draft: ['in-progress', t('초안', 'Draft')],
}

/** 절 제목의 자리 (사이드바 아래 줄이 옮겨 간다) */
export const ruleSectionId = (i: number) => `common-rules-${i}`

/** 읽기: 맨 위 제목과 첫 절 앞의 머리 글을 떼고(안내 줄이 대신한다) 절마다 나눈다 */
function sectionsOf(body: string): { title: string; text: string }[] {
  const out: { title: string; text: string }[] = []
  for (const part of body.split(/^(?=## )/m)) {
    const m = /^##\s+(.*)\n?/.exec(part)
    if (m) out.push({ title: m[1]!.trim(), text: part.slice(m[0].length).trim() })
  }
  return out
}

export function useCommonRules() {
  return useQuery({ queryKey: qk.commonRules, queryFn: () => api.commonRules() })
}

export function CommonRulesSettings({ onSaved }: { onSaved(message: string): void }) {
  const client = useQueryClient()
  const { data: view, error, refetch } = useCommonRules()
  const [draft, setDraft] = useState<string | null>(null)
  const [base, setBase] = useState('')
  const [stale, setStale] = useState(false)
  const [saving, setSaving] = useState(false)
  const options = useMemo(() => ({}), [])

  const open = (v: CommonRulesView, text: string) => { setBase(v.hash); setDraft(text); setStale(false) }
  const save = async () => {
    if (draft === null) return
    setSaving(true)
    try {
      const r = await api.saveCommonRules(draft, base)
      client.setQueryData(qk.commonRules, r.view)
      setDraft(null)
      onSaved(r.published?.message ?? t('공통 규칙을 저장했습니다', 'Saved the common rules'))
    } catch (e) {
      if (e instanceof ConflictError) setStale(true)
      else onSaved(t(`저장하지 못했습니다 — ${(e as Error).message}`, `Could not save: ${(e as Error).message}`))
    } finally { setSaving(false) }
  }
  const reload = async () => {
    const r = await refetch()
    if (r.data) open(r.data, r.data.body)
  }

  const [s, name] = view?.status ? STATE[view.status] ?? ['in-progress', view.status] : [null, '']
  const head = view?.exists && <>
    {s && <span className="cr-state"><StatusDot s={s} label name={name} /></span>}
    <span className="count">{t(`· 규칙 ${view.count}`, `· ${view.count} rules`)}{view.updated && <>{t(` · 고친 날 ${view.updated}`, ` · edited ${view.updated}`)}</>}</span>
  </>

  return (
    <section data-ui="공통 규칙 묶음" className="cr">
      <div className="sec-head">
        <h2>{t('공통 규칙', 'Common rules')}</h2>{head}<span className="sp" />
        {view && draft === null && view.exists && <button className="icon-btn" data-ui="공통 규칙 고치기" title={t('고치기 — 규칙 파일의 원문을 고칩니다', 'Edit the rules file')} aria-label={t('고치기', 'Edit')} onClick={() => open(view, view.body)}>{Icon.pencil}</button>}
        {draft !== null && <>
          <button className="btn" onClick={() => setDraft(null)}>{t('취소', 'Cancel')}</button>
          <button className="btn primary" disabled={saving || stale || !draft.trim() || draft === view?.body} onClick={() => void save()}>{t('저장', 'Save')}</button>
        </>}
      </div>
      {!view && <p className="muted">{error ? (error as Error).message : t('불러오는 중…', 'Loading…')}</p>}
      {view && draft !== null && <>
        <p className="set-desc"><code>{view.file}</code> {t('원문 (Markdown). 저장하면 상태를 확정으로 적고, 이 파일 하나만 개인 저장소에 올립니다.', 'source (Markdown). Saving marks the rules accepted and pushes only this file to your personal repository.')}</p>
        {stale && <p className="cr-stale" data-ui="공통 규칙 바뀜">{t('그새 규칙 파일이 바뀌었습니다. ', 'The rules file changed in the meantime. ')}<button className="a" onClick={() => void reload()}>{t('다시 읽기', 'Reload')}</button></p>}
        <textarea className="tex-code cr-edit" data-ui="공통 규칙 원문" rows={Math.min(32, Math.max(12, draft.split('\n').length + 1))} value={draft} spellCheck={false} autoFocus onChange={(e) => setDraft(e.target.value)} />
      </>}
      {view && draft === null && !view.exists && (
        <div className="cr-empty" data-ui="공통 규칙 없음">
          <p className="empty">{t('공통 규칙이 아직 없습니다. 만들면 모든 연구 저장소의 에이전트가 먼저 읽습니다.', 'There are no common rules yet. Once created, agents in every research repository read them first.')}</p>
          <button className="btn" onClick={() => open(view, TEMPLATE)}>{t('＋ 공통 규칙 만들기', '＋ Create common rules')}</button>
        </div>
      )}
      {view && draft === null && view.exists && <>
        <p className="set-desc cr-lead">{t('모든 연구 저장소의 에이전트가 이 규칙을 먼저 읽습니다. 각 저장소 ', 'Agents in every research repository read these rules first. The first line of each ')}<code>AGENTS.md</code>{t(' 첫 줄이 이 파일을 가리키고, 저장소 규칙은 여기에 더하거나 더 엄하게만 정합니다. 그 일에 대해 대화에서 직접 정한 것이 둘보다 앞섭니다.', ' points here; repository rules only add to these or make them stricter. What you decide directly in a conversation about that work comes before both.')}</p>
        {view.unpublished && <p className="muted" data-ui="공통 규칙 올리지 못함">{t('고친 규칙을 아직 GitHub에 올리지 못했습니다. 다음 저장 때 함께 올립니다.', 'The edited rules are not on GitHub yet. They are pushed with the next save.')}</p>}
        {sectionsOf(view.body).map((sec, i) => (
          <div key={i} id={ruleSectionId(i)} className="cr-sec">
            <h3 className="set-h3">{sec.title}</h3>
            <NoteMarkdown text={sec.text} options={options} />
          </div>
        ))}
      </>}
    </section>
  )
}
