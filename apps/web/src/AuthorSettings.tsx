import { personId, type Author } from '@rw/core'
import { useEffect, useState } from 'react'
import { latexApi } from './api'
import { go } from './router'
import { askText } from './askText'
import { t } from './i18n'

/**
 * 저자와 소속 (설정 화면). 2026-10-04 요청 "저자 소속은 계정 정보에서 관리하고, export할 때 기계적으로 추가".
 * 순서가 곧 저자 순서다. 저장하면 앱 설정(config.yaml의 authors:)에만 쓴다.
 * 내보낼 때 \author{이름 \thanks{corresponding author}}, \email, \affiliation 줄로 들어간다.
 * 10/4 15:38 피드백 "개별 사람한테서 들어갔을 때 수정하게 하자": 네트워킹 첫 화면은 순서만 다루는 짧은 목록(list),
 * 이름·이메일·소속·교신 저자는 그 사람 페이지(only = 사람 id)에서 고친다.
 */
interface Draft { name: string; email: string; emails?: string[]; corresponding: boolean; affiliations: string }

const toDraft = (a: Author): Draft => ({ name: a.name, email: a.email ?? '', ...(a.emails && { emails: a.emails }), corresponding: !!a.corresponding, affiliations: a.affiliations.join('\n') })
const fromDraft = (d: Draft): Author => ({
  name: d.name.trim(),
  ...(d.email.trim() && { email: d.email.trim() }),
  ...(d.email.trim() && d.emails?.length && { emails: d.emails }),
  ...(d.corresponding && { corresponding: true }),
  affiliations: d.affiliations.split('\n').map((s) => s.trim()).filter(Boolean),
})

