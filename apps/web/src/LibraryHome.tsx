import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { figuresApi, LIBRARY_SCOPE, papersApi, type FigureBrief, type LibraryInfo, type PaperBrief, type PaperPick, type PaperRecommend, type PaperRow } from './api'
import { FIGURES_CHANGED } from './figureEmbed'
import { AddFigure, FigureCard, scopeTitle, showFigure, showRecentFigures } from './FiguresPage'
import { LibraryStorage, StoreLine } from './LibraryStorage'
import { PaperFind } from './PaperFind'
import { PAPERS_CHANGED, showPaper } from './PapersPage'
import { relativeTime } from './format'
import { go, type Route } from './router'
import { plural, t } from './i18n'

/**
 * 그림 첫 화면 (라이브러리 L2, 설계 결정 2026-10-06 "라이브러리 첫 화면"). 논문 첫 화면은 10/31 시안대로 따로(PapersHome).
 * 지식 첫 화면(KnowledgeHome.tsx)과 같은 틀(.kh-*): 머리줄 없이 ① 최근 더한 것(카드 한 줄, 맨 앞은 점선 더하기 카드)
 * ② 왼쪽 점검(사용자 차례, 주황 수, 0인 줄은 숨김) · 오른쪽 통계(0이면 흐리게). 점검 · 통계 줄은 목록을 그 거르기로 연다.
 * 오른쪽 사이드바는 라이브러리 정보(LibraryStorage). 숫자는 서버가 한 번에 센다(GET /api/papers/brief · /api/figures/brief).
 */

const RECENT = 12

/** 카드 한 줄에 들어가는 수 (더하기 카드 포함). 소수점 폭의 반올림 없이 실제 격자 열을 센다 */
function useOneRow(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [cols, setCols] = useState(RECENT + 1)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      if (!el.clientWidth) return
      const tracks = getComputedStyle(el).gridTemplateColumns
      setCols(tracks && tracks !== 'none' ? tracks.split(/\s+/).length : 1)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, cols]
}

/** 점검 · 통계 한 줄 */
interface StatRow { key: string; label: string; text: string; tip: string; count: number; to: Route }

function Home({ ui, kind, recentTitle, recentText, recentTip, onRecent, cards, check, stats, statsNote, error, notice, rightOpen, side }: {
  ui: string; kind: 'pl' | 'fg'; recentTitle: string; recentText: string; recentTip: string; onRecent(): void
  cards(cols: number): ReactNode
  check: StatRow[] | null; stats: StatRow[] | null; statsNote?: string
  error: string | null; notice?: string | null; rightOpen: boolean; side: ReactNode
}) {
  const [row, cols] = useOneRow()
  const turn = (check ?? []).filter((c) => c.count > 0)
  return (
    <main className="kn-page kh-page" data-ui={ui}>
      <div className={`kh-layout${rightOpen ? '' : ' no-right'}`}>
        <div className="scroll kh-main">
          {error && <div className="banner danger">{t('첫 화면 숫자를 읽지 못했습니다', 'Could not read the counts for this page')}: {error}</div>}
          {notice && <div className="banner">{notice}</div>}
          <section className="kh-sec lh-wide" data-ui={recentTitle}>
            <h2 className="kh-h"><button className="a lh-h-link" title={recentTip} onClick={onRecent}>{recentText}</button></h2>
            <div ref={row} className={`lh-cards ${kind}`}>{cards(cols)}</div>
          </section>
          <div className="kh-cols">
            <section className="kh-sec" data-ui="점검">
              <h2 className="kh-h">{turn.length > 0 && <span className="turn-dot kh-dot" aria-hidden />}{t('점검', 'Check')}</h2>
              {check && turn.length === 0 && <p className="empty kh-empty">{t('지금 확인 항목이 없습니다.', 'Nothing to review now.')}</p>}
              {turn.map((c) => (
                <button key={c.key} className="kh-stat" data-ui="점검 줄" data-ui-item={c.label} title={c.tip} onClick={() => go(c.to)}>
                  <span className="kh-stat-name">{c.text}</span><span className="rail-count">{c.count}</span>
                </button>
              ))}
            </section>
            <section className="kh-sec" data-ui="통계">
              <h2 className="kh-h">{t('통계', 'Stats')}{statsNote && <span className="kh-h-n">{statsNote}</span>}</h2>
              {stats?.map((c) => (
                <button key={c.key} className="kh-stat" data-ui="통계 줄" data-ui-item={c.label} title={c.tip} disabled={c.count === 0} onClick={() => go(c.to)}>
                  <span className="kh-stat-name">{c.text}</span><span className="kh-count">{c.count}</span>
                </button>
              ))}
            </section>
          </div>
        </div>
        {/* 오른쪽 사이드바: 제목줄 단추 · ⌥⌘\로 여닫는다 (지식과 같은 기억) */}
        {rightOpen && <aside className="kh-side" data-ui="라이브러리 정보">{side}</aside>}
      </div>
    </main>
  )
}

