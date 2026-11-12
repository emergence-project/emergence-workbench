import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { api, setAboutCheck } from './api'
import { ABOUT_PARTS, type AboutPart, type AboutSection, COLOR_ROWS, partOf, sectionAnchor, SYMBOL_GROUPS } from './aboutContent'
import { checkKey, checkState, lastPr, prsSince, putAboutChecks, useAboutChecks, type AboutCheckState } from './aboutChecks'
import type { AboutCheck, AboutChecks } from './api'
import { queryClient, qk } from './queries'
import { FileTreeFigure } from './aboutFigures'
import { askText } from './askText'
import { lang, t } from './i18n'
import { Icon } from './icons'
import { ProofMark, StatusDot } from './StatusDot'
import { go, href, type Route } from './router'

/**
 * 이 앱 소개: 앱의 왼쪽 사이드바에서 한 쪽을 고른다 (#/about/<쪽>).
 * 쪽마다 지금 앱이 어떤지를 화면의 짜임대로 절로 나눠 보여 준다 (내용은 aboutContent.tsx).
 * 확인은 절 단위다 (11/11 안 C′, aboutChecks.ts): 확인 전인 절은 쪽 맨 위 「이 쪽의 확인 항목」에 한 줄씩 모인다.
 * 툴바 오른쪽 시계로 이력 보기를 켜면 절 제목 밑에 그 절을 고친 업데이트와 확인한 때가 시간 순서로 한 줄 붙는다.
 */
