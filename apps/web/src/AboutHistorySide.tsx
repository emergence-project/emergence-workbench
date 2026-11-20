import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { AboutPart } from './aboutContent'
import { sectionAnchor } from './aboutContent'
import { checkKey, lastPr, okDate, prsSince, putAboutChecks, useAboutChecks } from './aboutChecks'
import { aboutChanges, api, setAboutCheck, type AboutChecks } from './api'
import { askText } from './askText'
import { t } from './i18n'
import { Icon } from './icons'
import { href } from './router'

/**
 * 소개 오른쪽 사이드바 (11/20 시안 2 · 3절, 「시안대로 구현하자」): 탭 「이력 · 수정」.
 * 이력은 (절, 업데이트)마다 카드 하나: 첫 줄 #번호 · 날짜 · 절과 오른쪽 맞아요 · 고칠 점(11/20, 예전 「답하기」), 다음 줄 제목 전문 (11/20 시안 3절 안 C: 표가 좁아
 * 이력을 두 칸의 오른쪽 칸에 띄운다). 카드를 누르면 본문이 그 절로 가고 그 업데이트가 바꾼 문장에 하이라이트가 붙으며, 카드 아래에 바꾼 것 요약이 펼쳐진다.
 * 예전(11/16–11/19)에는 본문 위 「이 쪽의 확인 항목」 상자와 업데이트마다 한 줄인 목록이 같은 업데이트를 두 번 보였다.
 */
export interface HistoryRow { n: number; sec: number; date: string; title: string; ok?: string; todo: boolean; ask?: string }

/** 이 쪽의 이력 줄: (절, 업데이트)마다 한 줄. 최근이 위, 같은 업데이트는 절 차례 */
export function historyRows(part: AboutPart, checks: Pick<AboutChecks, 'enabled' | 'exists' | 'sections' | 'prDates' | 'prTitles'>): HistoryRow[] {
  const secs = part.sections ?? []
  const rows: HistoryRow[] = []
  secs.forEach((sec, i) => {
    const rec = checks.sections[checkKey(part, sectionAnchor(sec, i))]
    const todo = checks.enabled && checks.exists ? prsSince(sec, rec) : []
    // 에이전트의 물음은 그 절의 확인하지 않은 줄 가운데 가장 최근 것 아래에 한 번
    const askAt = sec.ask && todo.length ? Math.max(...todo) : undefined
    for (const n of sec.prs ?? []) {
      const ok = okDate(rec, n)
      rows.push({ n, sec: i, date: checks.prDates[n] ?? '', title: checks.prTitles[n] ?? '', ...(ok !== undefined && { ok }), todo: todo.includes(n), ...(askAt === n && { ask: sec.ask }) })
    }
  })
  return rows.sort((a, b) => (a.date === b.date ? b.n - a.n || a.sec - b.sec : a.date < b.date ? 1 : -1))
}

const shortDate = (d: string) => { const m = /^\d{4}-(\d{2})-(\d{2})/.exec(d); return m ? `${Number(m[1])}/${Number(m[2])}` : '' }

export type SideTab = 'history' | 'fix'
export interface Picked { n: number; sec: number }

export function AboutSide({ part, tab, onTab, picked, onPick, onClose, fix }: {
  part: AboutPart; tab: SideTab; onTab(v: SideTab): void; picked: Picked | null; onPick(v: Picked | null): void; onClose(): void; fix: ReactNode
}) {
  return (
    <aside className="pane about-rs" data-ui="소개 이력" aria-label={t('이 쪽의 이력과 수정', 'History and edits of this page')}>
      <div className="rs-head side-tabbar">
        <div className="segmented small full" role="tablist" aria-label={t('소개 사이드바 갈래', 'About sidebar view')} data-ui="소개 사이드바 갈래">
          <button role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'on' : ''} onClick={() => onTab('history')}>{t('이력', 'History')}</button>
          <button role="tab" aria-selected={tab === 'fix'} className={tab === 'fix' ? 'on' : ''} onClick={() => onTab('fix')}>{t('수정', 'Edit')}</button>
        </div>
        <button className="icon-btn" aria-label={t('사이드바 닫기', 'Close sidebar')} data-tip={t('닫기', 'Close')} onClick={onClose}>{Icon.x}</button>
      </div>
      <div className="rs-scroll rs-pad">
        {tab === 'history' ? <HistoryTable part={part} picked={picked} onPick={onPick} /> : fix}
      </div>
    </aside>
  )
}

