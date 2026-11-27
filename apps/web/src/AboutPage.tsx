import { useCallback, useEffect, useRef, useState } from 'react'
import { AboutFixTab } from './AboutFix'
import { AboutSide, markChanges, useAboutChanges, type Picked, type SideTab } from './AboutHistorySide'
import { HistoryButton } from './NoteHistory'
import { InfoOrAgent } from './AgentSide'
import { closeRight, openRight, rightModeNow, useRightMode } from './noteScreen'
import { ABOUT_PARTS, type AboutPart, type AboutSection, partOf, sectionAnchor } from './aboutContent'
import { checkKey, checkState, lastPr, prsSince, useAboutChecks, type AboutCheckState } from './aboutChecks'
import type { AboutCheck, AboutChecks, RulesView } from './api'
import { askPart, needsUser, useRuleAsks } from './ResearchTables'
import { queryClient, qk } from './queries'
import { t } from './i18n'
import { go, href, type Route } from './router'
import { portUrl } from './about/code'
import { Intro, Layout, SymbolTable, Reference, Next, PartTitle, type SectionCheckView, Section } from './AboutParts'

/**
 * 이 앱 소개: 앱의 왼쪽 사이드바에서 한 쪽을 고른다 (#/about/<쪽>).
 * 쪽마다 지금 앱이 어떤지를 화면의 짜임대로 절로 나눠 보여 준다 (내용은 aboutContent.tsx).
 * 툴바 오른쪽 시계나 상단바의 정보 아이콘으로 앱의 오른쪽 사이드바를 연다 (11/20 시안 2 · 3절, AboutHistorySide.tsx. 11/24부터 따로 띄운 칸이 아니라
 * 앱 사이드바 한 칸이라 에이전트 사이드바와 둘이 함께 열리지 않는다): 탭 「이력」은 이 쪽을 고친 (절, 업데이트) 표로
 * 줄마다 확인을 받고, 줄을 누르면 그 절로 가서 그 업데이트가 바꾼 문장에 하이라이트를 붙인다. 탭 「수정」은 본문의 한 곳을 눌러 고친 글을 담아 보낸다(AboutFix.tsx).
 * 확인 전인 절은 절 제목 옆 「확인 전」과 왼쪽 목록의 「확인 n」으로 보인다(본문 위 확인 항목 상자는 11/20에 없앰).
 * 둘 다 누르면 이력 탭을 열고 그 절의 가장 최근 확인 전 줄을 고른다 (11/20 피드백 08:54 「클릭하면 오른쪽 사이드바가 뜨거나 알려 줘야」).
 */
const REVIEW_EVENT = 'rw-about-review'
/** 「확인 전」 · 「확인 n」을 눌렀을 때: 그 쪽의 그 절(없으면 첫 확인 전 절)을 이력에서 연다 */
export function openReview(part: string, sec?: number) { window.dispatchEvent(new CustomEvent(REVIEW_EVENT, { detail: { part, sec } })) }