export function AboutPage({ part, anchor }: { part?: string; anchor?: string }) {
  const p = partOf(part)
  // 절이 있는 쪽은 절 하나씩 따로 연다 (10/15 14:12 "서브섹션보다 서브페이지 구조로, 스크롤이 힘들다"). #/about/<쪽>은 첫 절
  const at = sectionIndex(p, anchor)
  const scroll = useRef<HTMLDivElement>(null)
  useEffect(() => { scroll.current?.scrollTo({ top: 0 }) }, [p.id, at])
  const pages = aboutPages()
  const i = pages.findIndex((x) => x.part === p && x.at === at)
  const prev = pages[i - 1]
  const next = pages[i + 1]
  const [history, setHistory] = useState(historyOn)
  const sec = at >= 0 ? p.sections![at] : undefined
  return (
    <main className="stage full" data-ui="소개">
      <section className="pane">
        <div className="pane-head about-tools" data-ui="머리줄">
          <span className="crumb"><b>{sec ? sec.title : p.title}</b></span><span className="sp" />
          <HistoryButton on={history} onChange={(v) => { setHistory(v); keepHistory(v) }} />
        </div>
        <div className="scroll" ref={scroll}>
          <PartTitle.Provider value={p.ui ?? p.title}>
            <article className="page-body about" data-ui={`소개 › ${p.ui ?? p.title}`}>
              <header>
                {p.id === 'intro' ? <h1 className="h-title" data-ui="제목">Emergence Workbench</h1> : <h1 className="h-title">{p.title}</h1>}
                {at <= 0 && <p className="h-sub" data-ui="부제">{p.id === 'intro' ? INTRO_SUB : p.sub}</p>}
                {at <= 0 && p.open && <p className="about-open">{p.open.map((o) => <button key={o.label} className="a" onClick={() => go(o.to)}>{o.label} ›</button>)}</p>}
              </header>
              <CheckNotice part={p} />
              {p.id === 'intro' ? <Intro /> : p.id === 'reference' ? <Reference /> : p.id === 'next' ? <Next /> : <Sections part={p} at={at} history={history} />}
              <footer className="about-pager" data-ui="소개 앞뒤">
                {/* 앞뒤 넘기기: 본문과 띄운 두 칸 (10/15 15:03 제안) */}
                {prev ? <a className="about-step" href={pageHref(prev)}><span className="k">‹ {t('이전', 'Previous')}</span><b>{pageLabel(prev, p)}</b></a> : <span />}
                {next ? <a className="about-step next" href={pageHref(next)}><span className="k">{t('다음', 'Next')} ›</span><b>{pageLabel(next, p)}</b></a> : <span />}
              </footer>
            </article>
          </PartTitle.Provider>
        </div>
      </section>
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
  { title: t('화면', 'Screens'), parts: ['home', 'project', 'notes', 'knowledge', 'reading', 'network', 'settings'] },
  { title: t('일하는 방식', 'How work flows'), parts: ['agents', 'feedback'] },
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
                    {count > 0 && <span className="about-nav-flag" title={t(`확인 전인 절 ${count}`, `Sections not reviewed: ${count}`)} data-ui="확인 필요 표시">{t(`확인 ${count}`, `Review ${count}`)}</span>}
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

const INTRO_SUB = t('여러 연구를 함께 진행하는 사람을 위한 작업대입니다. 맥 · 윈도우에 설치해 그 컴퓨터에서 돌고, 폰에서는 같은 앱을 웹 화면으로 엽니다. 노트 쓰기, 유도·계산, 논문 읽기, 할 일과 기록을 한 창에서 다룹니다. 각 연구 저장소가 이미 가진 파일을 그대로 읽고 고치며, 남기는 것은 그 저장소에 파일로 두어 코딩 에이전트가 이어받습니다.', 'A workbench for people running several research projects at once. It is installed on a Mac or Windows computer and runs there; on a phone you open the same app as a web page. Writing notes, derivations and calculations, reading papers, to-dos and records all happen in one window. It reads and edits the files each research repository already has, and what it leaves behind is saved as files in that repository so coding agents can pick up the work.')

const toPart = (id: string) => href({ page: 'about', part: id })

/** 첫 쪽: 소개를 읽는 법, 화면 구조 그림, 핵심 이해 */
function Intro() {
  return (
    <>
      <Section name={t('화면 구조', 'Screen layout')} ui="화면 구조">
        <p className="about-lead">{t('한 창이 다섯 영역으로 나뉩니다. 영역을 누르면 그 설명으로 갑니다.', 'One window is divided into five areas. Click an area to go to its description.')}</p>
        <div className="about-map" role="img" aria-label={t('화면 구조: 위에 상단바, 왼쪽에 레일과 왼쪽 사이드바, 가운데 작업 패널, 오른쪽에 오른쪽 사이드바', 'Screen layout: top bar on top, rail and left sidebar on the left, work panel in the middle, right sidebar on the right')}>
          <a className="m-title" href={toPart('project')}><b>{t('상단바', 'Top bar')}</b><span>{t('왼쪽 사이드바 여닫기 · 뒤로 · 앞으로 · 위치', 'Toggle left sidebar · Back · Forward · Location')}</span><span className="m-title-actions">{t('(새 버전) · 검색 · 두 패널 · 피드백 · 오른쪽 사이드바 여닫기', '(New version) · Search · Two panes · Feedback · Toggle right sidebar')}</span></a>
          <div className="m-rail">
            <a href={toPart('home')}>{t('홈', 'Home')}</a>
            <a href={toPart('agents')}>{t('에이전트', 'Agents')}</a>
            <a href={toPart('home')}>{t('저장소', 'Repositories')}</a>
            <a href={toPart('project')}>{t('프로젝트들', 'Projects')}</a>
            <a href={toPart('knowledge')}>{t('지식', 'Knowledge')}</a>
            <a href={toPart('reading')}>{t('논문', 'Papers')}</a>
            <a href={toPart('reading')}>{t('그림', 'Figures')}</a>
            <a href={toPart('network')}>{t('네트워킹', 'Networking')}</a>
            <span className="sp" />
            <a href={toPart('feedback')}>{t('피드백', 'Feedback')}</a>
            <a href={toPart('intro')}>{t('소개', 'About')}</a>
            <a href={toPart('settings')}>{t('설정', 'Settings')}</a>
            <i>{t('레일', 'Rail')}</i>
          </div>
          <div className="m-side">
            <a href={toPart('project')}>{t('프로젝트 | 파일 | 목차', 'Project | Files | Outline')}<small>{t('위의 탭. 목차는 지금 연 노트 · 보고서의 절', 'Tabs on top. Outline is the sections of the open note or report')}</small></a>
            <a href={toPart('project')}>{t('프로젝트 정보', 'Project info')}<small>{t('현황 · 변경사항 · 규칙', 'Status · Changes · Rules')}</small></a>
            <a href={toPart('project')}>{t('기록', 'Records')}<small>{t('판단 · 맡긴 일 · 할 일 · 메모 · 질문', 'Decide · Delegated tasks · To-dos · Memos · Questions')}</small></a>
            <a href={href({ page: 'about', part: 'project', anchor: 'flow' })}>{t('수정 검토 · 흐름', 'Edit review · Flow')}</a>
            <a href={toPart('notes')}>{t('주제', 'Topics')}<small>{t('주제 › 노트 나무 · 노트들', 'Topic › note tree · Loose notes')}</small></a>
            <a href={toPart('reading')}>{t('자료', 'Materials')}<small>{t('원고 · 참고 자료', 'Manuscripts · Reference materials')}</small></a>
            <i>{t('왼쪽 사이드바', 'Left sidebar')}</i>
          </div>
          <a className="m-main" href={toPart('project')}><b>{t('주 패널 (왼쪽)', 'Main pane (left)')}</b><span>{t('고른 노트·화면. 탭이 없으면 프로젝트 첫 화면. 노트는 늘 여기', 'The chosen note or screen. With no tabs, the project home screen. Notes always open here')}</span></a>
          <a className="m-other" href={toPart('reading')}><b>{t('옆 패널 (오른쪽)', 'Side pane (right)')}</b><span>{t('노트의 PDF, 함께 볼 논문·진술', 'The note\'s PDF, papers and statements to view alongside')}</span></a>
          <a className="m-ctx" href={toPart('notes')}><b>{t('오른쪽 사이드바', 'Right sidebar')}</b><span>{t('정보 | 기록 (메모 · 할 일 · 질문)', 'Info | Records (memos · to-dos · questions)')}</span></a>
        </div>
        <p className="about-note">{t('프로젝트 화면의 구조입니다. 상단바의 두 패널 버튼은 프로젝트 화면에만, 오른쪽 사이드바 버튼은 프로젝트와 지식·논문·그림 첫 화면에 있습니다. 홈·지식·논문·그림·네트워킹·피드백·소개·설정은 프로젝트 밖 화면이고, 지식·논문·그림·네트워킹·소개·설정은 자기 왼쪽 사이드바가 있습니다.', 'This is the layout of the project screen. The Two panes button in the top bar is only on project screens, and the right sidebar button is on projects and on the Knowledge, Papers and Figures home screens. Home, Knowledge, Papers, Figures, Networking, Feedback, About and Settings are screens outside projects, and Knowledge, Papers, Figures, Networking, About and Settings have their own left sidebar.')}</p>
      </Section>

      <Section name={t('이 소개를 읽는 법', 'How to read this page')} ui="읽는 법">
        {lang === 'ko' ? (
          <p className="about-lead">
            이 소개는 Claude(코딩 에이전트)가 지금까지의 대화와 피드백에서 무엇을 알아들었고 그것을 화면에 어떻게 만들었는지 보여 드리는 곳입니다.
            쪽마다 화면 하나를 다루고, 지금 앱이 어떤지를 화면의 짜임대로 적습니다. 승인하신 피드백은 여기 설명으로 옮기고 피드백 목록에서는 지웁니다.
            틀린 곳이 있으면 절 제목 오른쪽 연필(수정)로 글을 직접 고쳐 보내 주세요.
          </p>
        ) : (
          <p className="about-lead">
            This page is where Claude (the coding agent) shows what it understood from the conversations and feedback so far, and how it built that into the screens.
            Each part covers one screen and describes how the app works now, following the layout of the screen. Feedback you approve moves into these descriptions and is deleted from the feedback list.
            If something is wrong, edit the text directly with the pencil (Edit) at the right of a section heading and send it.
          </p>
        )}
        <div className="about-legend">
          <span><span className="about-unsure">{t('확인 전', 'Not reviewed')}</span> {t('내가 확인한 뒤 그 절을 고친 업데이트가 있는 절. 그 쪽 맨 위 「이 쪽의 확인 항목」에서 「맞아요」로 확인함이 되고, 왼쪽 목록에 "확인 N"으로 표시됩니다', 'A section that an update changed after you reviewed it. "That is right" in "To review on this page" at the top marks it reviewed, and the list on the left shows "Review N"')}</span>
          <span><span className="about-pending">{t('반영 대기', 'Waiting to apply')}</span> {t('연필로 고쳐 보낸 절. 반영한 업데이트가 들어오면 사라지고 다시 확인할 차례가 됩니다', 'A section you edited with the pencil and sent. It goes away when the update that applies it arrives, and the section is yours to review again')}</span>
          <span><b>{Icon.history}</b> {t('툴바 오른쪽 시계로 이력 보기를 켜면, 절 제목 밑에 그 절을 고친 업데이트와 확인한 때가 시간 순서로 한 줄 붙습니다', 'Turn on history with the clock at the right of the toolbar, and one line under each section heading lists the updates that changed it and when you reviewed it, in time order')}</span>
        </div>
      </Section>

      <Section name={t('내가 이해한 것', 'What I understood')} ui="이해한 것">
        <ol className="about-understood">
          {lang === 'ko' ? (<>
            <li><b>무엇을 위한 앱인가.</b> 여러 연구를 동시에 진행하는 한 사람의 작업대입니다. 노트 쓰기, 직접 유도·계산, 논문 읽기, 할 일과 기록이 창을 바꾸지 않고 한곳에서 이어져야 합니다.</li>
            <li><b>저장소가 주인이다.</b> 연구마다 이미 있는 저장소의 구조를 앱에 맞게 바꾸지 않습니다. 앱은 그 정본을 읽고 고치며, 남기는 것은 그 저장소의 <code>workbench/</code>에 둡니다. <a className="a" href={toPart('agents')}>에이전트와 안전 ›</a></li>
            <li><b>원고는 한 글자도 잃지 않는다.</b> 에이전트나 다른 편집기가 같은 파일을 고쳐도 앱은 덮어쓰지 않습니다.</li>
            <li><b>화면은 "파일이 어디 있나"가 아니라 "내가 무엇을 묻나"로 나눈다.</b> 홈은 모든 프로젝트와 이번 주, 프로젝트 첫 화면은 어디까지 왔고 다음에 무엇을 하나, 지식은 주제마다 내가 아는 것. <a className="a" href={toPart('home')}>홈 ›</a></li>
            <li><b>글의 역할을 나눈다.</b> 원고는 결과를 모으는 개인 초고이고, 노트는 한 주제 안에서 완결된 증명·유도·계산이나 주장·열린 질문 하나입니다. 여러 연구가 다시 쓰는 지식은 개념노트, 논문 하나의 정리는 문헌노트입니다. 원고는 개인 연구와 초고까지, 공동 집필·투고는 Overleaf에 둡니다. 노트 파일에는 본문만 두고 머리말은 앱이 붙입니다. <a className="a" href={toPart('notes')}>노트 ›</a></li>
            <li><b>남이 만든 것은 참고 자료.</b> 실제로 가진 PDF·파일만 두고, 노트가 인용한 논문 정보는 bib 항목으로 그 노트 화면에서 봅니다. <a className="a" href={toPart('reading')}>참고 자료 ›</a></li>
            <li><b>맡긴 일은 내가 판단해 끝낸다.</b> 계산·유도·대조를 에이전트에게 맡길 때 종결 조건을 적고, 에이전트가 채운 보고서를 기록 › 내 차례에서 승인하거나 수정으로 돌려보냅니다. <a className="a" href={toPart('project')}>작업 ›</a></li>
            <li><b>남긴 말은 에이전트가 이어받는다.</b> 코멘트·질문·할 일·피드백은 파일로 남고, 에이전트가 답하거나 고칩니다. 실제 쓰다 생긴 불편을 새 기능보다 먼저 고칩니다. <a className="a" href={toPart('feedback')}>피드백 ›</a></li>
            <li><b>같은 일은 같은 모양, 같은 자리.</b> 행동 하나에 이름 하나·기호 하나이고, 같은 일은 한 화면에서만 합니다. 무채색이 기본이고 색은 상태에만 씁니다: <StatusDot s="in-progress" label /> · <StatusDot s="blocked" label /> · <StatusDot s="stopped" label /> · <StatusDot s="solved" label />. <a className="a" href={toPart('design')}>화면 기준 ›</a></li>
          </>) : (<>
            <li><b>What the app is for.</b> A workbench for one person running several research projects at the same time. Writing notes, doing derivations and calculations by hand, reading papers, to-dos and records should flow together in one place without switching windows.</li>
            <li><b>The repository is in charge.</b> The structure of each existing research repository is not reshaped to suit the app. The app reads and edits those sources of truth, and keeps what it leaves in that repository's <code>workbench/</code>. <a className="a" href={toPart('agents')}>Agents and safety ›</a></li>
            <li><b>Not a single character of a manuscript is lost.</b> Even if an agent or another editor changes the same file, the app does not overwrite it.</li>
            <li><b>Screens are divided by "what am I asking", not "where is the file".</b> Home is all projects and this week, a project's home screen is how far it has come and what comes next, Knowledge is what I know, by topic. <a className="a" href={toPart('home')}>Home ›</a></li>
            <li><b>Each kind of writing has its role.</b> A manuscript is a personal draft that gathers results, and a note is one self-contained proof, derivation, calculation, claim or open question within a topic. Knowledge reused across projects is a concept note, and a summary of one paper is a literature note. Manuscripts cover personal research up to a first draft; co-writing and submission happen in Overleaf. Note files hold only the body, and the app adds the preamble. <a className="a" href={toPart('notes')}>Notes ›</a></li>
            <li><b>What others made is reference material.</b> Only PDFs and files you actually have are kept; paper details a note cites are bib entries, seen on that note's screen. <a className="a" href={toPart('reading')}>Reference materials ›</a></li>
            <li><b>I close delegated tasks by deciding.</b> When handing a calculation, derivation or comparison to an agent, I write completion criteria, and in the Work tab I approve or request changes on the report the agent filled in. <a className="a" href={toPart('project')}>Work ›</a></li>
            <li><b>Agents pick up what I leave.</b> Comments, questions, to-dos and feedback are saved as files, and agents answer or fix them. Friction found in real use is fixed before new features. <a className="a" href={toPart('feedback')}>Feedback ›</a></li>
            <li><b>The same job looks the same and sits in the same place.</b> One name and one symbol per action, and each job is done on only one screen. Neutral is the default, and color is only for status: <StatusDot s="in-progress" label /> · <StatusDot s="blocked" label /> · <StatusDot s="stopped" label /> · <StatusDot s="solved" label />. <a className="a" href={toPart('design')}>Screen standards ›</a></li>
          </>)}
        </ol>
      </Section>
    </>
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

/**
 * 쪽 맨 위 알림: 이 쪽의 확인 항목 (10/4 17:03, 11/11 안 C′ 절마다 한 줄).
 * 「맞아요」는 그 절을 확인함으로 적고(그때의 PR 번호와 날짜), 「답하기」는 지금처럼 피드백으로 남는다.
 */
function CheckNotice({ part }: { part: AboutPart }) {
  const checks = useAboutChecks()
  const [error, setError] = useState('')
  const list = sectionChecks(part, checks).filter((s) => s.state === 'unchecked')
  if (!list.length) return null
  const confirm = async (s: SectionCheck) => {
    setError('')
    try { putAboutChecks(await setAboutCheck({ key: s.key, action: 'check', pr: lastPr(s.sec) })) } catch (e) { setError((e as Error).message) }
  }
  const answer = async (s: SectionCheck) => {
    const v = await askText({ title: t('답하기', 'Reply'), label: s.sec.ask ?? t('이 절에서 고칠 점', 'What to fix in this section'), multiline: true, ok: t('보내기', 'Send') })
    if (!v?.trim()) return
    setError('')
    try {
      await api.addFeedback({
        kind: '미분류', target: `소개 › ${part.ui ?? part.title} › ${s.sec.ui ?? s.sec.title} › 확인 항목`, route: location.hash.slice(1) || undefined, snippet: (s.sec.ask ?? s.sec.title).slice(0, 120),
        text: `확인 항목에 답함 (${s.sec.ui ?? s.sec.title}).\n\n질문: ${s.sec.ask ?? '이 절이 맞는지'}\n\n답: ${v.trim()}`,
      })
    } catch (e) { setError((e as Error).message) }
  }
  return (
    <aside className="about-ask" data-ui="확인할 것" role="note">
      <b>{t(`이 쪽의 확인 항목 ${list.length}`, `To review on this page: ${list.length}`)}</b>
      <ul>
        {list.map((s) => {
          const prs = prsSince(s.sec, s.rec).map((n) => `#${n}`).join(' · ')
          return (
            <li key={s.key} className="about-ask-row">
              <span className="about-ask-q">
                <a className="a" href={href({ page: 'about', part: part.id, ...(s.i > 0 && { anchor: sectionAnchor(s.sec, s.i) }) })}>{s.sec.title}</a><span className="muted"> · </span>
                {t(`${prs}이 이 절을 고쳤습니다.`, `${prs} changed this section.`)}{s.sec.ask && <> {s.sec.ask}</>}
              </span>
              <span className="about-ask-tools">
                <button className="btn" data-ui="맞아요" title={t('읽어 보니 맞습니다. 이 절을 확인함으로 둡니다', 'You read it and it is right. Marks this section as reviewed')} onClick={() => void confirm(s)}>{t('맞아요', 'That is right')}</button>
                <button className="btn" data-ui="답하기" title={t('고칠 점이나 다른 답을 적어 보냅니다', 'Write what to fix or a different answer and send it')} onClick={() => void answer(s)}>{t('답하기', 'Reply')}</button>
              </span>
            </li>
          )
        })}
      </ul>
      {error && <p className="muted">{error}</p>}
      <p className="muted">{t('"답하기"로 보낸 답은 피드백으로 남고 다음 피드백 처리 때 반영됩니다. 글을 직접 고치려면 절 제목 오른쪽 연필(수정)을 누르세요.', 'Answers sent with "Reply" are saved as feedback and applied at the next round of feedback handling. To edit the text directly, press the pencil (Edit) at the right of a section heading.')}</p>
    </aside>
  )
}

/** 레일의 소개 버튼에 붙는 수: 확인 전인 절 (10/4 15:37 피드백 "피드백과 마찬가지로 알림을") */
/** 띠의 소개 버튼: 확인할 곳이 있으면 그 첫 쪽으로 연다 (10/8 11:36 "알림이 가리키는 곳으로") */
export function aboutRailRoute(): Route {
  const c = queryClient.getQueryData<AboutChecks>(qk.aboutChecks)
  const part = c && ABOUT_PARTS.find((x) => uncheckedCount(x, c) > 0)
  return part ? { page: 'about', part: part.id } : { page: 'about' }
}

export function AboutRailCount() {
  const checks = useAboutChecks()
  const n = ABOUT_PARTS.reduce((sum, x) => sum + uncheckedCount(x, checks), 0)
  if (!n) return null
  return <span className="rail-count" data-ui="확인할 곳 수" title={t(`소개에서 확인 전인 절 ${n}`, `About sections not reviewed: ${n}`)}>{n}</span>
}

/** 이력 보기 켬 · 끔 (툴바 시계). 고른 상태는 이 브라우저가 기억한다 */
const HISTORY_KEY = 'rw.aboutHistory'
function historyOn(): boolean { try { return localStorage.getItem(HISTORY_KEY) === '1' } catch { return false } }
function keepHistory(on: boolean) { try { localStorage.setItem(HISTORY_KEY, on ? '1' : '0') } catch { /* 기억하지 못해도 지금 화면은 바뀐다 */ } }

/** 이력 보기 단추: 툴바 오른쪽 시계 (노트의 이력 보기도 같은 단추를 쓴다) */
export function HistoryButton({ on, onChange }: { on: boolean; onChange(v: boolean): void }) {
  return (
    <button className={`icon-btn${on ? ' on' : ''}`} data-ui="이력 보기" data-tip={on ? t('이력 끄기', 'Hide history') : t('이력 보기', 'Show history')} aria-pressed={on}
      aria-label={t('이력 보기', 'Show history')} onClick={() => onChange(!on)}>{Icon.history}</button>
  )
}

/** 다시 정리한 설명: 절마다 항목 목록, 그리고 남은 것 */
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
        <Section key={sec.title} name={sec.title} ui={sec.ui ?? sec.title} id={sectionAnchor(sec, i)} check={check}>
          {part.id !== 'symbols' && sec.figure && <div className="about-figs">{sec.figure}</div>}
          <ul className="about-list">{sec.items.map((it, n) => <li key={n}>{it.text}</li>)}</ul>
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

/**
 * 기호와 의미 쪽의 표 (10/15 피드백 "기호와 의미 절"): 절 id마다 하나. 색 표(10/4, COLOR_ROWS)와 기호 표(10/4 17:57, SYMBOL_GROUPS)는 about/symbolTables.tsx
 */
function SymbolTable({ id }: { id: string }) {
  if (id === 'colors') return (
    <table className="about-sym-table about-color-table">
      <thead><tr><th>{t('색', 'Color')}</th><th>{t('이름', 'Name')}</th><th>{t('뜻', 'Meaning')}</th><th>{t('사용처', 'Where')}</th></tr></thead>
      <tbody>
        {COLOR_ROWS.map((r) => (
          <tr key={r.name}>
            <td className="about-sym">{r.status ? (r.status === 'none' ? <ProofMark p="none" /> : <StatusDot s={r.status} />) : <span className="about-swatch" style={{ background: `var(${r.token})` }} />}<span className="about-color-name">{r.color}</span></td>
            <td>{r.name}</td><td>{r.meaning}</td><td className="muted">{r.where}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
  const groups = SYMBOL_GROUPS({ icons: Icon })
  const rows = id === 'actions' ? groups[0]!.rows : id === 'marks' ? groups[1]!.rows : id === 'screens' ? screenIcons() : null
  if (!rows) return null
  return (
    <table className="about-sym-table">
      <thead><tr><th>{t('기호', 'Symbol')}</th><th>{t('이름', 'Name')}</th><th>{t('뜻', 'Meaning')}</th><th>{t('사용처', 'Where')}</th></tr></thead>
      <tbody>
        {rows.map((r) => <tr key={r.name}><td className="about-sym">{r.mark}</td><td>{r.name}</td><td>{r.meaning}</td><td className="muted">{r.where}</td></tr>)}
      </tbody>
    </table>
  )
}

/** 화면으로 가는 아이콘: 레일 · 왼쪽 사이드바 · 상단바 (icons.tsx를 그대로) */
const screenIcons = () => [
  { mark: Icon.home, name: t('홈', 'Home'), meaning: t('모든 프로젝트와 한 일 달력', 'All projects and the work calendar'), where: t('레일 맨 위', 'Top of the rail') },
  { mark: Icon.library, name: t('지식', 'Knowledge'), meaning: t('개념노트 라이브러리', 'Concept note library'), where: t('레일', 'Rail') },
  { mark: Icon.papers, name: t('논문', 'Papers'), meaning: t('논문과 책, PDF', 'Papers, books and PDFs'), where: t('레일', 'Rail') },
  { mark: Icon.figures, name: t('그림', 'Figures'), meaning: t('노트에서 함께 쓰는 그림', 'Figures shared across notes'), where: t('레일', 'Rail') },
  { mark: Icon.network, name: t('네트워킹', 'Networking'), meaning: t('저자와 공동 연구자들', 'Authors and collaborators'), where: t('레일', 'Rail') },
  { mark: Icon.info, name: t('소개', 'About'), meaning: t('이 앱 소개', 'This About page'), where: t('레일 아래', 'Bottom of the rail') },
  { mark: Icon.projectInfo, name: t('프로젝트 정보', 'Project info'), meaning: t('그 프로젝트의 설명 · 시작일 · 현황 · 변경사항 · 규칙', 'That project\'s description, start date, status, changes and rules'), where: t('왼쪽 사이드바 맨 위', 'Top of the left sidebar') },
  { mark: Icon.repo, name: t('저장소', 'Repository'), meaning: t('그 프로젝트의 폴더 · 브랜치 · GitHub와 같은지 · 파일', 'That project\'s folder, branch, sync with GitHub and files'), where: t('왼쪽 사이드바 흐름 아래', 'Left sidebar, below Flow') },
  { mark: Icon.settings, name: t('설정', 'Settings'), meaning: t('앱 설정과 업데이트', 'App settings and updates'), where: t('레일 맨 아래', 'Bottom of the rail') },
  { mark: Icon.task, name: t('작업', 'Work'), meaning: t('판단 · 맡긴 일 · 할 일 · 메모 · 질문', 'Decisions · delegated tasks · to-dos · memos · questions'), where: t('왼쪽 사이드바', 'Left sidebar') },
  { mark: Icon.comment, name: t('기록', 'Records'), meaning: t('프로젝트의 메모 · 할 일 · 질문 · 지시', 'The project\'s memos, to-dos, questions and instructions'), where: t('왼쪽 사이드바', 'Left sidebar') },
  { mark: Icon.review, name: t('수정 검토', 'Edit review'), meaning: t('에이전트가 고친 노트를 변경사항마다 검토', 'Review each change agents made to notes'), where: t('왼쪽 사이드바', 'Left sidebar') },
  { mark: Icon.branch, name: t('흐름', 'Flow'), meaning: t('메시지를 쓰고 시작한 질문과 그 아래에서 해 본 방법(시도)의 나무', 'Questions started with a message, and the tree of methods (attempts) tried under them'), where: t('왼쪽 사이드바', 'Left sidebar') },
  { mark: Icon.manuscript, name: t('원고', 'Manuscript'), meaning: t('원고 화면과 원고 목록', 'Manuscript screen and list'), where: t('왼쪽 사이드바', 'Left sidebar') },
  { mark: Icon.clip, name: t('참고 자료', 'References'), meaning: t('프로젝트에 둔 자료 파일', 'Material files in the project'), where: t('왼쪽 사이드바', 'Left sidebar') },
  { mark: <>{Icon.back}{Icon.forward}</>, name: t('뒤로 · 앞으로', 'Back · Forward'), meaning: t('지나온 화면 사이를 오감', 'Move between screens you visited'), where: t('상단바 왼쪽', 'Left of the top bar') },
  { mark: Icon.split, name: t('두 패널', 'Two panes'), meaning: t('주 패널 옆에 옆 패널을 열고 닫음', 'Open or close the side pane next to the main pane'), where: t('상단바 오른쪽 (프로젝트)', 'Right of the top bar (projects)') },
]

function Reference() {
  return (
    <>
      <Section name={t('단축키와 조작', 'Shortcuts and actions')} ui="단축키와 조작">
        <dl className="props">
          <dt><kbd>/</kbd></dt><dd>{t('앱 전체 검색 — 글을 쓰는 중이 아닐 때 (상단바 돋보기와 같음)', 'Search the whole app, when you are not typing (same as the magnifier in the top bar)')}</dd>
          <dt><kbd>⌘</kbd> <kbd>↵</kbd></dt><dd>{t('LaTeX 편집기(원고·LaTeX 노트)에서 컴파일. 수정 창 · 맡기기 창 · 기록 입력란에서는 저장', 'Compile in the LaTeX editor (manuscripts, LaTeX notes). Save in edit dialogs, the Delegate dialog and the records input')}</dd>
          <dt><kbd>⌘</kbd> <kbd>S</kbd></dt><dd>{t('편집기에서 저장 (노트는 고치면 잠시 뒤 자동으로 저장됩니다)', 'Save in the editor (notes save on their own shortly after you edit)')}</dd>
          <dt><kbd>⌘</kbd> <kbd>\</kbd></dt><dd>{t('왼쪽 사이드바 켜고 끄기', 'Toggle the left sidebar')}</dd>
          <dt><kbd>⌥</kbd> <kbd>⌘</kbd> <kbd>\</kbd></dt><dd>{t('오른쪽 사이드바 켜고 끄기', 'Toggle the right sidebar')}</dd>
          <dt><kbd>M</kbd></dt><dd>{t('빠른 메모 — 글을 쓰는 중이 아닐 때', 'Quick memo, when you are not typing')}</dd>
          <dt><kbd>Esc</kbd></dt><dd>{t('창 닫기, 수정 취소', 'Close a dialog, cancel editing')}</dd>
          <dt><kbd>⌘</kbd> <kbd>K</kbd>, <kbd>/</kbd></dt><dd>{lang === 'ko' ? <>개념노트 편집기의 명령 메뉴 (<kbd>/</kbd>는 줄 맨 앞이나 띄어쓰기 뒤에서). <kbd>[[</kbd>로 개념, <kbd>[@</kbd>로 출처 찾기</> : <>Command menu in the concept note editor (<kbd>/</kbd> at the start of a line or after a space). <kbd>[[</kbd> finds concepts, <kbd>[@</kbd> finds sources</>}</dd>
          <dt>{t('PDF 누르기', 'Click in a PDF')}</dt><dd>{t('원고·LaTeX 노트의 그 줄로 이동 (원고는 다른 장이면 그 장을 엽니다)', 'Go to that line of the manuscript or LaTeX note (for a manuscript, opens the chapter if it is a different one)')}</dd>
          <dt>{t('커서 옮기기', 'Move the cursor')}</dt><dd>{t('PDF에서 그 부분을 노랗게 표시', 'Marks that part of the PDF in yellow')}</dd>
          <dt>{t('피드백 모드', 'Feedback mode')}</dt><dd>{t('상단바 피드백(핀 + 글줄) 버튼. 화면 부위를 눌러 남기면 부위 이름과 화면 그림이 함께 쌓입니다', 'The Feedback button in the top bar (pin with text lines). Click a part of the screen to leave a comment; the part name and a picture of the screen are saved with it')}</dd>
        </dl>
      </Section>
      <Section name={t('파일 위치', 'Where files are')} ui="파일이 있는 곳">
        <FileTreeFigure />
        <p className="about-note">{lang === 'ko' ? <>원고는 <code>research.yaml</code>의 <code>sources.manuscript</code>에 적은 자리에 그대로 있고, 앱 컴파일 결과는 <code>workbench/.build/</code>에만 둡니다. 옮기지 않은 Study 노트는 iCloud Obsidian의 Study vault에서 읽기만 합니다.</> : <>Manuscripts stay where <code>sources.manuscript</code> in <code>research.yaml</code> says, and the app's compile output goes only in <code>workbench/.build/</code>. Study notes not moved yet are read only from the Study vault in iCloud Obsidian.</>}</p>
      </Section>
    </>
  )
}

/** One list row in both languages: [bold title, rest] */
type Row2 = [ReactNode, ReactNode?]
const rows = (list: Row2[]) => list.map(([b, rest], n) => <li key={n}><b>{b}</b>{rest !== undefined && <> — {rest}</>}</li>)
const rowsEn = (list: Row2[]) => list.map(([b, rest], n) => <li key={n}><b>{b}</b>{rest !== undefined && <>: {rest}</>}</li>)

function Next() {
  return (
    <>
      <Section name={t('방향', 'Direction')} ui="방향">
        <p className="about-vision">{t('연구자와 AI 에이전트가 함께 일하는 신뢰할 수 있는 작업대. 지식과 근거를 쌓아 새로운 발견으로.', 'A trustworthy workbench where a researcher and AI agents work together. Building up knowledge and grounds, toward new discoveries.')}</p>
      </Section>
      <Section name={t('아직 없는 것', 'Not there yet')} ui="아직 없는 것">
        <ul className="about-list">
          {lang === 'ko' ? rows([
            ['본문 검색', '상단바 검색은 이름과 개념노트 본문까지만 찾습니다. 메모·일지 글, 원고·노트 본문, 논문·그림 라이브러리, 맡긴 일은 아직 찾지 않습니다'],
            ['구글 캘린더에 마감 쓰기', '지금은 일정을 읽어 보여 주기만 합니다'],
            ['이력', '에이전트가 파일을 고친 것을 하나씩 비교하고 되돌리기 (맡긴 일의 결과를 승인하거나 수정으로 돌려보내는 것은 기록 › 내 차례에 있습니다)'],
            ['노트 쓰기 도움', <><code>\ref</code> 자동완성, 그림 끌어다 넣기 (<code>[@</code> 인용 찾기는 있습니다)</>],
            ['재현 맡기기', '맡긴 일의 결과를 다른 세션이 다시 돌려 확인하게 맡기기'],
            ['개념노트 그림과 내보내기', 'tikz·양자 회로 그림, 손그림 붙이기, LaTeX로 내보내기'],
            ['네트워킹의 새 논문', '공동 연구자들의 arXiv 새 논문'],
            ['개념노트로 옮기기', '노트의 일부를 개념노트로 옮기고, 원래 자리에는 링크를 남기기'],
            ['원고 보호 훅', '에이전트가 원고나 맡긴 폴더 밖을 고치려 하면 실제로 막기'],
            ['다른 기기에서 쓰기', '늘 켜진 서버에서 앱을 돌리고, 나중에 구글 로그인으로 들어가기'],
            ['지식 연결 그래프', '개념노트와 노트가 어떻게 이어지는지 그림으로 보기'],
            ['컴파일한 PDF에 하이라이트·메모', '논문 PDF처럼 내 원고 PDF에도 남기기'],
            ['레일에서 프로젝트 숨기기'],
            ['사람 정보 고치는 창', '네트워킹의 사람 정보를 한 창에서 수정'],
            ['Zotero 연결', '나중에'],
          ]) : rowsEn([
            ['Full-text search', 'The top bar search finds names and concept note bodies only. Memo and journal text, manuscript and note bodies, the paper and figure libraries, and delegated tasks are not searched yet'],
            ['Writing deadlines to Google Calendar', 'For now it only reads events and shows them'],
            ['History', 'Compare and undo each change an agent made to files, one by one (approving or requesting changes on delegated task results is in the Work tab)'],
            ['Help writing notes', <><code>\ref</code> autocomplete, dragging in figures (searching citations with <code>[@</code> is there)</>],
            ['Delegating reproduction', 'Have another session rerun a delegated task\'s result to check it'],
            ['Figures and export for concept notes', 'tikz and quantum circuit figures, attaching hand drawings, export to LaTeX'],
            ['New papers in Networking', 'New arXiv papers by the people you research with'],
            ['Moving into concept notes', 'Move part of a note into a concept note and leave a link in its place'],
            ['Manuscript protection hook', 'Actually block an agent that tries to edit a manuscript or anything outside its delegated folder'],
            ['Using it from other devices', 'Run the app on an always-on server, and later sign in with Google'],
            ['Knowledge link graph', 'See as a picture how concept notes and notes connect'],
            ['Highlights and memos on compiled PDFs', 'Leave them on your own manuscript PDFs, as with paper PDFs'],
            ['Hiding projects from the rail'],
            ['Dialog for editing people', 'Edit a person\'s Networking details in one dialog'],
            ['Zotero integration', 'Later'],
          ])}
        </ul>
      </Section>
      <Section name={t('장기', 'Long term')} ui="장기">
        <ul className="about-list">
          {lang === 'ko' ? rows([
            ['서로 잇기', '라이브러리의 그림·자료와 노트·계산을 서로 이어, 어디에 쓰였는지 양쪽에서 보기'],
            ['검산과 검증 표시', '유도·계산을 독립된 에이전트와 SymPy·Mathematica로 다시 확인하고, 확인했는지를 노트에 보이기'],
            ['새 논문 잇기', '멈춘 질문과 새 논문을 이어 보기 (emergence 루틴·사이트와 연결)'],
            ['공유', '공동연구자에게 읽기 전용으로 보여 주기'],
          ]) : rowsEn([
            ['Linking both ways', 'Link library figures and materials with notes and calculations, and see from either side where each is used'],
            ['Rechecking and verification marks', 'Recheck derivations and calculations with an independent agent and SymPy or Mathematica, and show on the note whether they were checked'],
            ['Linking new papers', 'Connect blocked questions with new papers (tied to the emergence routine and site)'],
            ['Sharing', 'Show it read only to collaborators'],
          ])}
        </ul>
      </Section>
      <Section name={t('답을 기다리는 것', 'Waiting for your answer')} ui="답을 기다리는 것">
        <ul className="about-list">
          <li>{t('각 쪽 맨 위 "확인해 주실 것" (왼쪽 목록에 "확인 N"으로 표시)', '"To review" at the top of each page (shown as "Review N" in the list on the left)')}</li>
          <li>{t('피드백 화면의 "확인 필요"', '"Needs review" on the Feedback screen')}</li>
          <li>{t('구글 연결용 클라이언트를 설정에 넣기', 'Enter the client for the Google connection in Settings')}</li>
          <li>{t('작업 탭 첫 시험 (맥에서 읽기만 하는 일 하나를 맡겨 보기)', 'First trial of the Work tab (delegate one read-only task on the Mac)')}</li>
          <li>{t('늘 켜진 서버(Oracle) 만들기', 'Set up an always-on server (Oracle)')}</li>
        </ul>
      </Section>
    </>
  )
}

const PartTitle = createContext('')

/** 절 머리의 확인 상태와 이력 보기에 쓰는 것 */
interface SectionCheckView { key: string; rec?: AboutCheck; prs: number[]; dates: Record<string, string>; enabled: boolean; history: boolean; state: AboutCheckState }

/** 2026-11-03 → 11/3 */
const shortDate = (d?: string) => { const m = d && /^\d{4}-(\d{2})-(\d{2})/.exec(d); return m ? `${Number(m[1])}/${Number(m[2])}` : '' }

function Section({ name, ui, id, check, children }: { name: string; ui: string; id?: string; check?: SectionCheckView; children: ReactNode }) {
  const body = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<{ before: string; text: string } | null>(null)
  const checked = check?.rec?.checked !== undefined
  return (
    <section data-ui={ui} id={id && `about-${id}`}>
      <div className="sec-head">
        <h2>{name}</h2><span className="sp" />
        {check?.state === 'unchecked' && <span className="about-unsure" data-ui="확인 전">{t('확인 전', 'Not reviewed')}</span>}
        {check?.state === 'pending' && <span className="about-pending" data-ui="반영 대기" title={t('고쳐 보낸 글을 아직 반영하지 않았습니다', 'The text you sent has not been applied yet')}>{t('반영 대기', 'Waiting to apply')}</span>}
        {check?.history && check.state === 'checked' && checked && <span className="about-checked" data-ui="확인함"><i className="mark-ico" aria-hidden>{Icon.check}</i>{t(`확인함 ${shortDate(check.rec!.at)}`, `Reviewed ${shortDate(check.rec!.at)}`)}{check.rec!.checked ? ` · #${check.rec!.checked}` : ''}</span>}
        {!draft && <button className="icon-btn about-fix" data-ui="고치기" data-tip={t('수정', 'Edit')} aria-label={t(`수정 — ${name}`, `Edit: ${name}`)}
          onClick={() => { const t = body.current?.innerText.trim() ?? ''; setDraft({ before: t, text: t }) }}>{Icon.pencil}</button>}
      </div>
      {check?.history && <SectionHistory check={check} />}
      {draft ? <AboutFix name={ui} check={check} draft={draft} onChange={(text) => setDraft({ ...draft, text })} onClose={() => setDraft(null)} /> : <div ref={body}>{children}</div>}
    </section>
  )
}

/**
 * 이력 보기의 한 줄 (11/11 안 C′ ②): 그 절을 고친 업데이트와 확인한 때를 시간 순서로, 왼쪽이 옛것.
 * 업데이트 번호는 설정 › 업데이트 이력의 그 줄로 간다(이력의 "소개" 칸이 여기를 가리킨다, 10/15 "소개와 업데이트 1대1")
 */
function SectionHistory({ check }: { check: SectionCheckView }) {
  const { prs, rec, dates } = check
  const steps: ReactNode[] = []
  const prLink = (n: number, after: boolean) => (
    <a key={`pr${n}`} className={`a${after ? ' about-hist-after' : ''}`} data-ui="고친 업데이트" href={href({ page: 'settings', part: 'update', pr: n })}
      title={t('이 업데이트를 설정 › 업데이트 이력에서 봅니다', 'See this update in Settings › Update history')}>{dates[n] ? `${shortDate(dates[n])} ` : ''}#{n}</a>
  )
  const checkStep = rec?.checked !== undefined && <span key="ok" className="about-hist-ok"><i className="mark-ico" aria-hidden>{Icon.check}</i>{t(`확인 ${shortDate(rec.at)}`, `Reviewed ${shortDate(rec.at)}`)}</span>
  let placed = false
  // 확인 전에 고친 업데이트가 많으면 처음과 마지막만 (확인 뒤 것은 모두)
  const before = prs.filter((n) => checkStep && n <= rec!.checked!)
  const hidden = before.length > 3 ? new Set(before.slice(1, -1)) : new Set<number>()
  prs.forEach((n, j) => {
    if (hidden.has(n)) {
      if (n === before[1]) steps.push(<span key="more" title={before.slice(1, -1).map((x) => `#${x}`).join(' · ')}>{t(`… ${hidden.size}개`, `… ${hidden.size} more`)}</span>)
      return
    }
    if (checkStep && !placed && n > rec!.checked!) { steps.push(checkStep); placed = true }
    const after = check.state === 'unchecked' && checkStep !== false && n > rec!.checked!
    steps.push(prLink(n, after))
    if (after && j === prs.length - 1) steps.push(<b key="late" className="about-hist-after">{t('확인 뒤 고침', 'Changed after review')}</b>)
  })
  if (checkStep && !placed) steps.push(checkStep)
  if (rec?.sent) steps.push(<span key="sent">{t(`${shortDate(rec.sent)} 내가 고쳐 보냄`, `${shortDate(rec.sent)} you sent an edit`)}{check.state === 'pending' && t(' · 반영 대기', ' · waiting to apply')}</span>)
  return (
    <div className="about-hist" data-ui="절 이력">
      {steps.length ? steps.map((x, k) => k ? <span key={k} className="about-hist-step"><span className="about-hist-arr" aria-hidden>→</span>{x}</span> : <span key={k} className="about-hist-step">{x}</span>) : <span>{t('이 절을 고친 업데이트가 아직 없습니다', 'No update has changed this section yet')}</span>}
    </div>
  )
}

/**
 * 소개 글 고치기 (10/4 14:51 피드백 "표현이 부정확하거나 수정하고 싶은 경우, 사용자가 직접 수정할 수 있게").
 * 소개 글은 앱 코드(aboutContent.tsx)에 있어서 바로 저장하지 않고, 고친 글을 피드백으로 남긴다. 다음 피드백 처리 때 Claude가 코드에 반영한다.
 */
function AboutFix({ name, check, draft, onChange, onClose }: { name: string; check?: SectionCheckView; draft: { before: string; text: string }; onChange(t: string): void; onClose(): void }) {
  const part = useContext(PartTitle)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const changed = draft.text.trim() !== draft.before
  const submit = async () => {
    setBusy(true); setError('')
    try {
      await api.addFeedback({
        kind: '미분류', target: `소개 › ${part} › ${name}`, route: location.hash.slice(1) || undefined, snippet: draft.before.slice(0, 120),
        text: `소개 글을 이렇게 고쳐 줘.\n\n고친 글:\n${draft.text.trim()}\n\n원래 글:\n${draft.before}`,
      })
      // 고쳐 보낸 절은 반영될 때까지 「반영 대기」 (11/11 안 C′ ⑤)
      if (check?.enabled) await setAboutCheck({ key: check.key, action: 'sent', pr: check.prs[check.prs.length - 1] ?? 0 }).then(putAboutChecks).catch(() => undefined)
      onClose()
      alert(t('고친 글을 피드백으로 남겼습니다. 다음 피드백 처리 때 소개에 반영합니다.', 'Your edited text was saved as feedback. It will be applied to this page at the next round of feedback handling.'))
    } catch (e) { setError((e as Error).message); setBusy(false) }
  }
  return (
    <div className="about-fix-box" data-ui="소개 고치기">
      <p className="muted">{t('글을 고친 뒤 보내면 피드백으로 남고, 다음 피드백 처리 때 소개에 반영됩니다.', 'Edit the text and send it; it is saved as feedback and applied to this page at the next round of feedback handling.')}</p>
      <textarea className="about-fix-text" value={draft.text} rows={Math.min(24, Math.max(6, draft.text.split('\n').length + 1))} onChange={(e) => onChange(e.target.value)} autoFocus />
      {error && <p className="muted">{error}</p>}
      <div className="about-fix-tools">
        <button className="btn" onClick={onClose} disabled={busy}>{t('취소', 'Cancel')}</button>
        <button className="btn primary" onClick={() => void submit()} disabled={busy || !changed}>{t('고친 글 보내기', 'Send edited text')}</button>
      </div>
    </div>
  )
}
