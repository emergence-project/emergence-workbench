import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { figuresApi, LIBRARY_SCOPE, papersApi, type FigureBrief, type LibraryInfo, type PaperBrief } from './api'
import { FIGURES_CHANGED } from './figureEmbed'
import { AddFigure, FigureCard, scopeTitle, showFigure, showRecentFigures } from './FiguresPage'
import { LibraryStorage, StoreLine } from './LibraryStorage'
import { AddPaper, PAPERS_CHANGED, PaperCard, showPaper, showRecentPapers } from './PapersPage'
import { go, type Route } from './router'
import { plural, t } from './i18n'

/**
 * 논문 · 그림 첫 화면 (라이브러리 L2, 설계 결정 2026-10-06 "라이브러리 첫 화면").
 * 지식 첫 화면(KnowledgeHome.tsx)과 같은 틀(.kh-*): 머리줄 없이 ① 최근 더한 것(카드 한 줄, 맨 앞은 점선 더하기 카드)
 * ② 왼쪽 점검(사용자 차례, 주황 수, 0인 줄은 숨김) · 오른쪽 통계(0이면 흐리게). 점검 · 통계 줄은 목록을 그 거르기로 연다.
 * 오른쪽 사이드바는 라이브러리 정보(LibraryStorage). 숫자는 서버가 한 번에 센다(GET /api/papers/brief · /api/figures/brief).
 */

const RECENT = 12

/** 카드 한 줄에 들어가는 수 (더하기 카드 포함). 소수점 폭의 반올림 없이 실제 격자 열을 센다 */
function useOneRow(): [React.RefObject<HTMLDivElement>, number] {
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
              <h2 className="kh-h">{turn.length > 0 && <span className="kh-dot" aria-hidden />}{t('점검', 'Check')}</h2>
              {check && turn.length === 0 && <p className="kh-empty">{t('지금 확인할 것이 없습니다.', 'Nothing to review now.')}</p>}
              {turn.map((c) => (
                <button key={c.key} className="kh-stat" data-ui="점검 줄" data-ui-item={c.label} title={c.tip} onClick={() => go(c.to)}>
                  <span className="kh-stat-name">{c.text}</span><span className="kh-count turn">{c.count}</span>
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

export function PapersHome({ info, rightOpen, onSaved }: { info: LibraryInfo | null; rightOpen: boolean; onSaved(m: string): void }) {
  const [b, error] = useBrief<PaperBrief>(loadPapers, PAPERS_CHANGED, info)
  const title = (id: string) => b?.projects.find((p) => p.id === id)?.title ?? id
  const list = (filter: string): Route => ({ page: 'shelf', filter })
  const check: StatRow[] | null = b && [
    { key: 'folder', label: 'PDF 폴더 정하기', text: t('PDF 폴더 정하기', 'Choose a PDF folder'), tip: t('PDF를 찾고 받아 둘 iCloud · Google Drive 폴더가 아직 없습니다', 'There is no iCloud or Google Drive folder yet for finding and saving PDFs'), count: b.check.noFolder ? 1 : 0, to: { page: 'settings', part: 'library-papers' } },
    { key: 'answered', label: '답이 온 질문', text: t('답이 온 질문', 'Answered questions'), tip: t('Claude가 답한 논문 질문 가운데 아직 끝내지 않은 것', 'Paper questions Claude answered that are not marked done yet'), count: b.check.answered, to: list('answered') },
  ]
  const stats: StatRow[] | null = b && [
    ...(b.stats.unclassified !== undefined ? [{ key: 'unclassified', label: '분류 없음', text: t('분류 없음', 'No subject'), tip: t('분류 나무의 ID가 없는 자료', 'Items without an ID from the subject tree'), count: b.stats.unclassified, to: list('unclassified') }] : []),
    { key: 'nopdf', label: 'PDF 없음', text: t('PDF 없음', 'No PDF'), tip: t('PDF 폴더에 <bib 키>.pdf가 없는 논문', 'Papers with no <bib key>.pdf in the PDF folder'), count: b.stats.noPdf, to: list('nopdf') },
    { key: 'arxiv', label: 'arXiv로 받을 수 있음', text: t('arXiv로 받을 수 있음', 'Available on arXiv'), tip: t('PDF는 없지만 arXiv 번호가 있는 논문', 'Papers with no PDF but with an arXiv number'), count: b.stats.arxiv, to: list('arxiv') },
    { key: 'none', label: '프로젝트에 안 묶임', text: t('프로젝트에 안 묶임', 'Not linked to a project'), tip: t('어느 프로젝트에도 표시되지 않은 논문', 'Papers not marked for any project'), count: b.stats.unlinked, to: list('none') },
    { key: 'paper', label: '논문', text: t('논문', 'Papers'), tip: t('책이 아닌 항목', 'Entries that are not books'), count: b.stats.papers, to: list('paper') },
    { key: 'book', label: '책', text: t('책', 'Books'), tip: t('bib 종류가 book · inbook · incollection · booklet인 항목', 'Entries of bib type book · inbook · incollection · booklet'), count: b.stats.books, to: list('book') },
  ]
  const clouds = (kind: 'icloud' | 'drive') => {
    const f = (b?.folders ?? []).filter((x) => x.cloud === kind)
    return f.length ? f.map((x) => <StoreLine key={x.path} title={x.path}>{t('PDF 폴더', 'PDF folder')} {folderName(x.path)}</StoreLine>) : <StoreLine idle>{t('PDF 폴더 연결 안 함', 'No PDF folder connected')} <button className="a" onClick={() => go({ page: 'settings', part: 'library-papers' })}>{t('연결하기', 'Connect')}</button></StoreLine>
  }
  return (
    <Home ui="논문 첫 화면" kind="pl" recentTitle="최근 더한 논문" recentText={t('최근 더한 논문', 'Recently added papers')} recentTip={t('목록에서 더한 순서(최근 것부터)로 보기', 'View the list in order added (newest first)')} onRecent={showRecentPapers}
      error={error} notice={b && !b.library ? t('공유 라이브러리(research-library)가 설정되지 않았습니다. 설정 › 라이브러리 관리에서 저장 위치를 확인해 주세요.', 'The shared library (research-library) is not set up. Check its location in Settings › Library.') : null}
      check={check} stats={stats} statsNote={b ? t(`${b.total}편`, `${b.total}`) : undefined} rightOpen={rightOpen}
      cards={(cols) => <>
        <AddPaper look="card" compact onSaved={onSaved} onAdded={() => undefined} />
        {b?.recent.slice(0, cols - 1).map((p) => <PaperCard key={p.key} compact paper={p} projectTitle={title} onClick={() => showPaper(p.key)} />)}
      </>}
      side={<LibraryStorage info={info} section="papers" git={b ? t(`논문 ${b.total}편`, plural(b.total, 'paper')) : undefined} icloud={clouds('icloud')} drive={clouds('drive')} />} />
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
