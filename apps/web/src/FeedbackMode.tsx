import { Icon } from './icons'
import { feedbackNote } from './feedbackNote'
import { useEffect, useRef, useState } from 'react'
import { feedbackChanged, req } from './api'
import { uiShown } from './uiNames'
import { FeedbackText } from './FeedbackPage'
import { go } from './router'
import { onListKey } from './listInput'
import { MemoText } from './memo'
import { hasFeedbackList, issueDraftUrl } from './feedbackFormat'
import { t } from './i18n'

/**
 * 피드백 모드: 화면 부위(data-ui가 붙은 요소)에 마우스를 올리면 이름표가 뜨고,
 * 누르면 그 부위에 코멘트를 남긴다. 코멘트는 개인 저장소의 feedback/날짜.md에 쌓인다 (personalRepo.ts).
 * 부위 이름은 바깥 부위부터 이어 붙인다: data-ui="블록" > data-ui="속성 표" > data-ui="다른 시도"
 *   → "블록 › 속성 표 › 다른 시도"
 */
interface Entry { date: string; time: string; kind: string; target: string; text: string; n: number; snippet?: string }

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** 같은 종류가 여럿인 부위(카드, 블록 칩 등)는 data-ui-item으로 어느 것인지 덧붙인다: 카드 “Cor 3.9.1 거리 보존” */
export function uiPath(el: Element | null): string {
  const names: string[] = []
  for (let cur = el; cur; cur = cur.parentElement) {
    const n = cur.getAttribute('data-ui')
    if (!n) continue
    const item = cur.getAttribute('data-ui-item')
    names.push(item ? `${n} “${clip(item, 24)}”` : n)
  }
  return names.reverse().join(' › ')
}

/** 가리킨 부위의 글자. 요소 사이 글자가 붙지 않게(<b>다음</b>Prop → 다음 Prop) 글자 조각마다 띄운다 */
function snippetOf(el: Element): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return clip(el.value.trim(), 80)
  const parts: string[] = []
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n && parts.join(' ').length < 120; n = walker.nextNode()) parts.push(n.textContent ?? '')
  return clip(parts.join(' ').replace(/\s+/g, ' ').trim(), 80)
}

/**
 * 코멘트를 남기는 순간의 화면 그림 (JPEG). 에이전트는 글만으로는 사용자 화면을 볼 수 없어서 함께 남긴다.
 * 피드백 모드 자체의 창은 빼고, PDF처럼 그림으로 옮길 수 없는 부분은 비어 보일 수 있다. 실패해도 코멘트는 그대로 저장한다
 */
async function captureScreen(): Promise<string | null> {
  try {
    const { toJpeg } = await import('html-to-image')
    return await toJpeg(document.body, {
      quality: 0.8, pixelRatio: 1, width: innerWidth, height: innerHeight,
      filter: (n) => !(n instanceof Element && n.hasAttribute('data-feedback-ui')),
    })
  } catch { return null }
}

function isOwnUi(t: EventTarget | null): boolean {
  return t instanceof Element && !!t.closest('[data-feedback-ui]')
}

