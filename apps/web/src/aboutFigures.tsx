import type { ReactNode } from 'react'
import { Icon } from './icons'
import { ProofMark, StatusDot } from './StatusDot'
import { t } from './i18n'

/**
 * 이 앱 소개의 그림과 표 (10/8 사용자 "기호와 구조는 표와 그림으로도 보이게").
 * 글로만 설명하던 구조(글의 종류, 상태, 툴바, 맡긴 일과 피드백의 흐름, 파일 위치)를 실제 화면 부품으로 작게 그린다.
 * 기호는 화면이 쓰는 것(StatusDot, icons.tsx)을 그대로 쓰므로 화면이 바뀌면 그림도 함께 바뀐다.
 */

const c = (s: string) => <code>{s}</code>
const turn = <span className="about-turn" aria-label={t('사용자 차례', 'Your turn')}>2</span>

/** 프로젝트 › 주제 › 노트, 그리고 프로젝트 밖의 라이브러리 */
export function DocMapFigure() {
  return (
    <figure className="about-fig about-docmap" aria-label={t('글의 짜임: 프로젝트 안에 주제와 노트, 원고, 참고 자료. 프로젝트 밖 라이브러리에 개념노트, 논문, 그림', 'How writing is organized: topics and notes, manuscripts and reference materials inside a project; concept notes, papers and figures in the library outside projects')}>
      <div className="dm-box dm-project">
        <b>{t('프로젝트', 'Project')}</b><span className="muted">{t('연구 하나 = 저장소 하나', 'one research project = one repository')}</span>
        <div className="dm-row">
          <div className="dm-box">
            <b>{t('주제', 'Topic')}</b><span className="muted">{t('노트를 묶기만 함, 한 단계', 'only groups notes, one level')}</span>
            <div className="dm-notes">
              <span className="dm-note"><StatusDot s="in-progress" /> {t('노트', 'Note')}</span>
              <span className="dm-note"><StatusDot s="solved" /> {t('노트', 'Note')}</span>
              <span className="dm-note"><StatusDot s="blocked" /> {t('노트', 'Note')}</span>
            </div>
            <span className="muted dm-foot">{t('주제가 없는 노트는 "노트들"에', 'Notes without a topic go in "Loose notes"')}</span>
          </div>
          <div className="dm-col">
            <div className="dm-box dm-small"><b>{t('원고', 'Manuscript')}</b><span className="muted">{t('결과를 모은 개인 초고 (LaTeX)', 'personal draft gathering results (LaTeX)')}</span></div>
            <div className="dm-box dm-small"><b>{t('맡긴 일', 'Delegated tasks')}</b><span className="muted">{t('에이전트에게 맡긴 일과 보고서', 'tasks handed to agents, and their reports')}</span></div>
            <div className="dm-box dm-small"><b>{t('참고 자료', 'Reference materials')}</b><span className="muted">{t('가진 PDF·파일', 'PDFs and files you have')}</span></div>
          </div>
        </div>
      </div>
      <div className="dm-link muted" aria-hidden>{t('링크 [[ ]] · 인용 [@ ] · 그림 ![ ]( )', 'Link [[ ]] · Cite [@ ] · Figure ![ ]( )')}</div>
      <div className="dm-box dm-library">
        <b>{t('라이브러리', 'Library')}</b><span className="muted">{t('모든 프로젝트가 함께 씀 (research-library)', 'shared by all projects (research-library)')}</span>
        <div className="dm-row dm-three">
          <div className="dm-box dm-small"><b>{t('지식', 'Knowledge')}</b><span className="muted">{t('개념노트', 'concept notes')}</span></div>
          <div className="dm-box dm-small"><b>{t('논문', 'Papers')}</b><span className="muted">{t('bib · PDF · 코멘트', 'bib · PDF · comments')}</span></div>
          <div className="dm-box dm-small"><b>{t('그림', 'Figures')}</b><span className="muted">{t('tikz · svg · 사진', 'tikz · svg · photos')}</span></div>
        </div>
      </div>
    </figure>
  )
}