function HistoryTable({ part, picked, onPick }: { part: AboutPart; picked: Picked | null; onPick(v: Picked | null): void }) {
  const checks = useAboutChecks()
  const rows = historyRows(part, checks)
  const secs = part.sections ?? []
  const [error, setError] = useState('')
  const on = useRef<HTMLLIElement>(null)
  useEffect(() => { on.current?.scrollIntoView({ block: 'nearest' }) }, [picked?.n, picked?.sec])
  if (!rows.length) return <p className="muted">{t('이 쪽을 고친 업데이트가 아직 없습니다', 'No update has changed this page yet')}</p>
  const confirm = async (r: HistoryRow) => {
    const sec = secs[r.sec]!
    const key = checkKey(part, sectionAnchor(sec, r.sec))
    // 이 줄이 그 절의 마지막 남은 줄이면 절 전체를 확인함으로(고쳐 보낸 표시도 지움), 아니면 이 줄만
    const left = prsSince(sec, checks.sections[key]).filter((n) => n !== r.n)
    setError('')
    try { putAboutChecks(await setAboutCheck(left.length ? { key, action: 'ok', pr: r.n } : { key, action: 'check', pr: lastPr(sec) })) } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  const answer = async (r: HistoryRow) => {
    const sec = secs[r.sec]!
    const v = await askText({ title: t(`고칠 점 · #${r.n}`, `To fix · #${r.n}`), label: r.ask ?? t('이 업데이트가 바꾼 것에서 고칠 점', 'What to fix in what this update changed'), multiline: true, ok: t('보내기', 'Send') })
    if (!v?.trim()) return
    setError('')
    try {
      await api.addFeedback({
        kind: '미분류', target: `소개 › ${part.ui ?? part.title} › ${sec.ui ?? sec.title} › 이력`, route: location.hash.slice(1) || undefined, snippet: `#${r.n} ${r.title}`.slice(0, 120),
        text: `소개 이력의 업데이트 #${r.n}(${r.title})에 답함 (${sec.ui ?? sec.title}).\n\n질문: ${r.ask ?? '이 업데이트가 바꾼 것이 맞는지'}\n\n답: ${v.trim()}`,
      })
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  const pick = (r: HistoryRow) => onPick(picked?.n === r.n && picked.sec === r.sec ? null : { n: r.n, sec: r.sec })
  return (
    <>
      {error && <p className="muted">{error}</p>}
      <ol className="about-hist" data-ui="이력 표">
        {rows.map((r) => {
          const open = picked?.n === r.n && picked.sec === r.sec
          return (
            <li key={`${r.n}-${r.sec}`} ref={open ? on : undefined} className={`about-hist-row${r.todo ? ' todo' : ''}${open ? ' on' : ''}`} data-ui="고친 업데이트" data-ui-item={`#${r.n}`}
              tabIndex={0} aria-expanded={open} onClick={() => pick(r)} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick(r) } }}>
              <div className="about-hist-top">
                <a className="a about-hist-pr" href={href({ page: 'settings', part: 'update', pr: r.n })} onClick={(e) => e.stopPropagation()}
                  title={t('이 업데이트를 설정 › 업데이트 이력에서 봅니다', 'See this update in Settings › Update history')}>#{r.n}</a>
                <span className="muted">{[shortDate(r.date), secs[r.sec]!.title].filter(Boolean).join(' · ')}</span>
                <span className="sp" />
                <span className="about-hist-act" onClick={(e) => e.stopPropagation()}>
                  {r.ok !== undefined ? <span className="about-hist-ok" data-ui="확인함"><i className="mark-ico" aria-hidden>{Icon.check}</i>{t(`확인함 ${shortDate(r.ok)}`, `Reviewed ${shortDate(r.ok)}`)}</span>
                    : checks.enabled && <>
                      <button className="btn sm" data-ui="맞아요" data-tip={t('이 업데이트를 확인함으로', 'Mark this update reviewed')} onClick={() => void confirm(r)}>{Icon.check} {t('맞아요', 'Right')}</button>
                      <button className="btn sm" data-ui="고칠 점" data-tip={t('이 업데이트에서 고칠 점을 피드백으로', 'Send what to fix in this update as feedback')} onClick={() => void answer(r)}>{Icon.comment} {t('고칠 점', 'To fix')}</button>
                    </>}
                </span>
              </div>
              <div className="about-hist-what">{r.title}</div>
              {r.ask && <div className="about-hist-ask">{r.ask}</div>}
              {open && <div className="about-hist-more"><ChangeSummary n={r.n} title={r.title} /></div>}
            </li>
          )
        })}
      </ol>
    </>
  )
}