/** 서버가 센 숫자를 읽고, 목록이 바뀌면(더하기 · 바깥에서 고침) 다시 읽는다 */
function useBrief<T>(load: () => Promise<T>, event: string, info: unknown): [T | null, string | null] {
  const [brief, setBrief] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const read = useCallback(() => { load().then((b) => { setBrief(b); setError(null) }).catch((e: Error) => setError(e.message)) }, [load])
  useEffect(() => {
    read()
    window.addEventListener(event, read)
    return () => window.removeEventListener(event, read)
  }, [read, event, info])
  return [brief, error]
}

const loadPapers = () => papersApi.brief(RECENT)
const folderName = (p: string) => p.split('/').filter(Boolean).pop() ?? p
const SHOW = 6
const short = (authors: string[]) => (authors.length > 2 ? `${authors.slice(0, 2).join(', ')}${t(' 외', ' et al.')}` : authors.join(', '))
const pickWhen = (p: PaperPick) => (p.date ? `${Number(p.date.slice(5, 7))}/${Number(p.date.slice(8, 10))}` : p.year)

/**
 * 논문 첫 화면 (10/31 시안 1절 확정): 위에서 1/3에 찾기, 아래 왼쪽 최근 확인한 논문 · 오른쪽 추천 논문.
 * 점검 · 통계 줄은 두지 않는다: 답이 온 질문은 최근 확인한 논문 맨 앞(주황 수), 정리할 것(PDF 없음 · 분류 없음 …)은 목록의 보기 상자.
 */
