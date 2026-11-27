import { createContext, type ReactNode } from 'react'
import { COLOR_ROWS, SYMBOL_GROUPS } from './aboutContent'
import type { AboutCheckState } from './aboutChecks'
import type { AboutCheck } from './api'
import { FileTreeFigure } from './aboutFigures'
import { lang, t } from './i18n'
import { Icon } from './icons'
import { ProofMark, StatusDot } from './StatusDot'
import { go, href } from './router'
import * as portingGuides from './about/reference/porting-guides'

export const INTRO_SUB = t('연구와 지식 활동을 여러 사람과 여러 에이전트가 함께 하는 작업대입니다.', 'A workbench where several people and several agents do research and other knowledge work together.')

/** 한눈에 머리의 정의 세 가지 (2026-11-27 사용자 정의) */
export function IntroPillars() {
  return (
    <ul className="about-pillars">
      {lang === 'ko' ? (<>
        <li><b>함께</b> — 사람과 에이전트가 같은 정보를 보고 서로의 일을 이어받습니다. 남기는 것은 각 연구 저장소에 파일로 두어, 누가 이어 가도 같은 자료에서 시작합니다.</li>
        <li><b>어디서나</b> — 기기가 여러 대여도 어느 기기에서든 접속해 같은 작업을 이어 합니다. 맥 · 윈도우에 설치하고, 폰에서는 같은 앱을 웹 화면으로 엽니다.</li>
        <li><b>한곳에서</b> — 연구 프로젝트, 노트, 공부, 지시, 기록, 네트워크까지 연구에 필요한 전체를 하나의 시스템에서 관리합니다.</li>
      </>) : (<>
        <li><b>Together</b> — people and agents see the same information and pick up each other's work. What is left behind is saved as files in each research repository, so whoever continues starts from the same material.</li>
        <li><b>Anywhere</b> — with several devices, you connect from any of them and continue the same work. It is installed on Mac or Windows, and on a phone you open the same app as a web page.</li>
        <li><b>In one place</b> — research projects, notes, study, instructions, records and networking: everything research needs is managed in one system.</li>
      </>)}
    </ul>
  )
}

const toPart = (id: string) => href({ page: 'about', part: id })

/** 화면 쪽 맨 앞: 창의 다섯 영역 그림 (11/27 한눈에서 옮김) */
export function Layout() {
  return (
    <div data-ui="화면 구조">
        <div className="about-map" role="img" aria-label={t('화면 구조: 위에 상단바, 왼쪽에 레일과 왼쪽 사이드바, 가운데 작업 패널, 오른쪽에 오른쪽 사이드바', 'Screen layout: top bar on top, rail and left sidebar on the left, work panel in the middle, right sidebar on the right')}>
          <a className="m-title" data-ui="상단바" href={toPart('project')}><b>{t('상단바', 'Top bar')}</b><span>{t('왼쪽 사이드바 여닫기 · 뒤로 · 앞으로 · 위치', 'Toggle left sidebar · Back · Forward · Location')}</span><span className="m-title-actions">{t('(새 버전) · 검색 · 두 패널 · 피드백 · 오른쪽 사이드바 여닫기', '(New version) · Search · Two panes · Feedback · Toggle right sidebar')}</span></a>
          <div className="m-rail" data-ui="레일">
            <b>{t('레일', 'Rail')}</b>
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
          </div>
          <div className="m-side" data-ui="왼쪽 사이드바">
            <b>{t('왼쪽 사이드바', 'Left sidebar')}</b>
            <a href={toPart('project')}>{t('프로젝트 | 파일 | 목차', 'Project | Files | Outline')}<small>{t('위의 탭. 목차는 지금 연 노트 · 보고서의 절', 'Tabs on top. Outline is the sections of the open note or report')}</small></a>
            <a href={toPart('project')}>{t('프로젝트 정보', 'Project info')}<small>{t('현황 · 변경사항 · 규칙', 'Status · Changes · Rules')}</small></a>
            <a href={toPart('project')}>{t('기록', 'Records')}<small>{t('판단 · 맡긴 일 · 할 일 · 메모 · 질문', 'Decide · Delegated tasks · To-dos · Memos · Questions')}</small></a>
            <a href={href({ page: 'about', part: 'project', anchor: 'flow' })}>{t('수정 검토 · 흐름', 'Edit review · Flow')}</a>
            <a href={toPart('notes')}>{t('주제', 'Topics')}<small>{t('주제 › 노트 나무 · 노트들', 'Topic › note tree · Loose notes')}</small></a>
            <a href={toPart('reading')}>{t('자료', 'Materials')}<small>{t('원고 · 참고 자료', 'Manuscripts · Reference materials')}</small></a>
          </div>
          <a className="m-main" data-ui="주 패널" href={toPart('project')}><b>{t('주 패널 (왼쪽)', 'Main pane (left)')}</b><span>{t('고른 노트·화면. 탭이 없으면 프로젝트 첫 화면. 노트는 늘 여기', 'The chosen note or screen. With no tabs, the project home screen. Notes always open here')}</span></a>
          <a className="m-other" data-ui="옆 패널" href={toPart('reading')}><b>{t('옆 패널 (오른쪽)', 'Side pane (right)')}</b><span>{t('노트의 PDF, 함께 볼 논문·진술', 'The note\'s PDF, papers and statements to view alongside')}</span></a>
          <a className="m-ctx" data-ui="오른쪽 사이드바" href={toPart('notes')}><b>{t('오른쪽 사이드바', 'Right sidebar')}</b><span>{t('맨 위 아이콘 줄: 정보 · 기록 (메모 · 할 일 · 질문) · 에이전트', 'Icon row on top: Info · Records (memos · to-dos · questions) · Agent')}</span></a>
        </div>
        <p className="about-note">{t('프로젝트 화면의 구조입니다. 상단바의 두 패널 버튼은 프로젝트 화면에만, 오른쪽 사이드바 버튼은 프로젝트와 지식·논문·그림 첫 화면에 있습니다. 홈·지식·논문·그림·네트워킹·피드백·소개·설정은 프로젝트 밖 화면이고, 지식·논문·그림·네트워킹·소개·설정은 자기 왼쪽 사이드바가 있습니다.', 'This is the layout of the project screen. The Two panes button in the top bar is only on project screens, and the right sidebar button is on projects and on the Knowledge, Papers and Figures home screens. Home, Knowledge, Papers, Figures, Networking, Feedback, About and Settings are screens outside projects, and Knowledge, Papers, Figures, Networking, About and Settings have their own left sidebar.')}</p>
    </div>
  )
}

