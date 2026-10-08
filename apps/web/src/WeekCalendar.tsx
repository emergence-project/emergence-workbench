import { useEffect, useState } from 'react'
import { googleApi, type GoogleEvent } from './api'
import { localDate } from './format'
import { briefing, markOf, shortDate, WEEK_DAYS, weekStartOf, type DayGroup, type Deadline } from './homeData'
import { go } from './router'
import { t } from './i18n'

/** 한 칸에서 연구마다 보여 줄 기록 수 */
const SHOWN = 3

/**
 * 홈의 "한 일 달력": 한 주(일요일–토요일)를 일곱 칸으로. 오늘까지는 한 일(완료·메모·상태·블록 수정)을 연구별로,
 * 앞으로의 날에는 할 일 마감만 보여 준다. "브리핑 복사"는 이 주의 한 일을 글로 복사한다.
 * 구글 계정을 연결했으면 구글 캘린더 일정(읽기만)도 날마다 맨 위에 무채색으로 보여 준다.
 */
export function WeekCalendar({ byDay, deadlines, now = new Date(), onCopied }: {
  byDay: Map<string, DayGroup[]>; deadlines: Deadline[]; now?: Date; onCopied(msg: string): void
}) {
  const [start, setStart] = useState(() => weekStartOf(now))
  const today = localDate(now)
  const days = Array.from({ length: 7 }, (_, i) => localDate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)))
  const shift = (n: number) => setStart(new Date(start.getFullYear(), start.getMonth(), start.getDate() + n * 7))
  const dueOn = (iso: string) => deadlines.filter((d) => d.due === iso)
  // 구글 일정: 연결 안 됐으면 null (달력 아래에 연결 안내)
  const [gcal, setGcal] = useState<GoogleEvent[] | null | undefined>(undefined)
  const from = days[0]!, to = days[6]!
  useEffect(() => {
    let live = true
    googleApi.events(from, to).then((r) => { if (live) setGcal(r.connected ? r.events : null) }, () => { if (live) setGcal(undefined) })
    return () => { live = false }
  }, [from, to])
  const gcalOn = (iso: string) => (gcal ?? []).filter((e) => e.date <= iso && iso <= e.endDate)
  const done = days.filter((d) => d <= today)
  const copy = () => {
    const text = briefing(done, byDay)
    if (!text) { onCopied(t('이 주에는 복사할 기록이 없습니다', 'Nothing to copy for this week')); return }
    navigator.clipboard.writeText(text).then(() => onCopied(t('이 주의 한 일을 복사했습니다', "Copied this week's activity")), () => onCopied(t('복사하지 못했습니다', 'Could not copy')))
  }

  return (
    <section className="week" data-ui="한 일 달력">
      <div className="sec-head">
        <h2>{t('한 일 달력', 'Activity calendar')}</h2>
        <span className="muted today-sub">{shortDate(days[0]!)} – {shortDate(days[6]!)}</span>
        <span className="sp" />
        <button className="icon-btn" aria-label={t('지난주', 'Last week')} onClick={() => shift(-1)}>‹</button>
        <button className="fb-link" onClick={() => setStart(weekStartOf(now))}>{t('이번 주', 'This week')}</button>
        <button className="icon-btn" aria-label={t('다음 주', 'Next week')} onClick={() => shift(1)}>›</button>
        <button className="btn" data-ui="브리핑 복사" onClick={copy} title={t('이 주의 한 일을 연구별로 묶어 글로 복사', "Copy this week's activity as text, grouped by project")}>{t('브리핑 복사', 'Copy briefing')}</button>
      </div>
      <div className="week-grid" data-ui="주 칸">
        {days.map((iso, i) => {
          const groups = iso <= today ? byDay.get(iso) ?? [] : []
          const dues = iso >= today ? dueOn(iso) : []
          const count = groups.reduce((n, g) => n + g.events.length, 0)
          return (
            <div key={iso} className={`week-day${iso === today ? ' is-today' : ''}${iso > today ? ' future' : ''}`} data-ui="하루">
              <div className="week-dh"><b>{WEEK_DAYS[i]}</b><span>{shortDate(iso)}</span>{count > 0 && <span className="cnt">{count}</span>}</div>
              <div className="week-db">
                {gcalOn(iso).map((e) => (
                  <a key={e.id} className="week-gcal" data-ui="구글 일정" href={e.link} target="_blank" rel="noreferrer"
                    title={`${e.calendar}\n${e.time ? `${e.time}–${e.endTime} ` : t('종일 ', 'All day ')}${e.title}${e.location ? `\n${e.location}` : ''}`}>
                    <span className="week-ev">{e.time ? <b>{e.time}</b> : <b>{t('종일', 'All day')}</b>}{e.title}</span>
                  </a>
                ))}
                {groups.map((g) => (
                  <button key={g.rid} className={`week-chip c${g.color}`} onClick={() => go({ page: 'log', rid: g.rid })}
                    title={`${g.title}\n${g.events.map((e) => `${e.time} ${markOf(e.kind)} ${e.text}`).join('\n')}`}>
                    <span className="week-rt">{g.title}</span>
                    {g.events.slice(0, SHOWN).map((e) => <span key={e.key} className={`week-ev ev-${e.kind}`}><i aria-hidden>{markOf(e.kind)}</i>{e.text}</span>)}
                    {g.events.length > SHOWN && <span className="muted week-more">{t(`외 ${g.events.length - SHOWN}개`, `+${g.events.length - SHOWN} more`)}</span>}
                  </button>
                ))}
                {dues.map((d) => (
                  <button key={d.key} className={`week-chip is-due c${d.color}`} onClick={() => go({ page: 'log', rid: d.rid })} title={`${d.title} · ${t('마감', 'Due')} ${d.due}`}>
                    <span className="week-rt">{d.title}</span>
                    <span className="week-ev ev-due"><i aria-hidden>⚑</i>{d.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <div className="legend-row week-legend"><span>✓ {t('끝낸 할 일', 'Done to-do')}</span><span>✎ {t('노트 고침', 'Note edited')}</span><span>⇄ {t('상태 바꿈', 'Status changed')}</span><span>· {t('메모', 'Memo')}</span><span>⚑ {t('마감 (앞으로의 날)', 'Due (upcoming days)')}</span>
        {gcal ? <span>{t('시각 · 구글 캘린더 일정', 'Time · Google Calendar event')}</span> : gcal === null && <span className="week-gnote"><a href="#/settings">{t('구글 캘린더 연결', 'Connect Google Calendar')}</a></span>}</div>
    </section>
  )
}