/** 줄 아래에 펼치는 것: 업데이트 제목 전문과 커밋에 적은 바꾼 것 요약 */
function ChangeSummary({ n, title }: { n: number; title: string }) {
  const q = useAboutChanges(n)
  const lines = (q.data?.summary ?? []).filter((l) => !l.endsWith(title) && !title.endsWith(l))
  return (
    <div data-ui="바뀐 것 요약">
      {/* 제목 전문은 펼친 줄의 「바뀐 것」 칸에 보이므로 요약에서는 같은 줄을 뺀다 */}
      {lines.length ? <ul>{lines.map((l, i) => <li key={i}>{l}</li>)}</ul> : null}
      {q.data && !q.data.sentences.length && <p className="muted">{t('이 업데이트는 소개 글의 문장을 바꾸지 않았습니다 (그림 · 표 모양 · 업데이트 번호만)', 'This update did not change sentences of the text (only figures, table shape or update numbers)')}</p>}
    </div>
  )
}

export const useAboutChanges = (n: number | undefined) =>
  useQuery({ queryKey: ['about-changes', n], queryFn: () => aboutChanges(n!), enabled: n !== undefined, staleTime: Infinity })

/**
 * 업데이트가 바꾼 문장에 하이라이트 (CSS Custom Highlight, 본문을 고치지 않는다). 소스의 태그 자리와 화면의 띄어쓰기가 달라 빈칸을 빼고 맞춘다.
 * 찾은 수를 돌려준다. 하이라이트를 못 쓰는 브라우저는 0.
 */
export function markChanges(root: HTMLElement | null, sentences: string[]): number {
  const reg = typeof CSS !== 'undefined' && 'highlights' in CSS ? CSS.highlights : undefined
  reg?.delete('about-change')
  if (!root || !sentences.length || !reg || typeof Highlight === 'undefined') return 0
  const map: [Text, number][] = []
  let flat = ''
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walk.nextNode(); node; node = walk.nextNode()) {
    if (!(node instanceof Text)) continue
    for (let i = 0; i < node.data.length; i++) if (!/\s/.test(node.data[i]!)) { flat += node.data[i]; map.push([node, i]) }
  }
  const ranges = findSpans(flat, sentences).map(([a, b]) => {
    const r = document.createRange()
    r.setStart(map[a]![0], map[a]![1])
    r.setEnd(map[b - 1]![0], map[b - 1]![1] + 1)
    return r
  })
  if (!ranges.length) return 0
  reg.set('about-change', new Highlight(...ranges))
  ranges[0]!.startContainer.parentElement?.scrollIntoView({ block: 'center' })
  return ranges.length
}

/** 빈칸을 뺀 본문 글에서 문장(빈칸을 뺀)이 놓인 자리들 [시작, 끝) */
export function findSpans(flat: string, sentences: string[]): [number, number][] {
  const out: [number, number][] = []
  for (const s of sentences) {
    const key = s.replace(/\s+/g, '')
    if (key.length < 6) continue
    for (let at = flat.indexOf(key); at >= 0; at = flat.indexOf(key, at + key.length)) out.push([at, at + key.length])
  }
  return out
}
