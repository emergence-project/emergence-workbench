import { useEffect, useRef, useState } from 'react'
import { conceptsApi, type ConceptTableRow } from './api'
import { t } from './i18n'
import { Icon } from './icons'
import { Group } from './PaperFind'
import { pushRecent } from './ConceptNotes'
import { go } from './router'
import { shortSubject } from './knowledgeRecent'

/**
 * 지식 첫 화면 찾기 칸 (11/8 16:04 질문 진행 11/9, 시안 N7ik 2절): 논문 찾기 칸(PaperFind)과 같은 모양(.pf-box, 42px · 움푹한 바탕 · 돋보기 · 「/」).
 * 글을 쓰면 아래에 ① 개념노트(이름 · 다른 이름이 맞는 것, 이름이 같으면 먼저) ② 본문에 나온 곳(낱말이 모두 든 줄)을 묶어 보인다. 엔터는 첫 노트를 연다.
 */
const EACH = 5
const WAIT = 250
type Hit = { id: string; title: string; hits: { line: number; heading: string; text: string }[] }

export function KnowledgeFind() {
  const [value, setValue] = useState('')
  const [open, setOpen] = useState(false)
  const [found, setFound] = useState<{ q: string; names: ConceptTableRow[]; total: number; body: Hit[] } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const q = value.trim()
  const ready = q.length >= 2

  // 바로 가는 키 「/」: 논문 찾기 칸과 같게, 이 칸이 보이는 동안 앱 전체 검색 대신 이 칸으로
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const el = document.activeElement
      if (el instanceof HTMLElement && (/^(TEXTAREA|INPUT|SELECT)$/.test(el.tagName) || el.isContentEditable)) return
      if (document.querySelector('[role="dialog"]') || !input.current?.offsetParent) return
      e.preventDefault(); e.stopPropagation()
      input.current.focus()
    }
    window.addEventListener('keydown', on, true)
    return () => window.removeEventListener('keydown', on, true)
  }, [])

  useEffect(() => {
    if (!ready) { setFound(null); return }
    let live = true
    const timer = setTimeout(() => {
      Promise.all([conceptsApi.list({ q, limit: EACH }), conceptsApi.search(q, EACH * 2)])
        .then(([l, b]) => { if (live) setFound({ q, names: l.items, total: l.total, body: b }) })
        .catch(() => { if (live) setFound({ q, names: [], total: 0, body: [] }) })
    }, WAIT)
    return () => { live = false; clearTimeout(timer) }
  }, [q, ready])

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!(e.target instanceof Node) || !box.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  const now = found?.q === q ? found : null
  const named = new Set(now?.names.map((n) => n.id))
  // 이름으로 이미 나온 노트는 본문 묶음에서 뺀다
  const body = (now?.body ?? []).filter((b) => b.hits.length > 0 && !named.has(b.id)).slice(0, EACH)
  const openNote = (id: string) => { setOpen(false); setValue(''); pushRecent(id); go({ page: 'library', topic: id }) }

  return (
    <div className="pf kf" ref={box} data-ui="지식 찾기">
      <label className="pf-box">
        <span className="pf-icon" aria-hidden>{Icon.search}</span>
        <input ref={input} type="search" value={value} placeholder={t('개념 이름 · 다른 이름 · 본문', 'Concept name · alias · text')} aria-label={t('지식 찾기', 'Search knowledge')}
          onChange={(e) => { setValue(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setOpen(false); input.current?.blur() }
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) { const first = now?.names[0] ?? body[0]; if (first) { e.preventDefault(); openNote(first.id) } }
          }} />
        {!value && <kbd className="kbd pf-kbd" title={t('「/」를 누르면 이 칸으로 옵니다', 'Press / to jump here')}>/</kbd>}
      </label>
      {open && ready && (
        <div className="pf-pop" data-ui="찾기 결과">
          {!now ? <p className="pf-wait">{t('찾는 중…', 'Searching…')}</p> : <>
            <Group title={t('개념노트', 'Concept notes')} n={now.total}>
              {now.names.map((n) => (
                <button key={n.id} className="pf-row" onClick={() => openNote(n.id)}>
                  <span className="pf-title">{n.title}</span>
                  <span className="pf-meta">{[shortSubject(n.subject), n.aliases.length ? n.aliases.slice(0, 3).join(', ') : ''].filter(Boolean).join(' · ')}</span>
                </button>
              ))}
            </Group>
            <Group title={t('본문에 나온 곳', 'In the text')} n={body.length}>
              {body.map((b) => (
                <button key={b.id} className="pf-row" onClick={() => openNote(b.id)}>
                  <span className="pf-title">{b.title}{b.hits[0]?.heading ? ` › ${b.hits[0].heading}` : ''}</span>
                  <span className="pf-meta">{b.hits[0]?.text ?? ''}</span>
                </button>
              ))}
            </Group>
          </>}
        </div>
      )}
    </div>
  )
}