/** 글의 종류 표 */
export const DOC_KINDS: { name: string; what: string; format: string; where: ReactNode }[] = [
  { name: t('원고', 'Manuscript'), what: t('결과를 모으는 개인 초고. 공동 집필·투고는 Overleaf', 'Personal draft gathering results. Co-writing and submission in Overleaf'), format: 'LaTeX', where: <>{c('research.yaml')}의 {c('sources.manuscript')}</> },
  { name: t('노트', 'Note'), what: t('주제 안에서 완결된 최소 단위: 증명·유도·계산·열린 질문', 'Smallest self-contained unit in a topic: proof, derivation, calculation, open question'), format: 'Markdown + KaTeX', where: <>{c('workbench/notes/')} · {c('calc/')} · {c('blocks/')}</> },
  { name: t('개념노트', 'Concept note'), what: t('여러 연구가 다시 쓰는 정의·성질. 개념 하나에 노트 하나', 'Definitions and properties reused across projects. One note per concept'), format: 'Markdown + KaTeX', where: <>research-library {c('concepts/')}</> },
  { name: t('문헌노트', 'Literature note'), what: t('논문 한 편의 정리', 'Summary of one paper'), format: 'LaTeX', where: <>research-library {c('papers/')}</> },
  { name: t('맡긴 일', 'Delegated task'), what: t('에이전트에게 맡긴 일 하나. 그 파일이 보고서', 'One task handed to an agent. The file is the report'), format: t('Markdown + YAML 머리말', 'Markdown + YAML front matter'), where: c('workbench/tasks/') },
]

export function DocKindsTable() {
  return (
    <table className="about-sym-table about-kinds">
      <thead><tr><th>{t('이름', 'Name')}</th><th>{t('무엇', 'What')}</th><th>{t('형식', 'Format')}</th><th>{t('파일', 'File')}</th></tr></thead>
      <tbody>{DOC_KINDS.map((k) => <tr key={k.name}><td><b>{k.name}</b></td><td>{k.what}</td><td className="muted">{k.format}</td><td className="muted">{k.where}</td></tr>)}</tbody>
    </table>
  )
}

/** 상태: 대상마다 같은 색 점을 쓴다. 사용자 차례는 주황, 에이전트 차례는 회색 */
export function StatesTable() {
  const IP = t('진행', 'In progress'), BL = t('멈춤', 'Blocked'), DR = t('폐기', 'Dropped'), SO = t('해결', 'Solved')
  const d = (s: 'in-progress' | 'blocked' | 'stopped' | 'solved', name: string) => <span className="about-state"><StatusDot s={s} name={name} /> {name}</span>
  return (
    <table className="about-sym-table about-states">
      <thead><tr><th>{t('대상', 'Item')}</th><th>{t('상태 (색 점과 이름)', 'Status (colored dot and name)')}</th><th>{t('사용자가 고르는 곳', 'Where you set it')}</th></tr></thead>
      <tbody>
        <tr><td><b>{t('노트', 'Notes')}</b></td><td>{d('in-progress', IP)} {d('blocked', BL)} {d('stopped', DR)} {d('solved', SO)}</td><td className="muted">{t('노트 툴바 왼쪽의 상태. 멈춤·폐기는 다시 열 조건을 적음', 'Status at the left of the note toolbar. Blocked and Dropped get a reopen condition')}</td></tr>
        <tr><td><b>{t('맡긴 일', 'Delegated tasks')}</b></td><td>{d('in-progress', IP)} {d('blocked', t('판단 대기', 'Awaiting decision'))} {d('blocked', BL)} {d('stopped', DR)} {d('solved', SO)}</td><td className="muted">{t('작업 탭의 판단(승인 · 수정 요청 · ⋯ 멈춤 · 폐기)', 'To decide in the Work tab (Approve · Request changes · ⋯ Blocked · Dropped)')}</td></tr>
        <tr><td><b>{t('프로젝트', 'Projects')}</b></td><td>{d('in-progress', IP)} {d('blocked', BL)} {d('solved', t('완료', 'Done'))}</td><td className="muted">{t('프로젝트 고치기 창', 'Edit project dialog')}</td></tr>
        <tr><td><b>{t('진술', 'Statements')}</b></td><td><span className="about-state"><ProofMark p="solved" /> {t('증명 작업의 상태', 'status of the proof work')}</span> <span className="about-state"><ProofMark p="none" /> {t('증명 작업 없음', 'no proof work')}</span> <span className="about-state"><ProofMark p="given" /> {t('공리·정의', 'axiom or definition')}</span></td><td className="muted">{t('증명하는 노트의 상태를 따라감', 'Follows the status of the note that proves it')}</td></tr>
        <tr><td><b>{t('개념노트', 'Concept notes')}</b></td><td><span className="about-state">✓ {t('확인함', 'Reviewed')}</span> <span className="about-state">○ {t('확인 전', 'Not reviewed')}</span> <span className="about-state muted">{t('미완성 · 잠김', 'Incomplete · Locked')}</span></td><td className="muted">{t('개념노트 툴바의 확인 (미완성은 앱이 붙임)', 'Review in the concept note toolbar (Incomplete is set by the app)')}</td></tr>
        <tr><td><b>{t('피드백', 'Feedback')}</b></td><td><span className="about-state">{turn} {t('확인 필요', 'Needs review')}</span> <span className="about-state muted">{t('대기 · 수정(반영 · 거절 · 확인 필요) · 질문(답변) · 제안(동의 · 나중에 · 거절)', 'Waiting · Fix (Applied · Declined · Needs review) · Question (Answered) · Suggestion (Agreed · Later · Declined)')}</span> <span className="about-state">{Icon.approve} {t('승인', 'Approve')} · {Icon.sendBack} {t('수정 요청', 'Request changes')}</span></td><td className="muted">{t('피드백 화면 항목 오른쪽 위', 'Top right of an item on the Feedback screen')}</td></tr>
      </tbody>
    </table>
  )
}

