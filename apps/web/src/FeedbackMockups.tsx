import { useState } from 'react'
import { api, type FeedbackItem } from './api'
import { PictureGallery, type GalleryPicture } from './PictureGallery'
import { REPLY } from './feedbackTags'
import { josa, t } from './i18n'

/**
 * 피드백 처리 · 답에 붙은 시안 (11/19 "고르지 않은 결정은 피드백에서 시안을 제대로 볼 수 없어서"):
 * 에이전트가 feedback_answer의 mockups로 붙이면 서버가 feedback/pictures/로 옮겨 적는다(feedbackMockups.ts).
 * 작은 그림을 누르면 크게 띄워 ← →로 넘기고, html이 있으면 새 창에서 연다. decide면 크게 본 채로 「이 시안으로 진행」 · 「논의」.
 */
export interface FeedbackMockup { stem: string; name: string; pic?: string; html?: string }

const url = (p: string) => `/api/feedback/picture?path=${encodeURIComponent(p)}`

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

export function FeedbackMockups({ e, paths, decide }: { e: FeedbackItem; paths?: string[]; decide?: boolean }) {
  const [big, setBig] = useState<number | null>(null)
  const ms = groupMockups(paths ?? [])
  if (!ms.length) return null
  const shown = ms.filter((m) => m.pic)
  const pictures: GalleryPicture[] = shown.map((m) => ({ src: url(m.pic ?? ''), label: `${t('시안', 'Mockup')} · ${m.name}`, alt: m.name, ...(m.html && { html: url(m.html) }) }))
  return (
    <div className="ac-mockups fbp-mockups" data-ui="피드백 시안">
      {ms.map((m) => (
        <figure key={m.stem} className="ac-mockup" data-ui="시안" data-ui-item={m.name}>
          {m.pic && <button type="button" className="ac-mockup-pic" aria-label={t(`시안 ${m.name} 크게 보기`, `View mockup ${m.name} large`)} onClick={() => setBig(shown.indexOf(m))}><img src={url(m.pic)} alt={m.name} loading="lazy" /></button>}
          <figcaption>
            <span className="mono ac-mockup-name">{m.name}</span>
            {m.html && <a className="a" data-ui="시안 새 창" href={url(m.html)} target="_blank" rel="noopener noreferrer">{t('html 새 창에서 열기 ↗', 'Open html in new window ↗')}</a>}
          </figcaption>
        </figure>
      ))}
      {big !== null && <PictureGallery pictures={pictures} start={big} onClose={() => setBig(null)} foot={decide ? (p) => <Decide key={p.src} e={e} name={p.alt} /> : undefined} />}
    </div>
  )
}

/** 크게 본 시안 아래: 「이 시안으로 진행」은 바로 보내고, 「논의」는 글칸을 열어 적은 뒤 보낸다. 보낸 글 앞에 시안 이름이 붙는다 */
function Decide({ e, name }: { e: FeedbackItem; name: string }) {
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
  if (sent) return <div className="fbp-mockup-decide muted" role="status">{t(`시안 ${name}에 「${REPLY[sent]}」을 보냈습니다`, `Sent "${REPLY[sent]}" on mockup ${name}`)}</div>
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
