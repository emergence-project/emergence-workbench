// 상단바 알림 종 (11/20 시안 4절 안 B "알림 아이콘을 두고, 최근 알림을 모아보는게 어떨까?"):
// 제목줄의 「#n 반영됨」 글자 대신 종 하나와 읽지 않은 수. 누르면 지난 7일의 알림을 시간순으로 본다:
// 반영됨(합친 PR이 지금 앱에 들어옴) · 에이전트(내 차례인 대화) · 피드백(내 차례) · 오류(아래에 떴던 실패 알림)
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type ChatRow, type FeedbackItem } from './api'
import { useChatList, stateName } from './AgentChats'
import { feedbackBucket } from './feedbackBuckets'
import { feedbackSummary } from './feedbackFormat'
import { t } from './i18n'
import { Icon } from './icons'
import { qk } from './queries'
import { go } from './router'
import { NOTICE_ERRORS as ERRORS } from './flash'
import { store } from './store'
import { useDismiss } from './useDismiss'

type Kind = 'shipped' | 'agent' | 'feedback' | 'error'
export interface Notice { key: string; kind: Kind; at: string; text: string; open?(): void }

const KIND_NAME: Record<Kind, string> = { shipped: t('반영됨', 'Shipped'), agent: t('에이전트', 'Agent'), feedback: t('피드백', 'Feedback'), error: t('오류', 'Error') }
const SEEN = 'rw-notice-seen'
/** 예전 「#n 반영됨」에서 ×로 닫은 대화 (그 대화의 반영됨은 읽은 것으로) */
const OLD_SHIPPED_SEEN = 'rw-feedback-shipped-seen'
const WEEK = 7 * 24 * 3600_000
const FIRST = 8

/** 알림 목록 (새것이 위). 순수 함수: 테스트에서 부른다 */
export function noticesOf(chats: ChatRow[], feedback: FeedbackItem[], errors: { at: string; text: string }[], now = Date.now()): Notice[] {
  const out: Notice[] = []
  for (const c of chats) {
    if (c.shipped && c.pr) out.push({ key: `shipped:${c.id}`, kind: 'shipped', at: c.updated, text: `#${c.pr.number} ${c.title}`, open: () => go({ page: 'feedback', ...(c.feedback && { key: c.feedback }) }) })
    else if (!c.archived && (c.state === 'waiting' || c.state === 'error')) out.push({ key: `agent:${c.id}:${c.updated}`, kind: 'agent', at: c.updated, text: `「${c.title}」 ${stateName(c)}`, open: () => go({ page: 'agent', id: c.id }) })
  }
  for (const e of feedback) {
    if (feedbackBucket(e, now) !== '확인 필요') continue
    const at = e.status?.handled_at ?? `${e.date}T${e.time}`
    out.push({ key: `feedback:${e.key}:${at}`, kind: 'feedback', at, text: t(`내 차례 · ${feedbackSummary(e.status?.clean ?? e.text)}`, `Your turn · ${feedbackSummary(e.status?.clean ?? e.text)}`), open: () => go({ page: 'feedback', key: e.key }) })
  }
  for (const e of errors) out.push({ key: `error:${e.at}`, kind: 'error', at: e.at, text: e.text })
  return out.filter((n) => now - Date.parse(n.at) < WEEK).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}

const clock = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return d.toDateString() === new Date().toDateString() ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`
}

export function NoticeBell() {
  const chats = useChatList().data?.chats
  const fb = useQuery({ queryKey: qk.feedbackAll, queryFn: () => api.feedbackAll() }).data?.entries
  const [errorsTick, setErrorsTick] = useState(0)
  useEffect(() => { const on = () => setErrorsTick((n) => n + 1); window.addEventListener(ERRORS, on); return () => window.removeEventListener(ERRORS, on) }, [])
  const [seen, setSeen] = useState<string[]>(() => [...store.get<string[]>(SEEN, []), ...store.get<string[]>(OLD_SHIPPED_SEEN, []).map((id) => `shipped:${id}`)])
  const [open, setOpen] = useState(false)
  const [more, setMore] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  useDismiss(open, box, () => setOpen(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const list = useMemo(() => noticesOf(chats ?? [], fb ?? [], store.get(ERRORS, [])), [chats, fb, errorsTick])
  const unread = list.filter((n) => !seen.includes(n.key))
  const mark = (keys: string[]) => { const next = [...new Set([...seen, ...keys])].slice(-400); store.set(SEEN, next); setSeen(next) }
  const shown = more ? list : list.slice(0, FIRST)
  return (
    <span className="tb-bell" ref={box}>
      <button className={`icon-btn${open ? ' on' : ''}`} data-ui="알림 종" data-tip={open ? undefined : t('알림', 'Notifications')} aria-label={unread.length ? t(`알림 · 읽지 않음 ${unread.length}`, `Notifications, ${unread.length} unread`) : t('알림', 'Notifications')}
        aria-haspopup="menu" aria-expanded={open} onClick={() => { setOpen(!open); setMore(false) }}>
        {Icon.bell}{unread.length > 0 && <span className="rail-count tb-bell-n" aria-hidden>{unread.length > 99 ? '99+' : unread.length}</span>}
      </button>
      {open && (
        <div className="menu tb-bell-menu" role="menu" data-ui="알림 목록">
          <div className="tb-bell-head">
            <span className="tb-bell-title">{t('알림', 'Notifications')}</span>
            <button className="a" disabled={!unread.length} onClick={() => mark(list.map((n) => n.key))}>{t('모두 읽음', 'Mark all read')}</button>
          </div>
          {!list.length && <div className="muted tb-bell-none">{t('지난 7일 동안 알림이 없습니다', 'No notifications in the last 7 days')}</div>}
          {shown.map((n) => (
            <button key={n.key} role="menuitem" className={`tb-bell-item${seen.includes(n.key) ? '' : ' unread'}`} disabled={!n.open && seen.includes(n.key)} onClick={() => { mark([n.key]); if (n.open) { setOpen(false); n.open() } }}>
              <span className={`tb-bell-kind${n.kind === 'error' ? ' error-text' : ''}`}>{KIND_NAME[n.kind]} · {clock(n.at)}</span>
              <span className="tb-bell-text" title={n.text}>{n.text}</span>
            </button>
          ))}
          {list.length > FIRST && !more && <div className="tb-bell-foot"><span className="muted">{t('지난 7일', 'Last 7 days')}</span><button className="a" onClick={() => setMore(true)}>{t(`더 보기 (${list.length - FIRST})`, `Show more (${list.length - FIRST})`)}</button></div>}
        </div>
      )}
    </span>
  )
}
