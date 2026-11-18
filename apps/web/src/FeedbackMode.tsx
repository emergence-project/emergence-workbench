import { Icon } from './icons'
import { feedbackNote } from './feedbackNote'
import { useEffect, useRef, useState } from 'react'
import { api, feedbackChanged, req, type FeedbackKind } from './api'
import { uiShown } from './uiNames'
import { captureScreen, loadCapture } from './screenCapture'
import { PickHighlight, usePickElement } from './elementPicker'
import { FeedbackText } from './FeedbackPage'
import { go } from './router'
import { onListKey } from './listInput'
import { MemoText } from './memo'
import { hasFeedbackList } from './feedbackFormat'
import { shown, t } from './i18n'
import { newDraftId, readFeedbackDrafts, removeFeedbackDraft, saveFeedbackDraft, type FeedbackDraft } from './feedbackDraft'

/**
 * 피드백 모드: 화면 부위(data-ui가 붙은 요소)에 마우스를 올리면 이름표가 뜨고,
 * 누르면 그 부위에 코멘트를 남긴다. 코멘트는 개인 저장소의 feedback/날짜.md에 쌓인다 (personalRepo.ts).
 * 부위 고르기는 elementPicker.tsx (기록의 가리키기, 대화에 화면 요소 붙이기와 같다)
 */
interface Entry { date: string; time: string; kind: FeedbackKind; target: string; text: string; n: number; snippet?: string }

