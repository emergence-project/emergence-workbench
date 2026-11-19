import { useEffect, useState, type RefObject } from 'react'
import type { Attach } from './api'
import { t } from './i18n'
import { Icon } from './icons'
import { RecordMenu } from './RecordMenus'

/** 대화 줄에서 끌어 고른 글 (뷰포트 좌표 x · y는 메뉴 자리) */
interface Picked { x: number; y: number; text: string; mine: boolean }

/** 대화 줄들(list) 안에서 고른 글: 한 줄(li) 안이고 버튼 · 입력칸이 아닐 때만 */
function readPick(list: HTMLElement): Picked | null {
  const s = window.getSelection()
  if (!s || s.isCollapsed || s.rangeCount === 0) return null
  const range = s.getRangeAt(0)
  const at = (n: Node) => (n instanceof Element ? n : n.parentElement)
  const start = at(range.startContainer)
  const item = start?.closest('li')
  if (!item || !list.contains(item) || start?.closest('button, input, textarea, [contenteditable="true"]')) return null
  const text = s.toString().trim()
  if (!text) return null
  const last = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0).at(-1) ?? range.getBoundingClientRect()
  return { x: last.right, y: last.bottom, text: text.slice(0, 4000), mine: item.classList.contains('ac-me') }
}

/**
 * 대화의 답 일부를 다음 질문에 붙이기 (11/19 "대화에 대한 질문에 컨텍스트 추가").
 * 대화 줄에서 글을 끌어 고르면 그 끝에 「답글」이 뜨고, 누르면 입력란 위에 「고른 글」 칩으로 붙는다.
 * 보내면 에이전트는 그 글을 인용(>)으로 받는다(서버 promptOf, 노트에서 고른 글과 같은 칩). 칩은 ×로 뺀다
 */
export function ChatQuoteMenu({ list, onQuote }: { list: RefObject<HTMLElement | null>; onQuote(a: Attach): void }) {
  const [pick, setPick] = useState<Picked | null>(null)
  useEffect(() => {
    const el = list.current
    if (!el) return
    let timer: ReturnType<typeof setTimeout>
    const read = () => { clearTimeout(timer); timer = setTimeout(() => setPick(readPick(el)), 0) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Shift' || e.key.startsWith('Arrow')) read() }
    el.addEventListener('mouseup', read)
    el.addEventListener('keyup', onKey)
    return () => { clearTimeout(timer); el.removeEventListener('mouseup', read); el.removeEventListener('keyup', onKey) }
  }, [list])
  if (!pick) return null
  const add = () => {
    onQuote({
      kind: 'selection',
      ref: pick.mine ? t('이 대화의 내 지시', 'my earlier message in this conversation') : t('이 대화의 앞 답', 'an earlier answer in this conversation'),
      label: pick.text.replace(/\s+/g, ' ').slice(0, 40),
      text: pick.text,
    })
    setPick(null)
    window.getSelection()?.removeAllRanges()
  }
  return (
    <RecordMenu anchor={pick} owner={list.current} onClose={() => setPick(null)} onDefault={add}>
      <button data-ui="답글" title={t('고른 글을 인용해 이어서 묻습니다', 'Quote the selected text in your next message')} onClick={add}>
        <span className="ico">{Icon.ask}</span> {t('답글', 'Reply')}
      </button>
    </RecordMenu>
  )
}
