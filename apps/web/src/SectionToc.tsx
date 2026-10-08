import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { clampDragHeight, useDragHeight } from './dragHeight'
import { t } from './i18n'
import { useNoteToc } from './noteScreen'
import { store } from './store'

/* 프로젝트 사이드바와 지식 사이드바(10/8 12:02 피드백)가 함께 쓰는 맨 아래 절 목차 */

/** 목차가 위쪽 이동 목록을 모두 밀어내지 않도록 사이드바 높이에 맞춘 최대 높이 */
export function useTocMaxHeight(box: RefObject<HTMLElement | null>): number {
  const [max, setMax] = useState(600)
  useLayoutEffect(() => {
    // 사이드바의 스크롤 칸 높이 (목록이 길어 칸이 늘어나도 창 높이를 기준으로)
    const el = box.current?.closest<HTMLElement>('.side-scroll') ?? box.current
    if (!el) return
    const measure = () => setMax(clampDragHeight(el.clientHeight * 0.6, 80, 600))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [box])
  return max
}

const TOC_MIN = 80

/** 맨 아래 절 목차 (10/5 시안 가2 · 모양 B): 지금 절에 검은 세로 막대, 스크롤을 따라감, 절이 하나면 숨김 */
export function SectionToc({ show, maxHeight }: { show: boolean; maxHeight: number }) {
  const toc = useNoteToc()
  // 목차 칸은 내용 높이까지만 차지한다. 끌어서 줄이고 늘릴 수 있는 범위는 최소 높이 ~ 내용 높이 (10/6 11:43 피드백)
  const list = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState(0)
  const [height, startDrag] = useDragHeight('rw-side-toc-height', 240, TOC_MIN, Math.max(TOC_MIN, Math.min(maxHeight, contentHeight || maxHeight)))
  const [folded, setFolded] = useState<boolean>(() => store.get('rw-side-toc-folded', false))
  useEffect(() => store.set('rw-side-toc-folded', folded), [folded])
  useLayoutEffect(() => {
    const el = list.current
    if (!el) return
    const measure = () => setContentHeight(el.scrollHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [toc?.sections.length, folded])
  if (!show || !toc || toc.sections.length < 2) return null
  const resizable = contentHeight > TOC_MIN
  return (
    <div className="side-toc-box" data-ui="목차">
      {/* 10/4 13:52 피드백: 목차 칸 크기를 위 경계를 끌어 조절. 줄일 것이 없으면(목차가 짧으면) 경계를 두지 않는다 */}
      {!folded && resizable && <div className="row-resizer" onPointerDown={startDrag} role="separator" aria-orientation="horizontal" aria-label={t('목차 칸 경계 — 끌어서 높이 조절', 'Contents border: drag to resize')} />}
      <button className="side-toc-title" aria-expanded={!folded} onClick={() => setFolded((v) => !v)}><span className={`chev${folded ? '' : ' open'}`} aria-hidden>›</span>{t('목차', 'Contents')}</button>
      {!folded && <div ref={list} className="side-toc sec-toc" style={{ maxHeight: height }}>
        {toc.sections.map((s, i) => (
          <button key={i} className={`toc-row${s.level > 2 ? ' sub' : ''}${i === toc.current ? ' on' : ''}`} aria-current={i === toc.current ? 'location' : undefined} title={s.title} onClick={() => toc.jump(i)}>
            <span className="label">{s.title}</span></button>
        ))}
      </div>}
    </div>
  )
}