/** 누구 차례인가: 주황은 사용자, 회색은 에이전트 */
export function TurnFigure() {
  return (
    <div className="about-turns" role="img" aria-label={t('주황은 사용자 차례, 회색은 에이전트 차례', 'Orange is your turn, gray is the agent\'s turn')}>
      <div><span className="about-turn">3</span><span className="about-turn-dot" /><b>{t('사용자 차례', 'Your turn')}</b><span className="muted">{t('레일 배지, 확인 필요, 판단 대기, 점검. 주황 알약 수나 주황 점 하나의 모양', 'Rail badge, Needs review, Awaiting decision, Check. An orange pill with a count or a single orange dot')}</span></div>
      <div><span className="about-wait">{t('에이전트 대기', 'Waiting on agent')}</span><b>{t('에이전트 차례', 'Agent\'s turn')}</b><span className="muted">{t('질문의 답, 피드백 처리를 기다림. 무채색 글자', 'Waiting for an answer to a question or for feedback handling. Neutral text')}</span></div>
    </div>
  )
}

/** 노트 툴바: 왼쪽 무엇 · 가운데 보기 · 오른쪽 행동 (읽기와 고치기) */
export function NoteToolbarFigure() {
  return (
    <figure className="about-fig about-tb" aria-label={t('노트 툴바: 왼쪽 상태, 가운데 보기, 오른쪽 저장 상태와 행동', 'Note toolbar: status on the left, view in the middle, save status and actions on the right')}>
      <div className="tb-zones muted"><span>{t('왼쪽 · 무엇', 'Left · what')}</span><span>{t('가운데 · 보기', 'Middle · view')}</span><span>{t('오른쪽 · 행동', 'Right · actions')}</span></div>
      <div className="tb-bar">
        <span className="tb-l"><StatusDot s="in-progress" label /></span>
        <span className="tb-m" />
        <span className="tb-r"><span className="muted">{t('저장됨 · 3분 전', 'Saved · 3 min ago')}</span><i title={t('코멘트', 'Comment')}>{Icon.comment}</i><i title={t('고치기', 'Edit')}>{Icon.pencil}</i><i title={t('컴파일', 'Compile')}>{Icon.play}</i><i title={t('더 보기', 'More')}>{Icon.more}</i></span>
      </div>
      <figcaption className="muted">{t('읽을 때. 말풍선은 오른쪽 사이드바 기록, ▶는 PDF를 오른쪽 패널에, ⋯은 PDF 보기 · 서식 · 내보내기 · 지우기', 'While reading. The speech bubble opens Records in the right sidebar, ▶ opens the PDF in the right pane, ⋯ has View PDF · Template · Export · Delete')}</figcaption>
      <div className="tb-bar">
        <span className="tb-l"><span className="tb-input">{t('제목 입력란', 'Title input')}</span><StatusDot s="in-progress" /></span>
        <span className="tb-m"><span className="segmented small"><button tabIndex={-1}>{t('원문', 'Source')}</button><button tabIndex={-1}>{t('원문 | 미리보기', 'Source | Preview')}</button><button tabIndex={-1} className="on">{t('바로 보기', 'Live preview')}</button></span></span>
        <span className="tb-r"><span className="muted">{t('저장됨', 'Saved')}</span><span className="btn primary sm">{t('편집 완료', 'Done')}</span></span>
      </div>
      <figcaption className="muted">{t('연필을 누른 뒤. 고친 것은 저절로 저장되고 "편집 완료"(Esc)로 마칩니다', 'After pressing the pencil. Edits save on their own; finish with "Done" (Esc)')}</figcaption>
    </figure>
  )
}