export function AboutPage({ part, anchor, rightOpen, onSaved }: { part?: string; anchor?: string; rightOpen: boolean; onSaved(m: string): void }) {
  const p = partOf(part)
  // 절이 있는 쪽은 절 하나씩 따로 연다 (10/15 14:12 "서브섹션보다 서브페이지 구조로, 스크롤이 힘들다"). #/about/<쪽>은 첫 절
  const at = sectionIndex(p, anchor)
  const scroll = useRef<HTMLDivElement>(null)
  useEffect(() => { scroll.current?.scrollTo({ top: 0 }) }, [p.id, at])
  const pages = aboutPages()
  const i = pages.findIndex((x) => x.part === p && x.at === at)
  const prev = pages[i - 1]
  const next = pages[i + 1]
  // 오른쪽 사이드바가 열려 있고 에이전트 · 터미널이 아닌 갈래면 이력 · 수정이 보인다 (AgentSide.tsx의 InfoOrAgent)
  const mode = useRightMode()
  const side = rightOpen && mode !== 'agent' && mode !== 'terminal'
  // 이력 · 수정을 연다. 에이전트 · 터미널을 보던 때만 갈래를 바꾼다: 「기록」을 「정보」로 바꿔 적으면 프로젝트의 오른쪽 사이드바가 다음에 정보로 열린다
  const openSide = () => openRight(rightModeNow() === 'agent' || rightModeNow() === 'terminal' ? 'info' : rightModeNow())
  const [tab, setTab] = useState<SideTab>(tabOn)
  const [picked, setPicked] = useState<Picked | null>(null)
  // 다른 쪽의 「확인 n」을 누르면 쪽을 옮긴 뒤 고를 줄
  const pending = useRef<Picked | null>(null)
  useEffect(() => { setPicked(pending.current); pending.current = null }, [p.id])
  const checks = useAboutChecks()
  useEffect(() => {
    const on = (e: Event) => {
      const d = e instanceof CustomEvent ? e.detail : undefined
      const x = ABOUT_PARTS.find((y) => y.id === d?.part)
      if (!x?.sections) return
      const todo = (i: number) => prsSince(x.sections![i]!, checks.sections[checkKey(x, sectionAnchor(x.sections![i]!, i))])
      const i = typeof d.sec === 'number' ? d.sec : x.sections.findIndex((_, j) => todo(j).length > 0)
      const ns = i >= 0 ? todo(i) : []
      if (!ns.length) return
      const v = { n: Math.max(...ns), sec: i }
      openSide(); setTab('history'); keepTab('history')
      if (x.id !== p.id) pending.current = v
      else setPicked(v)
      if (x.id !== p.id || i !== at) go({ page: 'about', part: x.id, ...(i > 0 && { anchor: sectionAnchor(x.sections[i]!, i) }) })
    }
    window.addEventListener(REVIEW_EVENT, on)
    return () => window.removeEventListener(REVIEW_EVENT, on)
  }, [checks, p.id, at])
  const sec = at >= 0 ? p.sections![at] : undefined
  const showSide = (v: boolean) => { if (v) openSide(); else closeRight() }
  useEffect(() => { if (!side) setPicked(null) }, [side])
  const showTab = (v: SideTab) => { setTab(v); keepTab(v); if (v === 'fix') setPicked(null) }
  // 줄을 고르면 그 절로 간다
  const pick = (v: Picked | null) => {
    setPicked(v)
    if (v && v.sec !== at) go({ page: 'about', part: p.id, ...(v.sec > 0 && { anchor: sectionAnchor(p.sections![v.sec]!, v.sec) }) })
  }
  // 고른 업데이트가 바꾼 문장에 하이라이트 (그 절을 연 뒤)
  const article = useRef<HTMLElement>(null)
  const changes = useAboutChanges(side && tab === 'history' ? picked?.n : undefined)
  const sentences = picked && picked.sec === at ? changes.data?.sentences : undefined
  useEffect(() => {
    markChanges(article.current, sentences ?? [])
    return () => { markChanges(null, []) }
  }, [sentences, p.id, at])
  // 수정 탭: 고른 요소가 속한 절
  const sectionKey = useCallback((el: Element) => {
    const id = el.closest('section[id^="about-"]')?.id.slice('about-'.length)
    const i = (p.sections ?? []).findIndex((x, j) => sectionAnchor(x, j) === id)
    const x = p.sections?.[i]
    return x ? { key: checkKey(p, sectionAnchor(x, i)), pr: lastPr(x), name: x.ui ?? x.title } : undefined
  }, [p])
  return (
    <main className={`stage full${rightOpen ? ' about-with-side' : ''}`} data-ui="소개">
      <section className="pane">
        <div className="pane-head about-tools" data-ui="머리줄">
          <span className="crumb"><b>{sec ? sec.title : p.title}</b></span><span className="sp" />
          <HistoryButton on={side} onChange={showSide} />
        </div>
        <div className="scroll" ref={scroll}>
          <PartTitle.Provider value={p.ui ?? p.title}>
            <article ref={article} className="page-body about" data-ui={`소개 › ${p.ui ?? p.title}`}>
              <header>
                {p.id === 'intro' ? <h1 className="h-title" data-ui="제목">Emergence Workbench</h1> : <h1 className="h-title">{p.title}</h1>}
                {at <= 0 && <p className="h-sub" data-ui="부제">{p.sub}</p>}
                {at <= 0 && p.open && <p className="about-open">{p.open.map((o) => <button key={o.label} className="a" onClick={() => go(o.to)}>{o.label} ›</button>)}</p>}
              </header>
              {p.id === 'intro' ? <Intro /> : p.id === 'layout' ? <Layout /> : p.id === 'reference' ? <Reference /> : p.id === 'next' ? <Next /> : <Sections part={p} at={at} history={side} />}
              <footer className="about-pager" data-ui="소개 앞뒤">
                {/* 앞뒤 넘기기: 본문과 띄운 두 칸 (10/15 15:03 제안) */}
                {prev ? <a className="about-step" href={pageHref(prev)}><span className="k">‹ {t('이전', 'Previous')}</span><b>{pageLabel(prev, p)}</b></a> : <span />}
                {next ? <a className="about-step next" href={pageHref(next)}><span className="k">{t('다음', 'Next')} ›</span><b>{pageLabel(next, p)}</b></a> : <span />}
              </footer>
            </article>
          </PartTitle.Provider>
        </div>
      </section>
      {rightOpen && <InfoOrAgent ui="소개 이력" infoClass="about-rs" onSaved={onSaved}>
        <AboutSide part={p} tab={tab} onTab={showTab} picked={picked} onPick={pick}
          fix={<AboutFixTab key={`${p.id}-${at}`} root={article} partName={p.ui ?? p.title} sectionKey={sectionKey} />} />
      </InfoOrAgent>}
    </main>
  )
}

