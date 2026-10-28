import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { agentEditsApi, type EditAction, type EditHunk, type EditReview } from './api'
import { useConceptRender } from './ConceptNotes'
import { onlySpacing, paintDiff } from './diffPaint'
import { ObsidianMarkdown, type RenderOptions } from './ObsidianMarkdown'
import { useAgentEdits } from './projectQueries'
import { qk } from './queries'
import { t } from './i18n'
import { Icon } from './icons'
import { go } from './router'

/**
 * 기록 안의 수정 검토 (10/28 사용자 정정 "이동하지 않고 사이드바에서"): 기록의 대화가 고친 노트의 바뀐 곳을 기록 아래에 펼친다.
 * 좁은 칸이라 전 · 후를 위아래로 두고, 승인 · 되돌리기 · 고치기는 수정 검토 화면과 같은 일을 한다(같은 API)
 */
export function InlineEdits({ rid, files }: { rid: string; files: string[] }) {
  const reviews = useAgentEdits(rid).data?.reviews
  // 옛 배치(notes/)와 주제 폴더 경로가 섞여도 노트 폴더 이름으로 맞춘다 (수정 검토의 고친 대화 줄과 같게)
  const folder = (f: string) => f.split('/').slice(-2).join('/')
  const rows = reviews?.filter((r) => r.target.kind === 'note' && files.some((f) => f === (r.target as { file: string }).file || folder(f) === folder((r.target as { file: string }).file))) ?? []
  if (!reviews) return <p className="muted ie-empty">…</p>
  if (!rows.length) return <p className="muted ie-empty">{t('검토할 고친 곳이 없습니다 (모두 승인했거나 되돌림).', 'No changes left to review (all approved or reverted).')}</p>
  return <div className="ie" data-ui="기록 안 수정 검토">{rows.map((r) => <InlineReview key={r.key} k={r.key} title={r.title} rid={rid} />)}</div>
}

function InlineReview({ k, title, rid }: { k: string; title: string; rid: string }) {
  const client = useQueryClient()
  const [rv, setRv] = useState<EditReview | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState<string | null>(null)
  const render = useConceptRender(rid)
  const load = () => { agentEditsApi.review(k).then((r) => setRv(r.review)).catch((e: Error) => setFail(e.message)) }
  useEffect(load, [k])
  const act = async (h: EditHunk, action: EditAction, text?: string): Promise<boolean> => {
    if (!rv) return false
    setBusy(true); setFail(null)
    try {
      const r = await agentEditsApi.decide(k, rv.hash, h.id, action, text)
      setRv(r.review)
      void client.invalidateQueries({ queryKey: qk.agentEdits(rid) })
      return true
    } catch (e) {
      setFail(/409|바뀌었|changed/.test((e as Error).message) ? t('그사이 노트가 바뀌었습니다. 다시 읽었습니다.', 'The note changed in the meantime. Read it again.') : (e as Error).message)
      load()
      return false
    } finally { setBusy(false) }
  }
  if (rv === undefined) return null
  if (rv === null) return <p className="muted ie-empty">{t('이 노트의 고침은 모두 검토했습니다.', 'All edits to this note are reviewed.')}</p>
  return (
    <div className="ie-note">
      {/* 머리: 노트 이름 · 바뀐 곳 수, 오른쪽 넓게 보기 (자세히 볼 때만 수정 검토 화면으로, 10/28 사용자 답) */}
      <div className="ie-title">
        <span className="ie-name" title={title}>{title}</span>
        <span className="muted">{t(`바뀐 곳 ${rv.hunks.length}`, `${rv.hunks.length} changed`)}</span>
        <span className="sp" />
        <button className="icon-btn sm" data-ui="넓게 보기" data-tip={t('수정 검토에서 넓게 보기', 'Open wide in edit review')} aria-label={t('넓게 보기', 'Open wide')} onClick={() => go({ page: 'edits', rid, key: k })}>{Icon.openNote}</button>
      </div>
      {fail && <p className="error ie-fail">{fail}</p>}
      {rv.hunks.map((h) => <InlineHunk key={h.id} h={h} busy={busy} render={rv.target.kind === 'concept' || (rv.target.kind === 'note' && rv.target.file.endsWith('.md')) ? render : undefined} onAct={act} />)}
    </div>
  )
}