export function FeedbackMode({ onClose, onSaved }: { onClose(): void; onSaved(message: string): void }) {
  const [pending, setPending] = useState<{ path: string; snippet: string; x: number; y: number; route?: string } | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  /** 이번에 피드백 모드를 켠 뒤 남긴 코멘트. 모드를 끄면 다시 0부터 */
  const [entries, setEntries] = useState<Entry[]>([])
  const [showList, setShowList] = useState(false)
  const [publishable, setPublishable] = useState(false)
  /** 공개 저장소의 새 이슈 주소와 앱 버전: 다른 사용자가 관리자에게 보내는 곳 (docs/maintaining.md) */
  const [kind, setKind] = useState<'수정' | '질문' | '제안' | null>(null)
  const [busy, setBusy] = useState(false)
  // 적던 글 (10/21): 창에 적는 동안 이 브라우저에 두고, 아래 띠에서 이어 쓰거나 버린다. 여러 개면 "적던 글 n"의 목록에서 고른다
  const [drafts, setDrafts] = useState<FeedbackDraft[]>(readFeedbackDrafts)
  const [showDrafts, setShowDrafts] = useState(false)
  /** 지금 창의 글이 어느 적던 글인지 (새 창이면 새 id) */
  const draftId = useRef(newDraftId())
  const pendingRef = useRef(pending)
  useEffect(() => {
    if (!pending || !text.trim()) return
    const d: FeedbackDraft = { id: draftId.current, text, kind, path: pending.path, snippet: pending.snippet, route: pending.route ?? (location.hash || '#/'), at: new Date().toISOString() }
    setDrafts(saveFeedbackDraft(d))
  }, [pending, text, kind])
  pendingRef.current = pending

  // 그림 찍는 모듈은 모드를 켤 때 미리 받아 둔다 (등록할 때 기다리지 않게)
  useEffect(() => { void loadCapture().catch(() => undefined) }, [])

  useEffect(() => {
    api.feedbackState().then((b) => {
      setPublishable(b.publishable)
    }).catch(() => setPublishable(false))
  }, [])

  // 앱 자체의 동작(버튼 누르기, 편집기 커서 이동 등)은 막고 코멘트 창만 연다. 창을 연 동안 다른 부위를 누르면 그 부위로 다시 연다
  const { hover, clear } = usePickElement({
    skip: '[data-feedback-ui]', bodyClass: 'feedback-on', hold: () => !!pendingRef.current,
    onPick: (p) => {
      setPending({ path: p.path, snippet: p.snippet, x: p.x, y: p.y })
      draftId.current = newDraftId()
      setText(''); setKind(null); setError(null)
    },
    onEscape: () => { if (pendingRef.current) setPending(null); else onClose() },
  })

  /** 부위 없이 적기: 화면 한 곳이 아니라 앱 전체 방향에 대한 의견 (10/12). 서버는 빈 부위를 "(부위 없음)"으로 적는다 */
  const openWithoutPart = (e: React.MouseEvent) => {
    clear()
    // 단추 위에 연다 (아래 끝은 pop이 화면 안으로 당긴다)
    setPending({ path: '', snippet: '', x: e.currentTarget.getBoundingClientRect().left - 12, y: innerHeight })
    draftId.current = newDraftId()
    setText(''); setKind('제안'); setError(null)
  }
  /** 적던 글 이어 쓰기: 처음 화면으로 돌아가(그림과 주소가 맞게) 같은 부위의 창을 연다 */
  const resumeDraft = (draft: FeedbackDraft, e: React.MouseEvent) => {
    const left = e.currentTarget.getBoundingClientRect().left - 12
    setShowDrafts(false)
    draftId.current = draft.id
    if ((location.hash || '#/') !== draft.route) location.hash = draft.route
    clear()
    setPending({ path: draft.path, snippet: draft.snippet, x: left, y: innerHeight, route: draft.route })
    setText(draft.text); setKind(draft.kind); setError(null)
  }
  const only = drafts.length === 1 ? drafts[0] : undefined
  const dropDraft = (id: string) => { const list = removeFeedbackDraft(id); setDrafts(list); if (list.length < 2) setShowDrafts(false) }
  /** 오늘 적은 것은 시각, 그 전은 날짜와 시각 */
  const draftTime = (iso: string) => {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
    return d.toDateString() === new Date().toDateString() ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`
  }
  const targetName = (path: string) => (path ? uiShown(path) : t('부위 없음 · 앱 전체에 대한 의견', 'No part · about the app as a whole'))

  const themeName = () => {
    const theme = document.documentElement.getAttribute('data-theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    return theme === 'dark' ? t('다크', 'Dark') : t('라이트', 'Light')
  }

  const save = async (kind: '수정' | '질문' | '제안') => {
    if (!pending || !text.trim() || busy) return
    setBusy(true)
    try {
      // "등록 중…"이 먼저 그려진 뒤 찍는다
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r)))
      const image = (await captureScreen()) ?? undefined
      const res = await req('/api/feedback', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind, target: pending.path, text, snippet: pending.snippet, route: pending.route ?? (location.hash || '#/'), note: feedbackNote(),
          viewport: `${innerWidth}×${innerHeight}`, theme: themeName(), image,
        }),
      })
      const b = await res.json()
      if (!res.ok) throw new Error(b.error)
      setPending(null)
      dropDraft(draftId.current)
      setEntries((prev) => [b.entry as Entry, ...prev])
      feedbackChanged()
      onSaved(t(`피드백 저장됨 — ${pending.path || '부위 없음'}`, `Feedback saved: ${targetName(pending.path)}`))
    } catch (e) {
      setError((e as Error).message)
    } finally { setBusy(false) }
  }

  // 코멘트 창을 누른 자리 근처에, 화면 밖으로 나가지 않게
  const pop = pending && { left: Math.max(12, Math.min(pending.x + 12, innerWidth - 380)), top: Math.max(12, Math.min(pending.y + 12, innerHeight - 300)) }

  return (
    <>
      <div className="fb-bar" data-feedback-ui>
        <b>{t('피드백 모드', 'Feedback mode')}</b>
        {only && !pending
          ? <>
            <span className="fb-draft" title={only.text}>{t('적던 글', 'Unsent draft')} · {draftTime(only.at)} · {targetName(only.path)}{only.kind && ` · ${shown(only.kind)}`}</span>
            <button className="a" data-ui="적던 글 이어 쓰기" onClick={(e) => resumeDraft(only, e)}>{t('이어 쓰기', 'Continue')}</button>
            <button className="a" data-ui="적던 글 버리기" onClick={() => dropDraft(only.id)}>{t('버리기', 'Discard')}</button>
          </>
          : drafts.length > 1 && !pending
          ? <button className={`a${showDrafts ? ' on' : ''}`} data-ui="적던 글 목록" onClick={() => setShowDrafts((v) => !v)}>{t(`적던 글 ${drafts.length}`, `Unsent drafts ${drafts.length}`)}</button>
          : <span>{t('부위에 마우스를 올리면 이름이 뜹니다. 누르면 그 부위에 피드백을 남깁니다. 앱은 이 동안 눌러도 반응하지 않습니다.', 'Hover over a part to see its name. Click to leave feedback on it. The app does not respond to clicks while this is on.')}</span>}
        <span className="sp" />
        <button className="a" data-ui="부위 없이 적기" title={t('화면 한 곳이 아니라 앱 전체 방향에 대한 의견을 남깁니다', 'Leave feedback about the app as a whole, not one part of the screen')} onClick={openWithoutPart}>{t('부위 없이 적기', 'Without a part')}</button>
        <button className="a" data-ui="이번에 남긴 코멘트" onClick={() => setShowList((v) => !v)}>{t(`이번에 남긴 피드백 ${entries.length}`, `Feedback this session ${entries.length}`)}</button>
        {/* 피드백 등록은 피드백 화면 한 곳에서 (10/4 피드백: 같은 일은 담당 화면 하나에서 하고 나머지는 거기로 가는 길) */}
        <button className="a" data-ui="모아 보기" title={t('모든 피드백과 반영 여부. 피드백 등록도 여기서 합니다', 'All feedback and whether it was applied. Submit feedback there too')} onClick={() => { onClose(); go({ page: 'feedback' }) }}>{publishable ? t('모아 보기·등록', 'View all · submit') : t('모아 보기', 'View all')}</button>
        <button className="btn primary sm" onClick={onClose}>{t('끝내기', 'Exit')} <kbd>Esc</kbd></button>
      </div>

      {!pending && <PickHighlight hover={hover} />}

      {pending && pop && (
        <div className="fb-pop" data-feedback-ui style={{ ...pop, maxHeight: `calc(100dvh - ${pop.top}px - var(--sp-3))` }} role="dialog" aria-label={t('피드백 남기기', 'Leave feedback')}>
          <div className="fb-pop-head"><div className="fb-target">{targetName(pending.path)}</div><button className="icon-btn" data-tip={t('닫기', 'Close')} aria-label={t('닫기', 'Close')} onClick={() => setPending(null)}>{Icon.x}</button></div>
          {pending.snippet && <div className="fb-snippet">“{pending.snippet}”</div>}
          <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={t('무엇이 어떤지, 어떻게 되면 좋겠는지 (- 로 목록, Tab 들여쓰기 · ⌘↵ 저장)', 'What is wrong and how it should be (- for a list, Tab to indent · ⌘↵ to save)')}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (kind) void save(kind) } else onListKey(e, setText) }} />
          {hasFeedbackList(text) && <div className="fb-preview" aria-label={t('피드백 미리보기', 'Feedback preview')}><MemoText text={text} /></div>}
          {error && <div className="error-text">{error}</div>}
          <div className="fb-actions">
            <div className="segmented small fb-kind" role="radiogroup" aria-label={t('코멘트 유형', 'Comment type')}>
              {(['수정', '질문', '제안'] as const).map((k) => <button key={k} type="button" role="radio" className={kind === k ? 'on' : ''} aria-checked={kind === k} onClick={() => setKind(k)}>{shown(k)}</button>)}
            </div>
            <button className="btn primary" disabled={!text.trim() || !kind || busy} data-tip={kind ? undefined : t('유형을 고르면 등록됩니다', 'Choose a type to post')} onClick={() => kind && void save(kind)}>{busy ? t('등록 중…', 'Submitting…') : <>{t('의견 등록', 'Submit')} <span className="kbd">⌘↵</span></>}</button>
          </div>
        </div>
      )}

      {showDrafts && drafts.length > 1 && !pending && (
        <div className="fb-list fb-drafts" data-feedback-ui data-ui="적던 글 목록 칸">
          <div className="fb-list-head"><b>{t(`적던 글 ${drafts.length}`, `Unsent drafts ${drafts.length}`)}</b><button className="a" onClick={() => setShowDrafts(false)}>{t('닫기', 'Close')}</button></div>
          {drafts.map((d) => (
            <div key={d.id} className="fb-entry">
              <div className="fb-entry-head">{d.kind && <span className="tag">{shown(d.kind)}</span>}<span className="muted">{draftTime(d.at)}</span><span className="sp" />
                <button className="a" data-ui="적던 글 이어 쓰기" onClick={(e) => resumeDraft(d, e)}>{t('이어 쓰기', 'Continue')}</button>
                <button className="a" data-ui="적던 글 버리기" onClick={() => dropDraft(d.id)}>{t('버리기', 'Discard')}</button>
              </div>
              <div className="fb-target">{targetName(d.path)}</div>
              <div className="fb-draft-text">{d.text}</div>
            </div>
          ))}
        </div>
      )}
      {showList && (
        <div className="fb-list" data-feedback-ui>
          <div className="fb-list-head"><b>{t('이번에 남긴 피드백', 'Feedback this session')}</b><button className="a" onClick={() => setShowList(false)}>{t('닫기', 'Close')}</button></div>
          {entries.length === 0 ? <p className="muted">{t('아직 없습니다.', 'None yet.')}</p> : entries.map((e, i) => (
            <div key={i} className="fb-entry">
              <div className="fb-entry-head"><span className="tag">{shown(e.kind)}</span><span className="muted">{e.time}</span></div>
              <div className="fb-target">{e.target}</div>
              <FeedbackText e={e} onChanged={(text, kind) => setEntries((prev) => text === null ? prev.filter((x) => x !== e) : prev.map((x) => (x === e ? { ...x, text, ...(kind && { kind }) } : x)))} />
            </div>
          ))}
          <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{t('지난 피드백과 반영 여부는 레일의 피드백에서 봅니다. 파일: 개인 저장소의 feedback/', 'See past feedback and whether it was applied under Feedback in the rail. Files: feedback/ in your personal repository')}</p>
        </div>
      )}
    </>
  )
}
