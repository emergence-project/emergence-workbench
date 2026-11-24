// 상단바 알림 종 (11/20 시안 4절 안 B "알림 아이콘을 두고, 최근 알림을 모아보는게 어떨까?"), 11/23 다시 짬 (시안 「알림: 답할 것 먼저, 소식은 그 아래」):
// 알림은 두 가지다. 「답할 것」은 답하거나 정해야 끝난다(읽어도 남고, 며칠이 지나도 남는다). 「소식」은 열어 보거나 7일이 지나면 끝나 목록에서 빠진다.
// 한 목록에 답할 것 먼저, 굵은 줄, 그 아래 소식을 새것부터. 줄마다 곳(프로젝트 · 지식 라이브러리 · 앱 개발)과 종류를 적고, 곳은 고르기 상자 「전체」로 거른다.
// 종의 수는 답할 것만 센다(레일의 주황 수와 같은 뜻). 읽지 않은 소식만 있으면 무채색 점. 줄을 누르면 그 화면으로 가서 처리한다(목록 안에서 답하거나 승인하지 않는다: 실수 막기)
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LIBRARY_RID } from '@rw/core'
import type { RecordTidy, RecordTurn } from '@rw/core/contract/comments'
import { api, APP_RID, CENTRAL_RID, type ChatRow, type FeedbackItem, type ProjectIssues } from './api'
import { useChatList, stateName } from './AgentChats'
import { asksMe, isUnseen, useSeen } from './agentSeen'
import { feedbackBucket } from './feedbackBuckets'
import { feedbackSummary } from './feedbackFormat'
import { projectColor } from './format'
import { t } from './i18n'
import { Icon } from './icons'
import { qk } from './queries'
import { go } from './router'
import { NOTICE_ERRORS as ERRORS } from './flash'
import { FIGURES, NETWORK, PAPERS, useNoticeCounts } from './noticeCounts'
import { store } from './store'
import { useDismiss } from './useDismiss'

/** 종류 = 처리하러 가는 화면. 질문 · 지시는 기록, 대화는 에이전트 대화 */
type Kind = 'question' | 'order' | 'task' | 'edit' | 'flow' | 'chat' | 'feedback' | 'update' | 'error' | 'check' | 'repo' | 'about' | 'person' | 'answer' | 'archive'
export interface Notice {
  key: string; kind: Kind; text: string
  /** 답할 것인가 (아니면 소식) */
  need: boolean
  /** 생긴 때. 수로만 아는 답할 것(맡긴 일 · 수정 검토 · 흐름)은 없다 */
  at?: string
  /** 곳: 프로젝트 id · LIBRARY_RID · PAPERS · FIGURES · NETWORK · APP_RID. 없으면 「전체」에서만 보인다 */
  place?: string
  /** 한 줄이 여럿을 뜻하면 그 수 (종의 수에 더한다) */
  n?: number
  open?(): void
}

const KIND_NAME: Record<Kind, string> = {
  question: t('질문', 'Question'), order: t('지시', 'Instruction'), task: t('맡긴 일', 'Delegated task'), edit: t('수정 검토', 'Edit review'), flow: t('흐름', 'Flow'),
  chat: t('대화', 'Conversation'), feedback: t('피드백', 'Feedback'), update: t('업데이트', 'Update'), error: t('오류', 'Error'),
  check: t('점검', 'Check'), repo: t('저장소', 'Repository'), about: t('소개', 'About'), person: t('추천', 'Suggestion'), answer: t('답', 'Answer'), archive: t('보관', 'Archive'),
}
/** 프로젝트가 아닌 곳의 기호: 레일의 그 화면 아이콘 */
const PLACE_ICON: Record<string, ReactNode> = { [APP_RID]: Icon.feedback, [LIBRARY_RID]: Icon.library, [PAPERS]: Icon.papers, [FIGURES]: Icon.figures, [NETWORK]: Icon.network }
const SEEN = 'rw-notice-seen'
const PLACE = 'rw-notice-place'
/** 예전 「#n 반영됨」에서 ×로 닫은 대화 (그 대화의 업데이트는 읽은 것으로) */
const OLD_SHIPPED_SEEN = 'rw-feedback-shipped-seen'
const WEEK = 7 * 24 * 3600_000
const FIRST = 8

/** 기록 id(c-20261122-0900…)의 때 */
const recordAt = (id: string) => { const m = /^c-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/.exec(id); return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : undefined }
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()
const ms = (at?: string) => (at ? Date.parse(at) || 0 : 0)

