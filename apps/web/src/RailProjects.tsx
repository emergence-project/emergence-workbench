import { useLayoutEffect, useRef, useState, type DragEvent, type RefObject } from 'react'
import type { ResearchListItem } from './api'
import { initials, projectColor } from './format'
import { t } from './i18n'
import { PROJECT_KIND_LABEL, railFit } from './projectProfile'
import { ProjectRailCount, type useProjectIssues } from './projectIssues'
import { useDismiss } from './useDismiss'

type Issues = ReturnType<typeof useProjectIssues>
interface DragProps { draggable: boolean; onDragStart: (e: DragEvent<HTMLElement>) => void; onDragEnd: () => void; onDragOver: (e: DragEvent) => void }

/** 프로젝트 색 (CSS 변수 --pc) */
const pc = (id: string): Record<string, string> => ({ '--pc': projectColor(id) })

/** 버튼 34px + 사이 6px, 칸 위아래 5px (base.css .rail-projects) */
const STEP = 40, PAD = 10, GAP = 6

/**
 * 띠의 프로젝트 칸에 들어가는 버튼 수(＋ 포함). 
 * 칸 자체는 내용만큼만 커지므로 그 아래 빈칸(.sp)까지 더한다.
 */
function useRailSlots(box: RefObject<HTMLDivElement | null>): number {
  const [slots, setSlots] = useState(Infinity)
  useLayoutEffect(() => {
    const el = box.current, nav = el?.parentElement
    if (!el || !nav) return
    // 남은 자리 = 지금 칸 높이 + 늘어나는 빈칸(.sp) 높이. 칸이 넘쳐 줄어든 때는 빈칸이 0이고 칸 높이가 남은 자리다
    const measure = () => {
      const sp = Array.from(nav.children).find((c) => c.classList.contains('sp'))
      const avail = el.getBoundingClientRect().height + (sp?.getBoundingClientRect().height ?? 0) - PAD
      setSlots(Math.max(1, Math.floor((avail + GAP) / STEP)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(nav)
    ro.observe(el)
    return () => ro.disconnect()
  }, [box])
  return slots
}

/**
 * 왼쪽 띠의 프로젝트 버튼들 (10/7 끌어 순서 바꾸기, 11/20 화면 높이에 맞게 자르기).
 * 넘치면 들어가는 만큼만 보이고 「+n」 버튼이 나머지를 메뉴로 연다. 숨은 프로젝트의 확인 수는 그 버튼에 합쳐 보인다.
 */
export function RailProjects({ box, ids, order, researches, rid, issues, dragging, dragProps, dropProps, onOpen, onRegister }: {
  box: RefObject<HTMLDivElement | null>
  /** 띠에 보일 프로젝트(설정 순서) */
  ids: string[]
  /** 끄는 동안 바뀐 순서 */
  order: string[]
  researches: ResearchListItem[]
  rid: string | null
  issues: Issues
  dragging: string | null
  dragProps: (id: string) => DragProps
  dropProps: { onDragOver: (e: DragEvent) => void; onDrop: (e: DragEvent) => void }
  onOpen: (id: string) => void
  onRegister: () => void
}) {
  const slots = useRailSlots(box)
  const { shown, hidden, add } = railFit(ids, slots, rid)
  const byId = new Map(researches.map((r) => [r.id, r]))
  const [menu, setMenu] = useState<{ top: number } | null>(null)
  const menuBox = useRef<HTMLDivElement>(null)
  useDismiss(!!menu, menuBox, () => setMenu(null))
  // 메뉴가 화면 아래로 넘치지 않게 그린 뒤 높이를 재어 올린다 (디자인 문서 6절 "메뉴는 잘리지 않게")
  const menuEl = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const m = menuEl.current
    if (!m || !menu) return
    const top = Math.max(8, Math.min(menu.top, window.innerHeight - 8 - m.offsetHeight))
    if (top !== menu.top) setMenu({ top })
  }, [menu])
  const hiddenCount = hidden.reduce((s, id) => s + (issues.counts[id] ?? 0), 0)
  const count = (id: string) => <ProjectRailCount n={issues.counts[id]} tasks={issues.tasks[id]} edits={issues.edits[id]} records={issues.records[id]} problems={issues.problems[id]} />
  const tip = (r: ResearchListItem) => `${r.title}  ${PROJECT_KIND_LABEL[r.kind]}${r.fields.length ? ` ${r.fields.map((f) => `#${f}`).join(' ')}` : ''}`
  return (
      <div ref={box} className="rail-projects" data-ui="프로젝트 버튼들" {...dropProps}>
        {order.filter((id) => shown.includes(id)).map((id) => byId.get(id)).filter((r) => !!r).map((r) => (
          <button key={r.id} data-rid={r.id} className={`rail-proj${r.id === rid ? ' on' : ''}${r.available ? '' : ' off'}${dragging === r.id ? ' lifted' : ''}`} aria-current={r.id === rid ? 'true' : undefined} style={pc(r.id)}
            {...dragProps(r.id)}
            data-ui="프로젝트 버튼" data-ui-item={r.title} data-tip={tip(r)} aria-label={r.title}
            onClick={() => onOpen(r.id)}>{initials(r.title)}{count(r.id)}</button>
        ))}
        {hidden.length > 0 && (
          <div ref={menuBox} className="rail-more">
            <button className={`rail-proj more${menu ? ' on' : ''}`} data-ui="숨은 프로젝트" aria-haspopup="menu" aria-expanded={!!menu}
              data-tip={menu ? undefined : t(`프로젝트 ${hidden.length}개 더 보기`, `${hidden.length} more projects`)} aria-label={t(`프로젝트 ${hidden.length}개 더 보기`, `${hidden.length} more projects`)}
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu(menu ? null : { top: r.top }) }}>
              +{hidden.length}{hiddenCount > 0 && <span className="rail-count">{hiddenCount}</span>}
            </button>
            {menu && (
              <div ref={menuEl} className="menu rail-more-menu" role="menu" style={{ top: menu.top }}>
                {hidden.map((id) => byId.get(id)).filter((r) => !!r).map((r) => (
                  <button key={r.id} role="menuitem" title={tip(r)} onClick={() => { setMenu(null); onOpen(r.id) }}>
                    <span className="rail-more-mark" style={pc(r.id)}>{initials(r.title)}</span>
                    <span className="rail-more-name">{r.title}</span>
                    {issues.counts[r.id] ? <span className="rail-count">{issues.counts[r.id]}</span> : null}
                  </button>
                ))}
                {!add && <button role="menuitem" onClick={() => { setMenu(null); onRegister() }}><span className="rail-more-mark add">＋</span><span className="rail-more-name">{t('프로젝트 등록', 'Register project')}</span></button>}
              </div>
            )}
          </div>
        )}
        {add && <button className="rail-proj add" data-ui="프로젝트 등록" data-tip={t('프로젝트 등록', 'Register project')} aria-label={t('프로젝트 등록', 'Register project')} onClick={onRegister}>＋</button>}
      </div>
  )
}