/** 쪽 안에서 열 절: 주소의 절 이름이 없거나 모르는 것이면 첫 절. 절이 없는 쪽은 -1 (쪽 전체) */
function sectionIndex(p: AboutPart, anchor?: string): number {
  const secs = p.sections ?? []
  if (!secs.length) return -1
  const k = anchor ? secs.findIndex((sec, j) => sectionAnchor(sec, j) === anchor) : 0
  return k < 0 ? 0 : k
}

/** 앞뒤로 넘기는 차례: 절이 있는 쪽은 절마다 한 장, 없는 쪽은 쪽 하나 */
interface AboutPageRef { part: AboutPart; at: number }
const aboutPages = (): AboutPageRef[] => ABOUT_PARTS.flatMap((part) => part.sections?.length ? part.sections.map((_, at) => ({ part, at })) : [{ part, at: -1 }])
const pageHref = (x: AboutPageRef) => href({ page: 'about', part: x.part.id, ...(x.at > 0 && { anchor: sectionAnchor(x.part.sections![x.at]!, x.at) }) })
const pageLabel = (x: AboutPageRef, here: AboutPart) => x.at < 0 ? x.part.title : x.part === here ? x.part.sections![x.at]!.title : `${x.part.title} › ${x.part.sections![x.at]!.title}`

/** 설정과 같은 앱 사이드바의 쪽 목록. 쪽 주소와 피드백 부위 이름은 그대로 둔다. */
/** 왼쪽 목록의 묶음. 쪽 번호는 묶음을 넘어 이어진다. */
const NAV_GROUPS: { title: string; parts: string[] }[] = [
  { title: t('시작', 'Start'), parts: ['intro', 'principles'] },
  { title: t('화면', 'Screens'), parts: ['layout', 'home', 'project', 'notes', 'knowledge', 'reading', 'network', 'settings'] },
  { title: t('일하는 방식', 'How work flows'), parts: ['agents', 'feedback'] },
  { title: t('앱 개발', 'App development'), parts: ['research', 'rules'] },
  { title: t('기준과 참고', 'Standards and reference'), parts: ['design', 'symbols', 'reference', 'next'] },
]