export interface NoticeSources {
  chats?: ChatRow[]; feedback?: FeedbackItem[]; errors?: { at: string; text: string }[]
  /** 답을 기다리는 에이전트 기록 */
  records?: RecordTurn[]
  /** 완료 기록이 많이 쌓여 보관으로 옮기기를 권할 곳 */
  tidy?: RecordTidy[]
  /** 프로젝트마다 판단할 맡긴 일 · 수정 검토 · 흐름의 수 (레일의 주황 수와 같은 값) */
  issues?: Pick<ProjectIssues, 'tasks' | 'edits' | 'problems'>
  unseen?: (c: ChatRow) => boolean
  /** 수로만 아는 것: 라이브러리 점검 · 저장소 · 소개(답할 것), 새 추천 · 답이 온 논문 질문(소식). 화면마다 이미 세는 수 그대로 */
  counts?: Omit<Notice, 'key'>[]
}

/** 알림 목록: 답할 것 먼저(새것이 위, 때를 모르는 것은 그 아래), 그 다음 지난 7일의 소식(새것이 위). 순수 함수: 테스트에서 부른다 */
export function noticesOf({ chats = [], feedback = [], errors = [], records = [], tidy = [], issues, unseen = () => false, counts = [] }: NoticeSources, now = Date.now()): Notice[] {
  const need: Notice[] = []
  const news: Notice[] = []
  for (const r of records) {
    const concept = r.rid === LIBRARY_RID && r.target.startsWith('concept-') ? r.target.slice('concept-'.length) : null
    need.push({ key: `record:${r.rid}:${r.target}:${r.id}`, kind: r.kind === '지시' ? 'order' : 'question', need: true, at: recordAt(r.id), place: r.rid, text: oneLine(r.body),
      open: () => go(r.rid === LIBRARY_RID ? (concept ? { page: 'library', topic: concept } : { page: 'library' }) : { page: 'records', rid: r.rid }) })
  }
  const counted: [Kind, Record<string, number> | undefined, (n: number) => string, (rid: string) => void][] = [
    ['task', issues?.tasks, (n) => t(`판단을 기다리는 맡긴 일 ${n}개`, `${n} delegated task(s) awaiting your decision`), (rid) => go({ page: 'records', rid })],
    ['edit', issues?.edits, (n) => t(`검토할 노트 수정 ${n}개`, `${n} note edit(s) to review`), (rid) => go({ page: 'edits', rid })],
    ['flow', issues?.problems, (n) => t(`결정을 기다리는 흐름 ${n}개`, `${n} flow(s) awaiting your decision`), (rid) => go({ page: 'problems', rid })],
  ]
  for (const [kind, by, text, open] of counted) for (const [rid, n] of Object.entries(by ?? {})) if (n > 0) need.push({ key: `${kind}:${rid}`, kind, need: true, place: rid, n, text: text(n), open: () => open(rid) })
  for (const x of tidy) news.push({ key: `archive:${x.rid}:${x.ready}`, kind: 'archive', need: false, place: x.rid, n: x.ready, text: t(`완료 기록 ${x.done}개 · ${x.ready}개를 보관으로 옮길 수 있음`, `${x.done} done records · ${x.ready} can move to the archive`), open: () => go({ page: 'records', rid: x.rid }) })
  // 수가 바뀌면 열쇠가 바뀌어, 읽은 소식도 새로 늘면 다시 새 소식이 된다
  for (const c of counts) if ((c.n ?? 0) > 0) (c.need ? need : news).push({ ...c, key: `count:${c.kind}:${c.place ?? ''}:${c.n}` })
  for (const c of chats) {
    const place = c.rid === CENTRAL_RID ? undefined : c.rid
    if (c.shipped && c.pr) news.push({ key: `shipped:${c.id}`, kind: 'update', need: false, at: c.updated, place: APP_RID, text: `#${c.pr.number} ${c.title}`, open: () => go({ page: 'feedback', ...(c.feedback && { key: c.feedback }) }) })
    else if (c.archived) continue
    else if (c.state === 'waiting' || asksMe(c)) need.push({ key: `agent:${c.id}:${c.updated}`, kind: 'chat', need: true, at: c.updated, place, text: `「${c.title}」 ${stateName(c)}`, open: () => go({ page: 'agent', id: c.id }) })
    else if (c.state === 'error' || unseen(c)) news.push({ key: `agent:${c.id}:${c.updated}`, kind: 'chat', need: false, at: c.updated, place, text: `「${c.title}」 ${c.state === 'idle' ? t('종료 · 아직 열어 보지 않음', 'Done · not opened yet') : stateName(c)}`, open: () => go({ page: 'agent', id: c.id }) })
  }
  for (const e of feedback) {
    if (feedbackBucket(e, now) !== '확인 필요') continue
    const at = e.status?.handled_at ?? `${e.date}T${e.time}`
    need.push({ key: `feedback:${e.key}:${at}`, kind: 'feedback', need: true, at, place: APP_RID, text: feedbackSummary(e.status?.clean ?? e.text), open: () => go({ page: 'feedback', key: e.key }) })
  }
  for (const e of errors) news.push({ key: `error:${e.at}`, kind: 'error', need: false, at: e.at, text: e.text })
  const newest = (a: Notice, b: Notice) => ms(b.at) - ms(a.at)
  return [...need.sort(newest), ...news.filter((n) => !n.at || now - ms(n.at) < WEEK).sort(newest)]
}

