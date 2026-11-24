import { useState } from 'react'
import { api, type FeedbackItem } from './api'
import { REPLY } from './feedbackTags'
import { feedbackConversation } from './feedbackThread'
import { eulReul, josa, t } from './i18n'

/**
 * 피드백 처리 · 답에 붙은 시안 (11/19 "고르지 않은 결정은 피드백에서 시안을 제대로 볼 수 없어서"):
 * 에이전트가 feedback_answer의 mockups로 붙이면 서버가 feedback/pictures/로 옮겨 적는다(feedbackMockups.ts).
 * 작은 그림을 누르면 전후 그림과 같은 창(FeedbackViewer.tsx)에 크게 띄워 ← →로 넘기고, html은 작은 그림 아래 링크로 새 창에서 연다.
 * 답할 수 있으면 크게 본 채로 「이 시안으로 진행」 · 「논의」.
 */
export interface FeedbackMockup { stem: string; name: string; pic?: string; html?: string }

export const mockupUrl = (p: string) => `/api/feedback/picture?path=${encodeURIComponent(p)}`

/** 경로를 시안 하나씩으로 묶는다: 같은 이름의 그림과 html은 한 시안. 이름 앞 "날짜-시각-mockup-"은 보이지 않는다 */
export function groupMockups(paths: string[]): FeedbackMockup[] {
  const out: FeedbackMockup[] = []
  for (const p of paths) {
    const stem = p.replace(/\.[^./]+$/, '')
    let m = out.find((x) => x.stem === stem)
    if (!m) {
      m = { stem, name: (stem.split('/').pop() ?? stem).replace(/^\d{4}-\d{2}-\d{2}-\d{4}-mockup-/, '') }
      out.push(m)
    }
    if (/\.html$/i.test(p)) m.html ??= p
    else if (/\.(?:png|jpe?g|webp|gif)$/i.test(p)) m.pic ??= p
  }
  return out.filter((m) => m.pic || m.html)
}

/** 시안의 작은 그림들: 누르면 onOpen(그림 있는 시안 중 몇째)으로 크게 본 창을 연다(FeedbackViewer.tsx). html은 아래 링크로 새 창에 */
export function MockupThumbs({ ms, onOpen }: { ms: FeedbackMockup[]; onOpen(k: number): void }) {
  if (!ms.length) return null
  const shown = ms.filter((m) => m.pic)
  return (
    <div className="ac-mockups fbp-mockups" data-ui="피드백 시안">
      {ms.map((m) => (
        <figure key={m.stem} className="ac-mockup" data-ui="시안" data-ui-item={m.name}>
          {m.pic && <button type="button" className="ac-mockup-pic" aria-label={t(`시안 ${m.name} 크게 보기`, `View mockup ${m.name} large`)} onClick={() => onOpen(shown.indexOf(m))}><img src={mockupUrl(m.pic)} alt={m.name} loading="lazy" /></button>}
          <figcaption>
            <span className="mono ac-mockup-name">{m.name}</span>
            {m.html && <a className="a" data-ui="시안 새 창" href={mockupUrl(m.html)} target="_blank" rel="noopener noreferrer">{t('html 새 창에서 열기 ↗', 'Open html in new window ↗')}</a>}
          </figcaption>
        </figure>
      ))}
    </div>
  )
}

/** 크게 본 창 옆 대화의 글 수 (원문 포함): 접은 띠에 적는다 */
export const threadCount = (e: FeedbackItem) => 1 + feedbackConversation(e).filter((s) => s.kind !== '대기').length

/**
 * 크게 본 시안 오른쪽 칸 위의 주고받은 대화 (11/23 피드백 "논의를 눌렀을 때 대화 이력이 보이지 않아"):
 * 크게 보기가 화면을 덮어 아래 대화를 볼 수 없으니, 원문과 주고받은 글을 시각순으로 짧게 보인다
 */
export function MockupThread({ e }: { e: FeedbackItem }) {
  const steps = feedbackConversation(e).filter((s) => s.kind !== '대기')
  const when = (at?: string) => (at ? at.replace('T', ' ').slice(5, 16) : '')
  return (
    <div className="fbp-mockup-thread" data-ui="시안 옆 대화">
      <div className="muted fbp-mockup-thread-cap">{t('주고받은 대화', 'Conversation')}</div>
      <ol>
        <li className="me"><div className="fbp-mockup-thread-head"><b>{t('원문', 'Original')}</b><span className="muted">{`${e.date.slice(5)} ${e.time}`}</span></div><p>{e.text}</p></li>
        {steps.map((s, i) => (
          <li key={i} className={s.who === '나' ? 'me' : undefined}>
            <div className="fbp-mockup-thread-head">
              <b>{s.who === '나' ? t('사용자', 'User') : t('관리자', 'Maintainer')}</b>
              <span className="tag">{s.who === '나' ? (REPLY[s.kind] ?? s.kind) : s.kind === '답' ? t('답', 'Reply') : s.kind === '다시 처리' ? t('다시 처리', 'Reworked') : t('처리', 'Handled')}</span>
              <span className="muted">{when('at' in s ? s.at : undefined)}</span>
            </div>
            {'note' in s && s.note && <p>{s.note}</p>}
          </li>
        ))}
      </ol>
    </div>
  )
}

/** 크게 본 시안 옆 대화 아래: 「이 시안으로 진행」은 바로 보내고, 「논의」는 글칸을 열어 적은 뒤 보낸다. 보낸 글 앞에 시안 이름이 붙는다 */
export function Decide({ e, name }: { e: FeedbackItem; name: string }) {
  const [talk, setTalk] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<'진행' | '논의' | null>(null)
  const send = (v: '진행' | '논의') => {
    if (v === '논의' && !text.trim()) return
    setBusy(true)
    api.reviewFeedback(e.key, v, v === '진행' ? t(`시안 ${name}${josa(name, '로')} 진행`, `Go ahead with mockup ${name}`) : `${t('시안', 'Mockup')} ${name}: ${text.trim()}`)
      .then(() => { setSent(v); setError(null) }, (err: Error) => setError(err.message)).finally(() => setBusy(false))
  }
  if (sent) return <div className="fbp-mockup-decide muted" role="status">{t(`시안 ${name}에 「${REPLY[sent]}」${eulReul(REPLY[sent] ?? '')} 보냈습니다`, `Sent "${REPLY[sent]}" on mockup ${name}`)}</div>
  return (
    <div className="fbp-mockup-decide" data-ui="시안 결정">
      {talk && (
        <textarea className="fbp-input" autoFocus rows={2} value={text} placeholder={t('이 시안에서 이야기할 것', 'What to talk over in this mockup')} onChange={(ev) => setText(ev.target.value)}
          onKeyDown={(ev) => { if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); send('논의') } }} />
      )}
      <div className="fbp-mockup-decide-row">
        {error && <span className="error-text">{error}</span>}
        <button type="button" className="btn" data-ui="시안 논의" disabled={busy || (talk && !text.trim())} title={t('수정 전에 이 시안을 두고 이야기합니다', 'Talk this mockup over before any change')} onClick={() => (talk ? send('논의') : setTalk(true))}>
          {talk ? t('논의 보내기 (⌘↵)', 'Send discussion (⌘↵)') : t('논의', 'Discuss')}
        </button>
        <button type="button" className="btn primary" data-ui="시안으로 진행" disabled={busy} title={t('이 시안대로 만들게 합니다', 'Have it built as this mockup shows')} onClick={() => send('진행')}>{t('이 시안으로 진행', 'Go ahead with this mockup')}</button>
      </div>
    </div>
  )
}
