import { useEffect, useRef } from 'react'
import type { AboutPart } from './aboutContent'
import { sectionAnchor } from './aboutContent'
import { checkKey, checkState, useAboutChecks } from './aboutChecks'
import { t } from './i18n'
import { Icon } from './icons'
import { href } from './router'

/**
 * 소개 이력 사이드바 (11/13 22:53 제안 → 11/16 「시안은 다 추천대로」, 시안 1절 안 A).
 * 시계를 켜면 오른쪽에 이 쪽을 고친 업데이트가 최근 것부터 한 줄씩: 날짜 · 번호 · 업데이트 제목 · 고친 절.
 * 내가 확인한 때도 한 줄로 끼고, 확인한 뒤 고친 업데이트는 주황 「확인 뒤」. 한 줄을 고르면 본문에서 그 업데이트가 고친 절에 테두리를 두른다.
 * 예전(#433)에는 절 제목 밑에 그 절의 업데이트 번호가 한 줄씩 붙었다(같은 정보를 두 곳에 두지 않으려 없앰).
 */
export interface HistoryRow { kind: 'pr' | 'check'; n: number; date: string; title: string; secs: number[]; after: boolean }

/** 이 쪽의 이력 줄: 업데이트마다 한 줄, 확인한 날마다 한 줄. 최근이 위 */
export function historyRows(part: AboutPart, checks: ReturnType<typeof useAboutChecks>): HistoryRow[] {
  const secs = part.sections ?? []
  const recs = secs.map((sec, i) => checks.sections[checkKey(part, sectionAnchor(sec, i))])
  const byPr = new Map<number, number[]>()
  secs.forEach((sec, i) => { for (const n of sec.prs ?? []) byPr.set(n, [...(byPr.get(n) ?? []), i]) })
  const rows: HistoryRow[] = [...byPr].map(([n, at]) => ({
    kind: 'pr', n, date: checks.prDates[n] ?? '', title: checks.prTitles[n] ?? '', secs: at,
    // 확인한 뒤 고친 업데이트: 그 절이 확인 전이고 확인한 PR보다 뒤
    after: checks.enabled && at.some((i) => recs[i]?.checked !== undefined && n > recs[i]!.checked! && checkState(secs[i]!, recs[i], checks.exists) === 'unchecked'),
  }))
  const byDay = new Map<string, number[]>()
  recs.forEach((r, i) => { if (r?.checked !== undefined && r.at) byDay.set(r.at, [...(byDay.get(r.at) ?? []), i]) })
  for (const [date, at] of byDay) rows.push({ kind: 'check', n: Math.max(...at.map((i) => recs[i]!.checked!)) + 0.5, date, title: '', secs: at, after: false })
  // 날짜가 같으면 번호 순서 (확인 줄은 그때 확인한 마지막 PR 바로 위)
  return rows.sort((a, b) => (a.date === b.date ? b.n - a.n : a.date < b.date ? 1 : -1))
}

const shortDate = (d: string) => { const m = /^\d{4}-(\d{2})-(\d{2})/.exec(d); return m ? `${Number(m[1])}/${Number(m[2])}` : '' }

export function AboutHistorySide({ part, at, picked, onPick, onClose }: { part: AboutPart; at: number; picked: number | null; onPick(n: number | null, firstSection: number): void; onClose(): void }) {
  const checks = useAboutChecks()
  const rows = historyRows(part, checks)
  const secs = part.sections ?? []
  // 확인 항목 알림에서 업데이트를 눌러 열면 그 줄이 보이게 (11/19 09:27 진행)
  const on = useRef<HTMLLIElement>(null)
  useEffect(() => { on.current?.scrollIntoView({ block: 'nearest' }) }, [picked])
  // 지금 보는 절은 링크로 두지 않는다: 같은 주소라 눌러도 아무 일이 없었다 (11/19 21:52 "링크가 작동안하는 것 같아"). 누르면 그 줄 고르기로 이어진다
  const secLink = (i: number) => i === at
    ? <span key={i} className="about-ver-here" title={t('지금 보는 절', 'The section you are viewing')}>{secs[i]!.title}</span>
    : <a key={i} className="a" href={href({ page: 'about', part: part.id, ...(i > 0 && { anchor: sectionAnchor(secs[i]!, i) }) })} onClick={(e) => e.stopPropagation()}>{secs[i]!.title}</a>
  const join = (at: number[]) => at.flatMap((i, k) => (k ? [<span key={`s${i}`} className="muted"> · </span>, secLink(i)] : [secLink(i)]))
  return (
    <aside className="pane about-rs" data-ui="소개 이력" aria-label={t('이 쪽의 이력', 'History of this page')}>
      <div className="rs-head"><span className="rs-label">{t('이력', 'History')}</span><span className="sp" />
        <button className="icon-btn" aria-label={t('이력 끄기', 'Hide history')} data-tip={t('닫기', 'Close')} onClick={onClose}>{Icon.x}</button></div>
      <div className="rs-scroll rs-pad">
        <p className="muted about-rs-sub">{t('이 쪽을 고친 업데이트 · 최근이 위', 'Updates that changed this page · newest first')}</p>
        {!rows.length && <p className="muted">{t('이 쪽을 고친 업데이트가 아직 없습니다', 'No update has changed this page yet')}</p>}
        <ul className="about-vers">
          {rows.map((r) => r.kind === 'check' ? (
            <li key={`c${r.date}`} className="about-ver check" data-ui="확인한 때">
              <span className="about-ver-head"><b>{shortDate(r.date)}</b><span className="about-hist-ok"><i className="mark-ico" aria-hidden>{Icon.check}</i>{t('확인', 'Reviewed')}</span></span>
              <span className="about-ver-secs">{join(r.secs)}</span>
            </li>
          ) : (
            <li key={r.n} ref={picked === r.n ? on : undefined} className={`about-ver${picked === r.n ? ' on' : ''}`} data-ui="고친 업데이트" data-ui-item={`#${r.n}`}
              role="button" tabIndex={0} aria-pressed={picked === r.n}
              onClick={() => onPick(picked === r.n ? null : r.n, r.secs[0]!)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(picked === r.n ? null : r.n, r.secs[0]!) } }}>
              <span className="about-ver-head">
                <b>{r.date && `${shortDate(r.date)} `}<a className="a" href={href({ page: 'settings', part: 'update', pr: r.n })} onClick={(e) => e.stopPropagation()}
                  title={t('이 업데이트를 설정 › 업데이트 이력에서 봅니다', 'See this update in Settings › Update history')}>#{r.n}</a></b>
                {r.after && <span className="about-unsure">{t('확인 뒤', 'After review')}</span>}
              </span>
              {r.title && <span className="about-ver-title">{r.title}</span>}
              <span className="about-ver-secs"><span className="muted">{t('고친 절: ', 'Changed: ')}</span>{join(r.secs)}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}