export function AuthorSettings({ onSaved, only, list }: { onSaved?(): void; only?: string; list?: boolean } = {}) {
  const [saved, setSaved] = useState<Author[] | null>(null)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [message, setMessage] = useState('')
  useEffect(() => {
    latexApi.get().then((v) => { setSaved(v.authors); setDrafts(v.authors.map(toDraft)) }).catch((e: Error) => setMessage(e.message))
  }, [])
  if (!saved) return <p className="muted">{message || t('불러오는 중…', 'Loading…')}</p>

  const changed = JSON.stringify(drafts.map(fromDraft)) !== JSON.stringify(saved)
  const set = (i: number, patch: Partial<Draft>) => setDrafts(drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)))
  const move = (i: number, by: number) => {
    const next = [...drafts]
    const [d] = next.splice(i, 1)
    next.splice(i + by, 0, d!)
    setDrafts(next)
  }
  const save = async (next = drafts) => {
    try {
      const v = await latexApi.saveAuthors(next.map(fromDraft).filter((a) => a.name))
      setSaved(v.authors); setDrafts(v.authors.map(toDraft)); setMessage(t('저장했습니다', 'Saved')); onSaved?.()
      return true
    } catch (e) { setMessage(t(`저장하지 못했습니다 — ${(e as Error).message}`, `Couldn't save: ${(e as Error).message}`)); return false }
  }
  const actions = (
    <>
      <span className="sp" />
      {message && !changed && <span className="muted">{message}</span>}
      <button className="btn" disabled={!changed} onClick={() => { setDrafts(saved.map(toDraft)); setMessage('') }}>{t('되돌리기', 'Undo')}</button>
      <button className="btn primary" disabled={!changed} onClick={() => void save()}>{t('저장', 'Save')}</button>
    </>
  )

  if (only !== undefined) {
    const i = drafts.findIndex((d, j) => personId(saved[j]?.name ?? d.name) === only)
    const d = drafts[i]
    if (!d) return null
    return (
      <div className="authors" data-ui="저자 목록">
        <div className="author-card" data-ui="저자">
          <div className="author-top">
            <span className="author-n" title={t('저자 순서', 'Author order')}>{i + 1}</span>
            <label className="field author-name"><span>{t('이름', 'Name')}</span><input value={d.name} onChange={(e) => set(i, { name: e.target.value })} /></label>
            <label className="field author-email"><span>{t('이메일 (없으면 비워 둠)', 'Email (leave blank if none)')}</span><input value={d.email} onChange={(e) => set(i, { email: e.target.value })} /></label>
          </div>
          <label className="field"><span>{t('소속 (한 줄에 하나)', 'Affiliations (one per line)')}</span><textarea rows={Math.max(1, d.affiliations.split('\n').length)} value={d.affiliations} onChange={(e) => set(i, { affiliations: e.target.value })} /></label>
          <div className="author-foot">
            <label className="check"><input type="checkbox" checked={d.corresponding} onChange={(e) => set(i, { corresponding: e.target.checked })} />{t('교신 저자', 'Corresponding author')}</label>
            <span className="sp" />
            {message && !changed && <span className="muted">{message}</span>}
            <button className="btn" disabled={!changed} onClick={() => { setDrafts(saved.map(toDraft)); setMessage('') }}>{t('되돌리기', 'Undo')}</button>
            {/* 이름을 바꾸면 사람 주소도 바뀌니 새 주소로 간다 */}
            <button className="btn primary" disabled={!changed} onClick={() => void save().then((ok) => { const id = personId(d.name); if (ok && id !== only) go({ page: 'network', person: id }) })}>{t('저장', 'Save')}</button>
          </div>
        </div>
      </div>
    )
  }

  if (list) {
    const add = async () => {
      const name = (await askText({ title: t('저자 더하기', 'Add author'), label: t('이름', 'Name'), ok: t('더하기', 'Add') }))?.trim()
      if (!name) return
      if (await save([...drafts, { name, email: '', corresponding: false, affiliations: '' }])) go({ page: 'network', person: personId(name) })
    }
    return (
      <div className="authors" data-ui="저자 목록">
        {/* 10/4 17:06 "author 줄 순서는 내보내기에서 지정, 여기는 순서와 무관": 여기서는 저자로 쓸 사람만 고른다 */}
        <ol className="author-rows">
          {drafts.map((d, i) => (
            <li className="author-row" key={i} data-ui="저자" data-ui-item={d.name}>
              <button className="a author-row-name" title={t('이름·이메일·소속은 사람 페이지에서 고칩니다', 'Edit name, email and affiliations on the person page')} onClick={() => go({ page: 'network', person: personId(saved[i]?.name ?? d.name) })}>{d.name}</button>
              {d.corresponding && <span className="tag">{t('교신', 'Corresponding')}</span>}
              <span className="muted author-row-aff">{d.affiliations.split('\n')[0]}</span>
              <button className="icon-btn" title={t('빼기 — 노트 저자에서만 빠지고, 네트워킹의 사람은 그대로 남습니다', 'Remove from note authors only. The person stays in Networking')} aria-label={t('저자에서 빼기', 'Remove from authors')} onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}>×</button>
            </li>
          ))}
        </ol>
        <div className="author-actions">
          <button className="btn" onClick={() => void add()}>{t('저자 더하기', 'Add author')}</button>
          {actions}
        </div>
      </div>
    )
  }

  return (
    <div className="authors" data-ui="저자 목록">
      {drafts.map((d, i) => (
        <div className="author-card" key={i} data-ui="저자">
          <div className="author-top">
            <span className="author-n">{i + 1}</span>
            <label className="field author-name"><span>{t('이름', 'Name')}</span><input value={d.name} onChange={(e) => set(i, { name: e.target.value })} /></label>
            <label className="field author-email"><span>{t('이메일 (없으면 비워 둠)', 'Email (leave blank if none)')}</span><input value={d.email} onChange={(e) => set(i, { email: e.target.value })} /></label>
          </div>
          <label className="field"><span>{t('소속 (한 줄에 하나)', 'Affiliations (one per line)')}</span><textarea rows={Math.max(1, d.affiliations.split('\n').length)} value={d.affiliations} onChange={(e) => set(i, { affiliations: e.target.value })} /></label>
          <div className="author-foot">
            <label className="check"><input type="checkbox" checked={d.corresponding} onChange={(e) => set(i, { corresponding: e.target.checked })} />{t('교신 저자', 'Corresponding author')}</label>
            <span className="sp" />
            <button className="a" disabled={i === 0} onClick={() => move(i, -1)}>{t('위로', 'Move up')}</button>
            <button className="a" disabled={i === drafts.length - 1} onClick={() => move(i, 1)}>{t('아래로', 'Move down')}</button>
            <button className="a" onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}>{t('빼기', 'Remove')}</button>
          </div>
        </div>
      ))}
      <div className="author-actions">
        <button className="btn" onClick={() => setDrafts([...drafts, { name: '', email: '', corresponding: false, affiliations: '' }])}>{t('저자 더하기', 'Add author')}</button>
        <span className="sp" />
        {message && !changed && <span className="muted">{message}</span>}
        <button className="btn" disabled={!changed} onClick={() => { setDrafts(saved.map(toDraft)); setMessage('') }}>{t('되돌리기', 'Undo')}</button>
        <button className="btn primary" disabled={!changed} onClick={() => void save()}>{t('저장', 'Save')}</button>
      </div>
    </div>
  )
}