/** 화살표로 잇는 흐름 그림 */
function Flow({ steps, label }: { steps: { title: ReactNode; sub: ReactNode; turn?: boolean }[]; label: string }) {
  return (
    <ol className="about-flow" aria-label={label}>
      {steps.map((s, i) => <li key={i} className={s.turn ? 'turn' : ''}><b>{s.title}</b><span>{s.sub}</span></li>)}
    </ol>
  )
}

/** 맡긴 일: 맡기기 → 종결 조건 → 진행 → 판단 */
export function TaskFlowFigure() {
  return (
    <figure className="about-fig">
      <Flow label={t('맡긴 일의 흐름', 'How a delegated task flows')} steps={[
        { title: <>＋ {t('맡기기', 'Delegate')}</>, sub: t('작업 내용 · 종결 조건 · 참고 자료 · 하지 말 것. 파일 하나가 생김', 'Task description · completion criteria · reference materials · what not to do. One file is created') },
        { title: <><StatusDot s="blocked" name={t('종결 조건 승인 대기', 'Awaiting criteria approval')} /> {t('종결 조건', 'Completion criteria')}</>, sub: t('비워 두면 에이전트가 먼저 제안하고 내가 승인', 'If left empty, the agent proposes first and you approve'), turn: true },
        { title: <><StatusDot s="in-progress" /> {t('진행', 'In progress')}</>, sub: t('맥의 Claude Code · Codex가 앱 밖에서 일하고 같은 파일에 결과를 채움', 'Claude Code or Codex on the Mac works outside the app and fills the result into the same file') },
        { title: <><StatusDot s="blocked" name={t('판단 대기', 'Awaiting decision')} /> {t('판단 대기', 'Awaiting decision')}</>, sub: t('결론 · 확인 요청 · 남은 문제 · 다음 지시 제안', 'Conclusion · review requests · open problems · proposed next instructions'), turn: true },
      ]} />
      <div className="about-verdicts">
        <span>{Icon.approve}<b>{t('승인', 'Approve')}</b><span className="muted">→ <StatusDot s="solved" label /></span></span>
        <span>{Icon.sendBack}<b>{t('수정 요청', 'Request changes')}</b><span className="muted">{t('고칠 것 한 줄', 'one line on what to fix')} → <StatusDot s="in-progress" label /></span></span>
        <span>{Icon.more}<b>{t('멈춤으로 두기 · 폐기', 'Leave as blocked · Drop')}</b><span className="muted">→ <StatusDot s="blocked" label /> · <StatusDot s="stopped" label /></span></span>
      </div>
      <figcaption className="muted">{t('주황 단계가 사용자 차례입니다. 승인은 사용자만 하고, 판단에 쓴 시간은 일지에 남습니다. 규칙:', 'Orange steps are your turn. Only you approve, and the time spent deciding is kept in the journal. Rules:')} {c('docs/agent-delegated-work.md')}</figcaption>
    </figure>
  )
}

/** 피드백이 반영되는 길 */
export function FeedbackFlowFigure() {
  return (
    <figure className="about-fig">
      <Flow label={t('피드백이 반영되는 길', 'How feedback gets in')} steps={[
        { title: <>{Icon.feedback} {t('남기기', 'Leave')}</>, sub: t('피드백 모드에서 부위를 누름. 화면 그림이 함께 남고 30초 뒤 GitHub에', 'Click a part in feedback mode. A screen picture is saved with it and goes to GitHub after 30 seconds') },
        { title: t('처리', 'Handle'), sub: <>{t('Claude가 고치고', 'Claude fixes it and writes in')} {c('feedback/status.yaml')}{t('에 이해한 요구 · 원인 · 처리를 적음', ' the understood request · cause · handling')}</> },
        { title: t('반영', 'Ship'), sub: t('검사(CI)를 통과하면 합침. 맥에서 업데이트를 누르면 앱에 들어옴', 'Merged once checks (CI) pass. Pressing Update on the Mac brings it into the app') },
        { title: <>{turn} {t('확인', 'Review')}</>, sub: t('처리된 항목을 승인하거나 수정 요청', 'Approve or request changes on handled items'), turn: true },
        { title: t('소개로', 'Into About'), sub: t('승인된 내용은 이 소개의 설명이 되고 원문은 지움', 'Approved content becomes a description on this page and the original is deleted') },
      ]} />
    </figure>
  )
}