function Text({ text, render }: { text: string; render?: RenderOptions }) {
  return render ? <div className="ae-text ae-md"><ObsidianMarkdown text={text.replace(/\s*\\label\{[^}]*\}/g, '')} options={render} /></div> : <pre className="ae-text">{text}</pre>
}

/** 바뀐 곳 하나: 든 절 · 전(옅게) · 후, 오른쪽 위 아이콘 고치기 · 되돌리기 · 승인 */
function InlineHunk({ h, busy, render, onAct }: { h: EditHunk; busy: boolean; render?: RenderOptions; onAct(h: EditHunk, a: EditAction, text?: string): Promise<boolean> }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [epoch, setEpoch] = useState(0)
  const baseRef = useRef<HTMLDivElement>(null)
  const curRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (baseRef.current && curRef.current && h.base && h.current) paintDiff(baseRef.current, curRef.current)
  }, [h.base, h.current, render, editing === null, epoch]) // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => { setEditing(null); setEpoch((n) => n + 1) }
  return (
    <div className="ie-hunk" data-ui="기록 안 바뀐 곳">
      <div className="ie-head">
        <span className="ie-sec muted" title={h.section}>{h.section?.split(' › ').pop() ?? t('제목 앞', 'Before the first heading')}</span>
        <span className="sp" />
        {editing === null && <>
          <button className="icon-btn sm" disabled={busy} data-ui="고치기 버튼" data-tip={t('고치기', 'Edit')} aria-label={t('고치기', 'Edit')} onClick={() => setEditing(h.current)}>{Icon.pencil}</button>
          <button className="icon-btn sm" disabled={busy} data-ui="되돌리기 버튼" data-tip={t('되돌리기', 'Revert')} aria-label={t('되돌리기: 이 부분만 고치기 전 글로', 'Revert: put back the text from before the edit, for this part only')} onClick={() => void onAct(h, 'revert')}>{Icon.revert}</button>
          <button className="icon-btn sm" disabled={busy} data-ui="승인 버튼" data-tip={t('승인', 'Approve')} aria-label={t('승인: 이 고침을 받아들입니다 (파일은 그대로)', 'Approve: accept this edit (the file stays as it is)')} onClick={() => void onAct(h, 'accept')}>{Icon.approve}</button>
        </>}
      </div>
      <div className="ie-base" ref={baseRef} key={`b${epoch}`}>
        {h.base ? <Text text={h.base} render={render} /> : <p className="ae-none">{t('새 문단', 'New paragraph')}</p>}
      </div>
      <div className="ie-cur">
        {editing !== null ? <>
          <textarea className="ae-edit" aria-label={t('고칠 글', 'Text to edit')} value={editing} rows={Math.min(12, Math.max(3, editing.split('\n').length + 1))} onChange={(e) => setEditing(e.target.value)} autoFocus />
          <div className="ie-edit-acts">
            <button className="btn sm" disabled={busy} onClick={close}>{t('취소', 'Cancel')}</button>
            <button className="btn sm primary" disabled={busy} onClick={() => void onAct(h, 'edit', editing).then((ok) => { if (ok) close() })}>{t('저장', 'Save')}</button>
          </div>
        </> : <div ref={curRef} key={`c${epoch}`}>
          {h.current ? <Text text={h.current} render={render} /> : <p className="ae-none">{t('지운 문단', 'Removed paragraph')}</p>}
          {onlySpacing(h.base, h.current) && <p className="ae-none">{t('띄어쓰기 · 줄바꿈만 바뀜', 'Only spacing or line breaks changed')}</p>}
        </div>}
      </div>
    </div>
  )
}