export function PapersHome({ info, rightOpen, onSaved }: { info: LibraryInfo | null; rightOpen: boolean; onSaved(m: string): void }) {
  const [b, error] = useBrief<PaperBrief>(loadPapers, PAPERS_CHANGED, info)
  // 찾기 (10/31 시안 1절): 라이브러리 묶음은 글을 처음 쓸 때 목록을 한 번 받아 거른다
  const [q, setQ] = useState('')
  const [all, setAll] = useState<PaperRow[] | null>(null)
  useEffect(() => { if (q.trim() && !all) void papersApi.list().then((l) => setAll(l.papers)).catch(() => setAll([])) }, [q, all])
  useEffect(() => { const reset = () => setAll(null); window.addEventListener(PAPERS_CHANGED, reset); return () => window.removeEventListener(PAPERS_CHANGED, reset) }, [])
  const [rec, recError] = useBrief<PaperRecommend>(papersApi.recommend, PAPERS_CHANGED, info)
  const [busy, setBusy] = useState<string | null>(null)
  const add = async (id: string) => {
    setBusy(id)
    try {
      const r = await papersApi.add(id)
      window.dispatchEvent(new Event(PAPERS_CHANGED))
      onSaved(r.existed ? t(`이미 있는 논문입니다: ${r.key}`, `Paper already exists: ${r.key}`) : t(`더했습니다: ${r.key}`, `Added: ${r.key}`))
    } catch (e) { onSaved(e instanceof Error ? e.message : String(e)) } finally { setBusy(null) }
  }
  const clouds = (kind: 'icloud' | 'drive') => {
    const f = (b?.folders ?? []).filter((x) => x.cloud === kind)
    return f.length ? f.map((x) => <StoreLine key={x.path} title={x.path}>{t('PDF 폴더', 'PDF folder')} {folderName(x.path)}</StoreLine>) : <StoreLine idle>{t('PDF 폴더 연결 안 함', 'No PDF folder connected')} <button className="a" onClick={() => go({ page: 'settings', part: 'library-papers' })}>{t('연결하기', 'Connect')}</button></StoreLine>
  }
  const opened = b?.opened.slice(0, SHOW) ?? []
  const answered = opened.some((p) => p.answered > 0)
  return (
    <main className="kn-page kh-page" data-ui="논문 첫 화면">
      <div className={`kh-layout${rightOpen ? '' : ' no-right'}`}>
        <div className="scroll kh-main lh-pmain">
          {error && <div className="banner danger">{t('첫 화면 숫자를 읽지 못했습니다', 'Could not read the counts for this page')}: {error}</div>}
          {b && !b.library && <div className="banner">{t('공유 라이브러리가 설정되지 않았습니다. 설정 › 라이브러리 관리에서 저장 위치를 확인해 주세요.', 'The shared library is not set up. Check its location in Settings › Library.')}</div>}
          <div className="lh-gap" aria-hidden />
          <div className="lh-find"><PaperFind value={q} onChange={setQ} papers={all ?? []} projects={b?.projects ?? []} onSaved={onSaved} /></div>
          <div className="lh-gap two" aria-hidden />
          <div className="kh-cols">
            <section className="kh-sec" data-ui="최근 확인한 논문">
              <h2 className="kh-h">{answered && <span className="turn-dot kh-dot" aria-hidden />}<button className="a lh-h-link" title={t('목록에서 모두 보기', 'See all in the list')} onClick={() => go({ page: 'shelf', list: true })}>{t('최근 확인한 논문', 'Recently checked papers')}</button></h2>
              {b && opened.length === 0 && <p className="empty kh-empty">{t('아직 연 논문이 없습니다. 논문을 열면 여기에 열어 본 순서로 보입니다.', 'No papers opened yet. Papers you open show here, latest first.')}</p>}
              <div className="kh-rows">
                {opened.map((p) => (
                  <button key={p.key} className="kh-row lh-row" data-ui="최근 확인한 논문 줄" onClick={() => showPaper(p.key)}>
                    <span className="lh-row-text"><span className="kh-title">{p.title}</span><span className="kh-subject">{short(p.authors)}{p.year ? ` · ${p.year}` : ''}</span></span>
                    {p.answered > 0
                      ? <span className="kh-when kh-turn">{t(`답이 온 질문 ${p.answered}`, `${p.answered} answered`)}</span>
                      : <span className="kh-when">{p.opened ? relativeTime(p.opened) : ''}</span>}
                  </button>
                ))}
              </div>
            </section>
            <section className="kh-sec" data-ui="추천 논문">
              <h2 className="kh-h">{t('추천 논문', 'Recommended papers')}{rec && rec.seeds > 0 && <span className="kh-h-n">{t(`내 논문 ${rec.seeds}편과 가까운 새 논문`, `New papers close to ${rec.seeds} of your papers`)}</span>}</h2>
              {(recError || rec?.offline) && <p className="empty kh-empty">{t('인터넷에 연결되지 않아 추천을 받지 못했습니다.', 'Not connected to the internet, so no recommendations.')}</p>}
              {rec && !rec.offline && rec.seeds === 0 && <p className="empty kh-empty">{t('arXiv 번호나 DOI가 있는 논문을 더하면 추천이 보입니다.', 'Add a paper with an arXiv number or DOI to see recommendations.')}</p>}
              {rec && !rec.offline && rec.seeds > 0 && rec.picks.length === 0 && <p className="empty kh-empty">{t('지금 추천할 새 논문이 없습니다.', 'No new papers to recommend now.')}</p>}
              <div className="kh-rows">
                {rec?.picks.map((p) => (
                  <div key={p.id} className="kh-row lh-row" data-ui="추천 논문 줄">
                    <span className="lh-row-text"><span className="kh-title">{p.title}</span><span className="kh-subject">{[short(p.authors), p.venue || (/^10\./.test(p.id) ? '' : 'arXiv'), pickWhen(p)].filter(Boolean).join(' · ')}</span></span>
                    <button className="btn small" disabled={busy !== null} onClick={() => void add(p.id)}>{busy === p.id ? t('추가 중…', 'Adding…') : t('＋ 추가', '＋ Add')}</button>
                  </div>
                ))}
              </div>
              {rec && rec.picks.length > 0 && <p className="kh-hint lh-source">{t('Semantic Scholar 추천', 'From Semantic Scholar')}</p>}
            </section>
          </div>
        </div>
        {rightOpen && <aside className="kh-side" data-ui="라이브러리 정보"><LibraryStorage info={info} section="papers" git={b ? t(`논문 ${b.total}편`, plural(b.total, 'paper')) : undefined} icloud={clouds('icloud')} drive={clouds('drive')} /></aside>}
      </div>
    </main>
  )
}