/** 홈의 상태 기호와 달력 기호 */
export function HomeMarksTable() {
  return (
    <table className="about-sym-table">
      <thead><tr><th>{t('기호', 'Symbol')}</th><th>{t('이름', 'Name')}</th><th>{t('뜻', 'Meaning')}</th><th>{t('쓰는 곳', 'Where')}</th></tr></thead>
      <tbody>
        <tr><td className="about-sym"><span className="about-turn-dot" /></td><td>{t('확인 필요', 'Needs review')}</td><td>{t('확인이 필요한 노트나 판단할 맡긴 일이 있음 (레일의 수와 같음)', 'There are notes to review or delegated tasks to decide (same as the rail count)')}</td><td className="muted">{t('프로젝트 줄 · 카드', 'Project rows · cards')}</td></tr>
        <tr><td className="about-sym">{Icon.sync}</td><td>{t('업데이트 필요', 'Update available')}</td><td>{t('GitHub에 받을 새 커밋이 있음. 눌러 받기 (빨리 감기만)', 'GitHub has new commits to pull. Click to pull (fast-forward only)')}</td><td className="muted">{t('프로젝트 줄 · 카드', 'Project rows · cards')}</td></tr>
        <tr><td className="about-sym">✓</td><td>{t('끝낸 할 일', 'Finished to-do')}</td><td>{t('그날 끝낸 할 일', 'A to-do finished that day')}</td><td className="muted">{t('한 일 달력', 'Work calendar')}</td></tr>
        <tr><td className="about-sym">✎</td><td>{t('노트 고침', 'Note edited')}</td><td>{t('그날 고친 노트', 'A note edited that day')}</td><td className="muted">{t('한 일 달력', 'Work calendar')}</td></tr>
        <tr><td className="about-sym">⇄</td><td>{t('상태 바꿈', 'Status changed')}</td><td>{t('노트 상태가 바뀐 기록', 'A record that a note\'s status changed')}</td><td className="muted">{t('한 일 달력 · 작업 탭 달력', 'Work calendar · Work tab calendar')}</td></tr>
        <tr><td className="about-sym">·</td><td>{t('메모', 'Memo')}</td><td>{t('그날 적은 메모', 'A memo written that day')}</td><td className="muted">{t('한 일 달력 · 작업 탭 달력', 'Work calendar · Work tab calendar')}</td></tr>
        <tr><td className="about-sym about-due">⚑</td><td>{t('마감', 'Deadline')}</td><td>{t('할 일의 마감 (앞으로의 날, 주황)', 'A to-do\'s deadline (future days, orange)')}</td><td className="muted">{t('한 일 달력 · 작업 탭 달력', 'Work calendar · Work tab calendar')}</td></tr>
        <tr><td className="about-sym">↘ ↗</td><td>{t('맡김 · 판단한 결과', 'Delegated · decided')}</td><td>{t('맡긴 날과 결과를 판단한 날', 'The day a task was delegated and the day its result was decided')}</td><td className="muted">{t('작업 탭 달력', 'Work tab calendar')}</td></tr>
      </tbody>
    </table>
  )
}

/** 노트에 쓰는 표기 */
export function NoteSyntaxTable() {
  const rows: [string, string][] = [
    [t('## 제목', '## Title'), t('절. 왼쪽 사이드바 절 목차에 보임', 'A section. Shows in the section outline in the left sidebar')],
    ['$…$, $$…$$', t('수식 (KaTeX). 기호는 workbench/macros.tex', 'Math (KaTeX). Symbols in workbench/macros.tex')],
    ['\\label{…} · \\ref{…} · \\eqref{…}', t('번호와 참조. 읽기 화면과 PDF에 같은 번호', 'Numbering and references. Same numbers in the reading view and the PDF')],
    [t('![캡션 \\label{…}](파일)', '![caption \\label{…}](file)'), t('그림 문단. 노트 폴더에 없는 이름이면 그림 라이브러리의 그림', 'A figure paragraph. A name not in the note folder means a figure from the figure library')],
    [t('[[개념]]', '[[concept]]'), t('개념노트 링크', 'Concept note link')],
    [t('[@키]', '[@key]'), t('인용 (references.bib). PDF에서는 \\cite', 'Citation (references.bib). \\cite in the PDF')],
    ['^[…]', t('각주', 'Footnote')],
    ['<!-- … -->', t('보이지 않는 메모', 'Hidden memo')],
  ]
  return (
    <table className="about-sym-table about-syntax">
      <thead><tr><th>{t('적는 것', 'You write')}</th><th>{t('보이는 것', 'You see')}</th></tr></thead>
      <tbody>{rows.map(([a, b]) => <tr key={a}><td><code>{a}</code></td><td>{b}</td></tr>)}</tbody>
    </table>
  )
}