/** 첫 쪽: 정의, 소개를 읽는 법, 핵심 이해 */
export function Intro() {
  return (
    <>
      <Section name={t('Emergence Workbench 개요', 'Emergence Workbench overview')} ui="정의">
        <p className="about-lead">{INTRO_SUB}</p>
        <IntroPillars />
      </Section>

      <Section name={t('이 소개를 읽는 법', 'How to read this page')} ui="읽는 법">
        {lang === 'ko' ? (
          <ul className="about-pillars">
            <li><b>정본</b> — 앱의 목표 · 개발 결정 · 지금 구현을 적는 single source of truth. 다른 문서는 이 소개의 자세한 설명</li>
            <li><b>독자</b> — 사용자와 에이전트가 함께 읽음. 누구나 쉽게 읽히게 씀</li>
            <li><b>에이전트</b> — 이 소개를 읽고 기능의 구현 방식과 파일을 정리함. 앱을 고치면 같은 PR에서 소개도 고쳐 둘을 맞춤</li>
            <li><b>짜임</b> — 쪽마다 화면 하나. 지금 앱이 어떤지를 화면의 짜임대로 적음</li>
            <li><b>피드백</b> — 승인한 피드백은 여기 설명으로 옮기고 피드백 목록에서 지움</li>
            <li><b>고치기</b> — 틀린 곳은 툴바 오른쪽 시계 › 「수정」 탭 › 본문의 그곳(문단 · 표 칸 · 그림 속 상자)을 눌러 고친 글을 보냄</li>
          </ul>
        ) : (
          <ul className="about-pillars">
            <li><b>Source of truth</b> — records the app's goals, development decisions and current implementation. Other documents are detailed notes on it</li>
            <li><b>Readers</b> — read by users and agents alike, so written to be easy for anyone</li>
            <li><b>Agents</b> — read it to work out how each feature is implemented and which files it uses. When they change the app, they change this page in the same PR</li>
            <li><b>Layout</b> — one part per screen, describing how the app works now in the order of the screen</li>
            <li><b>Feedback</b> — approved feedback moves into these descriptions and is deleted from the feedback list</li>
            <li><b>Corrections</b> — for anything wrong: clock at the right of the toolbar › "Edit" tab › click that place in the text (a paragraph, a table cell or a box in a figure) and send your edited text</li>
          </ul>
        )}
        <div className="about-legend">
          <span><span className="about-unsure">{t('확인 전', 'Not reviewed')}</span> {t('아직 확인하지 않은 업데이트가 있는 절(왼쪽 목록에는 "확인 N"). 누르면 오른쪽 「이력」이 열려 그 줄로 가고, 그 줄의 ✓(맞아요)를 누르면 확인함이 됩니다', 'A section with an update you have not reviewed (the list on the left shows "Review N"). Click it to open "History" on the right at that row; ✓ (That is right) on the row marks it reviewed')}</span>
          <span><span className="about-pending">{t('반영 대기', 'Waiting to apply')}</span> {t('「수정」 탭으로 고쳐 보낸 절. 반영한 업데이트가 들어오면 사라지고 다시 확인할 차례가 됩니다', 'A section you edited and sent from the "Edit" tab. It goes away when the update that applies it arrives, and the section is yours to review again')}</span>
          <span><b>{Icon.history}</b> {t('툴바 오른쪽 시계로 본문 옆에 이력 · 수정 패널을 엽니다. 이력 카드를 누르면 그 절로 가서 그 업데이트가 바꾼 문장에 하이라이트가 붙습니다', 'The clock at the right of the toolbar splits the screen and opens a History · Edit panel beside the text. Clicking a history card goes to that section and highlights the sentences that update changed')}</span>
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

/**
 * 기호와 의미 쪽의 표 (10/15 피드백 "기호와 의미 절"): 절 id마다 하나. 색 표(10/4, COLOR_ROWS)와 기호 표(10/4 17:57, SYMBOL_GROUPS)는 about/symbolTables.tsx
 */
export function SymbolTable({ id }: { id: string }) {
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

export function Reference() {
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
      {/* 이식 안내서 목록 (11/19): 글은 about/reference/porting-guides.tsx */}
      <Section name={(lang === 'ko' ? portingGuides.ko : portingGuides.en).title} ui="다른 앱에 옮기기" id="ports">
        <ul className="about-list">{(lang === 'ko' ? portingGuides.ko : portingGuides.en).items.map((it, n) => <li key={n}>{it.text}</li>)}</ul>
      </Section>
    </>
  )
}

/** One list row in both languages: [bold title, rest] */
type Row2 = [ReactNode, ReactNode?]
const rows = (list: Row2[]) => list.map(([b, rest], n) => <li key={n}><b>{b}</b>{rest !== undefined && <> — {rest}</>}</li>)
const rowsEn = (list: Row2[]) => list.map(([b, rest], n) => <li key={n}><b>{b}</b>{rest !== undefined && <>: {rest}</>}</li>)

export function Next() {
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
          <li>{t('절 제목 옆 "확인 전" (왼쪽 목록에 "확인 N"으로 표시, 누르면 이력에서 확인)', '"Not reviewed" next to a section title (shown as "Review N" in the list on the left; click to review in History)')}</li>
          <li>{t('피드백 화면의 "확인 필요"', '"Needs review" on the Feedback screen')}</li>
          <li>{t('구글 연결용 클라이언트를 설정에 넣기', 'Enter the client for the Google connection in Settings')}</li>
          <li>{t('작업 탭 첫 시험 (맥에서 읽기만 하는 일 하나를 맡겨 보기)', 'First trial of the Work tab (delegate one read-only task on the Mac)')}</li>
          <li>{t('늘 켜진 서버(Oracle) 만들기', 'Set up an always-on server (Oracle)')}</li>
        </ul>
      </Section>
    </>
  )
}

export const PartTitle = createContext('')
/** 절 머리의 확인 상태와 이력 보기에 쓰는 것 */
export interface SectionCheckView { key: string; rec?: AboutCheck; prs: number[]; dates: Record<string, string>; enabled: boolean; history: boolean; state: AboutCheckState }

/** 2026-11-03 → 11/3 */
const shortDate = (d?: string) => { const m = d && /^\d{4}-(\d{2})-(\d{2})/.exec(d); return m ? `${Number(m[1])}/${Number(m[2])}` : '' }

export function Section({ name, ui, id, check, onReview, children }: { name: string; ui: string; id?: string; check?: SectionCheckView; onReview?: () => void; children: ReactNode }) {
  const checked = check?.rec?.checked !== undefined && check.state === 'checked'
  return (
    <section data-ui={ui} id={id && `about-${id}`}>
      <div className="sec-head">
        <h2>{name}</h2><span className="sp" />
        {check?.state === 'unchecked' && <button type="button" className="about-unsure" data-ui="확인 전" data-tip={t('이력에서 확인하기', 'Review in History')} onClick={onReview}>{t('확인 전 ›', 'Not reviewed ›')}</button>}
        {check?.state === 'pending' && <span className="about-pending" data-ui="반영 대기" title={t('고쳐 보낸 글을 아직 반영하지 않았습니다', 'The text you sent has not been applied yet')}>{t('반영 대기', 'Waiting to apply')}</span>}
        {check?.history && checked && <span className="about-checked" data-ui="확인함"><i className="mark-ico" aria-hidden>{Icon.check}</i>{t(`확인함 ${shortDate(check.rec!.at)}`, `Reviewed ${shortDate(check.rec!.at)}`)}</span>}
      </div>
      <div className="about-sec-body">{children}</div>
    </section>
  )
}
