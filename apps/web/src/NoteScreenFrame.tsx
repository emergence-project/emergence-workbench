import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NoteToolbar, type NoteToolbarProps } from './NoteToolbar'
import { publishToc, useRightSlot, type NoteToc } from './noteScreen'
import { t } from './i18n'

/**
 * 노트 화면 틀 (10/10 "노트 화면 틀 하나"): 연구노트 · 노트 · 원고 장이 같은 겉을 쓴다.
 * - 툴바(NoteToolbar), 그 아래 저장 충돌 배너와 알림 배너
 * - 절 목차 알리기 (toc를 준 화면만. Markdown 본문은 MarkdownNoteBody가 스스로 알린다)
 * - 오른쪽 사이드바 "정보" 아래 칸에 그릴 것(side) 등록
 * 노트 종류마다 다른 본문 · 오류 목록 · 인용한 논문은 children으로 받는다.
 * 본문 스크롤은 본문 쪽(MarkdownNoteBody의 .scroll, LaTeX Editor)이 맡는다: 둘의 DOM이 달라 틀로 옮기지 않았다.
 * 파일 이름이 NoteScreen.tsx가 아닌 것은 맥(대소문자를 가리지 않는 디스크)에서 noteScreen.ts와 헷갈리지 않게.
 */
export function NoteScreen({ ui, className, paneUi, toolbar, head, conflictUi, banner, notice, noticeUi, onCloseNotice, tocOwner, toc, side, overlay, children }: {
  /** 바깥 칸의 data-ui (원고 장 · 작업노트) */
  ui: string
  /** note-screen 앞에 붙는 갈래 class (예: md-note) */
  className?: string
  paneUi?: string
  toolbar: NoteToolbarProps
  /** 툴바 바로 아래, 배너 위 (LaTeX 원고 장의 큰 제목) */
  head?: ReactNode
  conflictUi?: string
  /** 충돌 배너와 알림 배너 사이에 둘 배너 (본문만 남기기 안내) */
  banner?: ReactNode
  notice: string | null
  noticeUi?: string
  onCloseNotice(): void
  /** 지금 칸에서 보이면 그 탭 key: 절 목차를 알리고 오른쪽 사이드바 칸을 그린다 */
  tocOwner?: string | null
  /** 틀이 알릴 절 목차 (LaTeX 본문). null이면 알리지 않는다 */
  toc?: Omit<NoteToc, 'owner'> | null
  /** 오른쪽 사이드바 "정보" 아래에 그릴 것 */
  side?: ReactNode
  /** 칸 밖에 뜨는 것 (상태 이유 창) */
  overlay?: ReactNode
  children?: ReactNode
}) {
  const sections = toc?.sections
  const current = toc?.current
  const jump = toc?.jump
  useEffect(() => {
    if (!tocOwner || !sections || current === undefined || !jump) return
    publishToc({ owner: tocOwner, sections, current, jump }, tocOwner)
  }, [tocOwner, sections, current, jump])
  useEffect(() => () => { if (tocOwner) publishToc(null, tocOwner) }, [tocOwner])
  const slot = useRightSlot()
  return (
    <div className={`ws-doc ${className ? `${className} ` : ''}note-screen`} data-ui={ui}>
      <section className="pane" data-ui={paneUi}>
        <NoteToolbar {...toolbar} />
        {head}
        {toolbar.save === 'conflict' && (
          <div className="banner danger" data-ui={conflictUi}>
            {t('다른 곳(에이전트나 다른 편집기)에서 이 파일이 바뀌어 저장을 멈췄습니다. 덮어쓰지 않았습니다.', 'Saving stopped because this file changed elsewhere (an agent or another editor). Nothing was overwritten.')}
          </div>
        )}
        {banner}
        {notice && <div className="banner" data-ui={noticeUi}>{notice}<span className="sp" /><button className="btn ghost" onClick={onCloseNotice}>{t('닫기', 'Close')}</button></div>}
        {children}
      </section>
      {tocOwner && slot && side && createPortal(side, slot)}
      {overlay}
    </div>
  )
}