const loadFigures = () => figuresApi.brief(RECENT)

export function FiguresHome({ info, rightOpen, onSaved }: { info: LibraryInfo | null; rightOpen: boolean; onSaved(m: string): void }) {
  const [b, error] = useBrief<FigureBrief>(loadFigures, FIGURES_CHANGED, info)
  const list = (filter: string): Route => ({ page: 'figures', filter })
  const check: StatRow[] | null = b && [
    { key: 'broken', label: '그림으로 못 바꾼 tikz', text: t('그림으로 못 바꾼 tikz', 'tikz that failed to render'), tip: t('맥의 TeX로 그림(SVG)을 만들지 못한 tikz 원본. 원본을 고치면 다시 만듭니다', "tikz sources that the Mac's TeX could not turn into an SVG. Fixing the source renders it again"), count: b.check.broken, to: list('broken') },
  ]
  const stats: StatRow[] | null = b && [
    { key: 'tikz', label: 'tikz', text: t('tikz', 'tikz'), tip: t('tikz 원본(.tikz · .tex)', 'tikz sources (.tikz · .tex)'), count: b.stats.tikz, to: list('tikz') },
    { key: 'svg', label: 'svg', text: t('svg', 'svg'), tip: t('svg 그림', 'svg figures'), count: b.stats.svg, to: list('svg') },
    { key: 'photo', label: '사진', text: t('사진', 'Photos'), tip: t('png · jpg 그림', 'png · jpg figures'), count: b.stats.photo, to: list('photo') },
    { key: 'pdf', label: 'pdf', text: t('pdf', 'pdf'), tip: t('pdf 그림', 'pdf figures'), count: b.stats.pdf, to: list('pdf') },
    { key: 'unused', label: '쓰는 노트 없음', text: t('쓰는 노트 없음', 'Not used in any note'), tip: t('어느 노트도 ![[이름]]으로 쓰지 않는 그림', 'Figures no note uses with ![[name]]'), count: b.stats.unused, to: list('unused') },
    ...(b.stats.unclassified !== undefined ? [{ key: 'unclassified', label: '분류 없음', text: t('분류 없음', 'No subject'), tip: t('분류 나무의 ID가 없는 자료', 'Items without an ID from the subject tree'), count: b.stats.unclassified, to: list('unclassified') }] : []),
  ]
  const idle = <StoreLine idle>{t('사진 · 스캔 폴더 연결 안 함', 'No photo or scan folder connected')} <button className="a" onClick={() => go({ page: 'settings', part: 'library-figures' })}>{t('연결하기', 'Connect')}</button></StoreLine>
  return (
    <Home ui="그림 첫 화면" kind="fg" recentTitle="최근 더한 그림" recentText={t('최근 더한 그림', 'Recently added figures')} recentTip={t('목록에서 최근 더한 순으로 보기', 'View the list newest first')} onRecent={showRecentFigures}
      error={error} check={check} stats={stats} statsNote={b ? t(`${b.total}개`, `${b.total}`) : undefined} rightOpen={rightOpen}
      cards={(cols) => <>
        <AddFigure look="card" compact scope={LIBRARY_SCOPE} scopeLabel={t('공용', 'Shared')} onSaved={onSaved} onAdded={() => undefined} />
        {b?.recent.slice(0, cols - 1).map((f) => <FigureCard key={f.id} compact fig={f} scope={scopeTitle(b, f.scope)} onClick={() => showFigure(f.id)} />)}
      </>}
      side={<LibraryStorage info={info} section="figures" git={b ? t(`공용 그림 ${b.store.library}`, `Shared figures ${b.store.library}`) : undefined}
        gitMore={b && b.store.inProjects > 0 && <StoreLine title={t('프로젝트 전용 그림은 각 연구 저장소의 workbench/figures/에 있습니다', "Project figures are in each project repository's workbench/figures/")}>{t(`프로젝트 ${b.store.projects}곳 · ${b.store.inProjects}개`, `${plural(b.store.projects, 'project')} · ${b.store.inProjects}`)}</StoreLine>}
        icloud={idle} drive={idle} />} />
  )
}