/** 목록에 보일 알림: 답할 것은 끝날 때까지, 소식은 읽기 전까지 (11/23 피드백 "읽기만 하면 되는 알림은 읽고 나서 사라져야") */
export const unread = (list: Notice[], seen: readonly string[]) => list.filter((n) => n.need || !seen.includes(n.key))

/** 종의 수: 답할 것만 (한 줄이 여럿이면 그 수만큼) */
export const needCount = (list: Notice[]) => list.reduce((n, x) => n + (x.need ? x.n ?? 1 : 0), 0)

const clock = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return d.toDateString() === new Date().toDateString() ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`
}

export function NoticeBell() {
  const chats = useChatList().data?.chats
  const fb = useQuery({ queryKey: qk.feedbackAll, queryFn: () => api.feedbackAll() }).data?.entries
  const recordTurns = useQuery({ queryKey: qk.recordTurns, queryFn: () => api.recordTurns() }).data
  const records = recordTurns?.turns
  const tidy = recordTurns?.tidy
  const issues = useQuery({ queryKey: qk.researchIssues, queryFn: () => api.researchIssues() }).data
  const projects = useQuery({ queryKey: qk.researches, queryFn: () => api.researches() }).data?.researches
  const counts = useNoticeCounts()
  const [errorsTick, setErrorsTick] = useState(0)
  useEffect(() => { const on = () => setErrorsTick((n) => n + 1); window.addEventListener(ERRORS, on); return () => window.removeEventListener(ERRORS, on) }, [])
  const [seen, setSeen] = useState<string[]>(() => [...store.get<string[]>(SEEN, []), ...store.get<string[]>(OLD_SHIPPED_SEEN, []).map((id) => `shipped:${id}`)])
  const [open, setOpen] = useState(false)
  const [more, setMore] = useState(false)
  const [picked, setPicked] = useState<string>(() => store.get<string>(PLACE, ''))
  const box = useRef<HTMLSpanElement>(null)
  useDismiss(open, box, () => setOpen(false))
  // 대화를 열어 보면(본 기록이 바뀌면) 그 알림이 빠진다
  const agentSeen = useSeen()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const every = useMemo(() => noticesOf({ chats, feedback: fb, errors: store.get(ERRORS, []), records, tidy, issues, counts, unseen: isUnseen }), [chats, fb, records, tidy, issues, counts, errorsTick, agentSeen])
  // 읽은 소식은 목록에서 빠진다
  const all = useMemo(() => unread(every, seen), [every, seen])
  const placeName = (id: string) => (id === APP_RID ? t('앱 개발', 'App development') : id === LIBRARY_RID ? t('지식 라이브러리', 'Knowledge library') : id === PAPERS ? t('논문 라이브러리', 'Paper library') : id === FIGURES ? t('그림 라이브러리', 'Figure library') : id === NETWORK ? t('네트워킹', 'Networking') : projects?.find((p) => p.id === id)?.title ?? id)
  const placeIcon = (id: string) => (PLACE_ICON[id] ? <span className="tb-bell-pi" aria-hidden>{PLACE_ICON[id]}</span> : <i className="tb-bell-pc" style={{ background: projectColor(id) }} aria-hidden />)
  const fresh = (n: Notice) => !n.need
  // 고를 곳은 알림이 있는 곳만: 앱 개발 · 지식 라이브러리 먼저가 아니라 답할 것이 많은 곳부터
  const places = useMemo(() => {
    const by = new Map<string, { need: number; fresh: boolean }>()
    for (const n of all) if (n.place) { const p = by.get(n.place) ?? { need: 0, fresh: false }; by.set(n.place, { need: p.need + (n.need ? n.n ?? 1 : 0), fresh: p.fresh || fresh(n) }) }
    return [...by].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.need - a.need)
  }, [all])
  const place = places.some((p) => p.id === picked) ? picked : ''
  const list = place ? all.filter((n) => n.place === place) : all
  const count = needCount(all)
  const unreadNews = all.filter(fresh)
  const mark = (keys: string[]) => { const next = [...new Set([...seen, ...keys])].slice(-1000); store.set(SEEN, next); setSeen(next) }
  const shown = more ? list : list.slice(0, Math.max(FIRST, list.filter((n) => n.need).length))
  const label = count ? t(`알림 · 답할 것 ${count}`, `Notifications, ${count} to answer`) : unreadNews.length ? t(`알림 · 새 소식 ${unreadNews.length}`, `Notifications, ${unreadNews.length} new`) : t('알림', 'Notifications')
  return (
    <span className="tb-bell" ref={box}>
      <button className={`icon-btn${open ? ' on' : ''}`} data-ui="알림 종" data-tip={open ? undefined : label} aria-label={label}
        aria-haspopup="menu" aria-expanded={open} onClick={() => { setOpen(!open); setMore(false) }}>
        {Icon.bell}{count > 0 ? <span className="rail-count tb-bell-n" aria-hidden>{count > 99 ? '99+' : count}</span> : unreadNews.length > 0 && <span className="tb-bell-new" aria-hidden />}
      </button>
      {open && (
        <div className="menu tb-bell-menu" role="menu" data-ui="알림 목록">
          <div className="tb-bell-head">
            <span className="tb-bell-title">{t('알림', 'Notifications')}</span>
            {places.length > 1 && <select className="mini-select tb-bell-place" data-ui="알림 곳 고르기" aria-label={t('알림을 볼 곳', 'Where to show notifications from')} value={place}
              onChange={(e) => { store.set(PLACE, e.target.value); setPicked(e.target.value); setMore(false) }}>
              <option value="">{t('전체', 'All')}</option>
              {places.map((p) => <option key={p.id} value={p.id}>{placeName(p.id)}{p.need ? ` (${p.need})` : p.fresh ? ' •' : ''}</option>)}
            </select>}
          </div>
          {list.length > 0 && <div className="tb-bell-sum" data-ui="알림 요약">
            <span className="turn-dot" aria-hidden />{t(`답할 것 ${needCount(list)}`, `${needCount(list)} to answer`)}<span aria-hidden>·</span><span className="tb-bell-dot on" aria-hidden />{t(`새 소식 ${list.filter(fresh).length}`, `${list.filter(fresh).length} new`)}
          </div>}
          {!list.length && <div className="muted tb-bell-none">{t('답할 것도, 새 소식도 없습니다', 'Nothing to answer and no new news')}</div>}
          {shown.map((n, i) => (
            <button key={n.key} role="menuitem" className={`tb-bell-item${n.need ? ' need' : fresh(n) ? ' unread' : ''}${!n.need && shown[i - 1]?.need ? ' first-news' : ''}`}
              onClick={() => { if (!n.need) mark([n.key]); if (n.open) { setOpen(false); n.open() } }}>
              {n.need ? <span className="turn-dot" role="img" aria-label={t('답할 것', 'To answer')} /> : <span className="tb-bell-dot" role="img" aria-label={t('새 소식', 'New')} />}
              <span className="tb-bell-kind">
                {n.place && <span className="tb-bell-where">{placeIcon(n.place)}<span>{placeName(n.place)}</span></span>}
                <span className={`tag${n.kind === 'error' ? ' error-text' : ''}`}>{KIND_NAME[n.kind]}</span>
                {n.at && <span className="tb-bell-at">{clock(n.at)}</span>}
              </span>
              <span className="tb-bell-text" title={n.text}>{n.text}</span>
            </button>
          ))}
          {list.length > 0 && <div className="tb-bell-foot">
            <button className="a" disabled={!list.some(fresh)} onClick={() => mark(list.filter(fresh).map((n) => n.key))}>{t('소식 모두 읽음', 'Mark news read')}</button>
            {list.length > shown.length && <button className="a" data-tip={t('소식은 지난 7일', 'News from the last 7 days')} onClick={() => setMore(true)}>{t(`더 보기 (${list.length - shown.length})`, `Show more (${list.length - shown.length})`)}</button>}
          </div>}
        </div>
      )}
    </span>
  )
}
