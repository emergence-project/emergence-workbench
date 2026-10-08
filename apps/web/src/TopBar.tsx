import type { ReactNode } from 'react'
import { Icon } from './icons'
import { go, type Route } from './router'
import { t } from './i18n'

/** 위치 표시의 한 칸: 누르면 그 화면으로 (to가 없으면 글자만) */
export interface Crumb { label: string; to?: Route; title?: string }

/**
 * 상단바 (10/5 시안 "상단바", 앱 것만): 왼쪽 사이드바 여닫기 · 뒤로 · 앞으로 · 위치 … 검색 · 두 칸 · 피드백 | 오른쪽 사이드바 여닫기.
 * 위치는 "프로젝트 › 주제"까지(노트 이름은 탭 · 나무 · 제목이 보인다), 이름마다 그 화면으로 간다.
 * 아이콘만 두고 가리키면 이름과 키가 뜬다(data-tip). 켜진 것은 회색 바탕(.on).
 * 테마는 설정으로, 빠른 메모는 오른쪽 사이드바 메모와 M 키로, 두 칸 맞바꾸기는 칸 머리를 끌어서 한다.
 */
export function TopBar({ crumbs, heading, leftToggle, sideOpen, onSide, project, split, onSplit, rightToggle, rightOpen, onRight, search, onSearch, feedback, onFeedback, update }: {
  crumbs: Crumb[]
  /** 화면에 h1이 없으면 마지막 위치를 제목으로 알린다 (에이전트·화면 읽기 프로그램용) */
  heading: boolean
  leftToggle: boolean; sideOpen: boolean; onSide(): void
  /** 프로젝트 화면이면 두 칸 · 오른쪽 사이드바 버튼을 보인다 */
  project: boolean; split: boolean; onSplit(): void; rightToggle: boolean; rightOpen: boolean; onRight(): void
  search: boolean; onSearch(): void
  feedback: boolean; onFeedback(): void
  update: ReactNode
}) {
  return (
    <header className="titlebar topbar" data-ui="제목줄">
      <div className="tb-left">
        {/* 왼쪽 사이드바를 여닫는 버튼은 사이드바가 있는 왼쪽 끝에 (10/3 피드백, 10/5 시안 "여닫는 버튼은 그 칸 쪽에") */}
        {leftToggle && <button className={`icon-btn tip-start${sideOpen ? ' on' : ''}`} data-ui="사이드바 켜고 끄기" data-tip={t('왼쪽 사이드바 (⌘\\)', 'Left sidebar (⌘\\)')} aria-label={t('왼쪽 사이드바 켜고 끄기', 'Toggle left sidebar')} aria-pressed={sideOpen} onClick={onSide}>{Icon.panelLeft}</button>}
        <button className="icon-btn" data-ui="뒤로" data-tip={t('뒤로', 'Back')} aria-label={t('뒤로', 'Back')} onClick={() => history.back()}>{Icon.back}</button>
        <button className="icon-btn" data-ui="앞으로" data-tip={t('앞으로', 'Forward')} aria-label={t('앞으로', 'Forward')} onClick={() => history.forward()}>{Icon.forward}</button>
      </div>
      <nav className="tb-where" data-ui="위치 표시" aria-label={t('위치', 'Location')} title={crumbs.map((c) => c.label).join(' › ')}>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1
          const label = c.to
            ? <button className={`tb-crumb${i === 0 ? ' tb-proj' : ''}`} data-ui={i === 0 ? '프로젝트 이름' : '위치 칸'} title={c.title} onClick={() => go(c.to!)}>{c.label}</button>
            : <span className="tb-crumb plain">{c.label}</span>
          return <span key={i} className="tb-c" {...(last && heading && { role: 'heading', 'aria-level': 1 })}>{label}{!last && <span className="tb-sepch" aria-hidden> › </span>}</span>
        })}
      </nav>
      <div className="tb-right">
        {update}
        {/* 전역 검색은 제목줄에 (10/4 19:33 피드백) */}
        <button className={`icon-btn${search ? ' on' : ''}`} data-ui="검색 버튼" data-tip={t('검색 (/)', 'Search (/)')} aria-label={t('검색 — 모든 프로젝트와 라이브러리', 'Search all projects and the library')} aria-pressed={search} onClick={onSearch}>{Icon.search}</button>
        {project && <button className={`icon-btn${split ? ' on' : ''}`} data-ui="두 칸 켜고 끄기" data-tip={t('두 패널', 'Two panes')} aria-label={t('두 패널로 보기 켜고 끄기', 'Toggle two-pane view')} aria-pressed={split} onClick={onSplit}>{Icon.split}</button>}
        {/* 10/5 10:57 "팝업 창에서 코멘트를 달 수 없다": 창이 열려 있어도 이 버튼은 그 위에서 눌리고(fb-toggle),
            누를 때 창이나 펼친 상자가 "바깥을 눌렀다"며 닫히지 않게 mousedown을 여기서 멈춘다. 켜면 창 안의 부위에도 피드백을 남긴다.
            기호는 위치 핀 + 글줄 (말풍선은 코멘트만, 10/5 시안 "기호") */}
        <button className={`icon-btn fb-toggle${feedback ? ' on' : ''}${rightToggle ? '' : ' tip-end'}`} data-feedback-ui data-tip={t('피드백', 'Feedback')} aria-label={t('피드백 모드 — 화면 부위를 눌러 피드백 남기기', 'Feedback mode: click a part of the screen to leave feedback')} aria-pressed={feedback} onMouseDown={(e) => e.stopPropagation()} onClick={onFeedback}>{Icon.feedback}</button>
        {rightToggle && <>
          <span className="tb-sep" />
          <button className={`icon-btn tip-end${rightOpen ? ' on' : ''}`} data-ui="맥락 칸 켜고 끄기" data-tip={t('오른쪽 사이드바 (⌥⌘\\)', 'Right sidebar (⌥⌘\\)')} aria-label={t('오른쪽 사이드바 켜고 끄기', 'Toggle right sidebar')} aria-pressed={rightOpen} onClick={onRight}>{Icon.panelRight}</button>
        </>}
      </div>
    </header>
  )
}
