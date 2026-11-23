import { useQueries, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { agentChatsApi, mockupUrl } from './api'
import { PictureGallery, type GalleryPicture } from './PictureGallery'
import { qk } from './queries'
import { t } from './i18n'

/** 글에 나온 시안 하나: 작업 폴더(대화 id)와 확장자 뺀 이름 */
export interface MockupRef { dir: string; stem: string }

// …/agent-worktrees/<대화>/mockups/<이름>.png 또는 (그 대화 안에서) mockups/<이름>.html · .{png,html}
const REF = /(?:agent-worktrees\/([\w-]+)\/)?mockups\/([^\s/\\`'"()<>[\]{}|,*]+?)\.(?:png|jpe?g|gif|webp|svg|html|\{[a-z,]+\})(?![\w.])/g

/** 글에서 시안 경로를 찾는다. 작업 폴더가 없는 경로(mockups/a.png)는 이 대화(own)의 것. 같은 시안은 한 번만 */
export function mockupRefs(text: string, own: string): MockupRef[] {
  const out: MockupRef[] = []
  for (const m of text.matchAll(REF)) {
    const ref = { dir: m[1] ?? own, stem: m[2]! }
    if (!out.some((r) => r.dir === ref.dir && r.stem === ref.stem)) out.push(ref)
  }
  return out
}

const PICTURE = ['.png', '.webp', '.jpg', '.jpeg', '.gif', '.svg']

/**
 * 시안 (11/19 "시안이 있을 때 링크를 두거나 여기서 바로 볼 수 있게"): 대화 글에 시안 경로가 나오면 그 글 아래에 그림을 작게 보여 준다.
 * 그림을 누르면 앱 안에서 크게(PictureGallery), 「새 창에서 열기」는 html이 있으면 html, 없으면 그림을 새 창에 연다.
 * 파일은 서버 routes/agentMockups.ts가 그 대화 작업 폴더의 mockups/ 안에서만 내준다. 없는 시안은 그리지 않는다
 */
export function Mockups({ text, chat }: { text?: string; chat: string }) {
  const refs = text ? mockupRefs(text, chat) : []
  const dirs = [...new Set(refs.map((r) => r.dir))]
  const lists = useQueries({ queries: dirs.map((d) => ({ queryKey: qk.agentMockups(d), queryFn: () => agentChatsApi.mockups(d), staleTime: 10_000 })) })
  const [big, setBig] = useState<number | null>(null)
  const found = refs.flatMap((r) => {
    const files = lists[dirs.indexOf(r.dir)]?.data?.files ?? []
    const pic = PICTURE.map((x) => `${r.stem}${x}`).find((f) => files.includes(f))
    const html = files.includes(`${r.stem}.html`) ? `${r.stem}.html` : undefined
    return pic || html ? [{ ...r, pic, html }] : []
  })
  if (!found.length) return null
  const pictures: GalleryPicture[] = found.filter((m) => m.pic).map((m) => ({ src: mockupUrl(m.dir, m.pic!), label: `${t('시안', 'Mockup')} · ${m.stem}`, alt: m.stem, ...(m.html && { html: mockupUrl(m.dir, m.html) }) }))
  return (
    <div className="ac-mockups">
      {found.map((m, i) => {
        const open = mockupUrl(m.dir, m.html ?? m.pic!)
        const at = found.slice(0, i).filter((x) => x.pic).length
        return (
          <figure key={`${m.dir}/${m.stem}`} className="ac-mockup" data-ui="시안" data-ui-item={m.stem}>
            {m.pic && <button type="button" className="ac-mockup-pic" aria-label={t(`시안 ${m.stem} 크게 보기`, `View mockup ${m.stem} large`)} onClick={() => setBig(at)}><img src={mockupUrl(m.dir, m.pic)} alt={m.stem} loading="lazy" /></button>}
            <figcaption>
              <span className="mono ac-mockup-name">{m.stem}</span>
              <a className="a" data-ui="시안 새 창" href={open} target="_blank" rel="noopener noreferrer">{m.html ? t('html 새 창에서 열기 ↗', 'Open html in new window ↗') : t('새 창에서 열기 ↗', 'Open in new window ↗')}</a>
            </figcaption>
          </figure>
        )
      })}
      {big !== null && <PictureGallery pictures={pictures} start={big} onClose={() => setBig(null)} foot={(p) => <MockupSay key={p.src} chat={chat} name={p.alt} />} />}
    </div>
  )
}

/** 시안에 보낼 지시: 앞에 시안 이름을 붙인다 */
export const mockupSay = (name: string, text: string) => `${t('시안', 'Mockup')} ${name}: ${text.trim()}`

/**
 * 크게 본 시안 아래의 지시 한 칸 (11/21 피드백 "아티팩트처럼 바로 에이전트에게 지시해서 수정하라고"):
 * 보내면 이 대화에 「시안 이름: 한 말」로 간다. 일하는 중이면 그 차례에 섞어 읽고, 쉬는 중이면 새 차례를 연다(서버 send)
 */
function MockupSay({ chat, name }: { chat: string; name: string }) {
  const client = useQueryClient()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const send = () => {
    if (!text.trim() || busy) return
    setBusy(true)
    agentChatsApi.send(chat, { text: mockupSay(name, text) })
      .then((r) => { client.setQueryData(qk.agentChat(chat), r); setSent(true); setError(null) }, (err: Error) => setError(err.message))
      .finally(() => setBusy(false))
  }
  if (sent) return <div className="fbp-mockup-decide muted" role="status">{t(`시안 ${name}에 지시를 보냈습니다`, `Sent the instruction on mockup ${name}`)}</div>
  return (
    <div className="fbp-mockup-decide" data-ui="시안 지시">
      <textarea className="fbp-input" rows={2} value={text} placeholder={t('이 시안에서 고칠 것을 에이전트에게 말하세요', 'Tell the agent what to change in this mockup')} onChange={(ev) => setText(ev.target.value)}
        onKeyDown={(ev) => { if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); send() } }} />
      <div className="fbp-mockup-decide-row">
        {error && <span className="error-text">{error}</span>}
        <button type="button" className="btn primary" data-ui="시안 지시 보내기" disabled={busy || !text.trim()} onClick={send}>{t('보내기 (⌘↵)', 'Send (⌘↵)')}</button>
      </div>
    </div>
  )
}
