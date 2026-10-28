import { useEffect, useRef, useState, type ReactNode } from 'react'
import { t } from './i18n'
import { sideMounted, useNoteToc, useRepoOpen } from './noteScreen'
import { store } from './store'

/* 프로젝트 사이드바와 지식 사이드바가 함께 쓰는 맨 위 탭 "이동 | (파일) | 목차" (10/18 결정 "사이드바 탭과 수", 10/29 세 탭) */

type SideTab = 'nav' | 'files' | 'toc'
const TAB_KEY = 'rw-side-tab'

/**
 * 왼쪽 사이드바 맨 위 탭: 이동 목록(프로젝트 · 지식), 저장소의 파일 나무(프로젝트에서만, files), 지금 연 노트의 절 목차.
 * 탭은 어느 화면에서나 같은 자리에 있고, 목차가 없는 화면(절이 하나 이하)에서는 "목차"를 흐리게 둔다.
 * 고른 탭은 기억해 다른 노트를 열어도 그대로이고, 목차가 없는 화면에서 목차를 골라 두었으면 이동 목록을 보인다.
 * 저장소 쪽을 열면 「파일」 탭을 보인다(그 쪽에 있는 동안 고른 탭은 기억하지 않는다).
 * 다른 탭을 보는 동안 가려진 내 차례 수는 이동 탭 이름 옆 주황 알약으로 (turn).
 */
export function SideTabs({ label, turn = 0, turnTip, show, files, children }: {
  label: string; turn?: number; turnTip?: string
  /** 이 화면이 목차를 보일 수 있는지 (노트 · 보고서 · 개념노트를 열었을 때) */
  show: boolean
  /** 「파일」 탭의 나무 (프로젝트 사이드바만) */
  files?: ReactNode
  children: ReactNode
}) {
  const toc = useNoteToc()
  const hasToc = show && !!toc && toc.sections.length >= 2
  const [want, setWant] = useState<SideTab>(() => store.get<SideTab>(TAB_KEY, 'nav'))
  useEffect(() => store.set(TAB_KEY, want), [want])
  useEffect(() => sideMounted(), [])
  const repo = useRepoOpen() && !!files
  const [repoPick, setRepoPick] = useState<SideTab | null>(null)
  useEffect(() => { if (repo) setRepoPick(null) }, [repo])
  const wanted = repo ? repoPick ?? 'files' : want
  const tab: SideTab = wanted === 'files' && !files ? 'nav' : wanted === 'toc' && !hasToc ? 'nav' : wanted
  const pick = (to: SideTab) => (repo ? setRepoPick(to) : setWant(to))
  return (
    <>
      <div className="side-tabbar" data-ui="왼쪽 사이드바 갈래">
        <div className="segmented small full" role="tablist" aria-label={t('왼쪽 사이드바 갈래', 'Left sidebar view')}>
          <button role="tab" aria-selected={tab === 'nav'} className={tab === 'nav' ? 'on' : ''} onClick={() => pick('nav')}>
            {label}{tab !== 'nav' && turn > 0 && <span className="rail-count" title={turnTip}>{turn}</span>}</button>
          {files && <button role="tab" aria-selected={tab === 'files'} className={tab === 'files' ? 'on' : ''}
            title={t('저장소의 파일 나무', 'File tree of the repository')} onClick={() => pick('files')}>{t('파일', 'Files')}</button>}
          <button role="tab" aria-selected={tab === 'toc'} className={tab === 'toc' ? 'on' : ''} disabled={!hasToc}
            title={hasToc ? undefined : t('이 화면에는 목차가 없습니다', 'This screen has no contents')} onClick={() => pick('toc')}>{t('목차', 'Contents')}</button>
        </div>
      </div>
      {tab === 'files' ? <div className="side-toc-full side-files">{files}</div>
        : tab === 'toc' && toc ? <TocList sections={toc.sections} current={toc.current} jump={toc.jump} /> : children}
    </>
  )
}

/** 절 목차: 사이드바 높이를 모두 쓰고, 지금 절에 세로 막대, 읽는 자리를 따라 지금 절이 보이게 스크롤 */
function TocList({ sections, current, jump }: { sections: { title: string; level: number }[]; current: number; jump(i: number): void }) {
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('.toc-row.on')?.scrollIntoView({ block: 'nearest' })
  }, [current])
  return (
    <div ref={list} className="side-toc sec-toc side-toc-full" data-ui="목차">
      {sections.map((s, i) => (
        <button key={i} className={`toc-row${s.level > 2 ? ' sub' : ''}${i === current ? ' on' : ''}`} aria-current={i === current ? 'location' : undefined} title={s.title} onClick={() => jump(i)}>
          <span className="label">{s.title}</span></button>
      ))}
    </div>
  )
}