export function AboutSidebar({ part, anchor }: { part?: string; anchor?: string }) {
  const current = partOf(part)
  const checks = useAboutChecks()
  const grouped = new Set(NAV_GROUPS.flatMap((g) => g.parts))
  const groups = [...NAV_GROUPS, { title: '', parts: ABOUT_PARTS.filter((p) => !grouped.has(p.id)).map((p) => p.id) }]
  return (
    <nav className="set-side about-nav" data-ui="소개 목록" aria-label={t('소개 쪽', 'About pages')}>
      {groups.map((g) => {
        const parts = g.parts.map((id) => ABOUT_PARTS.find((p) => p.id === id)).filter((p): p is AboutPart => !!p)
        if (parts.length === 0) return null
        return (
          <div key={g.title || 'rest'} className="about-nav-group">
            {g.title && <div className="about-nav-head">{g.title}</div>}
            {parts.map((p) => {
              const count = uncheckedCount(p, checks)
              const on = p === current
              const at = on ? sectionIndex(p, anchor) : -1
              return (
                <div key={p.id}>
                  <a href={href({ page: 'about', part: p.id })} className={`nav about-nav-row${on && at < 0 ? ' on' : ''}`} aria-current={on && at < 0 ? 'page' : undefined} title={p.title}>
                    <span className="n">{ABOUT_PARTS.indexOf(p) + 1}</span><span className="label">{p.title}</span>
                    {count > 0 && <span role="button" tabIndex={0} className="about-nav-flag" title={t(`확인 전인 절 ${count}: 눌러 이력에서 보기`, `Sections not reviewed: ${count}. Click to see them in History`)} data-ui="확인 필요 표시"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); openReview(p.id) }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openReview(p.id) } }}>{t(`확인 ${count}`, `Review ${count}`)}</span>}
                  </a>
                  {on && (p.sections ?? []).map((sec, i) => {
                    const a = sectionAnchor(sec, i)
                    return (
                      <a key={a} href={href({ page: 'about', part: p.id, anchor: a })} className={`nav about-nav-sub${at === i ? ' on' : ''}`} aria-current={at === i ? 'page' : undefined} title={sec.title}>
                        <span className="label">{sec.title}</span>
                      </a>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )
      })}
    </nav>
  )
}

/** 이 쪽 각 절의 확인 상태 */
interface SectionCheck { sec: AboutSection; i: number; key: string; state: AboutCheckState; rec?: AboutCheck }
const sectionChecks = (x: AboutPart, c: AboutChecks): SectionCheck[] => c.enabled ? (x.sections ?? []).map((sec, i) => {
  const key = checkKey(x, sectionAnchor(sec, i))
  const rec = c.sections[key]
  return { sec, i, key, rec, state: checkState(sec, rec, c.exists) }
}) : []

/** 쪽에서 확인 전인 절 수 (왼쪽 목록의 "확인 n", 레일 소개 버튼의 수) */
const uncheckedCount = (x: AboutPart, c: AboutChecks) => sectionChecks(x, c).filter((s) => s.state === 'unchecked').length

/** 레일의 소개 버튼에 붙는 수: 확인 전인 절 (10/4 15:37 피드백 "피드백과 마찬가지로 알림을") */
/** 띠의 소개 버튼: 확인할 곳이 있으면 그 첫 쪽으로 연다 (10/8 11:36 "알림이 가리키는 곳으로") */
export function aboutRailRoute(): Route {
  const c = queryClient.getQueryData<AboutChecks>(qk.aboutChecks)
  const part = c && ABOUT_PARTS.find((x) => uncheckedCount(x, c) > 0)
  if (part) return { page: 'about', part: part.id }
  // 확인할 절이 없으면 결정을 기다리는 규칙 · 실험으로 (소개 › 연구)
  const ask = queryClient.getQueryData<RulesView>(qk.rules)?.rows.find(needsUser)
  return ask ? { page: 'about', part: askPart(ask) } : { page: 'about' }
}

/** 소개에서 확인 전인 절 수 (레일의 수 · 알림 종) */
export function useAboutUncheckedCount(): number {
  const checks = useAboutChecks()
  return ABOUT_PARTS.reduce((sum, x) => sum + uncheckedCount(x, checks), 0)
}
/** 레일의 수: 확인 전인 절 + 결정을 기다리는 규칙 · 실험 (종의 수와 같게) */
export function AboutRailCount() {
  const sections = useAboutUncheckedCount()
  const asks = useRuleAsks().length
  const n = sections + asks
  if (!n) return null
  const title = [sections && t(`소개에서 확인 전인 절 ${sections}`, `About sections not reviewed: ${sections}`), asks && t(`결정을 기다리는 규칙 · 실험 ${asks}`, `Rules or experiments awaiting a decision: ${asks}`)].filter(Boolean).join(' · ')
  return <span className="rail-count" data-ui="확인할 곳 수" title={title}>{n}</span>
}

/** 이력 · 수정 가운데 고른 탭. 사이드바를 여닫는 것은 앱의 오른쪽 사이드바가 기억한다 */
const TAB_KEY = 'rw.aboutSideTab'
function tabOn(): SideTab { try { return localStorage.getItem(TAB_KEY) === 'fix' ? 'fix' : 'history' } catch { return 'history' } }
function keepTab(v: SideTab) { try { localStorage.setItem(TAB_KEY, v) } catch { /* 위와 같다 */ } }

/** 다시 정리한 설명: 절마다 항목 목록, 그리고 남은 것 */
/** .md 절의 지킬 것 · 결정 · 구현 (11/27 "소개를 에이전트가 읽는 정본으로"): 지킬 것은 펼쳐 두고, 결정 · 구현은 접는다 */
function SectionMore({ sec }: { sec: AboutSection }) {
  return (
    <>
      {sec.keep && <div className="about-keep" data-ui="지킬 것"><h3>{t('지킬 것', 'Keep')}</h3><ul className="about-list">{sec.keep.map((it, n) => <li key={n}>{it.text}</li>)}</ul></div>}
      {sec.decisions && <details className="about-more" data-ui="결정"><summary>{t('결정', 'Decisions')}</summary><ul className="about-list">{sec.decisions.map((it, n) => <li key={n}>{it.text}</li>)}</ul></details>}
      {(sec.code || sec.mcp) && (
        <details className="about-more" data-ui="구현">
          <summary>{t('구현', 'Implementation')}</summary>
          <ul className="about-list">
            {sec.code?.map((f) => <li key={f}><code>{f}</code></li>)}
            {sec.mcp && <li>MCP {sec.mcp.map((m, n) => <span key={m}>{n > 0 && ' · '}<code>{m}</code></span>)}</li>}
          </ul>
        </details>
      )}
    </>
  )
}

function Sections({ part, at, history }: { part: AboutPart; at: number; history: boolean }) {
  const last = at === part.sections!.length - 1
  const checks = useAboutChecks()
  return (
    <>
      {part.sections!.map((sec, i) => {
        if (i !== at) return null
        const key = checkKey(part, sectionAnchor(sec, i))
        const rec = checks.sections[key]
        const check: SectionCheckView = { key, rec, prs: sec.prs ?? [], dates: checks.prDates, enabled: checks.enabled, history, state: checks.enabled ? checkState(sec, rec, checks.exists) : 'checked' }
        return (
        <Section key={sec.title} name={sec.title} ui={sec.ui ?? sec.title} id={sectionAnchor(sec, i)} check={check} onReview={() => openReview(part.id, i)}>
          {sec.summary && <p className="about-summary" data-ui="요약">{sec.summary}</p>}
          {part.id !== 'symbols' && sec.figure && <div className="about-figs">{sec.figure}</div>}
          <ul className="about-list">{sec.items.map((it, n) => <li key={n}>{it.text}</li>)}</ul>
          <SectionMore sec={sec} />
          {/* 이 기능을 다른 앱에 옮기는 이식 안내서 (11/19) */}
          {sec.port && <p className="about-port" data-ui="이식 안내서">{t('다른 앱에 옮기기: ', 'Port to another app: ')}<a className="a" href={portUrl(sec.port)} target="_blank" rel="noreferrer">{`docs/ports/${sec.port}.md`}</a>{t(' — 관련 코드와 옮기는 순서', ' — the code and the steps to port it')}</p>}
          {/* 기호와 의미 쪽은 설명 한 줄 다음에 표 */}
          {part.id === 'symbols' && sec.figure && <div className="about-figs">{sec.figure}</div>}
          {part.id === 'symbols' && sec.id && <SymbolTable id={sec.id} />}
        </Section>
        )
      })}
      {/* 남은 것은 쪽의 마지막 절 아래에 */}
      {last && part.left && part.left.length > 0 && (
        <Section name={t('남은 것', 'Still to do')} ui="남은 것">
          <ul className="about-list">{part.left.map((x, n) => <li key={n}>{x}</li>)}</ul>
        </Section>
      )}
    </>
  )
}