/** 파일이 있는 곳: 연구 저장소 · 라이브러리 · 앱 */
export function FileTreeFigure() {
  const r = (path: string, what: string) => <li key={path}><code>{path}</code><span className="muted">{what}</span></li>
  return (
    <div className="about-trees">
      <div className="about-tree"><b>{t('각 연구 저장소', 'Each research repository')}</b>
        <ul>
          {r('workbench/research.yaml', t('프로젝트 정보 · 주제 · sources(정본 위치) · concepts', 'Project info · topics · sources (where the sources of truth are) · concepts'))}
          {r(t('workbench/notes/<이름>/', 'workbench/notes/<name>/'), t('note.md + note.yaml (예전 LaTeX는 main.tex)', 'note.md + note.yaml (older LaTeX notes: main.tex)'))}
          {r(t('workbench/calc/<이름>/', 'workbench/calc/<name>/'), t('계산 노트, 코드와 함께', 'Calculation notes, together with code'))}
          {r('workbench/blocks/<id>.md', t('주장 하나의 노트 (예전 .tex)', 'Single-claim notes (older: .tex)'))}
          {r(t('workbench/tasks/<날짜>-<이름>.md', 'workbench/tasks/<date>-<name>.md'), t('맡긴 일 = 보고서', 'Delegated task = report'))}
          {r(t('workbench/log/<날짜>.md', 'workbench/log/<date>.md'), t('할 일 · 끝낸 일 · 상태 변화', 'To-dos · finished work · status changes'))}
          {r(t('workbench/comments/<대상>.md', 'workbench/comments/<target>.md'), t('메모 · 질문 · 코멘트 · 하이라이트', 'Memos · questions · comments · highlights'))}
          {r('workbench/figures/', t('이 프로젝트 그림 + figures.yaml', 'This project\'s figures + figures.yaml'))}
          {r('workbench/materials/', t('참고 자료 (git에 넣지 않음)', 'Reference materials (not in git)'))}
          {r('workbench/macros.tex', t('프로젝트 기호', 'Project symbols'))}
          {r('workbench/STATUS.md', t('에이전트용 요약, 앱이 씀 (git 제외, 정본 아님)', 'Summary for agents, written by the app (not in git, not a source of truth)'))}
        </ul>
      </div>
      <div className="about-tree"><b>research-library</b>
        <ul>
          {r('concepts/<id>.md', t('개념노트 (+ <id>.memo.md 메모)', 'Concept notes (+ <id>.memo.md memo)'))}
          {r('concepts/macros.tex', t('개념노트 기호 (설정 › LaTeX › 명령어)', 'Concept note symbols (Settings › LaTeX › Macros)'))}
          {r('papers/', t('문헌노트', 'Literature notes'))}
          {r('references.bib · papers.yaml', t('인용 하나 · 논문 분류와 관련 프로젝트', 'One citation file · paper subjects and related projects'))}
          {r(t('comments/<키>/<id>.md', 'comments/<key>/<id>.md'), t('논문 코멘트 · 질문', 'Paper comments · questions'))}
          {r('figures/', t('함께 쓰는 그림 + figures.yaml', 'Shared figures + figures.yaml'))}
          {r('subjects.yaml', t('분류 나무', 'Subject tree'))}
          {r('preamble/', t('LaTeX 서식', 'LaTeX templates'))}
        </ul>
      </div>
      <div className="about-tree"><b>{t('앱과 설정', 'App and settings')}</b>
        <ul>
          {r('research-workspace/feedback/', t('날짜.md(원문) · status.yaml(처리) · reviews.yaml(승인·수정 요청) · pictures/', '<date>.md (original) · status.yaml (handling) · reviews.yaml (approve, request changes) · pictures/'))}
          {r('~/.config/research-workspace/config.yaml', t('등록한 프로젝트 · 화면 설정 · LaTeX 서식 · 사람들 · 논문 PDF 폴더', 'Registered projects · display settings · LaTeX templates · people · paper PDF folders'))}
          {r('~/.config/research-workspace/google.yaml', t('구글 연결', 'Google connection'))}
        </ul>
      </div>
    </div>
  )
}