export function FeedbackMode({ onClose, onSaved }: { onClose(): void; onSaved(message: string): void }) {
  const [hover, setHover] = useState<{ rect: DOMRect; path: string } | null>(null)
  const [pending, setPending] = useState<{ path: string; snippet: string; x: number; y: number } | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  /** 이번에 피드백 모드를 켠 뒤 남긴 코멘트. 모드를 끄면 다시 0부터 */
  const [entries, setEntries] = useState<Entry[]>([])
  const [showList, setShowList] = useState(false)
  const [publishable, setPublishable] = useState(false)
  /** 공개 저장소의 새 이슈 주소와 앱 버전: 다른 사용자가 관리자에게 보내는 곳 (docs/maintaining.md) */
  const [issues, setIssues] = useState<{ url: string; version: string | null } | null>(null)
  const hoverEl = useRef<Element | null>(null)
  const shot = useRef<Promise<string | null> | null>(null)
  const pendingRef = useRef(pending)
  pendingRef.current = pending

  useEffect(() => {
    req('/api/feedback').then((r) => r.json()).then((b) => {
      setPublishable(!!b.publishable)
      setIssues(typeof b.issues === 'string' ? { url: b.issues, version: b.version ?? null } : null)
    }).catch(() => setPublishable(false))
  }, [])

  useEffect(() => {
    const target = (e: Event) => (e.target instanceof Element ? e.target.closest('[data-ui]') : null)
    const move = (e: MouseEvent) => {
      if (pendingRef.current || isOwnUi(e.target)) return
      const el = target(e)
      hoverEl.current = el
      setHover(el ? { rect: el.getBoundingClientRect(), path: uiPath(el) } : null)
    }
    // 앱 자체의 동작(버튼 누르기, 편집기 커서 이동 등)은 막고 코멘트 창만 연다
    const block = (e: Event) => {
      if (isOwnUi(e.target)) return
      e.preventDefault()
      e.stopPropagation()
    }
    const click = (e: MouseEvent) => {
      if (isOwnUi(e.target)) return
      block(e)
      const el = target(e)
      if (!el) return
      shot.current = captureScreen()
      setPending({ path: uiPath(el), snippet: snippetOf(el), x: e.clientX, y: e.clientY })
      setText(''); setError(null)
    }
    const refresh = () => { const el = hoverEl.current; if (el) setHover({ rect: el.getBoundingClientRect(), path: uiPath(el) }) }
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // 뒤에 열린 대화상자까지 닫히지 않게 여기서 멈춘다
      e.preventDefault()
      e.stopPropagation()
      if (pendingRef.current) setPending(null)
      else onClose()
    }
    window.addEventListener('mousemove', move, true)
    for (const t of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick'] as const) window.addEventListener(t, block, true)
    window.addEventListener('click', click, true)
    window.addEventListener('scroll', refresh, true)
    window.addEventListener('keydown', key, true)
    document.body.classList.add('feedback-on')
    return () => {
      window.removeEventListener('mousemove', move, true)
      for (const t of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick'] as const) window.removeEventListener(t, block, true)
      window.removeEventListener('click', click, true)
      window.removeEventListener('scroll', refresh, true)
      window.removeEventListener('keydown', key, true)
      document.body.classList.remove('feedback-on')
    }
  }, [onClose])

  const themeName = () => {
    const theme = document.documentElement.getAttribute('data-theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    return theme === 'dark' ? t('다크', 'Dark') : t('라이트', 'Light')
  }

  /** 공개 이슈 초안을 새 탭에 열고, 같은 코멘트를 여기에도 저장한다. 창은 누른 순간에 열어야 막히지 않는다 */
  const sendToGithub = () => {
    if (!pending || !text.trim() || !issues) return
    const url = issueDraftUrl(issues.url, {
      text, area: uiShown(pending.path) === pending.path ? pending.path : `${uiShown(pending.path)} (${pending.path})`, snippet: pending.snippet, route: location.hash || '#/', version: issues.version,
      environment: `${navigator.platform} · ${innerWidth}×${innerHeight} · ${themeName()}`,
    })
    window.open(url, '_blank', 'noopener')
    void save()
  }

  const save = async (kind: '질문' | '요청' = '요청') => {
    if (!pending || !text.trim()) return
    try {
      const image = (await shot.current) ?? undefined
      const res = await req('/api/feedback', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind, target: pending.path, text, snippet: pending.snippet, route: location.hash || '#/', note: feedbackNote(),
          viewport: `${innerWidth}×${innerHeight}`, theme: themeName(), image,
        }),
      })
      const b = await res.json()
      if (!res.ok) throw new Error(b.error)
      setPending(null)
      setEntries((prev) => [b.entry as Entry, ...prev])
      feedbackChanged()
      onSaved(t(`피드백 저장됨 — ${pending.path}`, `Feedback saved: ${uiShown(pending.path)}`))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  // 코멘트 창을 누른 자리 근처에, 화면 밖으로 나가지 않게
  const pop = pending && { left: Math.max(12, Math.min(pending.x + 12, innerWidth - 380)), top: Math.max(12, Math.min(pending.y + 12, innerHeight - 300)) }

  return (
    <>
      <div className="fb-bar" data-feedback-ui>
        <b>{t('피드백 모드', 'Feedback mode')}</b>
        <span>{t('부위에 마우스를 올리면 이름이 뜹니다. 누르면 그 부위에 피드백을 남깁니다. 앱은 이 동안 눌러도 반응하지 않습니다.', 'Hover over a part to see its name. Click to leave feedback on it. The app does not respond to clicks while this is on.')}</span>
        <span className="sp" />
        <button className="fb-link" data-ui="이번에 남긴 코멘트" onClick={() => setShowList((v) => !v)}>{t(`이번에 남긴 피드백 ${entries.length}`, `Feedback this session ${entries.length}`)}</button>
        {/* 피드백 등록은 피드백 화면 한 곳에서 (10/4 피드백: 같은 일은 담당 화면 하나에서 하고 나머지는 거기로 가는 길) */}
        <button className="fb-link" data-ui="모아 보기" title={t('모든 피드백과 반영 여부. 피드백 등록도 여기서 합니다', 'All feedback and whether it was applied. Submit feedback there too')} onClick={() => { onClose(); go({ page: 'feedback' }) }}>{publishable ? t('모아 보기·등록', 'View all · submit') : t('모아 보기', 'View all')}</button>
        <button className="fb-btn" onClick={onClose}>{t('끝내기', 'Exit')} <kbd>Esc</kbd></button>
      </div>

      {hover && !pending && (
        <>
          <div className="fb-box" style={{ left: hover.rect.left - 2, top: hover.rect.top - 2, width: hover.rect.width + 4, height: hover.rect.height + 4 }} />
          <div className="fb-label" style={{ left: Math.max(4, hover.rect.left - 2), top: hover.rect.top > 28 ? hover.rect.top - 24 : hover.rect.bottom + 4 }}>{uiShown(hover.path)}</div>
        </>
      )}

      {pending && pop && (
        <div className="fb-pop" data-feedback-ui style={{ ...pop, maxHeight: `calc(100dvh - ${pop.top}px - var(--sp-3))` }} role="dialog" aria-label={t('피드백 남기기', 'Leave feedback')}>
          <div className="fb-pop-head"><div className="fb-target">{uiShown(pending.path)}</div><button className="icon-btn" data-tip={t('닫기', 'Close')} aria-label={t('닫기', 'Close')} onClick={() => setPending(null)}>{Icon.x}</button></div>
          {pending.snippet && <div className="fb-snippet">“{pending.snippet}”</div>}
          <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={t('무엇이 어떤지, 어떻게 되면 좋겠는지 (- 로 목록, Tab 들여쓰기 · ⌘↵ 저장)', 'What is wrong and how it should be (- for a list, Tab to indent · ⌘↵ to save)')}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save() } else onListKey(e, setText) }} />
          {hasFeedbackList(text) && <div className="fb-preview" aria-label={t('피드백 미리보기', 'Feedback preview')}><MemoText text={text} /></div>}
          {error && <div className="error-text">{error}</div>}
          <div className="fb-actions">
            {issues && (
              <button className="btn fb-send" disabled={!text.trim()} onClick={sendToGithub}
                title={t('공개 저장소에 이슈 초안을 새 탭으로 엽니다. 여기에도 저장합니다. 화면 그림은 붙이지 않으니, 연구 내용이 보이지 않는 그림만 직접 붙이세요', 'Opens an issue draft on the public repository in a new tab. It is also saved here. Screenshots are not attached; add only pictures that show no research content.')}>{t('GitHub에 보내기', 'Send to GitHub')}</button>
            )}
            <button className="btn primary" disabled={!text.trim()} onClick={() => void save('요청')}>{t('수정 요청', 'Request change')} <span className="kbd">⌘↵</span></button>
            <button className="btn" disabled={!text.trim()} onClick={() => void save('질문')}>{t('질문', 'Question')}</button>
          </div>
        </div>
      )}

      {showList && (
        <div className="fb-list" data-feedback-ui>
          <div className="fb-list-head"><b>{t('이번에 남긴 피드백', 'Feedback this session')}</b><button className="fb-link" onClick={() => setShowList(false)}>{t('닫기', 'Close')}</button></div>
          {entries.length === 0 ? <p className="muted">{t('아직 없습니다.', 'None yet.')}</p> : entries.map((e, i) => (
            <div key={i} className="fb-entry">
              <div className="fb-entry-head"><span className="tag">{e.kind === '미분류' ? t('미분류', 'Unsorted') : e.kind}</span><span className="muted">{e.time}</span></div>
              <div className="fb-target">{e.target}</div>
              <FeedbackText e={e} onChanged={(text) => setEntries((prev) => text === null ? prev.filter((x) => x !== e) : prev.map((x) => (x === e ? { ...x, text } : x)))} />
            </div>
          ))}
          <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{t('지난 피드백과 반영 여부는 레일의 피드백에서 봅니다. 파일: 개인 저장소의 feedback/', 'See past feedback and whether it was applied under Feedback in the rail. Files: feedback/ in your personal repository')}</p>
        </div>
      )}
    </>
  )
}
